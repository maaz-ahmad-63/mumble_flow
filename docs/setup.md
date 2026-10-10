# Set up Mumble AI on your computer

This page installs Mumble AI on your own Windows, macOS, or Linux computer. It takes about five minutes.

- To put it on a server or use it from your phone, see [deploy/README.md](deploy/README.md).
- To let a coding agent do it, paste [agent-prompt.md](agent-prompt.md) into the agent.

## 1. Install Node.js and Git

1. Download the **LTS** version of Node.js from https://nodejs.org/en/download and install it. On Windows, keep **Add to PATH** checked. Mumble AI needs version 20 or newer.
2. Install Git if you do not have it:
   - Windows: https://git-scm.com/download/win
   - macOS: open Terminal and run `xcode-select --install`
   - Ubuntu or Debian: `sudo apt-get install -y git`
3. Close and reopen your terminal so it finds the new programs.

## 2. Download and start

### Windows

1. Open **PowerShell** (press the Windows key, type `PowerShell`, press Enter).
2. Paste these lines one at a time:

   ```powershell
   git clone https://github.com/maaz-ahmad-63/mumble_flow.git
   cd mumble_flow
   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
   ```

3. The script installs everything, runs the tests, starts the app, and opens http://localhost:3050 in your browser.

### macOS and Linux

1. Open **Terminal**.
2. Paste these lines one at a time:

   ```bash
   git clone https://github.com/maaz-ahmad-63/mumble_flow.git
   cd mumble_flow
   bash scripts/setup.sh
   ```

3. When it says `Mumble AI is running`, open http://localhost:3050 in Chrome, Edge, or Safari.

Keep the terminal window open while you use the app. Press `Ctrl+C` in it to stop the app. To start it again later, open a terminal in the `mumble_flow` folder and run the same setup command, or `npm start`.

### Without the script

```bash
npm install
cp .env.example .env
npm start
```

On Windows PowerShell, use `Copy-Item .env.example .env` for the second line.

## 3. Add an API key (optional)

Without a key, typed cleanup, snippets, the dictionary, and meeting notes work with built-in rules. Microphone dictation needs a key.

1. Get a free Groq key at https://console.groq.com/keys. Sign in, click **Create API Key**, and copy it.
2. Optional: get a Gemini key at https://aistudio.google.com/apikey.
3. In Mumble AI, click **Settings**, paste the key into **Groq key** (and **Gemini key**), and click **Save**.

Or open the `.env` file in the `mumble_flow` folder, paste the key after `GROQ_API_KEY=`, save, and restart the app.

To use a different AI provider, see [providers.md](providers.md).

## 4. Desktop companion (optional)

The companion types cleaned text into any app on your computer, such as Word, Slack, or your email. Press **F8**, speak, press **F8** again.

It is a separate program from the web app. The web app must be running, and a speech key must be saved in its Settings. The companion runs on the computer with the microphone, not on a server.

1. Install Python 3 from https://www.python.org/downloads/. On Windows, check **Add python.exe to PATH**.
2. With Mumble AI running, open a second terminal in the `mumble_flow` folder and run:

   ```bash
   pip install keyboard sounddevice scipy numpy
   python desktop/whisperflow_companion.py
   ```

On Windows, if F8 does nothing, close the terminal, right-click PowerShell, choose **Run as administrator**, and start the companion again. More options are in [desktop/README.md](../desktop/README.md).

## 5. Settings file

`.env` holds these settings. `.env.example` shows the defaults.

| Name | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3050` | Port the app uses. |
| `GROQ_API_KEY` | empty | Groq key for dictation and cleanup. |
| `GEMINI_API_KEY` | empty | Gemini key, used when Gemini is selected. |
| `DEFAULT_STT_PROVIDER` | `groq` | Speech-to-text provider. |
| `DEFAULT_LLM_PROVIDER` | `groq` | Rewrite provider. |
| `DEFAULT_TONE` | `casual` | Default tone. |
| `AUTO_COPY_CLIPBOARD` | `true` | Copy results to the clipboard. |

Your history, snippets, dictionary, and Settings are saved in `data/whisperflow_store.json`. Copy that file to keep a backup.

## 6. If something breaks

| Problem | Fix |
| --- | --- |
| `node` or `git` is not recognized | Install it (step 1), then close and reopen the terminal. |
| `running scripts is disabled on this system` | Use the exact command from step 2, which includes `-ExecutionPolicy Bypass`. |
| `Node.js ... is too old` | Install the LTS version from https://nodejs.org/en/download. |
| The app says it is running on 3051 or another port | Port 3050 was busy. Open the address it prints. |
| "API Key is not configured" | Add a key (step 3). |
| The microphone does not work | Use `http://localhost:3050`, not your computer's IP address. Allow microphone access when the browser asks. |
| The companion says a package is missing | Run `pip install keyboard sounddevice scipy numpy` again. |
