# Copilot instructions

The full instructions for this repository are in [AGENTS.md](../AGENTS.md). Read it first. Edit AGENTS.md, not this file.

Short version:

- Mumble AI is a Node.js 20+ Express app. `npm install && npm start` serves it on port 3050 or `PORT`.
- Data is saved in `data/whisperflow_store.json`. It must persist and must never be committed.
- `import 'dotenv/config'` must stay the first import in `server/index.js`.
- Never commit `.env`, API keys, or `data/*.json`. Never invent or print keys.
- Do not change model IDs (`whisper-large-v3-turbo`, `openai/gpt-oss-20b`, `gemini-3.6-flash`) unless asked.
- Do not add a login system unless asked. Put a password in front before exposing the app.
- Run `npm test` before finishing. It needs no API key.
- Hosting guides: [docs/deploy/README.md](../docs/deploy/README.md).
