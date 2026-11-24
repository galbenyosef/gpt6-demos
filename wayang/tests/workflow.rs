use anyhow::Result;
use image::{ImageEncoder, Rgba, RgbaImage};
use std::{fs, path::Path, sync::Mutex};
use tempfile::tempdir;
use wyang::{
    artwork,
    project::{Playback, Project},
    provider::{Batch, Config, DEFAULT_MODEL, Failure, Fixtures, Job, Provider, Request},
    scene::{self, Motion, Pose, Settings},
};

fn image(seed: u8) -> Vec<u8> {
    artwork::png(&RgbaImage::from_fn(72, 36, |x, y| {
        Rgba([x as u8 * 3, y as u8 * 6, seed, 255])
    }))
    .unwrap()
}
fn project() -> Project {
    Project::from_bytes("harbor.png".into(), image(10)).unwrap()
}
struct FixtureBatch {
    calls: Mutex<Vec<(usize, String, String, String)>>,
    dir: Fixtures,
    rate: Mutex<bool>,
}
impl Provider for FixtureBatch {
    fn edit(&self, r: &Request, slot: usize) -> std::result::Result<Vec<u8>, Failure> {
        self.calls.lock().unwrap().push((
            slot,
            r.source_digest.clone(),
            artwork::digest(&r.source),
            r.user_prompt.clone(),
        ));
        if slot == 1 && std::mem::take(&mut *self.rate.lock().unwrap()) {
            return Err(Failure::Rate(Some(7)));
        }
        self.dir.edit(r, slot)
    }
}
fn fixtures(dir: &Path) -> FixtureBatch {
    for i in 1..=3 {
        fs::write(dir.join(format!("{i}.png")), image(i)).unwrap();
    }
    FixtureBatch {
        calls: Default::default(),
        dir: Fixtures(dir.into()),
        rate: Mutex::new(true),
    }
}
#[test]
fn sequential_generation_retry_save_move_and_partial_recovery() -> Result<()> {
    let tmp = tempdir()?;
    let fixture = fixtures(tmp.path());
    let mut p = project();
    let source = p.manifest.source.sha256.clone();
    p.manifest.prompt = "Make it blue hour".into();
    let mut b = Batch::new(1, 3, p.manifest.prompt.clone(), DEFAULT_MODEL.into())?;
    let mut jobs = vec![];
    b.run(&fixture, &p, |j| jobs.push(j));
    assert_eq!(jobs.len(), 2);
    for job in jobs {
        assert!(b.accept(&job));
        match job.result {
            Ok((c, g)) => p.add(c, g),
            Err(e) => assert_eq!(e, Failure::Rate(Some(7))),
        }
    }
    assert_eq!(b.ready, 1);
    assert!(!b.active);
    let stale = Job {
        id: 1,
        slot: 1,
        result: Err(Failure::Network),
    };
    b.retry(2)?;
    assert!(!b.accept(&stale));
    p.manifest.prompt = "Next draft".into();
    let mut jobs = vec![];
    b.run(&fixture, &p, |j| jobs.push(j));
    for j in jobs {
        assert!(b.accept(&j));
        let (c, g) = j.result.unwrap();
        p.add(c, g);
    }
    assert_eq!(b.ready, 3);
    let calls = fixture.calls.lock().unwrap();
    assert_eq!(calls.iter().map(|c| c.0).collect::<Vec<_>>(), [0, 1, 1, 2]);
    assert!(calls.iter().all(|(_, d, u, prompt)| *d == source
        && *u == calls[0].2
        && prompt == "Make it blue hour"));
    p.manifest.selected = p.manifest.variants[1].id.clone();
    p.manifest.display = "panel".into();
    let settings = Settings {
        effect: scene::Effect::Lights,
        focal: [0.72, 0.66],
        horizon: 0.55,
        strength: 0.008,
        ambient: false,
        ..Default::default()
    };
    p.set_settings("panel", settings);
    let first = tmp.path().join("first");
    let moved = tmp.path().join("moved");
    p.save(&first)?;
    fs::rename(first, &moved)?;
    let mut reopened = Project::open(&moved)?;
    assert_eq!(reopened.candidates.len(), 3);
    assert_eq!(reopened.settings("panel"), settings);
    assert_eq!(reopened.chosen().pixels, p.chosen().pixels);
    assert_eq!(*reopened.original, *p.original);
    let scenes = tmp.path().join("playback");
    let id = Playback::stage(&scenes, &reopened, "panel")?;
    reopened.set_settings("panel", Settings::default());
    let manifest = fs::read_to_string(scenes.join(&id).join("scene.json"))?;
    assert!(!manifest.contains("prompt") && !manifest.contains("model"));
    let broken = &p.manifest.variants[1];
    fs::write(moved.join(&broken.asset.path), b"corrupt")?;
    fs::remove_file(moved.join(&p.manifest.variants[2].asset.path))?;
    let partial = Project::open(&moved)?;
    assert_eq!(partial.candidates.len(), 1);
    assert_eq!(partial.unavailable.len(), 2);
    assert!(partial.candidates.contains_key(&partial.manifest.selected));
    fs::remove_dir_all(moved)?;
    let (live, pixels) = Playback::load(&scenes, &id)?;
    assert_eq!(live.settings, settings);
    assert_eq!(pixels, p.chosen().pixels);
    Ok(())
}
#[test]
fn cancel_in_flight_then_retry_ignores_the_late_result() -> Result<()> {
    use std::sync::mpsc;
    struct Blocked(Mutex<mpsc::Receiver<()>>, mpsc::Sender<()>);
    impl Provider for Blocked {
        fn edit(&self, _: &Request, _: usize) -> std::result::Result<Vec<u8>, Failure> {
            self.1.send(()).unwrap();
            self.0.lock().unwrap().recv().unwrap();
            Ok(image(1))
        }
    }
    let p = project();
    let (release, wait) = mpsc::channel();
    let (entered, started) = mpsc::channel();
    let mut b = Batch::new(10, 3, "Harbor".into(), DEFAULT_MODEL.into())?;
    let worker = b.clone();
    let handle = std::thread::spawn(move || {
        let mut events = Vec::new();
        worker.run(&Blocked(Mutex::new(wait), entered), &p, |j| events.push(j));
        events
    });
    started.recv()?;
    b.cancel();
    b.retry(11)?;
    release.send(())?;
    assert!(handle.join().unwrap().is_empty());
    assert!(!b.accept(&Job {
        id: 10,
        slot: 0,
        result: Err(Failure::Network)
    }));
    assert!(b.active);
    assert_eq!(b.ready, 0);
    Ok(())
}
#[test]
fn invalid_rasters_and_import_limits() -> Result<()> {
    assert!(artwork::decode(b"incomplete", artwork::IMPORT_BYTES).is_err());
    let bytes = image(2);
    assert!(artwork::decode(&bytes, bytes.len() - 1).is_err());
    // A huge IHDR with a valid CRC must fail before decoding even one image row.
    let mut bytes = bytes;
    bytes[16..20].copy_from_slice(&1_000_000u32.to_be_bytes());
    let mut crc = u32::MAX;
    for byte in &bytes[12..29] {
        crc ^= *byte as u32;
        for _ in 0..8 {
            crc = (crc >> 1) ^ (0xedb88320 & (0u32.wrapping_sub(crc & 1)));
        }
    }
    bytes[29..33].copy_from_slice(&(!crc).to_be_bytes());
    assert!(
        format!(
            "{:#}",
            artwork::decode(&bytes, artwork::IMPORT_BYTES).unwrap_err()
        )
        .contains("32 megapixels")
    );
    assert!(wyang::project::Candidate::from_png(vec![5; 60]).is_err());
    Ok(())
}
#[test]
fn exif_orientation_is_applied_once_and_upload_has_no_exif() -> Result<()> {
    let im = image::RgbImage::from_fn(24, 12, |x, _| {
        if x < 12 {
            image::Rgb([255, 0, 0])
        } else {
            image::Rgb([0, 0, 255])
        }
    });
    let exif=b"II\x2a\x00\x08\x00\x00\x00\x01\x00\x12\x01\x03\x00\x01\x00\x00\x00\x06\x00\x00\x00\x00\x00\x00\x00";
    let mut jpg = vec![];
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpg, 98);
    encoder.set_exif_metadata(exif.to_vec())?;
    encoder.encode_image(&im)?;
    let p = Project::from_bytes("portrait.jpg".into(), jpg.clone())?;
    assert_eq!(*p.original, jpg);
    let oriented = &p.source.pixels;
    assert_eq!(oriented.dimensions(), (12, 24));
    assert!(oriented[(6, 2)][0] > 220 && oriented[(6, 20)][2] > 220);
    let r = Request::new(&p, "Retain the subject".into(), DEFAULT_MODEL.into())?;
    assert!(!r.source.windows(4).any(|p| p == b"eXIf"));
    assert_eq!(
        artwork::decode(&r.source, artwork::UPLOAD_BYTES)?,
        **oriented
    );
    let dir = tempdir()?;
    p.save(dir.path())?;
    assert_eq!(Project::open(dir.path())?.source.pixels, p.source.pixels);
    Ok(())
}
#[test]
fn restored_batches_use_new_ids_and_settings_validate() {
    assert!(Batch::new(1, 0, "p".into(), "m".into()).is_err());
    assert!(Batch::new(1, 5, "p".into(), "m".into()).is_err());
    let mut m = Motion::default();
    let s = Settings::default();
    for _ in 0..30 {
        m.step(s, [1., -1.], 1. / 30., false, false);
    }
    assert!(m.pose.pointer[0] > 0.98 && m.pose.pointer[0] < 1.);
    let held = m.pose;
    assert!(!m.step(s, [0., 0.], 1., true, false));
    assert_eq!(m.pose, held);
    assert!(!m.step(s, [1.; 2], 1., true, true));
    assert_eq!(m.pose, Pose::default());
    assert!(
        Settings {
            strength: f32::NAN,
            ..s
        }
        .validate()
        .is_err()
    );
    for target in [[1920, 1080], [1080, 1920], [3440, 1440]] {
        for focal in [[0.; 2], [1.; 2]] {
            let s = Settings {
                focal,
                strength: 0.01,
                ..s
            };
            for pointer in [[-1.; 2], [1.; 2]] {
                for step in 0..16 {
                    let phase = step as f32 / 16.;
                    let u = scene::uniforms(
                        [1500, 900],
                        target,
                        s,
                        Pose {
                            pointer,
                            phase,
                            animated: true,
                        },
                    );
                    for i in 0..2 {
                        assert!(
                            u.center[i] - u.span[i] / 2. - u.offset[i].abs() >= 0.
                                && u.center[i] + u.span[i] / 2. + u.offset[i].abs() <= 1.
                        );
                    }
                }
            }
        }
    }
}
#[test]
fn missing_configuration_is_valid_and_blank_env_masks_file() -> Result<()> {
    let dir = tempdir()?;
    assert!(!Config::resolve(dir.path(), |_| None)?.ready());
    fs::write(
        dir.path().join(".env"),
        "OPENAI_API_KEY=file-dummy\nOPENAI_IMAGE_MODEL=file-model\n",
    )?;
    assert!(Config::resolve(dir.path(), |_| None)?.ready());
    assert!(
        !Config::resolve(dir.path(), |k| (k == "OPENAI_API_KEY")
            .then_some("   ".into()))?
        .ready()
    );
    let c = Config::resolve(dir.path(), |_| Some("environment".into()))?;
    assert_eq!(c.model, "environment");
    assert!(c.ready());
    Ok(())
}
#[test]
fn asset_path_escape_is_flagged_without_reading_it() -> Result<()> {
    let p = project();
    let dir = tempdir()?;
    p.save(dir.path())?;
    let mut m = p.manifest.clone();
    m.source.path = "../outside.png".into();
    fs::write(dir.path().join("project.json"), serde_json::to_vec(&m)?)?;
    assert!(Project::open(dir.path()).is_err());
    Ok(())
}
#[test]
fn player_rejects_inherited_credentials_without_echoing_them() -> Result<()> {
    let r = std::process::Command::new(env!("CARGO_BIN_EXE_wyang-player"))
        .env("OPENAI_API_KEY", "fixture-secret-sentinel")
        .output()?;
    assert!(!r.status.success());
    let msg = String::from_utf8(r.stderr)?;
    assert!(msg.contains("credential-free"));
    assert!(!msg.contains("fixture-secret-sentinel"));
    Ok(())
}
