# Maritime Affairs — Scroll Video Handoff

Documento di continuità per riprendere il lavoro. Scritto il 2026-07-07,
sessione Claude Code, repo `f3deric0/maritime`, branch
`claude/maritime-video-scroll-analysis-u8c1wv` (già pushato, non ancora
mergiato in `main`, nessuna PR aperta).

## Stato attuale — cosa è già fatto

### 1. Sezione video scroll-driven (l'intro)
Sostituito il vecchio video intro autoplay con una sezione **pinned** dove
scorrere controlla l'avanzamento del video (non il tempo):

- **HTML**: `index.html`, cerca `<!-- SCROLL-DRIVEN INTRO VIDEO -->` →
  `#scrollvid` (contenitore alto 280vh) → `.scrollvid-sticky` (sticky
  100svh) → `<video id="svVideo">` con `<source src="./assets/video/Logo_Intro.mp4">`
  come placeholder. C'è anche un anello di progresso SVG (`#svRing`, stile
  bussola) e un bottone `#svskip`.
- **CSS**: `css/style.css`, cerca `.scrollvid`. Altezza 280vh desktop,
  200vh sotto 760px, gestione `prefers-reduced-motion` (niente pin, sezione
  torna 100svh statica).
- **JS**: `js/main.js`, cerca `SCROLL-DRIVEN INTRO VIDEO`. Variabili
  `svWrap/svVideo/svSkip/svRing`, funzioni `svProgress()` (scroll →
  0..1), `svLoop()` (rAF, lerp verso `svTarget`, scrive
  `video.currentTime`), `svOnScroll()` (chiamata dal listener scroll
  globale), `svFinish()` (skip button). Quando la sezione arriva al 100%
  chiama `startHero()` che rivela nav/hero.
- **Comportamento attuale**: è un **singolo** blocco scroll-video hardcoded
  (una sola istanza, variabili globali). Non è ancora generalizzato per
  supportarne più di uno sulla stessa pagina.

### 2. Polish SEO / performance / mobile / accessibilità (commit `3ddeca8`)
- Open Graph + Twitter Card + JSON-LD (schema NGO) + canonical su
  index/publications/article. Immagine social generata:
  `assets/images/og-image.jpg` (1200×630, brandizzata, HTML sorgente in
  `/tmp/.../scratchpad/og-card.html` — **non persistito**, se serve
  rigenerare va ricreato).
- `robots.txt` + `sitemap.xml` in root. `noindex` su `user.html` e
  `admin/index.html`.
- **Lite mode**: `LITE` in `js/main.js` (controlla
  `navigator.connection.saveData` / `effectiveType` 2G) — su connessioni
  lente non scarica nessuno dei tre video (~21MB risparmiati), CSS mostra
  un gradiente statico (`body.lite .hero-vid`).
- Tutti i video (`hvid`, `.ocean-pill-video`, `svVideo`) hanno
  `preload="none"`: partono a scaricare solo quando il JS decide (non al
  parse HTML).
- Logo compresso: `assets/images/Logo-maritimes.png` (144KB→14KB,
  quantizzato PNG) + nuovo `Logo-maritimes-nav.png` (160px, 5KB) usato in
  nav/loader al posto dell'originale.
- Menu mobile hamburger reale (`#menu-toggle` + `#drawer`) su
  index/publications/article, sotto i 1100px, al posto del vecchio
  ocean-pill che spariva senza alternativa.
- Cursore custom: `body.cursor-on` (in `css/style.css`) attivato da JS
  solo se la bussola è davvero in uso — prima `cursor:none` era globale e
  rendeva il puntatore invisibile su `user.html` e dispositivi ibridi.
  La bussola resta invisibile finché non arriva il primo `mousemove`
  (`body.cursor-live`), altrimenti appariva "parcheggiata" nell'angolo.
- `:focus-visible` oro, skip-link, `<noscript>` fallback, timeout di
  sicurezza CSS sul loader (si nasconde comunque dopo 9s se `main.js` non
  parte), link footer placeholder (`href="#"`) sostituiti con destinazioni
  reali.
- HUD coordinate (`#coords`) ora sfuma quando arriva il footer, per non
  sovrapporsi ai link; `#svskip` sparisce quando arriva `.scrollvid.ending`
  per non sovrapporsi all'HUD.

## Cosa vuole l'utente adesso

Ispirazione: un reel Instagram (screen recording di qualcuno che usa Claude
Code) che mostra un sito immobiliare/architettura fittizio **"Litorale"**:
hero con foto drone di una costa vergine, scritta "Scroll to build", e
scorrendo un video mostra **una villa che si costruisce da sola**
(fondamenta → struttura in legno → casa finita), inquadratura fissa,
sincronizzata allo scroll. Poi altre card-progetto con lo stesso linguaggio
(serif elegante, foto dorate, minimal).

L'utente vuole lo stesso meccanismo (che **abbiamo già** con lo
scroll-scrub) ma con **contenuto video marittimo**, e in **due punti**
della pagina, non solo nell'intro:

- **Primo momento** (intro, sezione già pronta): drone che vola basso tra
  i container impilati sul ponte di una nave cargo. Sostituisce
  `Logo_Intro.mp4`.
- **Secondo momento**: posizione e soggetto **non ancora decisi**.
  L'utente ha detto esplicitamente "altre idee vanno bene" — proporre
  qualcosa in linea (es. porto che si sviluppa, turbina eolica offshore
  che si monta, rotta che si traccia su mappa nautica — erano le opzioni
  già proposte in chat) e concordare dove inserirlo (candidati naturali:
  prima della sezione Units, o nella sezione CTA finale).

**Strumento di generazione video**: l'utente usa **Dreamina (CapCut)**,
https://dreamina.capcut.com/ — **non Higgsfield** (il connettore Higgsfield
MCP era comunque scaduto/disconnesso in questa sessione, non affidarsi a
quello). L'utente genera i video fuori da Claude Code e poi li carica nel
progetto.

## Richiesta esplicita per la prossima sessione

> "voglio che tu modifichi il sito così devo solo rimpiazzare i video, e
> il resto è già pronto"

Quindi il lavoro da fare NON è generare i video (li fa l'utente su
Dreamina), ma:

1. **Generalizzare il meccanismo scroll-scrub** in `js/main.js` così
   supporti più istanze sulla pagina (oggi `svWrap/svVideo/...` sono
   variabili singole hardcoded). Serve una funzione tipo
   `initScrollVideo(wrapEl, videoEl, opts)` richiamabile per ogni sezione,
   con progress ring/skip opzionali per istanza.
2. **Aggiungere il markup della seconda sezione scroll-video** nel punto
   della pagina che si deciderà con l'utente (Units o CTA sono i candidati
   più naturali strutturalmente: sono già sezioni "heavy" con `position:
   sticky`).
3. **Percorsi file chiari e stabili** per i video da rimpiazzare, es.:
   - `assets/video/scroll-containers.mp4` (primo momento — drone tra i
     container)
   - `assets/video/scroll-[nome-da-decidere].mp4` (secondo momento)
   così l'utente scarica da Dreamina, rinomina, e trascina nella cartella
   senza dover toccare codice.
4. **Documentare le specifiche di export** per Dreamina nel README o in
   un commento vicino al markup (già scritte una volta in chat, riassunto
   qui sotto).

### Specifiche export video (per l'utente, da ricordare/riscrivere)
- H.264, contenitore MP4, **senza audio** (i video sono muti).
- **Keyframe frequenti / GOP corto** — fondamentale per uno scrubbing
  fluido con `video.currentTime`; se Dreamina non espone questo parametro,
  va bene lo stesso ma lo scrub sarà "a scatti" tra un keyframe e l'altro.
- Risoluzione consigliata: 1920×1080 o inferiore (peso file contenuto).
- Durata: 8–14s per una sezione di scroll di 280vh (200vh mobile) — è la
  sensazione di avanzamento più naturale. Se la sezione cambia altezza,
  scalare la durata di conseguenza.
- Inquadratura fissa (camera lock) — è ciò che rende credibile l'effetto
  "si costruisce/appare mentre scorri", esattamente come nel reel Litorale.

## Note tecniche / limiti incontrati in questa sessione

- Il Chromium headless di questo sandbox **non decodifica H.264** (solo
  VP9/VP8/AV1) — i test Playwright sulla logica di scroll-scrub sono stati
  fatti forzando `video.duration`/`currentTime` via `Object.defineProperty`
  per bypassare il decoder mancante. La logica è verificata, ma **lo
  scrubbing va comunque testato su un browser reale** (desktop + iPhone)
  con il video vero una volta caricato.
- `python3 -m http.server` ha dato `ConnectionResetError` intermittenti
  servendo i video (probabile problema con le Range request); usare
  `http-server` (npm, già installato globalmente) per test locali, non il
  server Python.
- I file temporanei di lavoro (screenshot, frame estratti dal reel,
  `og-card.html` sorgente) erano in `/tmp/claude-0/.../scratchpad/` — **non
  persistono** tra sessioni. Se servono di nuovo vanno rigenerati.

## File chiave da riaprire

- `index.html` — markup `#scrollvid`, nav, drawer
- `css/style.css` — sezioni `SCROLL-DRIVEN INTRO VIDEO`, `MOBILE MENU`,
  `LITE MODE`, `RESPONSIVE`
- `js/main.js` — `LITE`, blocco `FORCE-PLAY ALL MUTED VIDEOS`, blocco
  `SCROLL-DRIVEN INTRO VIDEO`, `MOBILE DRAWER MENU`
- `js/ocean-nav.js` — guard lite mode + `preload` lazy-load per il video
  del pill di navigazione
- `vercel.json` — header cache/Range già ok per i video, non toccare
