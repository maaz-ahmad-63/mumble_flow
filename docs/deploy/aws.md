# Mumble AI on AWS

Use **Amazon Lightsail**. It is AWS's simple monthly-price server, and the install script sets everything up on it.

Other AWS options and why they are not used here:

- **App Runner** is closed to new customers since 2026-04-30 ([notice](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)).
- **Elastic Beanstalk** and **ECS** replace the app's files on every deploy, so `data/` is lost unless you add shared storage. That is more work than this guide covers.
- **EC2** works the same way as Lightsail. If you use EC2, pick Ubuntu 24.04, open TCP 22, 80, and 443 in the security group, then follow [linux-vps.md](linux-vps.md).

Replace anything in capital letters that starts with `YOUR_`.

## What to buy

A **Lightsail instance**: platform **Linux/Unix**, blueprint **OS Only**, **Ubuntu 24.04 LTS**, plan **$7 USD (1 GB RAM)** with public IPv4. Plus a **static IP** (free while it is attached to the instance).

## Cost

$7 per month for the 1 GB plan with IPv4 (checked 2026-10, [pricing](https://aws.amazon.com/lightsail/pricing/)). The $5 plan has only 512 MB of RAM, which is tight for `npm install`. A static IP that is not attached to an instance is billed.

## Before you start

1. Create an AWS account at https://aws.amazon.com and add a payment method.
2. Optional: a domain, ready for an A record.

## Steps

1. Open https://lightsail.aws.amazon.com and click **Create instance**.
2. Pick a **Region** close to you.
3. **Select a platform**: **Linux/Unix**. **Select a blueprint**: **OS Only**, then **Ubuntu 24.04 LTS**.
4. **Choose your instance plan**: the **$7** plan (1 GB).
5. **Identify your instance**: type `mumble-ai`. Click **Create instance**.
6. Open the instance, then the **Networking** tab.
   1. Under **IPv4 networking**, click **Attach static IP**, create one, and attach it. Copy this IP. It is `YOUR_SERVER_IP`.
   2. Under **IPv4 Firewall**, click **Add rule**, choose **HTTPS**, and click **Create**. The default rules already allow SSH (22) and HTTP (80).
7. If you have a domain, create an A record that points to `YOUR_SERVER_IP` now.
8. Connect: on the instance page, click **Connect using SSH**. A browser terminal opens. Or use your own terminal with the key from **Account**, **SSH keys**: `ssh -i PATH_TO_YOUR_KEY ubuntu@YOUR_SERVER_IP`.
9. Paste the install command and answer the questions. Details are in [linux-vps.md, Steps](linux-vps.md#steps).

   ```bash
   curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo bash
   ```

## Add your API keys

The script asks for them. To change them later, see [linux-vps.md, Add your API keys](linux-vps.md#add-your-api-keys).

## Put a password in front

The script sets up a username and password with Caddy. See [linux-vps.md, Put a password in front](linux-vps.md#put-a-password-in-front).

## HTTPS

Automatic, once port 443 is open in the Lightsail firewall (step 6). See [linux-vps.md, HTTPS](linux-vps.md#https).

## Make data permanent

Nothing to do. Data is on the instance's disk.

## Update

Run the install command again. See [linux-vps.md, Update](linux-vps.md#update).

## Back up

See [linux-vps.md, Back up](linux-vps.md#back-up). The username in the `scp` command is `ubuntu`, and the file must be readable by it:

```bash
sudo tar -czf /home/ubuntu/mumble-flow-backup.tar.gz -C /opt/mumble-flow data .env
sudo chown ubuntu /home/ubuntu/mumble-flow-backup.tar.gz
```

```bash
scp -i PATH_TO_YOUR_KEY ubuntu@YOUR_SERVER_IP:/home/ubuntu/mumble-flow-backup.tar.gz .
```

Lightsail can also take snapshots (**Snapshots** tab). Snapshots are billed per GB.

## Remove it and stop paying

1. Back up first if you want your history.
2. On the instance page, click the three-dot menu, then **Delete**, and confirm.
3. Open **Networking** on the Lightsail home page and delete the static IP. An unattached static IP is billed.
4. Delete any snapshots, and remove the domain's DNS record.

## Troubleshooting

See [linux-vps.md, Troubleshooting](linux-vps.md#troubleshooting).

| Problem | Fix |
| --- | --- |
| HTTPS never works | Add the HTTPS (443) rule in the instance's **Networking** tab. |
| The IP changed after a restart | Attach a static IP (step 6), update the DNS record, and run the script again with `MF_RECONFIGURE=1`. |
| `npm` is killed during install | The instance has too little memory. Use the 1 GB plan or larger. |
