# Wortschatz — German A1 Trainer (PWA)

A self-contained, installable web app. No build step, no backend — just static files.

## Deploy to GitHub Pages

1. Create a new **public** GitHub repo (e.g. `wortschatz`).
2. Copy all files in this folder (`index.html`, `style.css`, `words.js`, `app.js`,
   `manifest.json`, `service-worker.js`, `icons/`) into the repo root.
3. From inside the repo folder:
   ```
   git init
   git add .
   git commit -m "Wortschatz PWA"
   git branch -M main
   git remote add origin https://github.com/<your-username>/wortschatz.git
   git push -u origin main
   ```
4. On GitHub: **Settings → Pages → Source** → select branch `main`, folder `/ (root)` → **Save**.
5. Wait ~1 minute, then visit `https://<your-username>.github.io/wortschatz/`.

## Install on iPhone

1. Open that URL in **Safari** (must be Safari, not Chrome, for install to work on iOS).
2. Tap the **Share** icon → **Add to Home Screen**.
3. Launch it from the Home Screen icon — it opens full-screen, no browser bar.

## How progress is saved

Everything (word scores, seen/correct/incorrect counts, your settings) is stored
in the browser's `localStorage`, scoped to that installed app. Once added to the
Home Screen, iOS treats it as its own standalone storage context, which is exempt
from Safari's usual 7-day inactivity cleanup — so it should hold up fine with
normal use.

It's still on-device storage, not a cloud backup, so:
- Deleting the app from your Home Screen deletes its data.
- Use **Settings → Export progress** occasionally to save a JSON backup you can
  keep anywhere (iCloud Drive, email to yourself, etc.).
- **Settings → Import progress** restores from that file — useful if you get a
  new phone or reinstall.

## Updating later

If you edit the files and push again, installed users will get the update
automatically next time they're online (the service worker checks for a new
version and swaps it in on the next launch).
