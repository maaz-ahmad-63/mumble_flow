# AGENTS.md

Instructions for AI coding agents working in this repository: Claude Code, Cursor, GitHub Copilot, Gemini CLI, Windsurf, Codex, and others. This file is the single source of truth. `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, and `.cursor/rules/murmur-flow.mdc` only point here.

Humans should start at [README.md](README.md). Someone who wants an agent to install the app can paste [docs/agent-prompt.md](docs/agent-prompt.md) into it.

## What this is

Mumble AI (formerly Murmur Flow) is an open-source voice dictation and intelligence platform. You speak in the browser or via the Electron desktop companion, and it returns cleaned-up, structured text.

- Node.js 20 or newer (22 or 24 LTS recommended). Express serves `client/` and the API in `server/`.
- No build step. `npm install && npm start` runs it.
- Listens on port 3050, or on `PORT` from the environment. If the port is busy, it moves to the next free port and prints the address.
- Saves multi-user history, settings, quotas, and BYOK encrypted keys in `data/mumble_flow.sqlite` (with legacy fallback to `data/whisperflow_store.json`). That data must survive restarts and redeploys.
- Includes JWT Bearer authentication and an Admin dashboard.
- The browser only allows the microphone on `https://` or `http://localhost`. A plain `http://SERVER_IP:3050` page will load, but dictation will not work without HTTPS.

The public name is Mumble AI. Some internal legacy files still maintain compatibility with `whisperflow` store data. Do not delete them to avoid losing user data.

## Repo map

```text
server/index.js              Express app and all routes. GET /health returns {"status":"ok"}.
server/services/             Groq, Gemini, rule-based cleanup, notes, storage
server/providers/            Provider registry (see docs/providers.md)
client/                      Browser UI: index.html, styles/, js/
desktop/                     Optional companion that types into other apps (F8 hotkey)
tests/test_services.js       npm test. Needs no API key.
scripts/setup.ps1            Local setup and start on Windows
scripts/setup.sh             Local setup and start on macOS and Linux
scripts/install-vps.sh       One-command install on a fresh Ubuntu server
docs/setup.md                Local install guide for people
docs/deploy/                 One hosting guide per platform, plus a chooser
docs/agent-prompt.md         Copy-paste prompt for users
Dockerfile                   Node 22 image, runs as user node, data in /app/data
docker-compose.yml           Docker with a named volume for /app/data
render.yaml, fly.toml        Platform configs used by docs/deploy/render.md and fly.md
.env.example                 Template for .env
```

## Set up on this computer

Run the setup script from the repository root. It checks Node.js, runs `npm install`, creates `.env` from `.env.example` if missing, runs `npm test`, starts the app, and prints the address. It stays in the foreground. Ctrl+C stops it.

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

macOS and Linux:

```bash
bash scripts/setup.sh
```

Options: `-NoStart` / `--no-start` (set up and test only), `-SkipTests` / `--skip-tests`, and on Windows `-NoBrowser`.

Manual steps if the script cannot run:

```bash
npm install
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
npm test
npm start
```

If Node.js is missing or older than 20, tell the user to install the LTS version from https://nodejs.org/en/download, then open a new terminal. On Ubuntu servers, `scripts/install-vps.sh` installs Node.js itself.

If you start the server to check something, stop it before you finish. Do not leave a server running.

## Verify

1. `npm test` prints `ALL TESTS PASSED`. It writes a row into `data/whisperflow_store.json`. Do not commit that file.
2. `GET http://localhost:3050/health` returns HTTP 200 with `{"status":"ok",...}`.
   - PowerShell: `Invoke-WebRequest http://localhost:3050/health -UseBasicParsing`
   - macOS and Linux: `curl -fsS http://localhost:3050/health`
3. Open http://localhost:3050 in Chrome, Edge, or Safari. The page loads. Typed cleanup works with no key. Microphone dictation needs a key.

## Environment variables

Set them in `.env` (local and VPS) or in the host's environment settings (Render, Railway, Fly secrets, Azure, Cloud Run). `.env.example` lists them.

| Name | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3050` | Port to listen on. PaaS hosts set this themselves. Do not override it there. |
| `GROQ_API_KEY` | empty | Groq key. Used for speech-to-text and cleanup. |
| `GEMINI_API_KEY` | empty | Gemini key. Used when Gemini is selected. |
| `DEFAULT_STT_PROVIDER` | `groq` | Speech-to-text provider. |
| `DEFAULT_LLM_PROVIDER` | `groq` | Rewrite provider. |
| `DEFAULT_TONE` | `casual` | Default tone. |
| `AUTO_COPY_CLIPBOARD` | `true` | Copy results to the clipboard. |

Values already set in the real environment win over `.env`. `docs/providers.md` lists any extra variables for other providers.

## Where API keys go

- Keys are optional. With no key, typed cleanup, snippets, dictionary, and meeting notes still work through built-in rules. Microphone dictation needs a key.
- Free Groq key: https://console.groq.com/keys. Gemini key: https://aistudio.google.com/apikey.
- On a server, put keys in `.env` or the host's environment settings. Keys typed into the Settings screen are saved in plain text in `data/whisperflow_store.json`, and `GET /api/settings` returns them to anyone who can open the app.
- Ask the user to paste their key. Never invent, guess, or reuse a key from somewhere else.
- Never print a key, echo it back, put it in a command that gets logged, or write it anywhere except `.env` or the host's secret settings.

## AI providers

The default providers are Groq and Gemini. To add or switch providers, read [docs/providers.md](docs/providers.md).

Do not change model IDs unless the task is to update them. Current defaults that work on a free key:

- Groq speech-to-text: `whisper-large-v3-turbo`
- Groq chat: `openai/gpt-oss-20b`. The call uses `max_completion_tokens` and `reasoning_effort: "low"`.
- Gemini: `gemini-3.6-flash`

## Google Drive backup

To back up `data/` to Google Drive, read [docs/google-shared-drive.md](docs/google-shared-drive.md).

## Deploy

Hosting guides are in [docs/deploy/README.md](docs/deploy/README.md). There is one guide per platform, and each has the same sections: what to buy, cost, steps, API keys, password, HTTPS, permanent data, update, back up, and remove.

## Decision flow

Ask the user only what you cannot find out yourself:

1. Which AI provider they want, and their key for it. A key is optional; they can skip it.
2. Whether the app is only for this computer, or must be reachable from other devices.
3. If other devices: whether they have an always-on computer at home, or want a cloud server, and which cloud account they already have.
4. For a cloud server: whether they own a domain. A domain is optional.

Then follow this order:

1. **Only this computer.** Run the setup script. Done. Guide: [docs/setup.md](docs/setup.md).
2. **Own devices only, with an always-on computer at home.** Use [docs/deploy/home-server.md](docs/deploy/home-server.md) with Tailscale. Nothing is exposed to the internet.
3. **Cloud server, no preference.** Use a small Ubuntu VPS and `scripts/install-vps.sh`. It sets up HTTPS and a password. Guide: [docs/deploy/linux-vps.md](docs/deploy/linux-vps.md). The user picks the provider from the table in `docs/deploy/README.md`.
4. **Cloud server, specific provider.** Use that provider's guide in `docs/deploy/`.
5. **Free.** Oracle Cloud Always Free ([oracle-cloud.md](docs/deploy/oracle-cloud.md)) or a Google Cloud e2-micro ([gcp.md](docs/deploy/gcp.md)). Both need a card for sign-up and take more steps.
6. **Render or Railway.** Possible, but these have no password screen. Explain the risk in their guides before using them.
7. **Will not work.** PHP-only shared hosting, static hosts (GitHub Pages, Netlify static), and Vercel serverless functions. The app needs a long-running Node.js process and a disk that persists.

Ask before doing anything that costs money or creates resources in the user's cloud account.

## Rules

- Never commit `.env`, API keys, or `data/*.json`.
- Never invent keys. Never print keys.
- Never put secrets in docs, issues, commit messages, or prompts.
- Do not change model IDs unless the task asks for it.
- Do not add a login system unless the task asks for it.
- Put a password in front before exposing the app to the internet: Caddy basic auth (`scripts/install-vps.sh` does this), Tailscale, Cloudflare Access, the host's own sign-in, or a private-only URL. The app has none of its own.
- `import 'dotenv/config'` must stay the first import in `server/index.js`.
- Do not claim a path works if you did not run it. Say what you ran and what you did not.
- Do not rename `whisperflow` files, the store file, or the Docker volume unless the task is a rename.
- If you change install or hosting steps, update `docs/setup.md`, the matching file in `docs/deploy/`, and the README links in the same change.

## Where to change things

- Speech and rewrite calls: `server/services/groqService.js`, `server/services/geminiService.js`, and the provider registry described in `docs/providers.md`
- Cleanup when no key is set: `server/services/zeroEditEngine.js`
- Routes: `server/index.js`
- Saved settings, dictionary, snippets: `server/services/storageService.js`
- Screens: `client/index.html`, `client/styles/`, `client/js/`
- Desktop hotkey: `desktop/whisperflow_companion.py`

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `node` is not recognized | Install Node.js LTS from https://nodejs.org/en/download, then open a new terminal. |
| `npm.ps1 cannot be loaded because running scripts is disabled` | Use `npm.cmd install` and `npm.cmd start`, or run the setup script with `-ExecutionPolicy Bypass` as shown above. |
| The app prints a port other than 3050 | Port 3050 was busy. Use the printed address, or stop the other program. |
| Dictation says "API Key is not configured" | Add a key to `.env` and restart, or paste it in Settings and click Save. |
| The microphone button does nothing on a server | The page is on plain `http://`. Use HTTPS (see the deploy guide) or `http://localhost`. |
| History disappears after a restart or redeploy | `data/` is not on a persistent disk. Follow "Make data permanent" in the platform's guide. |
| 502 or "bad gateway" behind Caddy | The app is not running. `sudo systemctl status mumble-ai` and `sudo journalctl -u mumble-ai -n 50`. |
| HTTPS certificate fails | The domain does not point at the server yet, or ports 80 and 443 are closed in the cloud firewall. |
| Desktop companion cannot reach a password-protected server | The companion has no password support. Run it against `http://localhost:3050` or a Tailscale address. |

## Before you finish

1. Run `npm test`.
2. Stop any server you started.
3. Check `git status`. `.env` and `data/*.json` must not appear as staged.
