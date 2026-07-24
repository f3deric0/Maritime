# Design System — Maritime Affairs

Scope: this document formalizes the **hybrid-refined** direction used to rebuild the homepage
hero (`#hero` in [index.html](index.html)) around a scroll-scrubbed frame sequence of the
container-ship footage. It extends — does not replace — the site's existing navy/gold system in
[css/style.css](css/style.css#L4-L22). Everything outside the hero (marquee, mission, buttons
sitewide) keeps the original `--gold` (`#c8913a`); this doc adds a second, rarer accent used only
for the hero's cinematic/editorial flourishes.

## Thesis

The hero *is* the ship: a container vessel gliding through golden-hour water, seen from a low
drone pass along the containers. Scrolling doesn't trigger an animation — it **walks the deck**,
frame by frame, bow to stern. The title sits on that footage the way a vessel's name sits on its
transom: engraved, spaced, permanent. Nothing about the hero should feel like a decorative loop;
it should feel like a vantage point you are moving through.

## Why hybrid-refined (not a full rebrand)

The site already has a distinct identity (navy ink, gold accent, Cormorant/Barlow). A full second
palette for one section would fight it. Instead: keep the navy bones, and introduce **brass** — a
duller, cooler-gold — as a second, more restrained accent reserved for the hero's editorial
details (nameplate hairlines, progress ring, scrim tint). Buttons and every other section keep the
brighter `--gold` untouched, so calls-to-action read identically sitewide.

## Palette

Additive tokens (defined in `css/style.css` alongside the existing `:root` block):

| Token | Hex | Role |
|---|---|---|
| `--brass` | `#B8894A` | Hero-only accent: nameplate hairlines, progress ring, eyebrow micro-text. Duller than `--gold` on purpose — reads as engraved metal, not jewelry. |
| `--brass-l` | `#D6A868` | Brass highlight/hover state. |
| `--salt` | `#EFF2F1` | Sea-salt white — the title color, warmer/softer than pure `--white`. |
| `--scrim` | `rgba(5,9,13,.55)` | Cinematic veil laid over the frame sequence so type stays legible without killing the footage. |

Existing tokens reused as-is: `--ink #050c15`, `--deep #091524`, `--ocean #0d3a54`, `--gold
#c8913a` (rest of site only), `--white #ffffff`.

## Typography

Roles unchanged: **Cormorant Garamond** (display serif), **Barlow Condensed** (labels/eyebrows),
**Barlow** (body). What's refined is *how the display face is used* in the hero:

### Signature: the transom nameplate

The `<h1>` reads like a ship's nameplate rather than a plain poster headline:
- A small vessel-code line sits above the title, in Barlow Condensed, `.32em` tracking, `.62rem`,
  `--brass` — e.g. `M/V · MARITIME AFFAIRS`. This is the one added micro-element, not a redesign
  of the existing `section-marker` eyebrow (which stays, above it, unchanged).
- The title characters themselves get a faint engraved treatment: a 1px `--brass-l` highlight
  offset down-right and a soft dark shadow offset up-left, at low opacity — legible as "stamped
  metal" only on close inspection, invisible at a glance so it never reads as noise.
- Letter-spacing on the mega-title opens very slightly versus the current `-.025em` (to `-.01em`)
  — enough to feel cut rather than crushed at poster scale, not enough to lose the word-reveal
  animation's rhythm.

Scale (unchanged clamp ranges, still responsive):
```
mega-title   clamp(5.5rem, 14vw, 15rem)   Cormorant, 700, line-height .9
hero-sub     clamp(1.125rem, 1.6vw, 1.25rem)  Barlow, 300
eyebrow/code .6–.65rem   Barlow Condensed, 700, uppercase, tracking .28–.32em
```

## Layout — the hero stage

```
┌───────────────────────────────────────────────────────────┐
│  nav (fixed, unchanged)                                    │
├───────────────────────────────────────────────────────────┤
│                                                             │
│   [ full-bleed canvas — current scroll frame, cover-fit ]   │
│   [ scrim gradient: transparent top → --scrim bottom ]      │
│                                                             │
│   EU BLUE ECONOMY DO-TANK            <- existing eyebrow    │
│   ───brass hairline + tick───                              │
│   M/V · MARITIME AFFAIRS             <- new nameplate code  │
│   M A R I T I M E                    <- mega-title (engraved)│
│         A F F A I R S                │
│   ───brass hairline + tick───                              │
│   sub copy, actions                                         │
│                                                             │
│                                     [ stats plate ] (bottom-right, unchanged) │
│              [ scroll hint + compass ring ] (bottom-center) │
└───────────────────────────────────────────────────────────┘
        ↕ pinned for ~300vh (200vh mobile) while frames scrub
```

The whole `.hero` is tall (300vh desktop / 200vh mobile); a `.hero-stage` sticks to the viewport
for that span. A `<canvas>` draws whichever frame matches scroll progress (`round(progress ×
159)`), cover-fit and DPR-aware — replacing the old `<video>`/`initScrollVideo` seek approach with
a decode-independent image draw (see below, *Why frames, not video seek*, and `js/main.js`'s
`initScrollFrames`). The former separate `#scrollvid` intro is retired — this *is* now the intro,
folded into the hero itself, one scrub instead of two in sequence.

## Why frames, not video seek

`video.currentTime` seeking depends on keyframe density and the browser's decoder; the previous
intro (`initScrollVideo` in `js/main.js`) fought jank for exactly this reason. A pre-rendered WebP
sequence drawn to `<canvas>` has no decode cost per seek — it's just an image swap — so scroll
scrubbing is as smooth as the frame count allows, and bidirectional (scroll up = frames go
backward) for free. Cost: more individual files and a small preload step, handled by the loader.

## Motion & interaction

- Scrub follows scroll via `requestAnimationFrame` + lerp (`EASE ≈ .09`), same rhythm as the
  existing `initScrollVideo` so it still feels like the rest of the site.
- `prefers-reduced-motion`: no pinning, no scrub — the hero renders as a static `100svh` section
  showing the poster frame (`assets/images/hero-poster.webp`) only.
- `body.lite` (Save-Data/2G, see `js/main.js` `LITE`): same static-poster fallback — never fetch
  160 frames on a constrained connection.
- Mobile (`≤760px`): a lighter 90-frame/800px set loads instead of the 160-frame desktop set.

## Quality floor

- Responsive down to small mobile; canvas resize handler keeps cover-fit correct on
  orientation/viewport change.
- `:focus-visible` unchanged (gold ring, sitewide).
- Reduced motion and lite mode both degrade to a still frame, never a blank hero.
- No console errors if frames are mid-preload when the user starts scrolling (renders whatever's
  loaded closest to target, doesn't throw).

## Follow-up (not part of this change)

Migrating the *rest* of the site's `--gold` to `--brass` for a fuller rebrand is deliberately out
of scope here — the brief was the hero. If that direction is wanted later, do it as its own pass
so button/marquee contrast can be re-checked deliberately rather than inherited from the hero
tokens.
