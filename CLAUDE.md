# Maritime Affairs — Project Instructions

## What this is

Static site, no build step: plain HTML/CSS/JS deployed on Vercel. There is no `package.json`, no
bundler, no framework. Scripts are loaded as globals (no ES modules) — `js/ocean-nav.js`,
`js/canvas.js`, `js/main.js` in that order, from `index.html`.

- `index.html` / `article.html` / `publications.html` / `user.html` / `admin/index.html` — pages
- `css/style.css` — the single global stylesheet, design tokens at the top (`:root`)
- `js/main.js` — loader, scroll behavior, hero entrance, the frame-scrub hero engine
- `js/canvas.js` — nautical-chart canvas overlay drawn on top of the hero
- `js/ocean-nav.js` — nav-pill ambient video helper
- `assets/video/` — source video clips (not all wired into pages)
- `assets/frames/hero/` `assets/frames/hero-m/` — extracted WebP frame sequences for the hero
- `assets/images/hero-poster.webp` — static fallback frame (reduced-motion / lite mode)
- `design.md` — the design system for the hero rebuild (palette, type, layout, motion rules).
  Read it before touching hero visuals.

## Design tokens

Defined once in `css/style.css` `:root`. Don't hardcode colors/fonts elsewhere — reference the
custom properties (`--ink`, `--gold`, `--ff-d`, etc.). `design.md` documents the additional
hero-only tokens (`--brass`, `--brass-l`, `--salt`, `--scrim`) and why they're scoped to the hero
rather than replacing `--gold` sitewide.

## The hero: scroll-scrubbed frame sequence

The homepage hero (`#hero`) is not a `<video>`. It's a tall pinned section where scrolling draws
one of ~160 pre-extracted WebP frames onto a `<canvas>`, indexed by scroll progress
(`js/main.js`, `initScrollFrames`). This replaced an earlier `video.currentTime`-seek approach
(`initScrollVideo`, still present in `main.js` for reference/reuse if a future section wants
literal video scrubbing) because seek-based scrubbing was decoder-dependent and janky; frame
draws are not.

### Replacing the hero video

1. Drop the new clip in `assets/video/` (H.264 MP4, camera-locked/static framing scrubs best).
2. Run `./scripts/extract-hero-frames.sh assets/video/your-clip.mp4`.
   - Requires `ffmpeg` and `cwebp`/`dwebp` (`brew install ffmpeg webp`).
   - Regenerates `assets/frames/hero/`, `assets/frames/hero-m/`, and
     `assets/images/hero-poster.webp` in place — no HTML/CSS/JS changes needed afterward.
   - If a clip genuinely has a watermark near the edges, pass `CROP_PCT=<percent per side>`, e.g.
     `CROP_PCT=12 ./scripts/extract-hero-frames.sh`. Default is `0` (full frame) — verify with a
     contact-sheet/zoomed-edge check before assuming a crop is needed; don't crop blind.
3. Reload — `initScrollFrames` reads frame count from the DOM data attributes on `#hero-canvas`
   (see markup), so frame count changes don't require a JS edit unless you change the *number* of
   frames the script generates (then update `DESK_COUNT`/`MOB_COUNT` in the script and the
   matching `data-count` attributes together).

### Constraints to respect when touching the hero

- `prefers-reduced-motion` and `body.lite` (Save-Data/2G, see `LITE` in `js/main.js`) must both
  fall back to the static poster — never make either path fetch the full frame sequence.
- Keep desktop frame payload roughly 10–14 MB total (160 frames) and mobile roughly 2–4 MB (90
  frames) — that's the budget `design.md` calls "massima fluidità"; if you regenerate with more
  frames or larger dimensions, re-check total size.
- `startHero()` in `main.js` reveals the nav + title/sub/actions/stats — the hero markup's
  `hmark`/`htitle`/`hsub`/`hact`/`hstats` ids are read by it; keep those ids if you edit markup.

## Local testing

Use `npx http-server` for local preview, **not** `python3 -m http.server` — the Python server has
given intermittent `ConnectionResetError`s on video/large-asset Range requests in this repo.

## Deploy

Vercel, static. `vercel.json` already sets cache/Range headers for `assets/video/`; if you add a
new heavy static directory (e.g. more frame sets), consider adding an `immutable` cache rule for
it there too.
