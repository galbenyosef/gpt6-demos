# 002 — Resume the macOS wallpaper after restart

Wyang already keeps an applied wallpaper playing when the editor closes. Today, restarting the Mac ends playback. This change adds an opt-in **Resume wallpaper at login** setting. After a restart or logout, signing back in restores the last applied scene on each eligible display. The editor stays closed and playback works offline. [Existing desktop behavior](001-spec-animated-wallpaper-gen.md#5-desktop-integration)

## What the user controls

The checkbox belongs beside the desktop playback controls and defaults to off, including after an upgrade. Turning it on remembers scenes already playing, so the user can enable it after applying a wallpaper. Turning it off cancels future restores and lets current playback continue.

| Action | What happens at the next login |
| --- | --- |
| Apply a scene, then close the editor | Restore that scene with its applied artwork, crop, depth, effect and motion settings. Later draft edits take effect only after another successful Apply. |
| Try to replace a scene and the new player fails to start | Restore the last successfully applied scene. |
| Choose **Stop** in the editor or the player’s menu | Leave the system wallpaper visible on that display. Other displays keep their choices. |
| Choose a different wallpaper in macOS System Settings | Honor the system selection on the affected display, including when the selection changed while the player was absent. A later explicit Wyang Apply can reclaim that display. |
| Log out or shut down with a scene playing | Keep the saved choice for the next login. Ordinary player teardown must preserve it. |

## How restoration works

1. **Record the applied scene.** Under the user’s Wyang Application Support directory, associate each stable display UUID with its immutable playback snapshot ID and the system wallpaper selection observed at Apply. The existing snapshot contains the artwork and settings, so restoration also works after the source project moves. The current numeric display ID, process token and lease describe a running player and can expire across login. [Snapshot implementation](../src/project.rs) · [macOS player lifecycle](../src/mac_host.rs)
2. **Register a bundled login helper.** On macOS 13 and later, the packaged app registers a per-user helper with `SMAppService` when the user enables the checkbox and unregisters it when they disable it. Read the actual registration status when displaying the control. If macOS requires approval, show that state and a route to Login Items in System Settings. For an unbundled development launch, direct the user to the packaged app for login registration. [Apple Service Management](https://developer.apple.com/documentation/servicemanagement/smappservice)
3. **Restore in the signed-in desktop session.** Resolve each display UUID to its current screen, compare the saved system wallpaper selection with the current one, validate the snapshot and launch the existing player. Reuse the player’s readiness check and its menu-bar controls. Skip displays that are absent and retain their choices for a later login. A missing or corrupt snapshot leaves that display’s system wallpaper visible and allows other displays to restore. The helper needs neither an OpenAI key nor a network connection.
4. **Respect the latest choice.** Serialize restore, Apply and Stop per display and write saved choices atomically. Recheck the choice before publishing a player. An older player exiting after replacement must never clear its successor’s choice. Registration can launch the helper immediately, so repeated starts must leave an already active scene with a single player. [Apple login-item registration behavior](https://developer.apple.com/documentation/servicemanagement/smappservice/register%28%29)

## Acceptance

- **Packaged Mac, actual restart.** Apply the harbor scene, enable the setting, close the editor and restart. Sign in offline. Verify the same crop and effect animate behind Finder icons, the editor stays closed, and the player menu offers **Pause** and **Stop**.
- **User override.** Use separate logout and login runs to test **Stop** from the menu with the editor closed, choosing a new macOS wallpaper, and turning off the checkbox. In each case the system wallpaper should be visible at login. Also exercise a system selection change while the player is absent.
- **Independent displays.** Apply distinct scenes on two displays and stop one. After login, only the other resumes. Disconnect a display before a subsequent login and verify its scene never appears on the remaining screen.
- **Automated lifecycle checks.** Cover a clean install, pending or revoked macOS approval, duplicate helper launches, a failed replacement, a corrupt snapshot and a Stop racing with restore. Record the real restart separately from simulated login tests.
