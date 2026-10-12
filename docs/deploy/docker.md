# Mumble AI with Docker

Run Mumble AI in a container on any computer or server that has Docker. `docker-compose.yml` in this repository builds the image and keeps `data/` in a named volume.

Replace anything in capital letters that starts with `YOUR_`.

## What to buy

Nothing extra. You need a machine with **Docker Engine** and the **Docker Compose plugin**, or **Docker Desktop** on Windows and macOS. On a server, any VPS from [README.md](README.md#choose-a-platform) works.

## Cost

$0 on your own computer. On a server, the server's price.

## Before you start

1. Install Docker:
   - Windows and macOS: Docker Desktop from https://docs.docker.com/get-started/get-docker/
   - Ubuntu server:

     ```bash
     curl -fsSL https://get.docker.com | sudo sh
     ```

2. Check it works:

   ```bash
   docker compose version
   ```

3. Get the code:

   ```bash
   git clone https://github.com/maaz-ahmad-63/mumble_flow.git
   cd mumble_flow
   ```

## Steps

1. Create the settings file:
   - macOS and Linux: `cp .env.example .env`
   - Windows PowerShell: `Copy-Item .env.example .env`
2. Optional: open `.env` and paste your keys after `GROQ_API_KEY=` and `GEMINI_API_KEY=`.
3. On a server, add this line to `.env` so the app port is not open to the internet. Docker port rules skip the ufw firewall, so this matters:

   ```text
   BIND_ADDRESS=127.0.0.1
   ```

4. Build and start:

   ```bash
   docker compose up -d --build
   ```

5. Check it:

   ```bash
   docker compose ps
   ```

   The `mumble-ai` container shows `healthy` after about 30 seconds.

6. On your own computer, open http://localhost:3050. On a server, continue with "Put a password in front".

## Add your API keys

Edit `.env`, then recreate the container:

```bash
docker compose up -d
```

## Put a password in front

On your own computer, nothing is needed: `localhost` is only reachable from that computer.

On a server, run Caddy on the server itself, in front of the container:

1. Install Caddy (official Ubuntu steps from https://caddyserver.com/docs/install):

   ```bash
   sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
   sudo apt-get update
   sudo apt-get install -y caddy
   ```

2. Make a password hash. Type your password when asked:

   ```bash
   caddy hash-password
   ```

   Copy the line it prints. It starts with `$2a$`.

3. Open the Caddy settings file:

   ```bash
   sudo nano /etc/caddy/Caddyfile
   ```

   Delete everything in it and paste this. Replace `YOUR_DOMAIN` (or use `YOUR-IP-WITH-DASHES.sslip.io`, for example `203-0-113-10.sslip.io`), `YOUR_USERNAME`, and `YOUR_PASSWORD_HASH`:

   ```text
   YOUR_DOMAIN {
   	basic_auth {
   		YOUR_USERNAME YOUR_PASSWORD_HASH
   	}
   	reverse_proxy 127.0.0.1:3050
   }
   ```

   Save with `Ctrl+O`, Enter, `Ctrl+X`.

4. Load it:

   ```bash
   sudo systemctl reload caddy
   ```

5. Open `https://YOUR_DOMAIN`. It asks for the username and password.

If you would rather not run Docker, [linux-vps.md](linux-vps.md) does all of this with one command.

## HTTPS

On a server, Caddy gets the certificate on its own once the domain points at the server and ports 80 and 443 are open. On your own computer, `http://localhost` is enough.

## Make data permanent

Already done. `docker-compose.yml` stores `/app/data` in the named volume `whisperflow_data`. It survives `docker compose down`, rebuilds, and updates.

Do not run `docker compose down -v`. The `-v` deletes the volume and your history.

## Update

```bash
git pull
docker compose up -d --build
```

## Back up

Copy the data out of the running container into a folder named `mumble-flow-backup`:

```bash
docker compose cp mumble-ai:/app/data ./mumble-flow-backup
```

To restore into a running container:

```bash
docker compose cp ./mumble-flow-backup/. mumble-ai:/app/data
docker compose exec -u root mumble-ai chown -R node:node /app/data
docker compose restart
```

## Remove it and stop paying

Stop and remove the container but keep the data:

```bash
docker compose down
```

Remove everything, including your history:

```bash
docker compose down -v --rmi local
```

If this ran on a rented server, delete the server in the provider's panel to stop the bill.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `docker: command not found` | Install Docker (see "Before you start") and open a new terminal. |
| Port 3050 is already in use | Set `PORT=3052` in `.env` and run `docker compose up -d`. Open port 3052. |
| Container keeps restarting | Run `docker compose logs --tail 50` to see why. |
| History is empty after an update | You may have run `down -v`. Restore from a backup. |
| The app is reachable on `http://SERVER_IP:3050` | Add `BIND_ADDRESS=127.0.0.1` to `.env` and run `docker compose up -d`. |
