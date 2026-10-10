# Security

## Reporting a problem

If you find a security issue, do not open a public GitHub issue with the details.

Use GitHub private vulnerability reporting on this repository: **Security** → **Report a vulnerability**. If that is unavailable, email the maintainer through the address on the GitHub profile [ImaduddeenKhan](https://github.com/ImaduddeenKhan) and leave the exploit out of the first message.

## What to know before you host this

Mumble AI is an open-source voice dictation and intelligence platform.

- It includes built-in authentication and session tokens.
- Keys typed into Settings are stored in plain text in `data/whisperflow_store.json`.
- `GET /api/settings` returns those keys to anyone who can open the app.
- Put a password in front of the app before it is reachable from the internet. Every guide in [docs/deploy/](docs/deploy/README.md) has a "Put a password in front" section. `scripts/install-vps.sh` sets up Caddy with HTTPS and basic auth on a VPS. Render and Railway have no password screen; their guides explain the risk.

Prefer environment variables (`GROQ_API_KEY`, `GEMINI_API_KEY`) over typing keys into Settings on a machine you do not fully control. `.env` is listed in `.gitignore`. Do not remove that line.
