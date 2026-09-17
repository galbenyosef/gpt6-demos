# Portal verification

- Chromium desktop 1440×1000 and mobile 390×844.
- Ten cards open dialogs with the expected app ports 3001–3010, README video IDs, and expanded descriptions.
- No iframe exists before Play. Play creates the expected privacy-enhanced YouTube iframe; a live player check reported video currentTime 5.000387 and paused false.
- Clicking the linked demo title generated a real new tab. The original URL and open dialog were preserved. The local demo response was intercepted for this navigation check; individual apps were not started or tested.
- Closing with Escape, close button, or backdrop works. Focus returns to the trigger. The iframe is removed on close.
- No horizontal overflow on gallery or dialog at 390px. Reduced motion disables the dialog animation. No application JavaScript errors.
- Server checks cover intended assets, /portal redirect, root compatibility, HEAD, method restrictions and rejection of source-file routes.
- Detector's 11px metadata warning was fixed to12px; the design hook reports no deterministic findings afterward.

## Asset provenance

No new raster assets were generated or copied. The gallery reuses the repository's application screenshots under images/, mapped by the original index.html. Dialog thumbnails use YouTube's i.ytimg.com/vi/<README-video-id>/maxresdefault.jpg; if a remote thumbnail fails or is only a tiny placeholder, the existing application screenshot is used. The review PNGs are Chromium captures of this implementation, not shipping assets.

## Finish review

Independent reviewer disposition: ship. The initial review identified one material finding, a soft enlarged YouTube poster. The fix uses high-resolution thumbnails with screenshot fallback. A verdict pass inspected the recaptured desktop dialog and scored the finding resolved. Playback and new-tab navigation were rechecked after the change (video currentTime 5.187805, paused false).
