use notavirus_pack::*;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn copy_fixture(name: &str) -> tempfile::TempDir {
    let temp = tempfile::tempdir().unwrap();
    let path = root().join("tests/fixtures").join(name);
    for entry in fs::read_dir(path).unwrap() {
        let entry = entry.unwrap();
        fs::copy(entry.path(), temp.path().join(entry.file_name())).unwrap();
    }
    temp
}
fn replace(temp: &tempfile::TempDir, from: &str, to: &str) {
    let p = temp.path().join("pack.toml");
    let s = fs::read_to_string(&p).unwrap();
    assert!(s.contains(from));
    fs::write(p, s.replace(from, to)).unwrap();
}
fn archive(path: &Path, entries: &[(&str, &[u8])]) {
    let mut zip = zip::ZipWriter::new(fs::File::create(path).unwrap());
    for (name, data) in entries {
        zip.start_file(*name, zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(data).unwrap();
    }
    zip.finish().unwrap();
}
#[test]
fn real_packs_and_both_atlas_layouts() {
    for name in ["default", "paco", "gatita"] {
        let p = load(&root().join("resources/packs").join(name)).unwrap();
        assert_eq!(p.pack.id, name);
        assert_eq!(p.rgba.len(), p.width as usize * p.height as usize * 4);
    }
    let p = load(&root().join("tests/fixtures/minimal")).unwrap();
    assert_eq!(p.pack.clips[0].frames[0].uv.origin.y, 0.75);
    assert_eq!(p.pack.clips[0].frames[1].uv.origin.x, 0.125);
    let p = load(&root().join("tests/fixtures/regions")).unwrap();
    assert_eq!(p.pack.clips[1].frames[0].uv.origin.y, 0.);
}
#[test]
fn paco_runtime_art_is_transparent_and_registered() {
    let p = load(&root().join("resources/packs/paco")).unwrap();
    assert_eq!((p.width, p.height), (512, 512));
    for frame in 0..16 {
        let mut occupied = 0;
        let mut bottom = 0;
        for y in 0..128 {
            for x in 0..128 {
                let alpha = p.rgba[((frame / 4 * 128 + y) * 512 + frame % 4 * 128 + x) * 4 + 3];
                assert!(
                    alpha == 0 || alpha == 255,
                    "pixel art has translucent fringe"
                );
                if alpha > 0 {
                    assert!(
                        (8..120).contains(&x) && (8..116).contains(&y),
                        "clipped tile {frame}"
                    );
                    occupied += 1;
                    bottom = bottom.max(y);
                }
            }
        }
        assert!(occupied > 2000, "missing art in frame {frame}");
        assert_eq!(
            bottom,
            if frame == 5 || frame == 7 { 113 } else { 115 },
            "unstable ground in frame {frame}"
        );
    }
}
#[test]
fn gatita_art_has_smooth_alpha_padding_and_authored_motion() {
    use notavirus_core::*;
    let loaded = load(&root().join("resources/packs/gatita")).unwrap();
    let default = load(&root().join("resources/packs/default")).unwrap();
    assert_eq!(default.rgba, loaded.rgba);
    assert_eq!(default.pack.filter, loaded.pack.filter);
    assert_eq!(default.pack.name, "gatita (Default)");
    assert_eq!(
        default.pack.clips[default.pack.behavior.idle].name,
        "play_roll_purr"
    );
    assert_eq!((loaded.width, loaded.height), (512, 768));
    assert_eq!(loaded.pack.filter, Filter::Linear);
    for frame in 0..24 {
        let (mut solid, mut soft, mut bottom) = (0, 0, 0);
        for y in 0..128 {
            for x in 0..128 {
                let a = loaded.rgba[((frame / 4 * 128 + y) * 512 + frame % 4 * 128 + x) * 4 + 3];
                if a > 0 {
                    assert!(
                        (8..120).contains(&x) && (8..116).contains(&y),
                        "clipped frame {frame}"
                    );
                    soft += usize::from(a < 255);
                }
                if a >= 128 {
                    solid += 1;
                    bottom = y;
                }
            }
        }
        assert!(
            solid > 1500 && soft > 80,
            "missing drawing or smooth alpha in frame {frame}"
        );
        let ground = match frame {
            9 => 107,
            11 => 111,
            _ => 115,
        };
        assert!(
            (ground - 2..=ground).contains(&bottom),
            "unstable ground: frame {frame}, bottom {bottom}"
        );
    }
    let pack = loaded.pack;
    let idle = &pack.clips[pack.behavior.idle];
    assert_eq!(
        idle.frames.first().unwrap().uv,
        idle.frames.last().unwrap().uv
    );
    assert!(idle.duration() > 5.);
    let stop = &pack.clips[pack.behavior.stop.unwrap()];
    assert_eq!(stop.interrupt, Interrupt::Finish);
    assert_eq!(pack.clips[stop.next.unwrap()].interrupt, Interrupt::OnMove);

    // Exercise the shipped manifest through a complete chase/rest/wake cycle.
    let origin = Vec2::new(100., 100.);
    let resting_cursor = origin + pack.anchor_offset(1.);
    let mut brain = Brain::new(pack, origin);
    let input = |cursor| TickInput {
        dt: 1. / 120.,
        cursor,
        scale: 1.,
        paused: false,
        screen: ScreenGeometry {
            id: 1,
            backing_scale: 2.,
            visible: Rect {
                origin: Vec2::ZERO,
                size: Vec2::new(1600., 1000.),
            },
        },
    };
    for _ in 0..360 {
        brain.tick(input(resting_cursor));
    }
    assert_eq!(brain.phase, Phase::Idle);
    brain.tick(input(Vec2::new(900., 112.)));
    assert_eq!(
        brain.phase,
        Phase::Starting,
        "play/roll/purr must yield immediately to chase"
    );
    let mut clips = std::collections::HashSet::new();
    for _ in 0..3000 {
        brain.tick(input(Vec2::new(900., 112.)));
        clips.insert(brain.pack.clips[brain.player.clip].name.clone());
    }
    for name in [
        "bound",
        "settle",
        "tail_flick",
        "play_roll_purr",
        "curl_up_asleep",
    ] {
        assert!(clips.contains(name), "shipped gatita cycle skipped {name}");
    }
    assert_eq!(brain.phase, Phase::Sleeping);
    brain.tick(input(Vec2::new(1200., 112.)));
    assert_eq!(brain.phase, Phase::Waking);
    assert_eq!(brain.pack.clips[brain.player.clip].name, "stretch");
}

#[test]
fn rejects_invalid_schema_roles_timing_motion_and_unknown_keys() {
    for (from, to) in [
        ("schema = 1", "schema = 2"),
        ("id = \"minimal\"", "id = \"../bad\""),
        ("anchor = [64, 116]", "anchor = [64, 129]"),
        ("[states.run]", "[states.walk]"),
        ("[states.idle]", "[states.idle]\nloop = false"),
        ("[states.idle]", "[states.idle]\nfps = 0"),
        ("[states.idle]", "[states.idle]\nfps = nan"),
        (
            "[states.idle]",
            "[states.idle]\nfps = 8\ndurations_ms = [1, 1]",
        ),
        ("[states.idle]", "[states.idle]\ndurations_ms = [1]"),
        ("[states.idle]", "[states.idle]\ndurations_ms = [1, 0]"),
        ("[states.idle]", "[states.idle]\ninterrupt = \"finish\""),
        ("[states.idle]", "[states.idle]\nflip = \"backwards\""),
        ("[states.idle]", "[states.idle]\nunknown = true"),
        ("[atlas]", "[behavior]\npreset = \"wander\"\n[atlas]"),
        ("[atlas]", "[behavior]\nsleep_after_ms = 0\n[atlas]"),
        ("[atlas]", "[behavior]\nidle_dealy_ms = 10\n[atlas]"),
        ("[atlas]", "[behavior]\nturn = \"missing\"\n[atlas]"),
        ("[atlas]", "[behavior]\nwake = \"run\"\n[atlas]"),
        ("[atlas]", "[motion]\nmax_speed = inf\n[atlas]"),
        ("[atlas]", "[motion]\nstart_distance = 24\n[atlas]"),
        ("[atlas]", "[[rules]]\nstate = \"run\"\n[atlas]"),
        ("grid = [8, 4]", "grid = [8, 3]"),
        ("grid = [8, 4]", "grid = [8, 4]\nregions = \"atlas.json\""),
        ("frames = [0, 1]", "frames = [32]"),
        ("frames = [0, 1]", "frames = []"),
        ("frames = [0, 1]", "frames = [\"top\"]"),
        ("file = \"atlas.png\"", "file = \"../atlas.png\""),
    ] {
        let t = copy_fixture("minimal");
        replace(&t, from, to);
        assert!(load(t.path()).is_err(), "accepted {to}");
    }
}
#[test]
fn rejects_missing_cyclic_and_looping_next_chains() {
    for chain in ["next = \"missing\"", "next = \"a\"", "next = \"run\""] {
        let t = copy_fixture("minimal");
        let p = t.path().join("pack.toml");
        let mut source = fs::read_to_string(&p).unwrap();
        source += &format!("\n[states.a]\nframes = [0]\nloop = false\n{chain}\n");
        fs::write(p, source).unwrap();
        assert!(load(t.path()).is_err());
    }
}
#[test]
fn named_regions_are_untrimmed_unrotated_and_bounded() {
    for invalid in [
        r#"{"top":{"x":1000,"y":0,"w":128,"h":128}}"#,
        r#"{"top":{"x":0,"y":0,"w":64,"h":128}}"#,
        r#"{"top":{"x":0,"y":0,"w":128,"h":128,"rotated":true}}"#,
    ] {
        let t = copy_fixture("regions");
        fs::write(t.path().join("atlas.json"), invalid).unwrap();
        assert!(load(t.path()).is_err());
    }
}
#[test]
fn rejects_apng_and_non_rgba() {
    for animated in [true, false] {
        let t = copy_fixture("minimal");
        let f = fs::File::create(t.path().join("atlas.png")).unwrap();
        let mut encoder = png::Encoder::new(f, 1024, 512);
        encoder.set_color(if animated {
            png::ColorType::Rgba
        } else {
            png::ColorType::Rgb
        });
        if animated {
            encoder.set_animated(1, 0).unwrap();
        }
        let mut writer = encoder.write_header().unwrap();
        writer
            .write_image_data(&vec![0; 1024 * 512 * if animated { 4 } else { 3 }])
            .unwrap();
        drop(writer);
        assert!(load(t.path()).is_err());
    }
}
#[test]
fn valid_zip_root_nested_and_duplicate_id_preserve_existing() {
    for prefix in ["", "outer/"] {
        let t = tempfile::tempdir().unwrap();
        let dest = t.path().join("installed");
        let zip = t.path().join("good.petpack");
        let source = root().join("tests/fixtures/minimal");
        let manifest = fs::read(source.join("pack.toml")).unwrap();
        let png = fs::read(source.join("atlas.png")).unwrap();
        archive(
            &zip,
            &[
                (&format!("{prefix}pack.toml"), &manifest),
                (&format!("{prefix}atlas.png"), &png),
            ],
        );
        let installed = install(&zip, &dest, &[]).unwrap();
        assert_eq!(load(&installed).unwrap().pack.id, "minimal");
        assert!(install(&zip, &dest, &[]).is_err());
        assert!(load(&installed).is_ok());
        assert_eq!(fs::read_dir(&dest).unwrap().count(), 1);
    }
}
#[test]
fn malicious_truncated_and_oversized_zips_leave_no_install() {
    for name in [
        "../escape.png",
        "/escape.png",
        "C:/escape.png",
        "a\\escape.png",
        "payload.dylib",
    ] {
        let t = tempfile::tempdir().unwrap();
        let zip = t.path().join("bad.petpack");
        let dest = t.path().join("packs");
        archive(&zip, &[(name, b"bad")]);
        assert!(install(&zip, &dest, &[]).is_err());
        assert_eq!(fs::read_dir(dest).unwrap().count(), 0);
    }
    let t = tempfile::tempdir().unwrap();
    let zip = t.path().join("bad.petpack");
    let dest = t.path().join("packs");
    fs::write(&zip, b"PK\x03\x04truncated").unwrap();
    assert!(install(&zip, &dest, &[]).is_err());
    let mut writer = zip::ZipWriter::new(fs::File::create(&zip).unwrap());
    writer
        .start_file(
            "large.png",
            zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated),
        )
        .unwrap();
    writer.write_all(&vec![0; MAX_BYTES as usize + 1]).unwrap();
    writer.finish().unwrap();
    assert!(install(&zip, &dest, &[]).is_err());
    assert_eq!(fs::read_dir(dest).unwrap().count(), 0);
}
#[cfg(unix)]
#[test]
fn escaped_symlinks_and_zip_symlinks_fail() {
    let t = copy_fixture("minimal");
    let external = tempfile::tempdir().unwrap();
    fs::copy(
        t.path().join("atlas.png"),
        external.path().join("atlas.png"),
    )
    .unwrap();
    fs::remove_file(t.path().join("atlas.png")).unwrap();
    std::os::unix::fs::symlink(
        external.path().join("atlas.png"),
        t.path().join("atlas.png"),
    )
    .unwrap();
    assert!(load(t.path()).is_err());
    let zip = t.path().join("bad.petpack");
    let mut writer = zip::ZipWriter::new(fs::File::create(&zip).unwrap());
    writer
        .add_symlink(
            "atlas.png",
            "/tmp/elsewhere",
            zip::write::SimpleFileOptions::default(),
        )
        .unwrap();
    writer.finish().unwrap();
    assert!(install(&zip, &t.path().join("packs"), &[]).is_err());
}
#[test]
fn discovery_first_valid_id_wins() {
    let t = copy_fixture("minimal");
    let parent = t.path().parent().unwrap(); // isolated roots avoid scanning other tests
    let container = tempfile::tempdir().unwrap();
    let target = container.path().join("a");
    fs::create_dir(&target).unwrap();
    for e in fs::read_dir(t.path()).unwrap() {
        let e = e.unwrap();
        fs::copy(e.path(), target.join(e.file_name())).unwrap();
    }
    let _ = parent;
    let list = discover(&[container.path().into(), container.path().into()]);
    assert_eq!(list.len(), 2);
    assert!(list[0].failure.is_none());
    assert_eq!(list[1].failure.as_deref(), Some("duplicate id"));
}
