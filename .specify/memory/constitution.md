# prolific-vapi-connect Constitution

Repo-local constraints for coding agents and Ralph Wiggum loops.

## Version
1.0.0

## Context Detection

This repo is worked on in two modes:

1. Interactive mode (chat): be cautious, ask for permission for big changes, and follow `AGENTS.md`.
2. Ralph loop mode (stdin-driven): be autonomous inside the loop while still respecting the constraints below.

## Safety / Autonomy

- YOLO Mode: DISABLED
- Git push: manual only (do not auto-push from loops).

## Notifications (Local Dev)

If the user has the browser notify tab open (see `npm run notify:server`), use:

- `./scripts/notify-browser.sh done`
- `./scripts/notify-browser.sh question`

## Project Rules (Must Follow)

- Follow `AGENTS.md` verification + PASS/FAIL gating for repo changes.
- Supabase schema/migrations and Edge Functions are managed/deployed via Lovable for the hosted environment.
