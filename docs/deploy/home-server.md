# Mumble AI on a home computer or home server

Run Mumble AI on a computer at home that stays on, then use it from your phone or laptop anywhere. There are two ways to reach it:

- **Tailscale (recommended).** A private network between your own devices. Nothing is exposed to the internet. Free for personal use.
- **Cloudflare Tunnel.** A public address on your own domain, with Cloudflare's login screen in front. Needs a domain managed by Cloudflare.

Replace anything in capital letters that starts with `YOUR_`.

## What to buy

Nothing, if you have a computer that can stay on: a desktop, an old laptop, a mini PC, or a Raspberry Pi 4 or 5 with 2 GB of RAM or more. For Cloudflare Tunnel you also need a domain.

## Cost

$0, plus electricity. Tailscale's free plan covers personal use. Cloudflare Tunnel and Cloudflare Access have free plans. A domain costs about $10 to $15 per year.

## Before you start

1. Install Mumble AI on the home computer with [../setup.md](../setup.md). Check that http://localhost:3050 works there.
2. Make sure the computer does not go to sleep. Windows: **Settings**, **System**, **Power**, set **Sleep** to **Never** when plugged in. macOS: **System Settings**, **Energy**, turn on **Prevent automatic sleeping**.

## Steps

### Keep the app running

The app must be running for you to use it. Pick one:

- Leave the terminal with `npm start` open.
- Linux: run it as a service. Replace `YOUR_USER` with your Linux username and `/home/YOUR_USER/mumble-flow` with the project folder:

  ```bash
  sudo tee /etc/systemd/system/mumble-ai.service >/dev/null <<'EOF'
  [Unit]
  Description=Mumble AI
  After=network-online.target

  [Service]
  User=YOUR_USER
  WorkingDirectory=/home/YOUR_USER/mumble-flow
  ExecStart=/usr/bin/node server/index.js
  Restart=on-failure

  [Install]
  WantedBy=multi-user.target
  EOF
  sudo systemctl daemon-reload
  sudo systemctl enable --now mumble-ai
  ```

  If `which node` prints a path other than `/usr/bin/node`, put that path in `ExecStart`.

- Windows: start it when you sign in. In PowerShell, from the project folder:

  ```powershell
  $action = New-ScheduledTaskAction -Execute (Get-Command node).Source -Argument "server/index.js" -WorkingDirectory (Get-Location).Path
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  Register-ScheduledTask -TaskName "Mumble AI" -Action $action -Trigger $trigger
  ```

  If it says "Access is denied", open PowerShell with **Run as administrator**, go to the project folder with `cd`, and run the three lines again.

### Option A: Tailscale

1. Create a free account at https://tailscale.com and install Tailscale on the home computer and on your phone and laptop. Sign in to the same account on each.
2. In the Tailscale admin console at https://login.tailscale.com/admin/dns, turn on **MagicDNS** and **HTTPS Certificates**.
3. On the home computer, in a terminal:

   ```bash
   tailscale serve --bg 3050
   ```

   On Linux, put `sudo` in front. It prints an address like `https://YOUR_COMPUTER.YOUR_TAILNET.ts.net`.

4. On your phone or laptop, with Tailscale turned on, open that address. The microphone works because the address is HTTPS.

### Option B: Cloudflare Tunnel with Cloudflare Access

Your domain must use Cloudflare's nameservers. Create the login screen first, so the address is never open without it.

1. In the Cloudflare dashboard, open **Zero Trust**. Choose the free plan if asked.
2. Go to **Access controls**, **Applications**, **Create new application**, **Self-hosted and private**.
   1. Add the public hostname you will use, for example `dictate.YOUR_DOMAIN`.
   2. Add a policy: **Action** **Allow**, **Include** **Emails**, and type your email address.
   3. Save. Cloudflare will send a one-time code to that email at sign-in.
3. Go to **Networking**, **Tunnels**, **Create Tunnel**. Pick **Cloudflared**, name it `mumble-ai`.
4. Cloudflare shows install commands for your operating system. Run them on the home computer. On Linux they end with:

   ```bash
   sudo cloudflared service install YOUR_TUNNEL_TOKEN
   ```

5. In the tunnel, go to **Routes**, **Add route**, **Published application**. Hostname: `dictate.YOUR_DOMAIN`. Service: `http://localhost:3050`. Save.
6. Open `https://dictate.YOUR_DOMAIN` in a private browser window. Cloudflare asks for your email and code before the app loads.

## Add your API keys

On the home computer, open `.env` in the project folder, paste your keys after `GROQ_API_KEY=` and `GEMINI_API_KEY=`, and restart the app. Or paste them in the app under **Settings**.

## Put a password in front

- Tailscale: only devices signed in to your Tailscale account can reach the address. Do not use `tailscale funnel`; that makes it public.
- Cloudflare: Cloudflare Access (step 2 of Option B) is the login screen.
- Do not forward port 3050 on your router. That exposes the app with no password.

## HTTPS

Both options give you an HTTPS address. Tailscale needs **HTTPS Certificates** turned on (Option A, step 2).

## Make data permanent

Nothing to do. Data is in the `data/` folder of the project on the home computer.

## Update

On the home computer, in the project folder, stop the app, then:

```bash
git pull
npm install
```

Start the app again (or `sudo systemctl restart mumble-ai` on Linux).

## Back up

Copy the `data` folder and `.env` from the project folder to a USB drive or cloud storage. To back up to Google Drive, see [../google-shared-drive.md](../google-shared-drive.md).

## Remove it and stop paying

1. Tailscale: `tailscale serve reset` stops sharing the app.
2. Cloudflare: delete the tunnel under **Networking**, **Tunnels**, and the application under **Access controls**. On Linux, `sudo cloudflared service uninstall`.
3. Stop the app. Linux: `sudo systemctl disable --now mumble-ai`. Windows: `Unregister-ScheduledTask -TaskName "Mumble AI"`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The Tailscale address does not load | Check Tailscale is on, on both devices, and the app runs on the home computer (http://localhost:3050 there). |
| `tailscale serve` says HTTPS is not enabled | Turn on **HTTPS Certificates** in the admin console (Option A, step 2). |
| Cloudflare shows error 1033 | The tunnel is not running on the home computer. Run the install command from step 4 again. |
| Cloudflare shows a 502 page | The app is not running, or the route's service is not `http://localhost:3050`. |
| It stops working at night | The computer went to sleep. Change the power settings (see "Before you start"). |
| Desktop companion | Run it on the computer with the microphone. Point it at the Tailscale address: `python desktop/whisperflow_companion.py --server https://YOUR_COMPUTER.YOUR_TAILNET.ts.net`. It does not work through Cloudflare Access. |
