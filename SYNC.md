# Sync your Macro Console data

This is optional. The app already keeps everything on your phone. Sync only copies that same backup to a **private** GitHub repo, so an assistant can read it. Nothing is sent until you paste a token and the app has checked the repo is private.

The token stays in the phone's browser. It is not saved in the Macro Console app repo, and your food, weight, and measurements are never written there either.

Do this once, on your phone. You need to be signed in to GitHub in the phone's browser (Safari or Chrome).

## 1. Make a private repo

1. Open [github.com/new](https://github.com/new).
2. Repository name: `macro-console-data`
3. Set it to **Private**. If you see Public selected, change it before you create the repo.
4. Tick **Add a README file**. This creates the `main` branch the app writes to.
5. Tap **Create repository**.
6. On the repo page, check it says **Private** (a lock, not a globe). If it says Public, stop. Open the repo's Settings, change the visibility to Private, and only then continue.

The app expects `nelzon-ai/macro-console-data` on the `main` branch. If your GitHub username is different, use `your-username/macro-console-data` and type that same name into the app later.

## 2. Make a token that can only touch that repo

The token is a password for this one repo. GitHub shows it only once.

1. Open [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta) (Fine-grained tokens).
2. Tap **Generate new token**.
3. Name it `Macro Console sync`.
4. Expiration: 90 days is fine. When it expires, repeat this step and paste the new token into the app. The old one stops working on its own.
5. Repository access: **Only select repositories**, then choose **macro-console-data**. Do not choose All repositories, and do not choose the public `macro-console` app.
6. Permissions → Repository permissions → **Contents** → **Read and write**. Leave everything else as No access.
7. Tap **Generate token**.
8. Copy the token straight away. It starts with `github_pat_`. If you leave the page, you cannot see it again — just generate another one.

Do not paste the token into a chat, an email, a note you share, or the public Macro Console repo. If you think someone else saw it, open the token page, delete it, and make a new one.

## 3. Paste it into the app

1. Open Macro Console on your phone (the home-screen icon).
2. Tap the gear (Settings).
3. Scroll to **Sync**.
4. Paste the token into **Token**.
5. Private data repo: `nelzon-ai/macro-console-data` (already filled in if that is your account).
6. Branch: `main`.
7. Tap **Test connection**.
   - It should say the repo is private.
   - If it warns that the repo is **public**, nothing has been uploaded. Make the repo private (step 1.6) and test again.
8. Tap **Sync now**. When it says it synced, you are done.

After that, the phone syncs on its own a couple of seconds after you save a day, lock a day, or change weight, body comp, measurements, recipes, targets, or the plan in Settings. It also syncs when you open the app.

Each sync reads the private repo, merges that with the phone, then writes the combined backup. A meal, workout, weigh-in, or measurement added in the repo shows up on the phone. A row that exists on only one side is kept. The app does not treat "missing from the file" as a delete, so clearing the phone and then syncing brings the private repo's rows back. To remove a row, add a delete entry (see below). If the same row was edited on both sides, the newer `updatedAt` wins, and the other copy is kept inside `conflicts` in `data/latest.json` so it is not thrown away.

If GitHub cannot be reached, or `data/latest.json` is not valid JSON, the phone uploads its own copy as before and does not change the logs already on the phone.

Targets and the rest of the plan stay as they are on the phone unless an inbox file includes a `settings` object. The shape for that object is in [SETTINGS.md](SETTINGS.md). Do not put a filled-in settings file in this public repo.

## Update safely

Do this once after this version is deployed, on the phone, while online:

1. Open Macro Console from the home-screen icon and leave it open for a few seconds so it can pick up the new version. If the screen looks unchanged, switch away and open it again.
2. The first sync saves a full safety copy before it merges anything. It stores that copy on the phone, offers a JSON download (`macro-console-safety-backup.json`), and writes `data/backups/<timestamp>.json` in the private repo. Keep the downloaded file. You can also tap Settings → Sync → **Download safety backup** later.
3. You do not need to paste the token again if it is already saved. Tap **Sync now** if you want to see it finish. When it says it synced, entries added in the private repo are on the phone.
4. Do not delete files under `data/history/` in the private repo. The app will not change or remove those files. It only creates the current day's file when that file is not there yet.

The safety copy on the phone is written once, under its own storage keys (`macroConsole.sync.preTwoWayBackup` in the browser's local storage, and `preTwoWayBackup` in the app database). A later sync does not overwrite it. The private-repo snapshot is also written once, before the first merged upload, and is a new file. It is not a replacement for `data/latest.json`.

## What gets saved, and where

In the private repo only:

- `data/latest.json` — the merged backup (targets, plan settings, history, recipes, body comp, measurements, day logs, tombstones, and any kept conflict copies)
- `data/history/YYYY-MM-DD.json` — the first snapshot written for that day. Later syncs leave an existing file alone.
- `data/backups/<timestamp>.json` — the phone's full backup from before the first merged write
- `data/inbox/*.json` — optional files an assistant adds. After a successful sync they are moved to `data/inbox/processed/`.

Nothing in this list is written to the public app repo. If you are offline, or GitHub does not answer, the app keeps your data and tries again later.

## Adding entries from the private repo

Put a JSON file in `data/inbox/` (any name ending in `.json`). The phone imports it on the next sync, then moves it to `data/inbox/processed/`. Importing the same file twice does not duplicate rows. The field list and one fake example of each entry type are in [docs/REMOTE_ENTRIES.md](docs/REMOTE_ENTRIES.md).

You can also edit `data/latest.json` directly. New rows are added. To change an existing row, set `updatedAt` to the current time. To remove a row, add a tombstone under `deleted` (or an inbox `delete` entry). Deleting a row from the JSON without a tombstone does not remove it: the next sync puts it back.

## Turn it off

Settings → Sync → **Disconnect**. That removes the token from this phone. It does not delete the private repo. To stop a token that might have leaked, delete the token on GitHub as well.
