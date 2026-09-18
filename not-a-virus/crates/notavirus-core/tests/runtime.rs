use notavirus_core::*;
fn frame(x: f64, duration: f64) -> Frame {
    Frame {
        uv: Rect {
            origin: Vec2::new(x, 0.),
            size: Vec2::new(0.1, 1.),
        },
        duration,
    }
}
fn clip(name: &str, looped: bool) -> Clip {
    Clip {
        name: name.into(),
        frames: vec![frame(0., 0.1), frame(0.1, 0.2)],
        looped,
        next: None,
        interrupt: Interrupt::Finish,
        flip: FlipMode::Velocity,
    }
}
fn pack() -> Pack {
    Pack {
        id: "test".into(),
        name: "Test".into(),
        version: 1,
        tile: Vec2::new(128., 128.),
        anchor: Vec2::new(64., 116.),
        filter: Filter::Nearest,
        clips: vec![
            clip("idle", true),
            clip("run", true),
            clip("start", false),
            clip("stop", false),
            clip("turn", false),
            clip("sleep", true),
            clip("wake", false),
            clip("settle", false),
        ],
        behavior: Behavior {
            idle: 0,
            moving: 1,
            start: Some(2),
            stop: Some(3),
            turn: Some(4),
            sleep: Some(5),
            wake: Some(6),
            idle_delay: 0.1,
            sleep_after: 0.5,
        },
        motion: Motion {
            max_speed: 180.,
            acceleration: 500.,
            stop_distance: 24.,
            start_distance: 40.,
        },
    }
}
fn input(cursor: Vec2, dt: f64) -> TickInput {
    TickInput {
        dt,
        cursor,
        screen: ScreenGeometry {
            id: 1,
            visible: Rect {
                origin: Vec2::ZERO,
                size: Vec2::new(1600., 1000.),
            },
            backing_scale: 2.,
        },
        scale: 1.,
        paused: false,
    }
}
fn run(b: &mut Brain, cursor: Vec2, seconds: f64) {
    for _ in 0..(seconds * 120.).round() as u32 {
        b.tick(input(cursor, 1. / 120.));
    }
}
#[test]
fn player_boundaries_chains_and_unequal_durations() {
    let mut p = pack();
    let mut player = Player::new(0);
    assert_eq!(player.frame(&p).uv.origin.x, 0.);
    player.advance(&p, 0.1, false);
    assert_eq!(player.frame(&p).uv.origin.x, 0.1);
    player.advance(&p, 0.2, false);
    assert!(player.elapsed < 1e-10);
    player.advance(&p, 10., false);
    assert!((player.elapsed - 0.1).abs() < 1e-10);
    p.clips[2].next = Some(7);
    player.select(2);
    player.advance(&p, 0.4, false);
    assert_eq!(player.clip, 7);
    assert!((player.elapsed - 0.1).abs() < 1e-10);
    player.advance(&p, 0.3, false);
    assert!(player.completed);
    assert_eq!(player.frame(&p).uv.origin.x, 0.1);
}
#[test]
fn flips_use_source_direction_and_anchor() {
    let mut p = pack();
    let player = Player::new(0);
    for (mode, left, right) in [
        (FlipMode::None, false, false),
        (FlipMode::Velocity, true, false),
        (FlipMode::AlwaysLeft, true, true),
        (FlipMode::AlwaysRight, false, false),
    ] {
        p.clips[0].flip = mode;
        assert_eq!(player.flipped(&p, true), left);
        assert_eq!(player.flipped(&p, false), right);
    }
    p.anchor = Vec2::new(40., 110.);
    assert_eq!(p.anchor_offset(1.5), Vec2::new(60., 27.));
    // Mirroring around center plus translation maps the anchor back to itself.
    assert_eq!(
        p.tile.x * 1.5 - p.anchor.x * 1.5 + p.mirror_translation(1.5),
        p.anchor.x * 1.5
    );
}
#[test]
fn full_cycle_stationary_cursor_catchup_sleep_and_wake() {
    let mut b = Brain::new(pack(), Vec2::new(100., 100.));
    let cursor = Vec2::new(800., 112.);
    b.tick(input(cursor, 1. / 120.));
    assert_eq!(b.phase, Phase::Starting);
    assert_eq!(b.origin, Vec2::new(100., 100.));
    run(&mut b, cursor, 0.4);
    assert_eq!(b.phase, Phase::Moving);
    assert_eq!(b.rest, 0.);
    run(&mut b, cursor, 1.);
    assert_eq!(b.phase, Phase::Moving);
    assert!(b.target_distance > 24.);
    let mut phases = Vec::new();
    for _ in 0..1200 {
        b.tick(input(cursor, 1. / 120.));
        if phases.last() != Some(&b.phase) {
            phases.push(b.phase);
        }
    }
    assert!(phases.contains(&Phase::Stopping));
    assert!(phases.contains(&Phase::Idle));
    assert_eq!(b.phase, Phase::Sleeping);
    b.tick(input(Vec2::new(1200., 112.), 1. / 120.));
    assert_eq!(b.phase, Phase::Waking);
    run(&mut b, Vec2::new(1200., 112.), 0.32);
    assert_eq!(b.phase, Phase::Moving);
}
#[test]
fn jitter_hysteresis_and_no_optional_roles() {
    let mut p = pack();
    p.behavior.start = None;
    p.behavior.stop = None;
    p.behavior.sleep = None;
    p.behavior.turn = None;
    let mut b = Brain::new(p, Vec2::new(100., 100.));
    for n in 0..200 {
        b.tick(input(Vec2::new(194. + f64::from(n % 2), 112.), 1. / 120.));
        assert_eq!(b.phase, Phase::Idle);
    }
    run(&mut b, Vec2::new(500., 112.), 5.);
    assert_eq!(b.phase, Phase::Idle);
    assert!(b.target_distance <= 24.00001);
}
#[test]
fn pause_and_long_tick_use_bounded_clock() {
    let mut b = Brain::new(pack(), Vec2::new(100., 100.));
    let c = Vec2::new(700., 112.);
    run(&mut b, c, 1.);
    let before = (b.origin, b.player.elapsed, b.rest, b.arrival, b.facing_left);
    let mut i = input(Vec2::new(0., 0.), 100.);
    i.paused = true;
    for _ in 0..5 {
        b.tick(i);
    }
    assert_eq!(
        before,
        (b.origin, b.player.elapsed, b.rest, b.arrival, b.facing_left)
    );
    b.tick(input(c, 1. / 120.));
    assert_eq!(b.cursor_speed, 0.);
    let mut a = Brain::new(pack(), Vec2::new(100., 100.));
    let mut z = Brain::new(pack(), Vec2::new(100., 100.));
    a.tick(input(c, 100.));
    z.tick(input(c, 0.1));
    assert_eq!(a.origin, z.origin);
    assert_eq!(a.player.elapsed, z.player.elapsed);
}
#[test]
fn start_completion_reevaluates_demand() {
    let mut b = Brain::new(pack(), Vec2::new(100., 100.));
    b.tick(input(Vec2::new(800., 112.), 1. / 120.));
    run(&mut b, Vec2::new(164., 112.), 0.35);
    assert_eq!(b.phase, Phase::Stopping);
    assert_eq!(b.origin, Vec2::new(100., 100.));
}
#[test]
fn stopping_finish_then_on_move_cancels_chain() {
    let mut p = pack();
    p.clips[3].next = Some(7);
    p.clips[7].interrupt = Interrupt::OnMove;
    let mut b = Brain::new(p, Vec2::new(100., 100.));
    b.phase = Phase::Stopping;
    b.player.select(3);
    b.tick(input(Vec2::new(800., 112.), 0.1));
    assert_eq!(b.phase, Phase::Stopping);
    assert_eq!(b.player.clip, 3);
    run(&mut b, Vec2::new(800., 112.), 0.21);
    assert_eq!(b.phase, Phase::Starting);
    assert_eq!(b.player.clip, 2);
}
#[test]
fn turning_keeps_moving_and_does_not_restart() {
    let mut b = Brain::new(pack(), Vec2::new(500., 200.));
    b.phase = Phase::Moving;
    b.player.select(1);
    b.chase_requested = true;
    run(&mut b, Vec2::new(100., 212.), 0.03);
    assert_eq!(b.phase, Phase::Turning);
    assert!(b.facing_left);
    let origin = b.origin;
    let elapsed = b.player.elapsed;
    run(&mut b, Vec2::new(1000., 212.), 0.05);
    assert_eq!(b.phase, Phase::Turning);
    assert!(b.player.elapsed > elapsed);
    assert_ne!(b.origin, origin);
}
#[test]
fn arrival_precedes_turn_and_movement_precedes_sleep() {
    let mut b = Brain::new(pack(), Vec2::new(500., 200.));
    b.rest = 10.;
    b.tick(input(Vec2::new(100., 212.), 1. / 120.));
    assert_eq!(b.phase, Phase::Starting);
    b.phase = Phase::Moving;
    b.player.select(1);
    b.arrival = 1.;
    b.chase_requested = true;
    b.velocity = Vec2::new(-100., 0.);
    b.facing_left = false;
    b.tick(input(b.origin + Vec2::new(64., 12.), 1. / 120.));
    assert_eq!(b.phase, Phase::Stopping);
}
#[test]
fn screen_size_clamp_and_oversized_tile() {
    let mut b = Brain::new(pack(), Vec2::new(1500., 900.));
    let mut i = input(Vec2::new(1700., 40.), 1. / 120.);
    i.screen.id = 2;
    i.screen.visible = Rect {
        origin: Vec2::new(1600., 0.),
        size: Vec2::new(100., 80.),
    };
    i.scale = 2.;
    let out = b.tick(i);
    assert_eq!(out.panel_size, Vec2::new(80., 80.));
    assert_eq!(out.panel_origin.y, 0.);
    assert_eq!(b.character_speed, 0.);
    assert!(!b.facing_left);
    assert_eq!(b.cursor_speed, 0.);
}
#[test]
fn screen_edges_arrive_and_zero_stop_does_not_overshoot() {
    for stop in [24., 0.] {
        let mut p = pack();
        p.motion.stop_distance = stop;
        p.behavior.start = None;
        p.behavior.stop = None;
        let mut b = Brain::new(p, Vec2::new(100., 100.));
        run(&mut b, Vec2::new(1600., 1000.), 20.);
        assert!(!b.chase_requested, "distance {}", b.target_distance);
        assert!(b.target_distance <= stop + 1e-7);
        assert!(b.origin.x <= 1472. && b.origin.y <= 872.);
    }
}
#[test]
fn motion_speed_acceleration_and_sixty_vs_one_twenty() {
    let mut p = pack();
    p.behavior.start = None;
    p.behavior.turn = None;
    let mut a = Brain::new(p.clone(), Vec2::new(100., 100.));
    let mut b = Brain::new(p, Vec2::new(100., 100.));
    let c = Vec2::new(1400., 700.);
    let mut old = Vec2::ZERO;
    for _ in 0..120 {
        a.tick(input(c, 1. / 120.));
        assert!(a.velocity.length() <= 180. + 1e-8);
        assert!((a.velocity - old).length() <= 500. / 120. + 1e-7);
        old = a.velocity;
    }
    for _ in 0..60 {
        b.tick(input(c, 1. / 60.));
    }
    assert!((a.origin - b.origin).length() < 1e-7);
}
#[test]
fn vertical_movement_keeps_facing() {
    let mut b = Brain::new(pack(), Vec2::new(100., 100.));
    b.facing_left = true;
    run(&mut b, Vec2::new(164., 800.), 1.);
    assert!(b.facing_left);
}

#[test]
fn restored_scale_preserves_initial_anchor_and_size_changes_preserve_feet() {
    let p = pack();
    let anchor = Vec2::new(500., 500.);
    let initial = anchor - p.anchor_offset(2.);
    let mut b = Brain::new_scaled(p, initial, 2.);
    let mut i = input(anchor, 0.);
    i.scale = 2.;
    b.tick(i);
    assert_eq!(b.origin + b.pack.anchor_offset(2.), anchor);
    i.scale = 1.5;
    b.tick(i);
    assert_eq!(b.origin + b.pack.anchor_offset(1.5), anchor);
    assert_eq!(b.velocity, Vec2::ZERO);
}
