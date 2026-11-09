# Mumble AI — Commercial Beta Guide

This guide covers local development, web access, desktop companion installation, macOS permissions, environment configuration, and known release boundaries.

---

## 1. Local Development Installation

### Prerequisites
- Node.js 20 LTS or newer (v22 or v24 recommended)
- macOS (Apple Silicon or Intel) or Windows 10/11

### Quick Start
```bash
# Clone and enter the repository
cd mumble-flow

# Install root dependencies
npm install

# Run automated tests to verify your environment
npm test

# Start the local development server (listens on port 3050)
npm run dev
```

For SQLite local development, no cloud database is required. The app automatically creates and manages `data/mumble_flow.sqlite`.

---

## 2. Web Application Access

- **Local Web Interface:** Open `http://localhost:3050` in Google Chrome, Safari, Edge, or Arc.
- **Microphone Security Note:** Modern web browsers require either `http://localhost` or a secure `https://` origin to access the microphone.
- **Initial Verification:**
  1. Open Settings (⚙️ in the top right).
  2. Enter a free Groq API key (`https://console.groq.com/keys`) or Gemini key (`https://aistudio.google.com/apikey`).
  3. Hold Space or tap the microphone button in the web UI and speak.
  4. Transcribed and enhanced text appears in the editor immediately.

---

## 3. Desktop Companion Installation & Packaging

The Mumble AI desktop companion is a lightweight system tray application that floats an overlay HUD and types dictated text into active desktop applications via global hotkey (`F8` or hold `Space`).

### Run in Development
```bash
# Install desktop companion dependencies (one-time setup)
cd desktop/electron && npm install && cd ../..

# Launch the desktop companion against the local server
npm run desktop:start
```

### Packaging Installers
Packaging commands use `electron-builder`:

```bash
# Build an unpacked macOS application bundle (.app) for testing
npm run desktop:pack

# Build distributable macOS DMG and ZIP installers (arm64 + x64)
npm run desktop:dist:mac

# Build Windows NSIS installer and portable executable
npm run desktop:dist:win
```

Output artifacts are generated in `desktop/electron/dist/`.

> **Packaging Security Guard:** The packaging configuration explicitly excludes all `.env` files, `.sqlite` databases, test files, and local store JSON files from the application bundle.

---

## 4. Required macOS Permissions

The desktop companion requires two macOS system permissions to operate:

1. **Microphone Access:**
   - **Purpose:** Capture spoken audio for speech-to-text.
   - **Path:** `System Settings → Privacy & Security → Microphone` → Enable **Mumble AI**.
2. **Accessibility (UI Automation):**
   - **Purpose:** Dispatch `Cmd+V` keystrokes to insert formatted text at your active cursor.
   - **Path:** `System Settings → Privacy & Security → Accessibility` → Enable **Mumble AI**.

If permissions are not granted, the desktop app displays an interactive setup dialog with a one-click button to open the relevant macOS preference pane.

---

## 5. Production Environment Configuration

When deploying the backend to production (Render, Railway, Fly.io, or VPS), configure the following environment variables in your cloud provider's dashboard:

| Variable | Description | Example / Default |
|---|---|---|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | HTTP/WebSocket listening port | Provided by host (e.g. `3050`) |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/mumble_prod?sslmode=require` |
| `JWT_SECRET` | Secret key for signing bearer tokens | Minimum 32-character random string |
| `BYOK_ENCRYPTION_KEY` | AES-256-GCM master key for user API keys | 64-character hex string (`openssl rand -hex 32`) |
| `ADMIN_SECRET` | Secret key used to provision initial admin | Secret passphrase |
| `GROQ_API_KEY` | Platform default Groq speech/chat key | `gsk_...` |
| `GEMINI_API_KEY` | Platform default Gemini key (optional) | `AIzaSy...` |
| `DEFAULT_STT_PROVIDER` | Speech-to-text provider | `groq` |
| `DEFAULT_LLM_PROVIDER` | Language model provider | `groq` |
| `DEFAULT_TONE` | Default dictation tone | `casual` |

> **Security Rule:** Never commit real secrets to source control or `.env` in public repositories.

To point the desktop companion to a remote cloud deployment rather than a local server, launch the desktop app with:
```bash
MUMBLE_SERVER_URL=https://your-mumble-deployment.com npm run desktop:start
```

---

## 6. Known Boundaries, Limitations & Troubleshooting

### Cross-Application Text Insertion Compatibility
- **Guaranteed Compatible:**
  - Web Browsers: Google Chrome, Safari, Firefox, Arc, Brave, Microsoft Edge.
  - Development Tools: Visual Studio Code, Cursor, Xcode, Android Studio, Sublime Text.
  - Messaging & Social: Slack, Discord, Messages, WhatsApp Desktop, Telegram.
  - Productivity & Notes: Apple Notes, Obsidian, Notion, Google Docs (in browser).
  - Terminals: Terminal.app, iTerm2, Warp (in command prompt or insert mode).
- **Incompatible / Non-Guaranteed by Design:**
  - Password and secure entry fields: The macOS kernel `SecureInput` API prevents keystroke automation by design.
  - Full-screen exclusive 3D games (Metal / OpenGL).
  - Virtual machines and remote desktop sessions (Citrix Workspace, Microsoft Remote Desktop).
  - Terminal editors in Normal mode (e.g., Vim/Helix in command mode; cursor must be in Insert mode).

### Common Troubleshooting
| Symptom | Cause | Solution |
|---|---|---|
| `Dictation says "API Key is not configured"` | No API key detected | Enter your Groq or Gemini key in the web Settings modal or set `GROQ_API_KEY` in `.env`. |
| `Microphone button disabled in browser` | Insecure origin | Access via `http://localhost:3050` or deploy with HTTPS. Plain `http://IP:3050` disables Web Audio APIs. |
| `Cmd+V does not paste into other apps` | Accessibility permission missing | Grant Accessibility permission to Mumble AI in `System Settings → Privacy & Security → Accessibility`. |
| `400 invalid_media_file during streaming` | Missing WebM container header | Resolved in latest codebase via `earlyChunkBuffer` and EBML header auto-repair. |
| `Gatekeeper warning when opening .app` | Unsigned binary in beta build | Right-click the `.app` bundle, select **Open**, and click **Open Anyway**. For public distribution, configure Apple Developer ID code signing and notarization. |

---

## 7. Current Build & Release Status

- **Core Dictation Engine:** Stable. Verified across all 15 supported tones, verbatim Raw mode, EBML streaming audio recovery, and PostgreSQL/SQLite database compatibility.
- **Desktop Companion:** Stable. Implements active target application awareness, clipboard restoration safety, and global hotkeys.
- **Automated Tests:** 28 of 28 test suites passing (100% pass rate).
- **Release Readiness Classification:**
  - **Private Beta:** **READY**. Can be distributed to internal testers and pilot users using unpacked `.app` or direct developer builds.
  - **Public Beta:** **PENDING APPLE CODE SIGNING**. Requires an active Apple Developer ID certificate and `xcrun notarytool` notarization to eliminate macOS Gatekeeper warnings on consumer machines.
  - **Commercial Release:** **PENDING PAYMENT / STRIPE INTEGRATION**. Quotas and user tier models are fully functional in software; billing checkout workflows require integration prior to paid commercial launch.
