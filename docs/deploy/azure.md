# Mumble AI on Microsoft Azure

There are two ways. Pick one.

- **Option A: App Service.** Azure runs the Node.js app for you. You put Microsoft sign-in in front, so only your Microsoft account can open it. No server to manage.
- **Option B: a Linux virtual machine.** A small Ubuntu server where you run the install script, the same as any VPS.

Replace anything in capital letters that starts with `YOUR_`.

## What to buy

- Option A: an **App Service** web app, **Linux**, runtime **Node 22 LTS**, pricing plan **Basic B1**. The **Free F1** plan works for a short test, but it has a daily CPU limit and sleeps.
- Option B: a **Virtual machine** with **Ubuntu Server 24.04 LTS**, a small B-series size with at least 1 GB of RAM.

## Cost

Checked 2026-10, not verified on Azure's own pricing page:

- Option A: Basic B1 is about $13 per month in US regions. Free F1 costs $0. See [App Service pricing](https://azure.microsoft.com/pricing/details/app-service/linux/).
- Option B: depends on the size and region. The portal shows the monthly estimate when you pick a size. New accounts may get free VM hours for 12 months.

## Before you start

1. Create an account at https://portal.azure.com.
2. Option A: install the Azure CLI from https://learn.microsoft.com/cli/azure/install-azure-cli, or use **Cloud Shell** (the terminal icon at the top of the portal). Then sign in with `az login`.

## Steps

### Option A: App Service

1. Get a fresh copy of the code. Use a new folder so no local `.env` or `data/` is uploaded:

   ```bash
   git clone https://github.com/maaz-ahmad-63/mumble_flow.git mumble-flow-azure
   cd mumble-flow-azure
   ```

2. Check the exact Node.js runtime name Azure offers today:

   ```bash
   az webapp list-runtimes --os linux --output table
   ```

   Look for a line like `NODE:22-lts`.

3. Create and deploy the app. `YOUR_APP_NAME` becomes part of the address and must be unique across Azure:

   ```bash
   az webapp up --name YOUR_APP_NAME --runtime "NODE:22-lts" --sku B1 --location eastus
   ```

   It prints the resource group it created and the address, `https://YOUR_APP_NAME.azurewebsites.net`. Azure runs `npm install` and sets `PORT` itself. Do not set `PORT`.

4. Add sign-in before you use it. See "Put a password in front" below.

### Option B: virtual machine

1. In the portal, click **Create a resource**, then **Virtual machine**.
2. **Image**: **Ubuntu Server 24.04 LTS**. **Size**: a small B-series size with at least 1 GB of RAM.
3. **Authentication type**: **SSH public key**. Username: `azureuser`. Download the key when asked.
4. **Inbound port rules**: allow **SSH (22)**, **HTTP (80)**, and **HTTPS (443)**.
5. Click **Review + create**, then **Create**. Copy the **Public IP address**. This is `YOUR_SERVER_IP`.
6. Connect and install. Details are in [linux-vps.md, Steps](linux-vps.md#steps).

   ```bash
   ssh -i PATH_TO_YOUR_KEY azureuser@YOUR_SERVER_IP
   ```

   ```bash
   curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo bash
   ```

## Add your API keys

- Option A: in the portal, open your web app, then **Settings**, **Environment variables**. On **App settings**, click **Add**, enter `GROQ_API_KEY` and your key, click **Apply**. Repeat for `GEMINI_API_KEY`. Click **Apply** at the bottom and confirm. The app restarts.
- Option B: the script asks for them. To change them later, see [linux-vps.md, Add your API keys](linux-vps.md#add-your-api-keys).

## Put a password in front

- Option A: use App Service Authentication ([Microsoft guide](https://learn.microsoft.com/azure/app-service/configure-authentication-provider-aad)).
  1. Open your web app, then **Settings**, **Authentication**. Click **Add identity provider**.
  2. **Identity provider**: **Microsoft**. Choose **Workforce configuration (current tenant)**. Keep the option to create a new app registration.
  3. **Supported account types**: current tenant only.
  4. Under **App Service authentication settings**: **Restrict access** set to **Require authentication**. **Unauthenticated requests**: **HTTP 302 Found redirect**.
  5. Click **Add**. Open the app address in a private browser window. It sends you to Microsoft sign-in first.
- Option B: the script sets up a username and password with Caddy. See [linux-vps.md, Put a password in front](linux-vps.md#put-a-password-in-front).

## HTTPS

- Option A: `https://YOUR_APP_NAME.azurewebsites.net` has HTTPS already. Under **Settings**, **Configuration**, **General settings**, turn **HTTPS Only** on.
- Option B: automatic. See [linux-vps.md, HTTPS](linux-vps.md#https).

## Make data permanent

- Option A: the app runs from `/home/site/wwwroot`, which is on Azure's persistent storage, so `data/` survives restarts. Whether a redeploy keeps `data/` was not tested. Back up before each redeploy.
- Option B: nothing to do. Data is on the VM's disk.

## Update

- Option A: in the `mumble-flow-azure` folder, run `git pull`, then the same `az webapp up` command from step 3.
- Option B: run the install command again. See [linux-vps.md, Update](linux-vps.md#update).

## Back up

- Option A: open `https://YOUR_APP_NAME.scm.azurewebsites.net/newui` (Kudu), sign in, open the file manager, go to `site/wwwroot/data`, and download `whisperflow_store.json`.
- Option B: see [linux-vps.md, Back up](linux-vps.md#back-up). Use `azureuser` instead of `root`, and write the file to `/home/azureuser`.

## Remove it and stop paying

Delete the resource group. This removes the web app or VM and everything created with it. Replace the name with the one `az webapp up` printed, or the one you picked for the VM:

```bash
az group delete --name YOUR_RESOURCE_GROUP
```

Or in the portal: **Resource groups**, click the group, **Delete resource group**.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Option A: "Application Error" page | Open **Monitoring**, **Log stream** to see why. Check the runtime is Node 20 or newer. |
| Option A: name already taken | `YOUR_APP_NAME` must be unique. Pick another. |
| Option A: sign-in loop | Delete the identity provider in **Authentication** and add it again. |
| Option B: page does not load | Check the network security group allows inbound 80 and 443 (VM, **Networking**). |
| Other problems on Option B | See [linux-vps.md, Troubleshooting](linux-vps.md#troubleshooting). |
