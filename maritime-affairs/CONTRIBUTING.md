# Contributing

## Workflow

1. Fork the repo and create a branch: `git checkout -b feature/my-change`
2. Make your changes — keep CSS in `style.css`, JS split between `main.js` and `canvas.js`
3. Test locally (`npx serve .` or `python3 -m http.server 8080`)
4. Open a pull request with a short description of what changed and why

## Code Style

- **CSS**: use the design tokens defined at the top of `style.css` (e.g. `var(--gold)`, not raw hex values)
- **JS**: vanilla ES6+, no frameworks, no build step
- **HTML**: semantic elements, `aria-label` on interactive items

## Assets

- Videos go in `assets/video/`
- Images go in `assets/images/`
- Optimise images before committing (WebP preferred, max ~200 KB)

## Questions

Open an issue or email info@maritime-affairs.eu.
