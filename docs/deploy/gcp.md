# Mumble AI on Google Cloud

There are two ways. Pick one.

- **Option A: Compute Engine e2-micro.** A small Ubuntu server that fits Google Cloud's free tier. You run the install script. It gives you an `https://` address with a password, usable from any device. Recommended.
- **Option B: Cloud Run.** Google runs the Docker image for you and keeps it private. Data is kept in a Cloud Storage bucket. You open it on your computer through `gcloud`. Good if you already use Google Cloud from the command line.

Replace anything in capital letters that starts with `YOUR_`.

## What to buy

- Option A: one **e2-micro** VM in **us-west1**, **us-central1**, or **us-east1**, with a **standard persistent disk** of up to 30 GB.
- Option B: a **Cloud Run** service and a **Cloud Storage** bucket in a US region.

## Cost

Checked 2026-10, [free tier](https://docs.cloud.google.com/free/docs/free-cloud-features):

- Option A: the free tier covers one e2-micro VM per month in those three regions, 30 GB of standard persistent disk, and 1 GB of outbound traffic. Other items, such as a balanced disk, a different region, or extra traffic, are billed.
- Option B: Cloud Run and Cloud Storage have monthly free amounts (Cloud Storage: 5 GB in US regions). Light personal use usually stays inside them. Builds use Cloud Build and Artifact Registry, which have their own free amounts.

Google Cloud needs a billing account with a card, even for free-tier use. Set a budget alert in **Billing**, **Budgets & alerts**.

## Before you start

1. Create a Google Cloud account at https://console.cloud.google.com and a project. Link a billing account.
2. Option B only: install the Google Cloud CLI from https://cloud.google.com/sdk/docs/install, or use **Cloud Shell** (the terminal icon at the top of the console).

## Steps

### Option A: e2-micro VM

1. In the console, open **Compute Engine**, **VM instances**. Click **Create instance**. Enable the Compute Engine API if asked.
2. **Name**: `mumble-ai`. **Region**: `us-central1`, `us-west1`, or `us-east1`.
3. **Machine type**: **E2**, then **e2-micro**.
4. **OS and storage**: click **Change**. Operating system **Ubuntu**, version **Ubuntu 24.04 LTS** (x86/64). Boot disk type **Standard persistent disk**. Size **30** GB. Click **Select**. The default disk type is not free; change it.
5. **Networking**: under **Firewall**, check **Allow HTTP traffic** and **Allow HTTPS traffic**.
6. Click **Create**. Copy the **External IP**. This is `YOUR_SERVER_IP`.
7. If you have a domain, create an A record that points to `YOUR_SERVER_IP` now.
8. Click **SSH** next to the VM. A browser terminal opens.
9. Paste the install command and answer the questions. Details are in [linux-vps.md, Steps](linux-vps.md#steps).

   ```bash
   curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo bash
   ```

The external IP can change if you stop and start the VM. To keep it, open **VPC network**, **IP addresses**, and reserve it as static. Check the price there first.

### Option B: Cloud Run, private

Run these in Cloud Shell or a terminal with the Google Cloud CLI. Use your own project ID and a bucket name that nobody else uses.

1. Get the code:

   ```bash
   git clone https://github.com/maaz-ahmad-63/mumble_flow.git
   cd mumble_flow
   ```

2. Pick the project and turn on the services:

   ```bash
   gcloud config set project YOUR_PROJECT_ID
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```

3. Create the bucket that holds `data/`:

   ```bash
   gcloud storage buckets create gs://YOUR_BUCKET_NAME --location=us-central1
   ```

4. Let Cloud Run's service account use the bucket. The first line looks up your project number:

   ```bash
   PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')
   gcloud storage buckets add-iam-policy-binding gs://YOUR_BUCKET_NAME --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role=roles/storage.objectAdmin
   ```

5. Build and deploy. This keeps the service private (`--no-allow-unauthenticated`) and runs at most one copy so two copies never write the data file at once:

   ```bash
   gcloud run deploy mumble-ai --source . --region us-central1 --port 3050 --no-allow-unauthenticated --max-instances 1 --execution-environment gen2 --add-volume name=data,type=cloud-storage,bucket=YOUR_BUCKET_NAME,mount-options="uid=1000;gid=1000" --add-volume-mount volume=data,mount-path=/app/data
   ```

   Answer `Y` if it asks to create an Artifact Registry repository.

6. Open it on your computer:

   ```bash
   gcloud run services proxy mumble-ai --region us-central1 --port 3050
   ```

   Open http://localhost:3050. Keep that terminal open while you use the app. Because the address is `localhost`, the microphone works.

## Add your API keys

- Option A: the script asks for them. To change them later, see [linux-vps.md, Add your API keys](linux-vps.md#add-your-api-keys).
- Option B: in the console, open **Cloud Run**, click `mumble-ai`, then **Edit & deploy new revision**. Open **Variables & Secrets**, add `GROQ_API_KEY` and `GEMINI_API_KEY`, and click **Deploy**. For stronger protection, store them in Secret Manager and reference them there instead.

## Put a password in front

- Option A: the script sets up a username and password with Caddy. See [linux-vps.md, Put a password in front](linux-vps.md#put-a-password-in-front).
- Option B: `--no-allow-unauthenticated` means only Google accounts you grant the **Cloud Run Invoker** role can reach it, and only through `gcloud run services proxy` or a signed request. Do not switch the service to public access. The app has no login of its own.

## HTTPS

- Option A: automatic. See [linux-vps.md, HTTPS](linux-vps.md#https).
- Option B: the `run.app` address is HTTPS. The proxy gives you `http://localhost`, which browsers also accept for the microphone.

## Make data permanent

- Option A: nothing to do. Data is on the VM's disk.
- Option B: the bucket mounted at `/app/data` keeps the data. Keep `--max-instances 1`.

## Update

- Option A: run the install command again. See [linux-vps.md, Update](linux-vps.md#update).
- Option B: in the `mumble-flow` folder, run `git pull`, then the same `gcloud run deploy` command from step 5.

## Back up

- Option A: in the browser SSH window, pack the data into your home folder:

  ```bash
  sudo tar -czf ~/mumble-flow-backup.tar.gz -C /opt/mumble-flow data .env
  sudo chown "$USER" ~/mumble-flow-backup.tar.gz
  echo ~/mumble-flow-backup.tar.gz
  ```

  Then click **Download file** at the top of the SSH window and paste the path that the last line printed. The file contains your API keys. Keep it safe. Restore steps are in [linux-vps.md, Back up](linux-vps.md#back-up).
- Option B: copy the data file from the bucket:

  ```bash
  gcloud storage cp gs://YOUR_BUCKET_NAME/whisperflow_store.json .
  ```

## Remove it and stop paying

- Option A: back up, then in **VM instances** select the VM and click **Delete**. Release any static IP you reserved.
- Option B:

  ```bash
  gcloud run services delete mumble-ai --region us-central1
  gcloud storage rm --recursive gs://YOUR_BUCKET_NAME
  gcloud artifacts repositories delete cloud-run-source-deploy --location us-central1
  ```

The simplest way to stop all charges is to shut down the whole project: **IAM & Admin**, **Settings**, **Shut down**.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Option A: page does not load | Check **Allow HTTP traffic** and **Allow HTTPS traffic** are on (VM, **Edit**, **Networking**). |
| Option A: bill is not zero | Check the region, the disk type (must be standard), and outbound traffic. |
| Option B: `403 Forbidden` in the browser | You opened the `run.app` address directly. Use `gcloud run services proxy` and `http://localhost:3050`. |
| Option B: data is not saved | Check step 4. The service account needs `roles/storage.objectAdmin` on the bucket. |
| Option B: deploy fails on `--add-volume` | Update the CLI with `gcloud components update`, or use Cloud Shell. |
| Other problems on Option A | See [linux-vps.md, Troubleshooting](linux-vps.md#troubleshooting). |
