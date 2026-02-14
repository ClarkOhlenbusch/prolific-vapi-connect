# Ralph Wiggum (Codex) Setup

This repo includes the Ralph Wiggum loop scripts and SpecKit-style templates.

## Quickstart

1. Create a spec using Cursor command: `/speckit.specify <feature description>`
2. Run the Codex loop:

```bash
./scripts/ralph-loop-codex.sh plan
./scripts/ralph-loop-codex.sh
```

## Optional: Browser Audio Notifications

1. Start the notify server:

```bash
NOTIFY_PORT=8085 npm run notify:server
```

2. Open `http://127.0.0.1:8085/` in Chrome and click "Enable sound" once.
3. Trigger:

```bash
./scripts/notify-browser.sh done
./scripts/notify-browser.sh question
```

## Important Defaults (This Repo)

- YOLO is disabled via `.specify/memory/constitution.md`.
- `git push` is manual (the loop will not auto-push).
