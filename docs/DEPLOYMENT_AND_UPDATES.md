# Mumble AI — Deployment & Update Guide

This guide contains everything you need to manage your **Live Web Link** on your VM instance and release new versions of the **Desktop Companion App** (`.exe` / `.dmg`).

---

## 1. Updating the Live Link on Your VM Instance

Whenever you push new changes to the `main` branch on GitHub, update your cloud server by running these 3 commands:

```bash
# SSH into your VM server
ssh ubuntu@YOUR_SERVER_IP

# Pull latest code and restart
cd /opt/mumble-flow
sudo git pull
sudo npm install
sudo systemctl restart mumble-ai
```

That's it! The live link at your domain/IP will immediately reload with the latest web studio and backend updates.

> **Useful Server Check Commands:**
> - Check server status: `sudo systemctl status mumble-ai`
> - View live server logs: `sudo journalctl -u mumble-ai -f`
> - Check Caddy HTTPS status: `sudo systemctl status caddy`

---

## 2. Releasing a New Desktop App Update (`.exe` & `.dmg`)

All desktop installers are built automatically by GitHub Actions across Mac and Windows runners whenever you push a version tag.

### Step 1: Bump the version (optional but recommended)
In `desktop/electron/package.json`, bump the version number (e.g. from `1.0.0` to `1.0.1`).

### Step 2: Tag and push to GitHub
```bash
git add .
git commit -m "release: v1.0.1"
git push origin main

# Create and push the version tag
git tag v1.0.1
git push origin v1.0.1
```

### Step 3: Automated Build & Publishing
GitHub Actions will automatically:
1. Spin up a macOS runner and build the `.dmg` and `.zip`.
2. Spin up a Windows runner and build the `.exe` installer and portable `.exe`.
3. Create a public release on GitHub and attach all downloads to:
   **`https://github.com/maaz-ahmad-63/mumble_flow/releases`**

### Step 4: User Notification
Any user who has the desktop app installed will automatically receive an in-app dialog prompt:
> **"Update Available: Mumble AI v1.0.1 is available (current: v1.0.0)."**
> Clicking **"Update Now"** downloads the latest installer directly.

---

## 3. How Users Interface with the Desktop App (`.exe` / `.dmg`)

When a user downloads and installs the app from `.exe` or `.dmg`:

### 1. Where Does the App Live?
- The app runs in the **System Tray** (Windows, near the clock) or **Menu Bar** (macOS, top right) with a microphone icon (`🎙️`).
- It does not clutter the screen with an unnecessary window while working.

### 2. How Do Users Speak & Dictate?
- The user clicks anywhere (Google Chrome, YouTube, VS Code, Word, Slack, WhatsApp, Terminal).
- They **Hold Space** (or tap **F8**).
- A sleek floating HUD appears at the bottom center of their screen showing:
  - `🎙️ Listening... Active App: Google Chrome`
- When they release **Space** or press **F8** again, it turns to `✨ Enhancing...` and types the polished, context-aware text directly at their cursor.

### 3. Where Do They Give Their API Key?
Users can open the settings interface at any time:
1. Click the **Mumble AI icon in the tray / menu bar**.
2. Click **"Settings..."** or **"Open Web Interface"**.
3. It opens the Mumble AI Web Studio (`http://localhost:3050`).
4. Click the **Settings (gear icon)** at the top right to paste their **Groq API Key** (`gsk_...`) or **Gemini API Key**.
5. Once saved, their key is encrypted and stored in `data/mumble_flow.sqlite`. The desktop app immediately starts using it for all dictations across all applications.

---

## 4. Quick Command Cheat-Sheet

| Task | Command |
| :--- | :--- |
| **Run Web Server Locally** | `npm start` |
| **Run Desktop App Locally** | `npm run desktop:start` |
| **Run Automated Tests** | `npm test` |
| **Publish New App Version** | `git tag v1.0.X && git push origin v1.0.X` |
| **Update Cloud VM** | `cd /opt/mumble-flow && sudo git pull && sudo systemctl restart mumble-ai` |
