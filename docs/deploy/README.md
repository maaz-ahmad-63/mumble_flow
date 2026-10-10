# Host Mumble AI

Use this page to choose where to run Mumble AI, then follow the one guide for that place.

If you only want it on your own computer, you do not need hosting. Follow [../setup.md](../setup.md).

## What Mumble AI needs from a host

1. **A Node.js process that keeps running.** Node.js 20 or newer. The app is a normal web server, not a set of short functions.
2. **A disk that keeps files.** History, snippets, dictionary, and Settings are saved in `data/whisperflow_store.json`. If the disk is wiped on restart or redeploy, that data is lost.
3. **HTTPS.** Browsers only allow the microphone on `https://` addresses or on `http://localhost`. On a plain `http://` address, the page loads but dictation does not work.
4. **A password in front.** The app has no login. Anyone who finds the address can use it, read your history, and use up your API key. Every guide has a "Put a password in front" section. Do not skip it.

## Kinds of hosting

| Kind | What it is | Works? |
| --- | --- | --- |
| VPS (virtual private server) | A small Linux computer you rent by the month. You get full control. | Yes. Best choice. One command installs everything, including HTTPS and a password. |
| PaaS (platform as a service) | You connect the GitHub repository and the platform runs it. | Yes, if you add a persistent disk. Most have no password screen. |
| Container service | Runs the Docker image from this repository. | Yes, if you attach a volume for `/app/data`. |
| Free tiers | Oracle Cloud Always Free, Google Cloud e2-micro. | Yes, but sign-up needs a card, and setup has more steps. |
| Your own computer or home server | A computer at home that stays on. | Yes. Free. Reach it from your phone with Tailscale. |
| PHP shared hosting | Hosting plans that only run PHP websites. | **No.** They cannot run a Node.js server. |
| Static hosting | GitHub Pages, Netlify or Cloudflare Pages static sites, S3 websites. | **No.** They only serve files. There is no server. |
| Vercel | Runs code as serverless functions. | **No.** Functions have a read-only disk (except `/tmp`), stop after at most 300 seconds on the free plan and 800 seconds on Pro, and keep nothing between runs. See [Vercel function limits](https://vercel.com/docs/functions/limitations). |

## Choose a platform

Prices are rough monthly costs in US dollars or euros, checked 2026-10. They change often. Check the pricing link before you buy.

| Platform | Kind | What to buy | Rough cost per month (checked 2026-10) | Data kept? | Password in front | Difficulty | Guide |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Any Linux VPS | VPS | Ubuntu 24.04 server with 1 GB RAM or more | $4 to $12 | Yes | Caddy (installed by the script) | Medium | [linux-vps.md](linux-vps.md) |
| DigitalOcean | VPS | Basic Droplet, Regular, 1 GB / 1 CPU | $6 ([pricing](https://www.digitalocean.com/pricing/droplets)) | Yes | Caddy | Medium | [digitalocean.md](digitalocean.md) |
| Hostinger | VPS | VPS KVM 1 | $6.49 first term, renews at $11.99 ([pricing](https://www.hostinger.com/vps-hosting)) | Yes | Caddy | Medium | [hostinger.md](hostinger.md) |
| AWS | VPS | Lightsail Linux instance, 1 GB, with public IPv4 | $7 ([pricing](https://aws.amazon.com/lightsail/pricing/)) | Yes | Caddy | Medium | [aws.md](aws.md) |
| Hetzner | VPS | Cloud server CPX12 (or CX23 when it is in stock) | about €12 for CPX12, not verified ([pricing](https://www.hetzner.com/cloud)) | Yes | Caddy | Medium | [hetzner.md](hetzner.md) |
| Oracle Cloud | Free tier VPS | Always Free Ampere A1 instance | $0 ([free tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)) | Yes | Caddy | Hard | [oracle-cloud.md](oracle-cloud.md) |
| Google Cloud | Free tier VPS, or container service | Compute Engine e2-micro in a US free-tier region, or Cloud Run | $0 within free tier limits ([free tier](https://docs.cloud.google.com/free/docs/free-cloud-features)) | Yes | Caddy, or Google sign-in on Cloud Run | Medium to hard | [gcp.md](gcp.md) |
| Azure | PaaS | App Service, Linux, Basic B1 | about $13, not verified ([pricing](https://azure.microsoft.com/pricing/details/app-service/linux/)) | Yes | Microsoft sign-in (App Service Authentication) | Medium | [azure.md](azure.md) |
| Render | PaaS | Starter web service and a 1 GB disk | $7 plus $0.25 ([pricing](https://render.com/pricing)) | Yes, with the disk | **None built in** | Easy | [render.md](render.md) |
| Railway | PaaS | Hobby plan and a 1 GB volume | $5, includes $5 of usage ([pricing](https://railway.com/pricing)) | Yes, with the volume | **None built in** | Easy | [railway.md](railway.md) |
| Fly.io | Container service | One small Machine and a 1 GB volume | a few dollars, machine price not verified; volume $0.15 ([pricing](https://fly.io/docs/about/pricing/)) | Yes, with the volume | Private network only, opened with `fly proxy` | Medium | [fly.md](fly.md) |
| Docker | Container, on any machine | A machine with Docker installed | Depends on the machine | Yes, named volume | Add Caddy or use Tailscale | Medium | [docker.md](docker.md) |
| Coolify | Self-hosted PaaS on your VPS | A VPS with 2 CPUs and 2 GB RAM or more | The VPS price, from about $9 | Yes, with persistent storage | Coolify's HTTP Basic Authentication | Medium | [coolify.md](coolify.md) |
| Home server | Your own computer | Nothing. Tailscale is free for personal use. | $0 plus electricity | Yes | Tailscale (private) or Cloudflare Access | Easy to medium | [home-server.md](home-server.md) |

## If you are not sure

1. **Only you, on your own devices, and you have a computer at home that stays on:** [home-server.md](home-server.md) with Tailscale. Nothing is exposed to the internet.
2. **You want a web address that works anywhere:** buy the cheapest VPS you trust from the table and follow its guide. The install script does HTTPS and the password for you.
3. **You want it free:** [oracle-cloud.md](oracle-cloud.md) or the e2-micro path in [gcp.md](gcp.md). Expect more steps.
4. **You already use Azure, Google Cloud, or Fly.io:** use those guides. They keep the app private with the platform's own sign-in.

Avoid Render and Railway for daily use until Mumble AI has its own login. Their guides explain why.

## Every guide has the same sections

1. What to buy
2. Cost
3. Before you start
4. Steps
5. Add your API keys
6. Put a password in front
7. HTTPS
8. Make data permanent
9. Update
10. Back up
11. Remove it and stop paying
12. Troubleshooting

To back up to Google Drive instead of a file on your computer, see [../google-shared-drive.md](../google-shared-drive.md). To use a different AI provider, see [../providers.md](../providers.md).
