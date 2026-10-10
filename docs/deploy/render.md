# Mumble AI on Render

Render builds the app from GitHub and runs it. `render.yaml` in this repository sets up a web service with a 1 GB disk for `data/`.

**Read this first.** Render has no password screen for web services, and Mumble AI has no login. Anyone who finds your `onrender.com` address can use the app, read your history, and use your API key. Use Render for a short test, or only if you accept that risk. For daily use, pick a VPS from [README.md](README.md#choose-a-platform).

## What to buy

A **Starter** web service (0.5 CPU, 512 MB) and a **1 GB disk**. The free plan does not support disks, so history would be lost on every restart.

## Cost

$7 per month for Starter plus $0.25 per month for the 1 GB disk (checked 2026-10, [pricing](https://render.com/pricing)).

## Before you start

1. Create an account at https://render.com. Sign in with GitHub to make the next steps shorter.
2. Add a payment method under **Billing**. The disk needs a paid plan.
3. Have your Groq key ready. A Gemini key is optional.

## Steps

1. Click this button, or open the link in your browser:

   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/maaz-ahmad-63/mumble_flow)

   Link: `https://render.com/deploy?repo=https://github.com/maaz-ahmad-63/mumble_flow`

2. Render reads `render.yaml` and shows one web service named `whisperflow` with a disk. Type a **Blueprint Name**, such as `mumble-ai`.
3. Paste your key into `GROQ_API_KEY`. Paste a Gemini key into `GEMINI_API_KEY`, or leave it empty.
4. Click **Deploy Blueprint** (or **Apply**). Wait until the service shows **Live**.
5. Open the service. Click the `https://whisperflow-....onrender.com` address at the top.

To change code yourself, fork the repository on GitHub first, then use your fork's URL in the link.

## Add your API keys

Open the service, then **Environment**. Edit `GROQ_API_KEY` or `GEMINI_API_KEY` and click **Save Changes**. Render redeploys.

Do not paste keys into the app's Settings screen on Render. Settings keys are saved in `data/`, and the app sends them back to anyone who opens it.

## Put a password in front

Render has no built-in password screen for web services. Things that reduce the risk:

1. Keep keys in **Environment**, not in the app's Settings.
2. Do not share or post the address. This only hides it; it does not protect it.
3. Set a spending limit or usage alert in your Groq and Gemini accounts.
4. Delete the service when you finish testing.

If you need real protection, use a VPS ([linux-vps.md](linux-vps.md)), Azure with Microsoft sign-in ([azure.md](azure.md)), or a home server with Tailscale ([home-server.md](home-server.md)).

## HTTPS

Automatic. The `onrender.com` address uses HTTPS. To use your own domain, open the service, then **Settings**, **Custom Domains**.

## Make data permanent

Already done by `render.yaml`: a 1 GB disk is mounted at `/opt/render/project/src/data`, which is the app's `data/` folder. Without the disk, Render wipes files on every deploy and restart.

With a disk attached, Render stops the old copy before starting the new one, so each deploy has a short downtime.

## Update

`render.yaml` turns off automatic deploys. To update, open the service and click **Manual Deploy**, then **Deploy latest commit**.

## Back up

Render takes a daily snapshot of the disk. To restore one, open the service, then **Disks**, and pick a snapshot. To keep a copy outside Render, see [../google-shared-drive.md](../google-shared-drive.md).

## Remove it and stop paying

1. Open the service, then **Settings**. At the bottom, click **Delete Web Service** and confirm. The disk is deleted with it.
2. Open **Blueprints** and delete the `mumble-ai` Blueprint.
3. Check **Billing** shows no other paid services.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Deploy fails with a plan or disk error | Add a payment method. Disks need a paid instance type. |
| History disappears after a deploy | The disk is missing. Open the service, **Disks**, and add one mounted at `/opt/render/project/src/data`. |
| "API Key is not configured" | Set `GROQ_API_KEY` under **Environment** and save. |
| Service shows "Deploy failed" | Open **Logs**. Most often `npm install` failed on a network error. Click **Manual Deploy** again. |
