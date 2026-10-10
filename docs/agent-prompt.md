# Prompt for your coding agent

Copy everything inside the box below. Paste it into Cursor, Claude Code, GitHub Copilot, Gemini CLI, Windsurf, Codex, or another coding agent. The agent will ask you a few questions and do the rest.

```text
Install Mumble AI for me: https://github.com/maaz-ahmad-63/mumble_flow

1. If this folder is not the project yet, clone it and open the folder.
2. Read AGENTS.md and follow it. If you support skills, use the setup skill in .claude/skills/setup/SKILL.md.
3. Ask me only what you cannot find out yourself: where it should run (this computer, my other devices, or a cloud server), which AI provider and key I want to use, and which cloud provider if any.
4. Never invent, print, or commit my API keys. Never commit .env or data/*.json.
5. Do not put it on the internet without a password in front.
6. Ask me before you create anything that costs money.
7. When done, tell me the address to open, how to start and stop it, and what you checked.
```

Agents that read `AGENTS.md` on their own (Cursor, Claude Code, Copilot, Gemini CLI, Windsurf, Codex) need only the first line of the prompt. The rest is there for agents that do not.

If you would rather do it yourself, follow [setup.md](setup.md) for your own computer or [deploy/README.md](deploy/README.md) for a server.
