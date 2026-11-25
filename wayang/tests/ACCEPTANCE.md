# Wyang acceptance record

## Automated checks

Version 0.3 adds animated water and drifting lights. The Metal regression compares the automatic harbor effect with a camera-only render at the same pose. Of 29,700 sampled water pixels, 7,416 changed by more than 12 channel levels. The sampled sky and ship regions stayed within that tolerance. A flat image selected drifting lights automatically; 23,202 of 480,000 pixels changed over 0.6 seconds. At 1080p the camera-only marker test measured 12.36 pixels of background travel and 24.24 pixels of foreground travel after three seconds. The 0.3 suite passed on Metal. Its GNOME desktop run is pending.

Version 0.2 adds an automatic 12-second camera and foreground parallax loop. The GPU regression test supplies a stationary pointer, advances the default scene for three seconds, then tracks the same vertical marker in two depth regions. At 1920 × 1080 on Metal it measured 4.84 pixels of background travel and 11.40 pixels of foreground travel. Pause held the rendered frame and Reduce Motion returned it to the centered export.

The 0.2 release suite has 12 tests on macOS 27.2.1 (arm64, Apple M4 Pro). The preceding 11-test suite passed on Ubuntu. Coverage includes credential resolution, multipart requests, error classification, sequential batches, cancellation, explicit retry, import and orientation, project relocation, damaged assets, scene settings, credential-free playback and GPU output at landscape, portrait and ultrawide sizes.

## macOS login restoration (0.4.0)

The release suite passed 16 Rust tests on macOS 27.2.1 (Apple Silicon). The lifecycle tests cover opting in after Apply, pending or revoked approval, an old player exiting after replacement, and a Stop arriving between render and publication. Native tests also compare serialized system wallpaper selections across player lifetimes.

The packaged integration check registered a separate test launch agent through the editor checkbox and closed the editor. After the fixture player exited, `launchd` started the production restore command. WindowServer reported a new wallpaper window on the expected display. The restored snapshot kept its artwork and settings even when the fixture's saved numeric display ID differed. An absent display retained its selection. Repeated starts kept one player, a corrupt snapshot left the system wallpaper visible, and choosing a different native wallpaper while the player was absent cleared the saved choice. Disabling login restore allowed current playback to continue.

This run simulated session teardown in an existing graphical login. An actual offline sign-in after a physical restart and playback across two physical displays remain open acceptance checks. [Restart specification](../specs/002-persistent-wallpaper-after-restart.md)

## Generation

On November 24, 2026, two sequential live edits of the bundled Hamburg harbor photograph completed with `gpt-image-2.5-flare`. Both 1456 × 1088 results reopened from the saved project. Both preserve the large masted ship at the left, the central harbor and distant skyline. The evening sky is blue and the lit windows and their reflections are warm in both edits.

The portable project archive contains the original, both edits and their manifest. After extracting it in a new directory, the GNOME test staging tool resolved the selected candidate to the same artwork digest offline.

## macOS desktop

The 0.3 player replaced a running Mac wallpaper using the exact saved 0.2 scene. WindowServer captures of that player's window taken roughly one second apart differed by 19.84 channel levels on average (0–255). The 12-second blue-hour sample video was generated separately by the production GPU renderer at 1280 × 720 and 30 fps with the pointer parked.

In the 0.2 packaged player, the saved blue-hour candidate used its default display settings. Registration of native wallpaper captures measured 3 pixels of sky travel and 7.5 pixels of foreground water travel, normalized to 1080p. The check follows the actual artwork on the desktop with no automated pointer input. The same registration check is included in the GNOME harness. Its 0.2 desktop rerun is pending.

The packaged, ad-hoc signed app ran outside the checkout on macOS 27.2.1 (26B131). Launch Services opened the saved project with a blank provider key. A window capture showed the selected blue-hour harbor and the two edit thumbnails.

On the built-in display at scale 2, WindowServer reported a 1728 × 1117 point player immediately above the system desktop and below Finder icons. The player stayed out of keyboard focus. A capture of its entire 3456 × 2234 backing surface matched the exported rest pose pixel for pixel with a non-default focal point and horizon. An invalid replacement left that wallpaper active. Quitting the editor left playback running. Applying the motion version replaced the old process. With the editor closed, macOS Accessibility activated the player's menu-bar Pause, Resume and Stop actions. Stop removed the wallpaper window and its helper.

| Apple M4 Pro, 0.1 baseline, 60-second run | Frames | FPS | Median render time | 95th percentile | Process CPU |
| --- | ---: | ---: | ---: | ---: | ---: |
| Packaged desktop player, 3456 × 2234 | 1801 | 30.02 | 1.29 ms | 2.16 ms | 9.35% |
| Offscreen Metal renderer, 1920 × 1080 | 1801 | 30.01 | 1.52 ms | 2.48 ms | 3.21% |

Timing spans scene submission through GPU completion. The desktop process CPU figure includes the player event loop and presentation work. The 1080p measurement uses the same shader and profiler with an offscreen texture. Each CPU percentage is relative to one logical core.

Finder icon clicks, drag selection, the desktop context menu, Show Desktop, Spaces, physical display reconnection, lock/unlock and monitor sleep still require a hands-on pass. The capture covered Wyang's window only.

## Ubuntu desktop

The Linux run used a GNOME Shell 50.1 Wayland test session on Ubuntu 26.04.1 with Ubuntu Dock and Desktop Icons NG. At 1280 × 720 and scale 1, the resting wallpaper differed from its export by 0.0371 channel levels on average (0–255, excluding Shell chrome). The compositor showed motion, then identical frames with reduced motion. Stop restored the prior background. The player stayed out of Alt-Tab, survived a failed replacement, and exited after Stop and extension disable. The overview and extension re-enable paths were exercised.

The Linux 60-second benchmark finished before migration. Its numeric output stayed on the Linux host. Rapid extension and player teardown emitted an intermittent GLib iterator warning. Physical display reconnection, fractional scaling, workspace switching, screen lock and monitor sleep remain open on Linux. The display tests used the bundled photo. The generated blue-hour project and the final shared frame-pacing change still need a GNOME desktop rerun.
