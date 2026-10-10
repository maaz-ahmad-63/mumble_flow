# Mumble AI on Oracle Cloud (Always Free)

Oracle Cloud's Always Free tier includes Arm servers that cost nothing. It takes more steps than a paid VPS, and free servers are sometimes hard to get.

Replace anything in capital letters that starts with `YOUR_`.

## What to buy

Nothing. Use the Always Free resources:

- Shape **VM.Standard.A1.Flex** (Ampere Arm). The free allowance is 2 OCPUs and 12 GB of memory in total across your A1 instances. 1 OCPU and 6 GB is plenty for Mumble AI.
- Image **Canonical Ubuntu 24.04** (the Arm build that matches the A1 shape).
- The boot volume. Always Free includes 200 GB of block storage in total.

Details: [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

## Cost

$0 within the Always Free limits (checked 2026-10). Sign-up needs a credit card for identity checks. Oracle may reclaim Always Free instances that sit idle for a long time.

## Before you start

1. Sign up at https://www.oracle.com/cloud/free/. Your **home region** cannot be changed later, and Always Free A1 servers can only be created there. Pick a region near you.
2. Optional: a domain, ready for an A record.

## Steps

1. In the Oracle Cloud console, open the menu, then **Compute**, then **Instances**. Click **Create instance**.
2. **Name**: type `mumble-ai`.
3. **Image and shape**:
   1. Click **Change image**, choose **Ubuntu**, then **Canonical Ubuntu 24.04**. Select the build without "Minimal" in its name.
   2. Click **Change shape**, choose **Ampere**, then **VM.Standard.A1.Flex**. Set **OCPUs** to 1 and **Memory** to 6 GB.
4. **Networking**: create a new virtual cloud network with a **public subnet**, and keep **Assign a public IPv4 address** selected.
5. **Add SSH keys**: choose **Generate a key pair for me** and click **Save private key**. Keep that file.
6. Click **Create**. Wait until the state is **Running**. Copy the **Public IP address**. This is `YOUR_SERVER_IP`.
7. Open ports 80 and 443 in Oracle's network firewall:
   1. On the instance page, click the **Subnet** link.
   2. Open **Security Lists** and click the default security list.
   3. Click **Add Ingress Rules**. Source CIDR `0.0.0.0/0`, IP protocol **TCP**, destination port range `80,443`. Click **Add Ingress Rules**.
8. If you have a domain, create an A record that points to `YOUR_SERVER_IP` now.
9. Connect from your computer. Replace the key path and IP:

   ```bash
   ssh -i PATH_TO_YOUR_PRIVATE_KEY ubuntu@YOUR_SERVER_IP
   ```

10. Paste the install command and answer the questions. Details are in [linux-vps.md, Steps](linux-vps.md#steps).

    ```bash
    curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo bash
    ```

Oracle's Ubuntu images block ports with iptables rules inside the server. The script detects this and opens 80 and 443 there too, without turning on ufw.

## Add your API keys

The script asks for them. To change them later, see [linux-vps.md, Add your API keys](linux-vps.md#add-your-api-keys).

## Put a password in front

The script sets up a username and password with Caddy. See [linux-vps.md, Put a password in front](linux-vps.md#put-a-password-in-front).

## HTTPS

Automatic, once step 7 is done. See [linux-vps.md, HTTPS](linux-vps.md#https).

## Make data permanent

Nothing to do. Data is on the boot volume. If Oracle reclaims an idle instance, the data goes with it, so keep backups.

## Update

Run the install command again. See [linux-vps.md, Update](linux-vps.md#update).

## Back up

See [linux-vps.md, Back up](linux-vps.md#back-up). Use `ubuntu` as the user and add `-i PATH_TO_YOUR_PRIVATE_KEY` to `scp`. Write the file where `ubuntu` can read it:

```bash
sudo tar -czf /home/ubuntu/mumble-flow-backup.tar.gz -C /opt/mumble-flow data .env
sudo chown ubuntu /home/ubuntu/mumble-flow-backup.tar.gz
```

```bash
scp -i PATH_TO_YOUR_PRIVATE_KEY ubuntu@YOUR_SERVER_IP:/home/ubuntu/mumble-flow-backup.tar.gz .
```

## Remove it and stop paying

1. Back up first if you want your history.
2. On the instance page, click **Actions**, then **Terminate**. Check **Permanently delete the attached boot volume** and confirm.
3. If you upgraded the account to Pay As You Go, check **Billing & Cost Management** for anything else that is not free.

## Troubleshooting

See [linux-vps.md, Troubleshooting](linux-vps.md#troubleshooting).

| Problem | Fix |
| --- | --- |
| "Out of capacity" or "Out of host capacity" when creating | Free Arm servers are sold out in your region for now. Try another availability domain in the same screen, or try again later. |
| Page does not load | Check the ingress rules in step 7. The script handles the server's own iptables. |
| Windows: `UNPROTECTED PRIVATE KEY FILE` | Run in PowerShell, with your key path: `icacls "PATH_TO_YOUR_PRIVATE_KEY" /inheritance:r /grant:r "$($env:USERNAME):R"` |
| You picked an x86 image and the shape list is empty | The A1 shape needs the Arm (aarch64) build of Ubuntu. Change the image. |
