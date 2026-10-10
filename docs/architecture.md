# How Mumble AI is put together

This page is for someone reading the code. Install steps are in [setup.md](setup.md).

## Request path

1. The browser records audio, or you paste text.
2. `POST /api/dictate` accepts an audio file. Groq Whisper (`whisper-large-v3-turbo`) or Gemini transcribes it.
3. `server/services/zeroEditEngine.js` rewrites the transcript. With a key, that is a Groq or Gemini chat call. With no key, a local cleanup removes some fillers and applies the selected tone.
4. The result is stored in `data/whisperflow_store.json` and returned to the page.
5. `POST /api/process-text` skips the audio step and starts at the rewrite.

Command mode (`POST /api/command`) and the meeting summary (`POST /api/notetaker/summarize`) call the chat model. Command mode has no local fallback. The meeting summary falls back to a fixed template when no key is set.

## What stays on disk

`server/services/storageService.js` creates `data/` and the JSON store if they are missing. The store holds settings, dictionary, snippets, history, and meetings. Uploaded audio is written under `uploads/` and is not part of the git history.

## Desktop

`desktop/whisperflow_companion.py` records on the computer where the microphone is, sends audio to the server, and types the result into the focused window. It is not a second server.

## Themes

The page sets `data-theme` on `<html>` to `light`, `dark`, or `contrast`. The choice is saved in the browser under `whisperflow-theme`.
