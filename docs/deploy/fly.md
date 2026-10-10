# Mumble AI on Fly.io

Fly.io runs the Docker image from this repository on a small virtual machine, with a volume for `data/`. `fly.toml` in this repository already has the volume mount.

This guide keeps the app **private**: it gets no public address, and you open it on your computer through `fly proxy`. Fly has no password screen, so a public Fly address would let anyone use the app and your API key.

Replace anything in capital letters that starts with `YOUR_`. `YOUR_APP_NAME` must be unique across Fly, for example `mumble-ai-yourname`.

## What to buy

One **shared-cpu-1x** Machine with 256 MB or 512 MB of memory, and one **1 GB volume**.

## Cost

Volume: $0.15 per GB per month. Machine: a few dollars per month for the smallest size; it costs less when it is stopped. The machine price table was not verified on Fly's page (checked 2026-10, [pricing](https://fly.io/docs/about/pricing/)). Fly needs a credit card.

## Before you start

1. Install the Fly command-line tool:
   - Windows (PowerShell):

     ```powershell
     pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
     ```

     If `pwsh` is not found, use `powershell` instead of `pwsh`.

   - macOS and Linux:

     ```bash
     curl -L https://fly.io/install.sh | sh
     ```

2. Open a new terminal and sign in. This opens your browser:

   ```bash
   fly auth login
   ```

   New users: run `fly auth signup` instead, and add a card under **Billing** on https://fly.io/dashboard.

3. Get the code:

   ```bash
   git clone https://github.com/maaz-ahmad-63/mumble_flow.git
   cd mumble_flow
   ```

## Steps

1. Open `fly.toml` in a text editor:
   1. Change `app = "whisperflow"` to `app = "YOUR_APP_NAME"`.
   2. Change `force_https = true` to `force_https = false`. Private Fly addresses only speak HTTP. Your browser still treats `localhost` as secure.
   3. Optional: change `primary_region = "iad"` to a region near you. `fly platform regions` lists them.
   Save the file.

2. Create the app and the volume. Use the same region as in `fly.toml`:

   ```bash
   fly apps create YOUR_APP_NAME
   fly volumes create whisperflow_data --size 1 --region iad --app YOUR_APP_NAME
   ```

   Fly warns that one volume has no copy on another machine. Type `y`. Back-up steps are below.

3. Add your keys (see "Add your API keys").

4. Deploy with a private address only, and one machine:

   ```bash
   fly deploy --flycast --no-public-ips --ha=false
   ```

5. Check that the app has no public IP addresses:

   ```bash
   fly ips list
   ```

   Only a `private` line should appear. If you see `public` lines, remove them with `fly ips release` followed by each public address.

6. Open the app on your computer:

   ```bash
   fly proxy 3050:80 YOUR_APP_NAME.flycast
   ```

   Open http://localhost:3050. Keep that terminal open while you use the app. Ctrl+C closes the connection; the app keeps running on Fly.

## Add your API keys

Run this, then paste the lines below with your real keys, then press Enter. Finish with `Ctrl+D` (macOS and Linux) or `Ctrl+Z` then Enter (Windows). This keeps the keys out of your shell history.

```bash
fly secrets import
```

```text
GROQ_API_KEY=YOUR_GROQ_KEY
GEMINI_API_KEY=YOUR_GEMINI_KEY
```

The app restarts with the new keys. `fly secrets list` shows the names, not the values.

## Put a password in front

This guide does it by keeping the app private: no public IP, and access only through `fly proxy` from a computer signed in to your Fly account.

The cost of this choice: phones and other people cannot open it. If you need a public address with a password, use a VPS ([linux-vps.md](linux-vps.md)) instead.

## HTTPS

Not needed for private use. `fly proxy` gives you `http://localhost:3050`, which browsers accept for the microphone.

## Make data permanent

Already done. `fly.toml` mounts the `whisperflow_data` volume at `/app/data`. Keep one machine (`--ha=false`). A volume belongs to one machine; a second machine would get its own empty volume.

## Update

```bash
git pull
fly deploy --ha=false
```

If `git pull` complains about your edits to `fly.toml`, run `git stash`, then `git pull`, then `git stash pop`.

## Back up

1. Fly takes daily snapshots of the volume and keeps them for a few days. List them with `fly volumes list`, then `fly volumes snapshots list VOLUME_ID`.
2. To copy the data to your computer, the app must be running. Open it once through `fly proxy`, then run:

   ```bash
   fly ssh sftp get /app/data/whisperflow_store.json
   ```

## Remove it and stop paying

This deletes the app, its machines, and its volume:

```bash
fly apps destroy YOUR_APP_NAME
```

Type the app name to confirm. Check https://fly.io/dashboard for anything left over.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `fly proxy` connects but the page does not load | The app may be starting. Wait 10 seconds and reload. Check `fly logs`. |
| `Name has already been taken` | Pick another `YOUR_APP_NAME` and update `fly.toml`. |
| Deploy says the volume is missing | Create it in the same region as `primary_region` (step 2). |
| `EACCES` on `/app/data` in `fly logs` | Run `fly ssh console` then `chown -R node:node /app/data`, then `fly apps restart YOUR_APP_NAME`. |
| History is empty after a deploy | A second machine was created. Run `fly scale count 1` and keep `--ha=false`. |
