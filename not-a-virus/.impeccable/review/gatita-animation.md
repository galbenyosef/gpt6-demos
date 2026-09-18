# gatita animation review

Disposition: implementation complete; live-motion and performance acceptance remain pending. This is the implementing agent's bounded review, not an independent review or full v1 release approval.

The user's scope was to implement gatita while leaving the other desktop checks pending. The native surface and controls remain unchanged. Paco remains the bundled default; gatita now appears under her real name instead of Diagnostic.

## Shipped result

24 original AI-assisted smooth cartoon drawings, 512×768 RGBA, 128px tiles, linear filtering. Seven data-driven clips cover paw play, roll and quiet visual purr; a four-pose bounding chase; crouch; chained settle/tail flick; curled sleep; and waking stretch. All poses retain tabby stripes, green eyes, pink nose/ears and cream markings. Source/provenance/compiler/preview are in `art/gatita/`.

## Evidence and corrections

- Inspected supplied references, generated source, compiled transparent atlas, and native Small/right and Large/left contact sheets. Native captures contain the actual production CALayer output, not a browser approximation.
- The source has approximate grid spacing and RGB backdrop values beneath its alpha matte. Alpha-aware silhouette extraction preserves complete tails/paws; alpha-weighted area sampling avoids sampling the backdrop into opaque pixels. Near-transparent matte noise is removed while fractional edge alpha remains.
- Common registration keeps grounded poses at the same virtual floor; two bounds lift eight/four pixels within the tile. The extended-tail pose shifts eleven pixels to keep its torso beside the following seated pose.
- 144 gatita frame/size/facing comparisons pass against a bilinear alpha reference with mean error below 1/255; maximum observed 0.8262/255. This tolerance acknowledges AppKit resampling differences and is not a pixel-identical claim. Both native filter settings and source margins are checked. Paco's 96 exact silhouette checks remain passing.
- Shipped-manifest simulation verifies immediate idle interruption, chase, both stop-chain clips, return to idle, sleeping and waking through stretch. 25 portable tests and all native controls/import checks pass. Strict Clippy, formatting, signed bundle and plist validation pass.
- The preview generator now honors nearest/linear filtering, shows each pack's actual clips, starts paused for reduced motion and stops advancing while hidden. The prior browser restriction remains; no browser interaction or human live-motion approval is claimed.

## Performance and acceptance limits

The first isolated release measurement delivered 901 callbacks in 15.091 seconds (59.71 Hz), 1.148% process CPU and 47.86 MB peak RSS. Memory and frequency passed; CPU exceeded the <1% target. A repeat after builds completed delivered zero display callbacks, so its 0.127% CPU is invalid as an idle animation measurement. Both benchmark runs cleaned up their own panel/status item before assertions. Repeat with an awake, delivering display clock before claiming gatita's performance budget passed.

The four-pose bound is deliberately compact. Play-to-rest uses held drawings and authored timings; it is not a high-frame-count animation. Perceived smoothness and temperament still need the user's live review. Physical click-through, chooser, Quit/restart, mixed displays, Spaces/fullscreen, macOS 13 fallback and fresh-Mac acceptance remain deferred as requested. No live app preferences were changed.
