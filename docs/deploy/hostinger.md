# Mumble AI on Hostinger

Use a **Hostinger VPS**. Normal Hostinger web hosting runs PHP websites and cannot run this app as a server.

Hostinger also has "Node.js Web Apps" on some web hosting plans. That option is not recommended for Mumble AI; see the end of this page.

Replace anything in capital letters that starts with `YOUR_`.

## What to buy

**VPS Hosting**, plan **KVM 1** (1 vCPU, 4 GB RAM, 50 GB disk), operating system **Ubuntu 24.04** (plain OS, no control panel).

## Cost

KVM 1 is $6.49 per month for the first term and renews at $11.99 per month (checked 2026-10, [pricing](https://www.hostinger.com/vps-hosting)). The low price needs a long prepaid term. Check the renewal price before you pay.

## Before you start

1. Buy the VPS plan at https://www.hostinger.com/vps-hosting.
2. Optional: a domain. If it is at Hostinger, you add the A record in hPanel under **Domains**, **DNS / Nameservers**.

## Steps

1. Log in to hPanel at https://hpanel.hostinger.com and click **VPS** in the top menu.
2. If the VPS is not set up yet, choose **Plain OS**, then **Ubuntu 24.04**. Set a root password and finish the setup.
3. On the VPS overview page, copy the IP address. This is `YOUR_SERVER_IP`.
4. If you have a domain, create an A record that points to `YOUR_SERVER_IP` now.
5. Connect. Either click **Browser terminal** on the VPS overview page, or open PowerShell or Terminal on your computer and run:

   ```bash
   ssh root@YOUR_SERVER_IP
   ```

6. Paste the install command and answer the questions. Details are in [linux-vps.md, Steps](linux-vps.md#steps).

   ```bash
   curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo bash
   ```

7. If you turned on the hPanel VPS firewall, add rules that accept TCP 80 and 443.

## Add your API keys

The script asks for them. To change them later, see [linux-vps.md, Add your API keys](linux-vps.md#add-your-api-keys).

## Put a password in front

The script sets up a username and password with Caddy. See [linux-vps.md, Put a password in front](linux-vps.md#put-a-password-in-front).

## HTTPS

Automatic. See [linux-vps.md, HTTPS](linux-vps.md#https).

## Make data permanent

Nothing to do on a VPS. Data is on the VPS disk.

## Update

Run the install command again. See [linux-vps.md, Update](linux-vps.md#update).

## Back up

See [linux-vps.md, Back up](linux-vps.md#back-up). hPanel can also take VPS snapshots under **Snapshots & Backups**.

## Remove it and stop paying

1. Back up first if you want your history.
2. Hostinger VPS plans are prepaid. In hPanel, open **Billing**, find the VPS, and turn off **auto-renewal** so you are not charged again. Hostinger's refund policy decides whether you get money back for the unused time.
3. Remove the domain's DNS record if you added one.

## Troubleshooting

See [linux-vps.md, Troubleshooting](linux-vps.md#troubleshooting).

| Problem | Fix |
| --- | --- |
| You do not know the root password | In hPanel, open the VPS, then **Settings** or **Overview**, and change the root password. |
| You bought web hosting, not a VPS | Web hosting cannot run the install script. Buy a VPS, or read the next section. |

## Hostinger Node.js Web Apps (not recommended)

Some Hostinger web hosting plans can run a Node.js app imported from GitHub (hPanel: **Websites**, **Add Website**, **Node.js web app**, **Import Git repository**). Mumble AI starts there, but:

1. Each redeploy builds into a new folder, so `data/` starts empty and your history is lost.
2. There is no password screen in front of the app.
3. Apps stop when idle and start again on the next visit.

If you try it anyway: set the entry file to `server/index.js`, pick Node.js 22, and add `GROQ_API_KEY` and `GEMINI_API_KEY` as environment variables, not in the app's Settings screen.
