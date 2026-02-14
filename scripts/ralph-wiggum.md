# Ralph Wiggum (Codex) Setup

This repo includes the Ralph Wiggum loop scripts and SpecKit-style templates.

## Quickstart

1. Create a spec using Cursor command: `/speckit.specify <feature description>`
2. Run the Codex loop:

```bash
./scripts/ralph-loop-codex.sh plan
./scripts/ralph-loop-codex.sh
```

## Important Defaults (This Repo)

- YOLO is disabled via `.specify/memory/constitution.md`.
- `git push` is manual (the loop will not auto-push).

