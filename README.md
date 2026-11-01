# Macro Console (personal app)

Installable, offline-first version of Macro Console. AI features (food parser, scan-photo reader, "ask about your data") are switched off; everything else works with no connection.

## Put it online (free, personal GitHub account only)
1. Sign in to github.com with your PERSONAL email (not a work one). Create a new repository, e.g. `macro-console` (private is fine for Pages on a paid plan; otherwise public — it contains no personal data, that lives only on your phone).
2. Upload everything in this folder (including the hidden `.github` folder) to the repo's `main` branch.
3. Repo → Settings → Pages → Source: **GitHub Actions**. The first deploy runs automatically (Actions tab); it takes ~2 minutes.
4. Your app is at `https://<your-username>.github.io/macro-console/`.

## Install on your phone
- iPhone: open the link in Safari → Share → Add to Home Screen.
- Android: open in Chrome → ⋮ → Install app.
Open it once while online so it can cache itself, then it works offline.

## Sync to a private repo (optional)
Health data stays on the phone unless you turn sync on. The steps — private repo, a token that can only touch that repo, paste it into Settings → Sync — are in [SYNC.md](SYNC.md). The token is never stored in this repo.

Sync is two-way. On each sync the phone reads `data/latest.json` and any new `data/inbox/*.json` files from the private repo, merges them with the copy on the phone, then writes the combined backup back. An entry added on either side is kept. The phone does not delete a row just because the other side omitted it. Removing a row takes an explicit delete entry, described in [docs/REMOTE_ENTRIES.md](docs/REMOTE_ENTRIES.md).

Before the first sync on this version, the app saves a full safety copy on the phone and uploads `data/backups/<timestamp>.json` before it writes any merged file. Open the updated app once while online so it can refresh, then let it sync (or tap Sync now). Keep the downloaded safety file. Details and the safe update steps are in [SYNC.md](SYNC.md).

Targets and the rest of the plan (milestones, meals, supplements, workout split) are edited in Settings and stored on the phone. The JSON shape for **Import settings** is in [SETTINGS.md](SETTINGS.md). Example values there are placeholders.

## Move your existing data over
1. In the claude.ai version: Settings → Copy full backup.
2. In the new app: Settings → Restore, paste, confirm.
Data is stored on the device (IndexedDB). Take a backup now and then; iPhone can clear web-app data if the app is unused for a long time.
