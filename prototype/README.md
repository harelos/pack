# Pack — browser prototype

Test the app's core loop (messy multi-lingual log → structured parse) in a browser.
No Expo, no Android Studio, no build step.

## Run it (real Claude parsing)
You need Node 18+ and an Anthropic API key.

**PowerShell (Windows):**
```powershell
cd C:\Users\Lenovo\pack
$env:ANTHROPIC_API_KEY="sk-ant-...."
node prototype/server.mjs
```

**bash / macOS / Linux:**
```bash
cd pack
ANTHROPIC_API_KEY=sk-ant-.... node prototype/server.mjs
```

Then open **http://localhost:5178**. Or from the repo root: `npm run prototype`.

## What you can do
- **Type** a messy log (Hebrew + English + Spanish mixed) and hit **Log it**.
- **🎤 Voice** — uses your browser's on-device speech-to-text (Chrome recommended). Auto-detects Hebrew vs English.
- **📷 Photo** — pick a food photo; it's sent to the vision model as a photo→meal parse.
- **Sample buttons** pre-fill realistic inputs (mixed day, drop+twins, body metrics).
- You'll see the **confidence bar**, meal rows (right-aligned for Hebrew), workout **set-groups with kind badges** (drop set / twins / uncounted), and **needs-review chips** with Yes / Fix.

## No API key?
The server still runs and returns a **canned mock** so you can see the UI. You can also just
double-click `index.html` (opens as a file) — it falls back to an offline demo parse.

## Notes
- The prompt + tool schema in `server.mjs` mirror `packages/parser`. Change the real parser there;
  this file is only for eyeballing the UX.
- Set `PACK_PROTO_MODEL=claude-haiku-4-5` for cheaper/faster (slightly lower nuance) parses.
- Nothing is persisted — this is a UX tester, not the real backend.
