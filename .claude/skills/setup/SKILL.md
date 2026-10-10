---
name: setup
description: Install and start Mumble AI for the user, on this computer or on a server. Use when the user asks to install, set up, run, host, or deploy Mumble AI.
---

# Set up Mumble AI

Read [AGENTS.md](../../../AGENTS.md) first. It has the rules, the environment variables, and the decision flow. This skill is the step-by-step version.

## 1. Ask only what you cannot find out

Ask these in one short message. Do not ask anything you can check yourself (operating system, Node.js version, whether `.env` exists).

1. Where should it run?
   - Only on this computer.
   - On my other devices too, using a computer at home that stays on.
   - On a cloud server. Which provider do you already use, if any?
2. Which AI provider do you want? Groq has a free key and is the default. Gemini is the other built-in option. See `docs/providers.md` for others. A key is optional; typed cleanup works without one.
3. For a cloud server only: do you own a domain you want to use? This is optional.

## 2. Handle the API key safely

- Best: tell the user to open `.env` in the project folder and paste the key after `GROQ_API_KEY=` or `GEMINI_API_KEY=` themselves. The key then never appears in the chat.
- If the user pastes the key into the chat, write it into `.env` only. Do not repeat it, print it, or put it in a command line that is logged.
- Never invent a key. If there is no key, continue without one.
- Free Groq key: https://console.groq.com/keys. Gemini key: https://aistudio.google.com/apikey.

## 3. Only this computer

1. Check Node.js: `node --version`. It must be v20 or newer. If not, tell the user to install the LTS version from https://nodejs.org/en/download, open a new terminal, and tell you when done.
2. From the repository root, run the setup script with tests but without starting the server, so you do not block:
   - Windows: `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -NoStart`
   - macOS and Linux: `bash scripts/setup.sh --no-start`
3. Add the key to `.env` as described in step 2, if the user has one.
4. Start the server in the background with `npm start` (Windows: `npm.cmd start`). Check `http://localhost:3050/health` returns HTTP 200. Use the port the app prints if it is not 3050.
5. Tell the user to open http://localhost:3050 in Chrome, Edge, or Safari.
6. Tell the user how to start it again later: open a terminal in the folder and run the setup script without `-NoStart`, or `npm start`.
7. If the user does not want it left running, stop the server. Do not leave a server running that the user does not know about.

## 4. Other devices, using a computer at home

Follow `docs/deploy/home-server.md`. Prefer the Tailscale option: nothing is exposed to the internet, and the microphone works because Tailscale gives an HTTPS address. Do the local setup in section 3 first.

## 5. A cloud server

1. Open `docs/deploy/README.md` and pick the guide for the user's provider. If they have no preference, use `docs/deploy/linux-vps.md` with a provider from the table.
2. Tell the user what to buy and the rough monthly cost before they create anything. Ask before running any command that creates paid resources.
3. For any Ubuntu server, the user (or you, if you have SSH access they gave you) runs:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/maaz-ahmad-63/mumble_flow/main/scripts/install-vps.sh | sudo bash
   ```

   The script asks for a domain (optional), a username, and a password, and optionally the API keys. The user should type the password and keys into the script themselves.
4. Remind the user to open TCP ports 80 and 443 in the provider's firewall if the guide says so.
5. Check the printed `https://` address loads and asks for the username and password.

Never expose the app to the internet without a password in front. The app has no login of its own. Render and Railway have no password screen; explain this from their guides before using them.

## 6. Report back

Tell the user, in plain words:

- The address to open.
- Where the key is stored (`.env` or the host's settings).
- How to start, stop, and update the app.
- What you ran and verified, and anything you did not verify.
