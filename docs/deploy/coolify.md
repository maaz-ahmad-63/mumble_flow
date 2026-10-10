# Mumble AI on Coolify

Coolify is a free, self-hosted dashboard that deploys apps from GitHub onto your own server. Use it if you want a web dashboard for this and other apps. If Mumble AI is the only app, [linux-vps.md](linux-vps.md) is simpler.

Replace anything in capital letters that starts with `YOUR_`.

## What to buy

A VPS with **at least 2 CPUs, 2 GB RAM, and 10 GB of free disk**, running **Ubuntu 24.04**. That is Coolify's own minimum. More disk helps, because each build keeps a Docker image. Examples: Hostinger KVM 2, Hetzner CPX22, DigitalOcean 2 CPU Droplet.

## Cost

Coolify is free when you host it yourself. You pay for the VPS, from about $9 per month for a 2 CPU / 8 GB Hostinger KVM 2 first term (checked 2026-10, [pricing](https://www.hostinger.com/vps-hosting)). See the provider guides for other prices.

## Before you start

1. Create the VPS using your provider's guide in this folder, up to the point where you can `ssh` in. Do not run Mumble AI's install script on this server; Coolify takes ports 80 and 443.
2. Open TCP ports 22, 80, 443, and 8000 in the provider's firewall.
3. Optional but recommended: a domain with an A record pointing to the server.

## Steps

1. Connect to the server and install Coolify ([official guide](https://coolify.io/docs/get-started/installation)):

   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
   ```

2. Open `http://YOUR_SERVER_IP:8000` right away and create the admin account. The first person to open this page becomes the admin.
3. In Coolify, click **Projects**, then create a project, then **Add New Resource**, **Public Repository**.
4. Repository URL: `https://github.com/maaz-ahmad-63/mumble_flow`. Branch: `main`.
5. **Build Pack**: **Dockerfile**. **Ports Exposes**: `3050`.
6. Click **Continue**. On the application page:
   1. **Domains**: type `https://YOUR_DOMAIN`. Without a domain, keep the generated `sslip.io` address.
   2. **Health check**: path `/health`.
7. Open **Persistent Storage**, click **Add**, choose a volume, and set the **Destination Path** to `/app/data`.
8. Add your keys (see below), turn on the password (see below), then click **Deploy**.

## Add your API keys

On the application page, open **Environment Variables** and add `GROQ_API_KEY` and `GEMINI_API_KEY`. Redeploy.

## Put a password in front

Coolify can add HTTP basic authentication ([Coolify docs](https://coolify.io/docs/core/networking/proxy/traefik/basic-auth)):

1. Open the application, then **Configuration**, **General**.
2. Find **HTTP Basic Authentication** and turn it on.
3. Type a **Username** and **Password**. Save.
4. Keep **Readonly labels** turned on so Coolify keeps generating the proxy settings.
5. Redeploy. Open the address in a private browser window and check it asks for the password.

Also protect the Coolify dashboard itself: use a strong admin password, and after setup, give the dashboard a domain with HTTPS under **Settings**.

## HTTPS

Coolify gets certificates on its own for the domains you enter, once they point at the server and ports 80 and 443 are open.

## Make data permanent

The persistent storage at `/app/data` from step 7 keeps the data across deploys. Without it, every deploy starts empty.

## Update

Click **Redeploy** on the application page. It pulls the newest code from GitHub. You can also turn on automatic deploys in the application settings.

## Back up

1. Back up the Coolify configuration file `/data/coolify/source/.env`. Coolify's guide says to keep a copy.
2. Back up the app data. Find the volume name on the **Persistent Storage** page, then on the server:

   ```bash
   sudo docker run --rm -v YOUR_VOLUME_NAME:/data -v "$PWD":/backup alpine tar -czf /backup/mumble-ai-data.tar.gz -C /data .
   ```

   Download `mumble-ai-data.tar.gz` with `scp`, as in [linux-vps.md, Back up](linux-vps.md#back-up).

## Remove it and stop paying

1. In Coolify, delete the application. Check the box to delete its volumes if you do not need the data.
2. To stop paying, delete the VPS in your provider's panel.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Port 8000 does not load | Open TCP 8000 in the provider's firewall. |
| Deploy works but the page is "Bad Gateway" | **Ports Exposes** must be `3050`. |
| `EACCES` on `/app/data` in the logs | The volume belongs to root. Open the application's **Terminal**, switch to root if offered, and run `chown -R node:node /app/data`. Then redeploy. |
| Password screen does not appear | Turn HTTP Basic Authentication off, save, on again, save, and redeploy. |
