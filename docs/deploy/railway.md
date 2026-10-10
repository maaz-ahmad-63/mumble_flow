# Mumble AI on Railway

Railway builds the app from GitHub using the `Dockerfile` in this repository and runs it. You add a volume so `data/` survives.

**Read this first.** Railway has no password screen, and Mumble AI has no login. Anyone who finds your `up.railway.app` address can use the app, read your history, and use your API key. Use Railway for a short test, or only if you accept that risk. For daily use, pick a VPS from [README.md](README.md#choose-a-platform).

There is no one-click button. Railway buttons need a published template, and this project does not have one yet.

## What to buy

The **Hobby** plan, one service, and a **1 GB volume**.

## Cost

Hobby is $5 per month and includes $5 of usage. A small app like this usually fits inside it. Volumes cost $0.15 per GB per month (checked 2026-10, [pricing](https://railway.com/pricing)).

## Before you start

1. On GitHub, open https://github.com/maaz-ahmad-63/mumble_flow and click **Fork**, then **Create fork**. Railway deploys from your fork.
2. Create an account at https://railway.com. Sign in with GitHub. Choose the Hobby plan.

## Steps

1. In Railway, click **New Project**, then **Deploy from GitHub repo**. Allow Railway to see your fork if asked. Pick your `mumble-flow` fork.
2. Railway finds the `Dockerfile` and starts building. Let it finish.
3. Open the service, then **Variables**. Click **New Variable** and add each of these:

   | Name | Value |
   | --- | --- |
   | `PORT` | `3050` |
   | `RAILWAY_RUN_UID` | `0` |
   | `GROQ_API_KEY` | your Groq key |
   | `GEMINI_API_KEY` | your Gemini key, or leave it out |

   `RAILWAY_RUN_UID=0` is needed because Railway volumes belong to root and the image runs as a normal user.

4. Add the volume: right-click an empty spot on the project canvas (or press `Ctrl+K` / `Cmd+K`) and choose to create a volume. Connect it to the Mumble AI service. Set the **mount path** to `/app/data`.
5. Open the service, then **Settings**. Under **Networking**, click **Generate Domain**. If asked for a port, type `3050`.
6. Under **Settings**, set the **Healthcheck Path** to `/health`.
7. Click **Deploy** if Railway shows pending changes. Open the `up.railway.app` address when the deploy is done.

## Add your API keys

Open the service, then **Variables**. Edit `GROQ_API_KEY` or `GEMINI_API_KEY`. Railway redeploys after you apply the change.

Do not paste keys into the app's Settings screen on Railway. Settings keys are saved in `data/`, and the app sends them back to anyone who opens it.

## Put a password in front

Railway has no built-in password screen. Things that reduce the risk:

1. Keep keys in **Variables**, not in the app's Settings.
2. Do not share or post the address. This only hides it; it does not protect it.
3. Set a spending limit or usage alert in your Groq and Gemini accounts.
4. Delete the project when you finish testing.

If you need real protection, use a VPS ([linux-vps.md](linux-vps.md)), Azure with Microsoft sign-in ([azure.md](azure.md)), or a home server with Tailscale ([home-server.md](home-server.md)).

## HTTPS

Automatic. The `up.railway.app` address uses HTTPS. To use your own domain, open **Settings**, **Networking**, **Custom Domain**.

## Make data permanent

The volume mounted at `/app/data` keeps the data across deploys and restarts. Without it, every deploy starts with empty history.

## Update

Railway redeploys when your fork changes. To get new versions of Mumble AI, open your fork on GitHub and click **Sync fork**, then **Update branch**.

## Back up

Open the volume in the project canvas and check its **Backups** tab, if your plan has it. To keep a copy outside Railway, see [../google-shared-drive.md](../google-shared-drive.md).

## Remove it and stop paying

1. Open the project, then **Settings**. At the bottom, delete the project. This deletes the service and the volume.
2. If you do not use Railway for anything else, open your workspace's billing settings and cancel the Hobby plan.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Deploy log shows `EACCES` or permission denied on `/app/data` | Add `RAILWAY_RUN_UID` = `0` under **Variables**. |
| "Application failed to respond" | `PORT` must be `3050` and the domain must point to port `3050`. |
| History disappears after a deploy | The volume is missing or mounted at the wrong path. It must be `/app/data`. |
| Railway mentions `railway.json` or Config as Code | This project no longer uses it. Set the options in the dashboard as shown above. |
