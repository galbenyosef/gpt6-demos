use notavirus_core::*;
use notavirus_gnome::{
    assets::Assets,
    protocol::*,
    runtime::{Runtime, input},
};
use serde_json::{Value, json};
use std::{
    os::unix::fs::{MetadataExt, PermissionsExt},
    path::PathBuf,
};
fn packs() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources/packs")
}
fn send(r: &mut Runtime, v: Value) -> Result<Value, String> {
    r.handle(serde_json::from_value(v).unwrap())
}
fn runtime() -> (tempfile::TempDir, Runtime) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let assets = Assets::new(dir.path()).unwrap();
    (dir, Runtime::new(vec![packs()], assets))
}
fn hello(r: &mut Runtime) {
    let a = send(
        r,
        json!({"type":"hello","seq":1,"version":1,"pack":"default","size":1.0,"paused":false}),
    )
    .unwrap();
    send(
        r,
        json!({"type":"commit_pack","seq":2,"generation":a["generation"]}),
    )
    .unwrap();
}
#[test]
fn staging_rollback_preferences_and_private_assets() {
    let (_dir, mut r) = runtime();
    assert!(
        send(
            &mut r,
            json!({"type":"hello","seq":1,"version":2,"pack":"default","size":1.0,"paused":false})
        )
        .is_err()
    );
    let a = send(
        &mut r,
        json!({"type":"hello","seq":2,"version":1,"pack":"removed","size":1.5,"paused":true}),
    )
    .unwrap();
    assert_eq!(a["id"], "default");
    let path = r.assets.path().join(a["token"].as_str().unwrap());
    assert_eq!(std::fs::metadata(&path).unwrap().mode() & 0o777, 0o600);
    assert!(r.brain.is_none());
    send(
        &mut r,
        json!({"type":"commit_pack","seq":3,"generation":a["generation"]}),
    )
    .unwrap();
    assert!(!path.exists());
    assert!(send(&mut r, json!({"type":"select_pack","seq":4,"id":"missing"})).is_err());
    let a = send(&mut r, json!({"type":"select_pack","seq":5,"id":"paco"})).unwrap();
    assert_eq!(r.brain.as_ref().unwrap().pack.id, "default");
    assert!(
        send(
            &mut r,
            json!({"type":"commit_pack","seq":6,"generation":999})
        )
        .is_err()
    );
    send(
        &mut r,
        json!({"type":"discard_pack","seq":7,"generation":a["generation"]}),
    )
    .unwrap();
    assert_eq!(r.brain.as_ref().unwrap().pack.id, "default");
    assert!(send(&mut r, json!({"type":"set_size","seq":7,"size":2.0})).is_err());
    let path = r.assets.path().to_owned();
    drop(r);
    assert!(!path.exists());
}
#[test]
fn coordinate_adapter_matches_direct_core_for_negative_vertical_layout_and_long_ticks() {
    let (_dir, mut r) = runtime();
    hello(&mut r);
    let loaded = notavirus_pack::load(&packs().join("default")).unwrap();
    let mut direct = Brain::new(loaded.pack, Vec2::ZERO);
    for n in 0..300u64 {
        let sample = Sample {
            dt: if n == 50 { 5.0 } else { 1. / 60. },
            pointer: [-1400. + (n as f64 * 3.), -200.],
            monitor: [-1920., -1080., 1920., 1080.],
            work: [-1920., -1050., 1860., 1050.],
            monitor_id: 1,
            monitor_generation: 2,
            device_scale: 1.5,
            visible: true,
            reset: n == 0,
        };
        let mut tick = input(sample, 1.);
        if n == 0 {
            direct.origin = tick.cursor - direct.pack.anchor_offset(1.);
            tick.dt = 0.;
        }
        let expected = direct.tick(tick);
        let frame = send(&mut r, json!({"type":"sample","seq":n+3,"sample":sample})).unwrap();
        assert_eq!(
            frame["rect"],
            json!([
                -1920. + expected.panel_origin.x,
                -expected.panel_origin.y - expected.panel_size.y,
                expected.panel_size.x,
                expected.panel_size.y
            ])
        );
        assert_eq!(
            frame["crop"],
            json!([
                expected.frame.uv.origin.x,
                1. - expected.frame.uv.origin.y - expected.frame.uv.size.y,
                expected.frame.uv.size.x,
                expected.frame.uv.size.y
            ])
        );
        assert_eq!(frame["flip"], expected.flip_x);
    }
}
#[test]
fn runtime_dir_rejects_symlinks_permissions_and_reclaims_only_unleased_sessions() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let a = Assets::new(dir.path()).unwrap();
    let a_path = a.path().to_owned();
    let b = Assets::new(dir.path()).unwrap();
    assert!(a_path.exists());
    drop(b);
    std::os::unix::fs::symlink(dir.path(), dir.path().join("link")).unwrap();
    assert!(Assets::new(&dir.path().join("link")).is_err());
    std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o755)).unwrap();
    assert!(Assets::new(dir.path()).is_err());
}

#[test]
fn pause_hidden_and_monitor_changes_freeze_time_and_fit_work_area() {
    let (_dir, mut r) = runtime();
    hello(&mut r);
    let mut sample = Sample {
        dt: 0.1,
        pointer: [500., 400.],
        monitor: [0., 0., 1000., 800.],
        work: [0., 30., 1000., 770.],
        monitor_id: 0,
        monitor_generation: 1,
        device_scale: 1.,
        visible: true,
        reset: true,
    };
    send(&mut r, json!({"type":"sample","seq":3,"sample":sample})).unwrap();
    send(&mut r, json!({"type":"set_paused","seq":4,"paused":true})).unwrap();
    let before = r
        .brain
        .as_ref()
        .unwrap()
        .player
        .frame(&r.brain.as_ref().unwrap().pack);
    sample.reset = false;
    sample.dt = 60.;
    sample.pointer = [900., 700.];
    send(&mut r, json!({"type":"sample","seq":5,"sample":sample})).unwrap();
    assert_eq!(
        before,
        r.brain
            .as_ref()
            .unwrap()
            .player
            .frame(&r.brain.as_ref().unwrap().pack)
    );
    send(&mut r, json!({"type":"set_size","seq":6,"size":2.0})).unwrap();
    sample.monitor_id = 2;
    sample.monitor_generation = 2;
    sample.monitor = [-500., 800., 90., 90.];
    sample.work = [-500., 810., 90., 80.];
    sample.pointer = [-450., 850.];
    sample.reset = true;
    let frame = send(&mut r, json!({"type":"sample","seq":7,"sample":sample})).unwrap();
    let rect: Vec<f64> = serde_json::from_value(frame["rect"].clone()).unwrap();
    assert!(
        rect[0] >= -500.
            && rect[1] >= 810.
            && rect[0] + rect[2] <= -410.
            && rect[1] + rect[3] <= 890.
    );
    assert_eq!(r.brain.as_ref().unwrap().velocity, Vec2::ZERO);
    sample.visible = false;
    sample.reset = false;
    send(&mut r, json!({"type":"sample","seq":8,"sample":sample})).unwrap();
    assert_eq!(
        before,
        r.brain
            .as_ref()
            .unwrap()
            .player
            .frame(&r.brain.as_ref().unwrap().pack)
    );
}

#[test]
fn quiet_hint_follows_core_frame_boundaries_and_never_defers_chase() {
    use notavirus_gnome::runtime::quiet_for;
    let loaded = notavirus_pack::load(&packs().join("gatita")).unwrap();
    let mut brain = Brain::new(loaded.pack, Vec2::ZERO);
    assert_eq!(quiet_for(&brain), 0.075);
    brain.player.elapsed = 0.89;
    assert!((quiet_for(&brain) - 0.01).abs() < 1e-10);
    brain.chase_requested = true;
    assert_eq!(quiet_for(&brain), 0.);
    brain.chase_requested = false;
    brain.phase = Phase::Moving;
    assert_eq!(quiet_for(&brain), 0.);
    brain.phase = Phase::Sleeping;
    brain.player.select(brain.pack.behavior.sleep.unwrap());
    assert_eq!(quiet_for(&brain), 0.075);
}
