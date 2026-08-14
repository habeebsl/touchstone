# Touchstone — Project Overview

## One-line pitch
A mirror that already knows what works on you: snap a selfie, get 3 makeup looks personalized to your actual skin/eye/hair color, tap one, see it live on your face.

## Hackathon context
Built for the YouCam API Skin AI & Apparel VTO Hackathon (Perfect Corp / Devpost, deadline Aug 17 2026). Submitting under the **Skin AI + Apparel/Beauty combined** framing — the product uses Skin AI analysis to drive an Apparel-adjacent VTO experience (makeup), so both capability families work as one experience rather than two bolted-together features.

## The problem we're targeting
The brief's own framing: *"People don't wonder about their skin in the abstract, they wonder right before a purchase, right after a bad breakout, right when they're standing in front of a mirror deciding whether something is working."*

Concretely, this shows up as:
- Existing "color analysis" tools (TikTok filters, ChatGPT selfie prompts) are widely known to be unreliable — different filters give different answers for the same face, because they're guessing from a color overlay, not measuring anything real.
- Makeup shopping (shade matching especially) has a well-documented, long-running trust problem, particularly for skin tones outside the lightest range — brands guess, get it wrong, and users return products or give up buying online entirely.
- There is currently no tool that goes from **real, measured facial color data → a specific makeup look → proof on your actual face**, in one flow, in under a minute.

## What we're building
One core loop, three steps, no more:

1. **Capture** — guided selfie capture (YouCam JS Camera Kit) ensures a clean, validated input image (correct angle, lighting, framing) before anything downstream runs.
2. **Analyze + Generate** — the captured photo is analyzed for skin tone, eye color, hair color (AI Facial Color Tones Analyzer) and skin type (AI Fitzpatrick Skin Type Analysis). A color engine uses those values to fill 8–10 fixed "look templates" (see below) with colors specific to that user, and sends each filled effect payload to the AI Makeup Virtual Try-On API. Three looks are surfaced first, labeled by mood ("soft," "polished," "bold"), not by preset name — the personalization should feel discovered, not chosen from a menu.
3. **Live preview** — user taps a look, camera opens, and the recommended lip + blush colors from that look render live on their face in real time via client-side face tracking and blend-mode compositing (not another YouCam API call — see architecture note below).

That's the whole product. No accounts, no catalog browsing required for the core flow, no unrelated features.

## Why this shape, specifically
- **One feature.** Snap → pick → see it live. Every screen exists to serve that loop.
- **Not a wrapper.** The personalization is grounded in real extracted color data, not a filter guess or an LLM opinion — this is explicitly what the Facial Color Tones API's own documentation says it's for ("the perfect solution for generating personalized color palettes and seasonal color reports"), and almost no other hackathon submission will have read that far into the API surface.
- **YouCam stays the star.** No external LLM sits in the personalization path. The color-matching logic is deterministic rule-based color theory (see architecture note), not an outsourced AI call — the story stays "look what YouCam's own data enables," not "look what we bolted on top of it."
- **Intuitive in one glance.** A judge or first-time user understands the entire value proposition by watching the first 15 seconds: your face, your colors, proof.

## Template system (the core abstraction)
A **template** defines the *structure* of a look: which makeup regions get color (blush, lip, eyeshadow, liner, brow, etc.), what pattern/technique is used for each, and what intensity/texture — but leaves the actual color values as placeholders.

A **color engine** (rule-based, not ML) takes a user's extracted skin undertone, eye color, and hair color and fills those placeholders with the specific hex values that flatter that individual, from within the range the template allows.

Same template + different user data = same *mood*, different *colors*. This is what makes the product feel personalized without needing per-user hand-tuning or an unbounded content library.

Build 8–10 templates covering a spread of daily-wear, going-out, and statement registers (e.g. natural/no-makeup-makeup, soft everyday glam, smoky night out, bold red lip, monochromatic warm, monochromatic cool, editorial liner, sun-kissed bronze). Full template definitions and their JSON structure live in the implementation, not this doc — this doc is scope, not spec.

## Architecture summary
```
[Camera Kit capture] 
        ↓ (validated selfie image)
[Facial Color Tones API] + [Fitzpatrick API]
        ↓ (skin/eye/hair color values)
[Rule-based color engine] → fills 3 template slots with user-specific hex values
        ↓ (3 filled effect JSON payloads)
[Makeup VTO API] (async: POST task → poll → get rendered image) × 3
        ↓ (3 personalized rendered looks shown to user)
[User taps one look]
        ↓ (lip + blush hex values from that look)
[Client-side face tracking + blend-mode overlay] → live camera preview
```

**Important honest note for the pitch:** the live camera preview layer (step 6) is NOT a YouCam API call — it's client-side rendering (face landmark tracking + canvas/WebGL blend-mode compositing) using the color values that YouCam's own analysis produced. Frame this explicitly and confidently in the submission: *"YouCam's Makeup VTO generates the studio-quality personalized look; our real-time layer lets you preview that exact look live before committing."* Don't let a judge discover this distinction — state it.

The live layer is intentionally scoped to **lip color + blush only**, not the full look (eyeshadow, liner, lashes, brows). Those render convincingly in the static YouCam-generated image already. Lips and blush are the two makeup regions that render convincingly in real time within a solo, week-long build; eyeliner and lash tracking are a much harder rendering problem and are explicitly out of scope for the live layer.

## Explicit non-goals (things we are deliberately not building)
- No user accounts / login
- No e-commerce / product purchase links
- No browsing catalog of all templates as a primary flow (a "see more looks" secondary screen is fine, but it's not the demo path)
- No external LLM anywhere in the color-matching or recommendation logic
- No full-face live AR (eyeshadow, liner, lashes, brows) in the live camera step — static render only for those
- No 3D / mesh reconstruction / rigging
- No multi-person, gifting, or B2B flows

## Success criteria for the hackathon submission
- A judge can understand the entire product in one watch of a ~60-90 second demo clip
- The live preview moment is the emotional high point of the demo and looks like real makeup, not a color overlay
- The submission text can clearly finish the sentence: "this uses YouCam's [specific APIs] to do [specific thing no generic wrapper does]"
- Total build stays inside 1,000 free API units
