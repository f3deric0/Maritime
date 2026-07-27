# Deploying to production — step by step

The site is served from a **VPS** (not Vercel anymore) at `https://maritime-affairs.eu`. This is the
exact sequence to follow every time code changes need to go live.

## Infrastructure summary

| What | Value |
|---|---|
| Domain | `maritime-affairs.eu` (+ `www.`) |
| VPS IP | `87.106.240.127` (IONOS, Ubuntu 24.04) |
| Web server | Apache2, **no Plesk** — plain vhost config |
| Live docroot on VPS | `/var/www/html` — a `git` checkout of this repo, branch `main` |
| GitHub repo | `https://github.com/f3deric0/Maritime.git` |
| SSH key (this machine) | `~/.ssh/maritime-vps` — public key already authorized on the VPS `root` user |
| SSL | Let's Encrypt (certbot), auto-renews |
| Auto-deploy | cron on the VPS pulls `main` every 2 minutes (see below) |

Two things on the VPS are **not** used, kept only as an untouched backup — don't delete without
checking first: `/var/www/maritime` (the pre-migration docroot, stale) and the disabled
`maritimeaffairs.conf` vhost (leftover WordPress config from before this site existed there).

## Every time you change something: the steps

1. **Commit and push to `main`** (this repo pushes directly to `main`, no PR step in normal use):
   ```bash
   git add <changed files>
   git commit -m "..."
   git push origin HEAD:main
   ```

2. **Deploy immediately** (don't wait up to 2 minutes for the cron) — SSH in and run the deploy
   script:
   ```bash
   ssh -i ~/.ssh/maritime-vps root@87.106.240.127 '/usr/local/bin/maritime-deploy.sh && tail -1 /var/log/maritime-deploy.log'
   ```
   That script (already installed on the VPS) does:
   ```bash
   cd /var/www/html
   git fetch origin --quiet
   git reset --hard origin/main --quiet
   chown -R www-data:www-data /var/www/html   # only if something changed
   ```
   If you skip this step, the same thing happens automatically within 2 minutes via
   `/etc/cron.d/maritime-deploy`, logged to `/var/log/maritime-deploy.log` on the VPS.

3. **Verify live**:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://maritime-affairs.eu/
   ```
   and spot-check whatever changed actually shows up (`curl -s https://maritime-affairs.eu/... | grep ...`
   for the specific markup/CSS/JS you touched).

That's the whole loop: **push → SSH deploy script → curl-verify**. No build step, no CI — the VPS
just pulls the same files GitHub has.

## Cache gotchas — read before assuming a fix "didn't work"

- **CSS/JS**: cached `max-age=3600` (1 hour, `must-revalidate`) via `.htaccess`. A change is live on
  the server the moment you deploy, but a browser that already loaded the page may keep serving the
  old file for up to an hour without a hard refresh. When checking a change landed, test the *server*
  state directly (`curl https://maritime-affairs.eu/css/style.css | grep "..."`) rather than trusting
  what a browser shows without a hard refresh (Cmd+Shift+R) — they can disagree for up to an hour and
  that's not a bug.
- **Hero frames / poster image** (`assets/frames/hero*/frame-*.webp`, `hero-poster.webp`): cached
  `max-age=31536000, immutable` — **one year, never revalidated**. If these are regenerated with the
  *same filenames* (e.g. re-running `scripts/extract-hero-frames.sh` with new footage), returning
  visitors' browsers keep serving the old cached images forever regardless of hard refresh. Fix: bump
  the `data-v` attribute on `#hero-canvas` and the `?v=` query string on the poster
  `background-image` URL in `index.html` — see the cache-busting comment in `js/main.js`'s
  `initScrollFrames`.
- **HTML pages**: `max-age=0, must-revalidate` — always fresh, no gotcha here.

## Fleet Watch relay (fleet-relay.service)

`insights.html`'s live ship map (`js/fleetwatch.js`) is fed by a small always-on Python process on
the VPS — `scripts/fleet-relay/relay.py` — that holds one WebSocket connection to aisstream.io and
writes `assets/data/fleet-live.json` every ~5s. The frontend never talks to aisstream directly (no
API key exposed, no per-visitor connections). The essentials:

- **Code** lives in the normal git-tracked docroot (`/var/www/html/scripts/fleet-relay/`) — deploys
  normally via the steps above.
- **Python deps** live in a venv OUTSIDE the docroot, `/opt/fleet-relay/venv`, so `git reset --hard`
  on every deploy never touches them. One-time setup:
  ```bash
  python3 -m venv /opt/fleet-relay/venv
  /opt/fleet-relay/venv/bin/pip install -r /var/www/html/scripts/fleet-relay/requirements.txt
  ```
- **API key** lives in `/etc/fleet-relay.env` (systemd `EnvironmentFile=`, never in git):
  ```
  AISSTREAM_API_KEY=...
  ```
- **Service** installed once:
  ```bash
  cp /var/www/html/scripts/fleet-relay/fleet-relay.service /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now fleet-relay
  ```
- **Check it's alive**:
  ```bash
  systemctl status fleet-relay
  journalctl -u fleet-relay -f          # watch it connect/reconnect
  cat /var/www/html/assets/data/fleet-live.json   # should have a fresh generatedAt
  ```
- **Restart after a relay.py code change**: a normal deploy updates the file, but you still need
  `systemctl restart fleet-relay` afterward — the running process won't pick up the new code on its
  own (unlike the static site, which Apache serves fresh on every request).
- `assets/data/fleet-live.json` is gitignored (generated, not committed) — don't be surprised it's
  missing right after a fresh clone; the service creates it on first snapshot write.

## If SSH access ever breaks

The deploy key lives only on this machine at `~/.ssh/maritime-vps` (ed25519, comment
`claude-code-maritime-vps-deploy`). If it's ever lost/revoked, a human needs to add a new public key
to `root`'s `~/.ssh/authorized_keys` on the VPS (via the IONOS console or password login) before an
AI session can deploy again — there is no other automated path in, and the root password should never
be typed into chat.

## If the local git worktree breaks ("not a git repository" errors)

This machine uses a `git worktree` setup. If the main repo checkout is ever moved/renamed on disk,
this worktree's `.git` file will point at a stale path and every git command will fail. Fix (run from
whichever directory now holds the *actual* `.git` folder, i.e. the main checkout, not this worktree):
```bash
git worktree repair /path/to/this/worktree
```
This just repairs the path pointer — no data is lost, nothing destructive.
