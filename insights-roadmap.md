# Insights & Homepage — Roadmap e stato lavori

*Documento di handoff: cosa è stato fatto, perché, e cosa resta da fare. Scritto per essere
ripreso da chiunque (umano o agente) senza dover rileggere l'intera conversazione.*

Ultimo aggiornamento: 28 luglio 2026.

---

## 1. Contesto

Dopo una fase di audit generale della pagina Insights (vedi `data-section.md` per lo stato
strutturale dei dati), è emerso un elenco di miglioramenti da fare in tre ondate, per tenere
sotto controllo rischio e costo di ogni sessione:

- **Fase 1** (piccola, basso rischio) — nav, testi, spostamento contenuti, sfondi. **COMPLETATA.**
- **Fase 2** (media) — restyle grafico Italy/Netherlands/Spain, passata di fluidità mobile. **COMPLETATA.**
- **Fase 3** (grossa) — mappa Fleet Watch interattiva (pan/zoom/fullscreen/news laterali) + selettore porti "barche che ondeggiano". **COMPLETATA.**

---

## 2. Fase 1 — completata

### A. Navigazione
- Aggiunto il link **Insights** al menu (nav desktop + drawer mobile) di `publications.html`,
  che non c'era.
- Rimossa la voce **"Join"** dalla lista dei link di navigazione su `index.html`, `publications.html`,
  `insights.html` (sia nav desktop `.ocean-pill-links` sia drawer mobile `.drawer-links`).
  **Il bottone dorato "Join Us" (`.nav-btn`, a destra del nav) resta invariato** — non è stato
  toccato, è una CTA distinta dalla lista link.

### B. "Defense" → "Defence" (UK English)
Sostituito ovunque nel codice sorgente (HTML/JS): `index.html`, `article.html` (meta tag +
valore `unit` di un articolo hardcoded/fallback), `publications.html` (bottone filtro),
`user.html` (option dropdown), `admin/index.html` (option dropdown), `js/main.js` (array
del marquee).

**Lasciato invariato apposta**: `assets/data/chokepoints.json`, riga con
"Japan's Maritime Self-**Defense** Force" — è un nome proprio ufficiale (US spelling), non un
refuso da correggere.

**⚠️ Azione manuale richiesta**: `"Defense & Security"` era anche il valore-tassonomia salvato
nel filtro articoli. Se in Supabase (tabella `articles`) esistono righe pubblicate con
`unit = 'Defense & Security'` (spelling US), ora non corrisponderanno più al bottone filtro
`"Defence & Security"` (spelling UK) e spariranno silenziosamente da quel filtro — resteranno
visibili solo nel filtro "All Units". **Controllare la tabella Supabase e rinominare quelle righe
a mano** se esistono.

### C. Sezione "Europe's maritime challenge by numbers" — spostata, non duplicata
- **Rimossa interamente** da `index.html` (era la sezione `#numbers`, 4 celle: 90% / 700k+ /
  4 Strategic Units / 2023). Nessuna ancora nel sito puntava a `#numbers`, quindi la rimozione
  non rompe nessun link.
- **Spostati in `insights.html`** solo i due numeri "di settore" — **90%** (quota di trade UE via
  mare) e **700k+** (posti di lavoro) — come riga compatta (`.obs-hero-scale`) subito sotto il
  paragrafo dell'hero.
- **Non spostati** (per scelta esplicita): "4 Strategic units" e "2023" (anno fondazione) — sono
  dati sull'organizzazione, non dati di mercato/osservatorio, quindi non hanno senso su una
  pagina dati come Insights.

### D. Sfondi alternati su `insights.html`
La pagina era interamente su sfondo navy scuro (`--ink`). Ora alterna:

| Sezione | Sfondo |
|---|---|
| Hero | scuro |
| Headline stats (`#obs-stats-grid`) | **chiaro** (`--chart`) |
| Charts short-sea | scuro |
| Fleet Watch (mappa) | scuro *(scelta deliberata: la mappa resta scura)* |
| Blue Economy footprint | **chiaro** |
| Carriers | scuro |
| Sea Basins | **chiaro** |
| Decarbonization/ETS | scuro |
| Maritime News | scuro *(vedi nota sotto)* |

Le sezioni diventate chiare riusano token già esistenti nel design system (`--chart` per lo
sfondo, le classi `.h2.on-light`/`.body-text.on-light`/`.eyebrow.dark` già usate altrove sul
sito, es. su `index.html`) — nessun colore nuovo inventato.

**Nota tecnica**: la sezione **Maritime News** è rimasta scura di proposito in questa fase. Le sue
righe (`.news-item`, `.news-attribution`) sono popolate dinamicamente da JS e usano colori testo
pensati per sfondo scuro (`rgba(255,255,255,...)`); prima di renderla chiara serve controllare il
JS che genera quel markup per sapere quali classi/colori aggiornare, così da non lasciare testo
bianco illeggibile su sfondo chiaro.

### C bis. Rinominato il riquadro teaser in home
Il titolo "Real data, pulled live from Eurostat" (sezione `#insights` in `index.html`,
la card che rimanda a Insights) è diventato **"The numbers behind the tide"**, con un
sottotitolo piccolo in corsivo **"Live from the water"** subito sotto.

### File toccati in Fase 1
`index.html`, `publications.html`, `insights.html`, `article.html`, `user.html`,
`admin/index.html`, `js/main.js`, `css/style.css`.

### Stato
Modifiche fatte e verificate via grep (nessun residuo "Join"/"Defense", classi coerenti).
**Non ancora testate in browser, non ancora committate, non ancora deployate** — in attesa di
conferma per procedere (vedi sessione in corso).

---

## 3. Fase 2 — da fare (non iniziata)

### E. Restyle grafico "Top short-sea shipping nations" (Italy/Netherlands/Spain)
Approvato: **barre con gradiente teal→oro + watermark di onde/linee nautiche** dietro il pannello.
- File: `insights.html` (canvas `#obs-bar-canvas`), `js/observatory.js` (funzione che disegna il
  bar chart — cercare dove viene renderizzato `#obs-bar-canvas`).
- Il gradiente va applicato al `fillStyle` delle barre in canvas (`ctx.createLinearGradient`),
  usando i token `--gold`/colore ocean/teal già definiti in `:root` di `css/style.css`.
- Il watermark va aggiunto come SVG inline leggero o pattern CSS dietro `.obs-chart-panel`, non
  come immagine esterna (per restare leggero e coerente con la disciplina "no asset esterni
  pesanti" già seguita nel resto del sito).
- Non estendere agli altri grafici (basins/sectors) in questa fase — solo il grafico paesi, poi
  farlo vedere all'utente prima di eventualmente estendere lo stile.

### H. Passata di fluidità mobile
- Tab switcher (`#fw-view-tabs`) e filtro tier (`#fw-filter-toggle`): controllare target touch
  ≥44px e wrap corretto su viewport stretti.
- Barre-porto (vedi Fase 3, punto G): scroll orizzontale con `scroll-snap-type` per non fermarsi
  a metà elemento.
- Canvas dei chart: verificare resa su schermi ad alta densità pixel (i canvas hanno `width`/
  `height` fissi negli attributi HTML, scalati via CSS — rischio di blur su mobile se non gestito
  con `devicePixelRatio`).
- Ricontrollare contrasto testo sulle nuove sezioni chiare (punto D) anche su mobile.

---

## 4. Fase 3 — da fare (non iniziata, è un progetto a sé)

### F. Mappa Fleet Watch — rework interattivo completo
File principale: `js/fleetwatch.js` (+ markup `#fw-map-wrap` in `insights.html`).

Da costruire:
1. **Pan**: trascinamento mouse/touch con inerzia leggera.
2. **Zoom**: rotellina + pinch-to-zoom touch, centrato sul cursore/dita, con limiti min/max (non
   zoomare oltre la risoluzione reale della coastline a 10m, si vedrebbe "sgranata" — vedi
   `assets/data/coastline.json`, generato da `scripts/build-coastline.py`).
3. **Fullscreen**: Fullscreen API nativa del browser sul contenitore `#fw-map-wrap`, nessuna
   libreria esterna.
4. **Pannello news laterale**: riusare lo stesso ticker già esistente in `#maritime-news`
   (stesso fetch/dati), non duplicare la logica — nuovo contenitore visibile a lato mappa
   (soprattutto in fullscreen).
5. **Punto tecnico critico**: marker (chokepoint/porti/cavi, oggi posizionati con percentuali
   assolute in DOM) e canvas overlay (coastline/rotte/cavi) devono condividere la STESSA
   trasformazione di coordinate pan/zoom. Serve rifattorizzare la funzione di proiezione
   lat/lon→pixel per accettare un fattore di zoom + offset di pan, e applicarla in modo identico
   sia al canvas sia ai marker DOM. Questo è il rischio principale di regressione (stesso tipo di
   bug già visto in passato: marker disallineati, rotte che sembrano attraversare la terraferma).
6. Su mobile: stessa interattività ma con target touch più grandi.

### G. Porti — selettore "barche che ondeggiano"
Sostituisce l'idea di 20 tastini piatti o marker generici, per la vista **Ports** (20 porti,
`assets/data/ports.json`):
- Fila orizzontale scorrevole sotto la mappa di **20 pulsanti a forma di barchetta** (icona SVG
  stilizzata), ognuno con il nome del porto.
- **Animazione**: oscillazione verticale (`translateY` sinusoidale via `@keyframes` CSS),
  sfasata per ogni barca (delay diverso) così non sembrano tutte sincrone — effetto "cullate
  dalle onde".
- Click/tap su una barca → la mappa fa pan+zoom sul porto e lo evidenzia (estende il pattern
  `selectPort` già esistente in `js/fleetwatch.js`, da adattare al nuovo sistema di pan/zoom
  del punto F).
- Da confermare con l'utente se estendere lo stesso trattamento (barche animate) anche a rotte
  e cavi, per coerenza totale del componente.

### Rischi principali Fase 3
- F è la parte con più superficie di regressione (proiezione coordinate condivisa).
- G dipende da F essere già funzionante (serve il pan/zoom per il pattern "click barca → la mappa
  si sposta lì").
- **Raccomandazione**: trattare la Fase 3 come una sessione dedicata, con test locale via
  chrome-devtools prima di qualunque deploy (checklist minima: marker allineati dopo zoom, rotte
  non tagliano la terra, pinch/drag fluidi su un viewport mobile emulato, fullscreen funziona ed
  esce correttamente).

---

## 5. Nome del riquadro teaser — alternative valutate

*(Già deciso — riportato solo come riferimento.)*

- "The numbers behind the tide" ← **scelto**, con sottotitolo "Live from the water"
- "Straight from the source"
- "No spin. Just Eurostat."

---

## 6. Note generali per chi riprende questo lavoro

- Tutti i colori/font usati devono venire da `:root` in `css/style.css` — non introdurre nuovi
  valori hardcoded. `--chart` (`#f2ead8`) è il token "sfondo chiaro" già in uso; `--ink`
  (`#050c15`) e `--ocean` (`#0d3a54`) sono gli sfondi scuri.
- Il contatore animato (`data-count`, usato per i nuovi `.obs-hero-scale .num-val`) dipende da
  `cObs` in `js/main.js` — già testato e funzionante (bug storico "s is not defined" risolto in
  una sessione precedente).
- Verificare sempre in un browser reale (chrome-devtools) prima di dichiarare "fatto" — questo
  progetto ha già avuto più bug (rotte che attraversano la terra, marker duplicati, metadati di
  citazione errati) scoperti solo con un check visivo dal vivo, non dal solo codice.
