# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

GPT6 Demos is a collection of fifteen browser demos and two native desktop demos, NotAVirus and Wyang. Its portal lets visitors discover the demos, watch previews and find the instructions for running each application.

## Operating Context

The root README and index.html define the current demos, images, video links, and local ports. run-all.sh starts fifteen browser demos on ports 3001–3015 by default and a portal server on port 3000.

## Capabilities and Constraints

The preview portal lives in portal/. Each card opens a description with a screenshot, a local clip or a YouTube walkthrough. Video plays in the page on request. Browser demos link to their local servers and native demos link to setup instructions. Both open in a new tab. The portal uses plain HTML, CSS and JavaScript. YouTube playback requires internet access and an HTTP origin.

## Brand Commitments

User request: minimalist, enticing, clear, light design, based on the root index.html. Existing identity: GPT6 Demos, screenshot-led gallery.

## Evidence on Hand

README.md contains descriptions of the demos and YouTube links where available. index.html contains screenshot paths, concise descriptions, and localhost app URLs. images/ contains existing application screenshots; images/portal.png shows the complete plain gallery.

## Open Decisions

No additional audience or deployment requirements were supplied. The portal follows the existing local development workflow.
