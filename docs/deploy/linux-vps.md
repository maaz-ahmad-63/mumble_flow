# Mumble AI on any Linux VPS

This is the main server guide. The provider guides (DigitalOcean, Hetzner, Hostinger, AWS, Oracle, Google Cloud, Azure VM) show how to rent the server, then send you here.

One command installs everything: Node.js, the app, a background service, HTTPS, a password screen, and a firewall.

In the commands below, replace anything in capital letters that starts with `YOUR_`. For example, replace `YOUR_SERVER_IP` with your server's IP address, such as `203.0.113.10`.

## What to buy

1. A VPS (virtual private server) running **Ubuntu 24.04** or **Ubuntu 22.04**.
2. At least **1 GB of RAM** and **10 GB of disk**. 1 CPU is enough.
3. A public IPv4 address. Most plans include one.
4. Optional: a domain name, such as `dictate.example.com`. Without one, the script uses a free address like `203-0-113-10.sslip.io` that still gets HTTPS.

## Cost

$4 to $12 per month for a 1 GB server at most providers. See the table in [README.md](README.md#choose-a-platform). The domain is optional and costs about $10 to $15 per year.

## Before you start

1. You have the server's IP address and can log in as `root`, or as a user that can use `sudo`.
2. You can open a terminal on your computer. Windows: open **PowerShell**. macOS: open **Terminal**.
3. If you use a domain: in your domain's DNS settings, create an **A record** that points the name (for example `dictate`) to `YOUR_SERVER_IP`. Do this first. It can take a few minutes to start working.
4. Your provider's firewall allows TCP ports **22**, **80**, and **443**. Some providers block 80 and 443 until you open them. The provider guide tells you where.

## Steps

1. Connect to the server. Replace `YOUR_SERVER_IP`:

   ```bash
   ssh root@YOUR_SERVER_IP
   ```

   Type `yes` if asked about the fingerprint. If your provider gave you a username such as `ubuntu`, use `ssh ubuntu@YOUR_SERVER_IP` instead.

2. Paste this command and press Enter:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo bash
   ```

   You can read the script first at [scripts/install-vps.sh](../../scripts/install-vps.sh).

3. Answer the questions:
   1. **Groq API key** and **Gemini API key**: paste them, or press Enter to skip. Nothing shows on screen while you paste. That is normal.
   2. **Domain**: type it, for example `dictate.example.com`, or press Enter if you have none.
   3. **Username**: press Enter to use `mumble`, or type your own.
   4. **Password**: type a password of at least 10 characters, then type it again.

4. Wait for `Mumble AI is installed and running.` It prints the address to open.

5. Open that `https://` address in your browser. Type the username and password. The Mumble AI page opens.

What the script does:

| Part | Where |
| --- | --- |
| App code | `/opt/mumble-flow` |
| Keys and settings | `/opt/mumble-flow/.env` (only root and the app can read it) |
| Saved data | `/opt/mumble-flow/data/` |
| Background service | `mumble-ai` (systemd), starts on boot and restarts after a crash |
| HTTPS and password | Caddy, config in `/etc/caddy/Caddyfile` |
| Firewall | ufw allows SSH, 80, and 443. Port 3050 stays closed. |

To run the script without questions (for example from a provider's "user data" box), set the answers in front of `bash`:

```bash
curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo MF_DOMAIN=none MF_USERNAME=YOUR_USERNAME MF_PASSWORD='YOUR_PASSWORD' bash
```

This leaves the password in your shell history. Run `history -c` afterwards.

## Add your API keys

1. Open the settings file:

   ```bash
   sudo nano /opt/mumble-flow/.env
   ```

2. Paste your key after `GROQ_API_KEY=` and, if you have one, after `GEMINI_API_KEY=`. No spaces, no quotes.
3. Save: press `Ctrl+O`, then Enter, then `Ctrl+X`.
4. Restart the app:

   ```bash
   sudo systemctl restart mumble-ai
   ```

You can also paste keys in the app under **Settings**. Those are saved in `data/whisperflow_store.json`. Both work. `.env` is safer because the Settings screen sends saved keys back to anyone who can open the app.

## Put a password in front

The script already did this with Caddy basic auth. To change the username or password, run the script again with `MF_RECONFIGURE=1`:

```bash
curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo MF_RECONFIGURE=1 bash
```

It asks for the domain, username, password, and keys again. Press Enter at the key questions to keep the current keys.

## HTTPS

Caddy gets and renews a free certificate from Let's Encrypt on its own. For this to work:

1. The domain (or the sslip.io address) must point to the server.
2. Ports 80 and 443 must be open in the provider's firewall.

Check the HTTPS log if the address does not load:

```bash
sudo journalctl -u caddy -n 50 --no-pager
```

## Make data permanent

Nothing to do. `data/` is on the server's own disk and survives restarts, updates, and reboots. It is lost only if you delete the server.

## Update

Run the install command again. It downloads the newest version, keeps `.env`, `data/`, and your password, and restarts the app:

```bash
curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo bash
```

## Back up

1. On the server, pack the data and keys into one file:

   ```bash
   sudo tar -czf /root/mumble-flow-backup.tar.gz -C /opt/mumble-flow data .env
   ```

2. On your own computer, in a new terminal window, download it. Replace `YOUR_SERVER_IP`:

   ```bash
   scp root@YOUR_SERVER_IP:/root/mumble-flow-backup.tar.gz .
   ```

3. Keep the file somewhere safe. It contains your API keys.

To restore on a new server: install with the script, copy the file to `/root/`, then run:

```bash
sudo tar -xzf /root/mumble-flow-backup.tar.gz -C /opt/mumble-flow
sudo chown -R mumble:mumble /opt/mumble-flow/data /opt/mumble-flow/.env
sudo systemctl restart mumble-ai
```

To back up to Google Drive, see [../google-shared-drive.md](../google-shared-drive.md).

## Remove it and stop paying

1. Make a backup first if you want to keep your history.
2. Delete the server in your provider's control panel. This is the step that stops the bill. Also delete any snapshots, backups, or reserved IP addresses you created.
3. If you used a domain, delete its DNS record.

To remove only the app and keep the server:

```bash
sudo systemctl disable --now mumble-ai
sudo rm /etc/systemd/system/mumble-ai.service
sudo systemctl daemon-reload
sudo rm -rf /opt/mumble-flow /var/lib/mumble-flow
sudo userdel mumble
sudo apt-get remove -y caddy
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The address does not load at all | Open TCP 80 and 443 in the provider's firewall. Check the domain's A record points to the server. |
| Certificate error, or Caddy log says "challenge failed" | Same as above. Caddy retries on its own. Wait two minutes after fixing. |
| "502 Bad Gateway" | The app is not running. Run `sudo systemctl status mumble-ai` and `sudo journalctl -u mumble-ai -n 50 --no-pager`. |
| The password box keeps coming back | The username or password is wrong. Reset it with `MF_RECONFIGURE=1` (see above). |
| Dictation says "API Key is not configured" | Add the key to `/opt/mumble-flow/.env` and restart the app. |
| `Could not update /opt/mumble-flow` | Files in that folder were edited by hand. Run `sudo -u mumble git -C /opt/mumble-flow status` to see them, then undo the edits. |
| `This script needs Ubuntu` | Use an Ubuntu 22.04 or 24.04 image, or install by hand: Node.js 22, `git clone` the repository, `npm ci --omit=dev`, a systemd service, and Caddy with `basic_auth`. |
| The desktop companion cannot connect | The companion does not support the password screen. Use it only with a local copy of the app or with [home-server.md](home-server.md) and Tailscale. |
