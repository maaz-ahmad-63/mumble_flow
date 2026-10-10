# Mumble AI on Hetzner Cloud

You rent a small Ubuntu cloud server and run one install command.

Replace anything in capital letters that starts with `YOUR_`.

## What to buy

A **Hetzner Cloud** server (not a dedicated server, not Webhosting):

- Image: **Ubuntu 24.04**
- Type: the cheapest shared vCPU type that is in stock in your location. **CX23** (cost-optimized) is cheapest when available. **CPX12** is the next choice.
- Networking: keep **Public IPv4** turned on.

## Cost

Checked 2026-10, not verified on Hetzner's own page: CX23 about €6 per month when it is in stock, CPX12 about €12 per month. Public IPv4 can add a small monthly fee. Check the current price in the server creation screen and at [hetzner.com/cloud](https://www.hetzner.com/cloud).

## Before you start

1. Create an account at https://console.hetzner.com. Hetzner may ask for ID verification or a prepayment for new accounts.
2. Optional: a domain, ready for an A record.

## Steps

1. In the Hetzner Console, open your project (or create one), then click **Add Server**.
2. **Location**: the one closest to you.
3. **Image**: **Ubuntu 24.04**.
4. **Type**: **Shared vCPU**, then the cheapest available type as described in "What to buy".
5. **Networking**: keep **Public IPv4** and **Public IPv6** on.
6. **SSH keys**: add yours if you have one. Without one, Hetzner emails you a root password.
7. **Name**: type `mumble-ai`.
8. Click **Create & Buy now**. Copy the IPv4 address. This is `YOUR_SERVER_IP`.
9. If you have a domain, create an A record that points to `YOUR_SERVER_IP` now.
10. Connect and install. Follow [linux-vps.md, Steps](linux-vps.md#steps). In short:

    ```bash
    ssh root@YOUR_SERVER_IP
    ```

    ```bash
    curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo bash
    ```

New servers have no Hetzner Cloud Firewall attached, so ports 80 and 443 are reachable. If you attach one later, allow inbound TCP 22, 80, and 443.

## Add your API keys

The script asks for them. To change them later, see [linux-vps.md, Add your API keys](linux-vps.md#add-your-api-keys).

## Put a password in front

The script sets up a username and password with Caddy. See [linux-vps.md, Put a password in front](linux-vps.md#put-a-password-in-front).

## HTTPS

Automatic. See [linux-vps.md, HTTPS](linux-vps.md#https).

## Make data permanent

Nothing to do. Data is on the server's disk.

## Update

Run the install command again. See [linux-vps.md, Update](linux-vps.md#update).

## Back up

See [linux-vps.md, Back up](linux-vps.md#back-up). Hetzner also sells automatic server backups (a percentage of the server price) in the server's **Backups** tab.

## Remove it and stop paying

1. Back up first if you want your history.
2. Open the server, click **Delete** and confirm. Hetzner bills by the hour until the server is deleted. A powered-off server is still billed.
3. Delete any snapshots and Primary IPs you kept, and remove the domain's DNS record.

## Troubleshooting

See [linux-vps.md, Troubleshooting](linux-vps.md#troubleshooting).

| Problem | Fix |
| --- | --- |
| The type you want is greyed out | It is out of stock in that location. Pick another location or the next type. |
| You did not get the root password email | Check spam. Or use **Rescue**, **Reset root password** on the server page. |
