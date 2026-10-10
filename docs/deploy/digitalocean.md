# Mumble AI on DigitalOcean

You rent a small Ubuntu server (a Droplet) and run one install command. Use a Droplet, not App Platform: App Platform has no persistent disk, so your history would be lost on every deploy.

Replace anything in capital letters that starts with `YOUR_`.

## What to buy

A **Basic Droplet**, CPU option **Regular**, **1 GB RAM / 1 CPU / 25 GB disk**, image **Ubuntu 24.04 (LTS) x64**.

## Cost

About $6 per month for the 1 GB Droplet (checked 2026-10, [pricing](https://www.digitalocean.com/pricing/droplets)). Billing is per second, with a monthly cap. Optional Droplet backups cost extra.

## Before you start

1. Create an account at https://cloud.digitalocean.com and add a payment method.
2. Optional: buy a domain anywhere and be ready to add an A record.

## Steps

1. In the DigitalOcean control panel, click **Create**, then **Droplets**.
2. **Region**: pick the one closest to you.
3. **Image**: **Ubuntu**, version **24.04 (LTS) x64**.
4. **Size**: **Basic**, **Regular**, the **1 GB** option.
5. **Authentication**: choose **SSH Key** if you have one, or **Password** and type a strong root password.
6. **Hostname**: type `mumble-ai`.
7. Click **Create Droplet**. Wait until it shows an IP address. Copy it. This is `YOUR_SERVER_IP`.
8. If you have a domain, create an A record that points to `YOUR_SERVER_IP` now.
9. Connect and install. Follow [linux-vps.md, Steps](linux-vps.md#steps). In short:

   ```bash
   ssh root@YOUR_SERVER_IP
   ```

   ```bash
   curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo bash
   ```

New Droplets have no cloud firewall, so ports 80 and 443 are already reachable. The script turns on the server's own firewall (ufw). If you later add a DigitalOcean Cloud Firewall, allow inbound TCP 22, 80, and 443.

## Add your API keys

The script asks for them. To change them later, see [linux-vps.md, Add your API keys](linux-vps.md#add-your-api-keys).

## Put a password in front

The script sets up a username and password with Caddy. See [linux-vps.md, Put a password in front](linux-vps.md#put-a-password-in-front).

## HTTPS

Automatic. See [linux-vps.md, HTTPS](linux-vps.md#https).

## Make data permanent

Nothing to do. Data is on the Droplet's disk and survives restarts and updates.

## Update

Run the install command again. See [linux-vps.md, Update](linux-vps.md#update).

## Back up

See [linux-vps.md, Back up](linux-vps.md#back-up). You can also turn on Droplet backups in the Droplet's **Backups** tab for an extra fee.

## Remove it and stop paying

1. Back up first if you want your history.
2. Open the Droplet, click **Destroy** in the left menu, then **Destroy this Droplet**, and confirm. Billing stops when the Droplet is destroyed. A powered-off Droplet is still billed.
3. Delete any snapshots under **Backups & Snapshots** and remove the domain's DNS record.

## Troubleshooting

See [linux-vps.md, Troubleshooting](linux-vps.md#troubleshooting).

| Problem | Fix |
| --- | --- |
| `ssh` asks for a password you never set | You chose SSH Key. Use the key: `ssh -i PATH_TO_YOUR_PRIVATE_KEY root@YOUR_SERVER_IP`. Or use **Access**, **Launch Droplet Console** in the control panel. |
| Page does not load after adding a Cloud Firewall | Add inbound rules for HTTP (80) and HTTPS (443). |
