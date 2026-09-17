# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

GPT6 Demos is a collection of ten standalone interactive web demos. Its portal lets visitors discover the demos, watch walkthroughs, and open applications.

## Operating Context

The root README and index.html define the current demos, images, video links, and local ports. run-all.sh starts ten demos on ports 3001–3010 and a portal server on port 3000.

## Capabilities and Constraints

The requested new portal lives in portal/. Gallery items open a preview with an embedded YouTube walkthrough and a fuller description. Video plays in the page on request. Demo title and launch links open the app in a new tab, preserving the portal. Use plain HTML, CSS, and JavaScript with the existing screenshots. YouTube playback requires internet access and an HTTP origin; apps require their local servers.

## Brand Commitments

User request: minimalist, enticing, clear, light design, based on the root index.html. Existing identity: GPT6 Demos, screenshot-led gallery.

## Evidence on Hand

README.md contains descriptions and YouTube links for all ten demos. index.html contains screenshot paths, concise descriptions, and localhost app URLs. images/ contains existing application screenshots; images/portal.png shows an earlier eight-demo version, so current HTML and README take precedence for demo count.

## Open Decisions

No additional audience or deployment requirements were supplied. The portal follows the existing local development workflow.
