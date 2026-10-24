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

After that, the phone sends an update on its own a couple of seconds after you save a day, lock a day, or change weight, body comp, measurements, recipes, or targets. It also syncs when you open the app. You can ignore it.

## What gets saved, and where

In the private repo only:

- `data/latest.json` — the full backup (targets, history, recipes, body comp, measurements, and today)
- `data/history/YYYY-MM-DD.json` — a snapshot for that day

The phone is still the copy that counts. Sync never deletes what is on the phone. If you are offline, or GitHub does not answer, the app keeps your data and tries again later.

## Turn it off

Settings → Sync → **Disconnect**. That removes the token from this phone. It does not delete the private repo. To stop a token that might have leaked, delete the token on GitHub as well.
