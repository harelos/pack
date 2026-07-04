# Make Pack live

## Option A — instant public URL (temporary, laptop must stay on)
Bring the app up, then tunnel it:
```powershell
cd C:\Users\Lenovo\pack
$env:ANTHROPIC_API_KEY="sk-ant-...."   # optional; without it, runs in demo mode
node prototype/server.mjs              # keep this window open
```
In a second terminal:
```powershell
npx --yes cloudflared tunnel --url http://localhost:5178
```
It prints a `https://xxxxx.trycloudflare.com` URL. Open it on any phone, Add to Home Screen, done.
The URL lasts until you stop the tunnel.

## Option B — permanent, always-on, own URL (recommended)
Deploy the `prototype/` folder to a free host. Easiest is Render:
1. Put this repo on GitHub (github.com -> new repo -> push `C:\Users\Lenovo\pack`).
2. Render.com -> New -> Blueprint -> pick the repo. It reads `render.yaml` and creates the service.
3. In the service's Environment tab, add `ANTHROPIC_API_KEY` = your key. Save.
4. You get a permanent URL like `https://pack-app.onrender.com`. Every `git push` auto-redeploys, and the
   installed PWA auto-updates on next open. (Free tier sleeps after ~15 min idle; first hit wakes it in ~50s.)

Notes
- The server reads `PORT` from the host automatically.
- Your data (logs, targets, aliases, sessions) lives in the browser's localStorage, so it stays on your
  phone regardless of host. The server only does AI parsing.
