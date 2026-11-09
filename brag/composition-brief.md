# HyperFrames Composition Brief: Satvic Studio

## Objective
Create a polished, short explainer of Satvic Studio's dubbed-video QA flow, focused on the problem of reviewing a language you do not speak.

## Output
- Composition directory: `brag/composition/`
- Rendered video: `brag/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: repository root
- Primary files read: `README.md`, `app/page.tsx`, `app/globals.css`, `services/dubbing-workflow.ts`, `app/api/analyze/route.ts`
- Product name: Satvic Studio
- Strongest grounded line: “AI listens, compares, and points to the moment.”
- Key UI moment: the `Analyze a dub` modal, then a report with paired source/dub time controls.
- Copy that must appear verbatim:
  - `Generate with Sarvam`
  - `I already have a dub`
  - `Source 00:26` and `Dub 00:26` (illustrative UI only)
  - `AI points you to where to listen. A fluent speaker confirms.`

## Creative Direction
- Tone preset: polished
- Creative direction: calm, confident product film for a practical language-access problem
- Angle: A person may hear a translated dub without understanding it. Satvic Studio compares both tracks and points to suspected moments for a fluent speaker to inspect.
- Hook: `You can hear the dub. Can you verify every word?`
- Outro: `AI points you to where to listen. A fluent speaker confirms.`
- Avoid: certification claims, invented accuracy scores, fake user testimonials, real uploaded media, personal data, or unrelated visuals.

## Visual Identity
- Background: `#f7f6f9`
- Text: `#22242d`
- Accent: `#7560c8`, with `#8e79dc` and dark panel `#37334a`
- Display font: Playfair Display for brief emphasis; Inter for UI headings
- Body font: Inter
- Visual reference: Satvic Studio’s cream/lilac dashboard, upload modal, paired audio review, and finding card.

## Storyboard
Follow `brag-plan.md` as the creative contract: gap/question (3.5s) → two-track upload (3.5s) → audio comparison (4s) → timestamped finding (5s) → fluent-human confirmation (4s). Total 20 seconds.

## Audio
- Audio role: warm polished bed with restrained UI sounds
- Music: `assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3`
- Music attribution: Sascha Ende, ende.app (CC BY 4.0); include in project notes.
- Music treatment: gentle entry, bed beneath UI, final fade; no voiceover.
- Music cue guidance: use bundled 120.19 BPM cue guidance; keep text readable; optional finding reveal near 17.02s.
- Audio-reactive treatment: very subtle glow on the active review panel, tied to music energy.
- Audio-coupled moments: one upload click; one soft finding reveal.
- Use restrained local UI sounds; the bundled music and sound-effect files are in the composition assets folder.
- Exact SFX choice: choose only after motion exists and copy assets into this composition.

## HyperFrames Instructions
Use the Brag and HyperFrames formats. Root holds 1920×1080, 30 fps, and the 20-second duration. Timed clips need IDs, `class="clip"`, `data-start`, `data-duration`; use a paused GSAP timeline registered per composition. Any scene file uses a `<template>` and its own root and timeline. No external network media, timers, random values, voiceover, or live API calls. Keep the scene editable and validate with `npx hyperframes check --json` before rendering.
