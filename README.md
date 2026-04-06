# Maritime Affairs — EU Blue Economy Do-Tank

> Connecting policy, industry and society across Europe's seas.

EU Transparency Register · REG 091578097296-40

---

## Overview

Single-page website for **Maritime Affairs**, a Brussels-based European NGO and project incubator for the Blue Century. The site covers four strategic units — Blue Policy & Law, Blue Economy & Logistics, Defense & Security, and Tech, Energy & Resources.

## Structure

```
maritime-affairs/
├── index.html          # Main HTML (all sections)
├── css/
│   └── style.css       # All styles and design tokens
├── js/
│   ├── main.js         # UI interactions, animations, scroll logic
│   └── canvas.js       # Nautical chart canvas overlay
├── assets/
│   ├── video/          # Local video files (hero + intro)
│   └── images/         # Logo and images
├── README.md
├── CONTRIBUTING.md
└── .gitignore
```

## Local Development

No build tools required — open `index.html` directly in a browser, or serve with any static server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

## Deployment

The site is a static HTML/CSS/JS project — deploy to any static host:

- **GitHub Pages** — push to `main`, enable Pages from Settings → Pages → Deploy from branch
- **Netlify / Vercel** — drag and drop or connect the repo, zero configuration needed

## Video Assets

Hero and intro videos are currently served from an external origin. To self-host:

1. Download the `.mp4` files
2. Place them in `assets/video/`
3. Update the `<source src="...">` paths in `index.html`

## Contact

info@maritime-affairs.eu · [maritime-affairs.eu](https://maritime-affairs.eu)
# Maritime
