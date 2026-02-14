---
name: push
description: Commits and pushes using this repo's scope prefixes (Participant, Researcher, Both, None). Makes one commit per logical change; optionally writes changelog JSON. When this skill is invoked, run git push at the end without asking—the user has authorized the push.
---

# Push (commit and push)

When helping with **commit** or **push** in this repo:

1. **Multiple commits** — Do **not** bundle all changes into one commit. Review staged and unstaged changes and group them into **logical commits** (one per feature, fix, or distinct change). Create one commit per group with an appropriate message and prefix. When done with all commits, **run `git push` once** — do **not** ask for permission; the user has invoked this skill to push.
2. **Commit message format** — Start every message with one of: **Participant**, **Researcher**, **Both**, or **None**, then a colon and a space, then the message.
3. **Choose the right prefix** using the guidance below.
4. **Changelog JSON (on push and on commit batches)** — On **every push** and also when the user asks to **commit without pushing**, after making the code commits, write a changelog JSON file and commit it. All batches use the **same version number** until you decide it’s time for a new version (see below).
   - **Check the latest version first:** Prefer the **release database** as source of truth. Run `node scripts/get-latest-changelog-version.mjs` (from repo root; requires `.env` or `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`). The script reads the max version from `changelog_entries` and prints it to stdout — use that as the current version. If the script fails (missing env, no DB access, or script not found), **fall back** to inferring from the latest `docs/changelog-import-*.json` filename (e.g. `changelog-import-2026-02-11-1.1.5-4.json` → version `1.1.5`). For the next batch filename use the same version and the next batch number (e.g. `changelog-import-YYYY-MM-DD-1.8-1.json`, then `-2.json`, …).
   - **Current version:** The version from the script or, if unavailable, from the latest import filename. Use this same version for every push until you bump.
   - **Each batch (push or commit-only):** Build one changelog entry for the commits in this batch:
     - Required: `version` (current version), `release_date` (today, YYYY-MM-DD), `description` (short summary of this batch), `changes` (array of one object per commit: `type` = added|changed|fixed|removed, `description` = first line of commit message without prefix, `scope` = participant|researcher|both from the commit prefix, `commit_hash` = short hash).
     - Optional: `active_batch_label`.
     - Status fields:
       - `release_status`: one of `committed` | `pushed` | `released`.
         - If the user asked for **commit only** (no push): write `release_status: "committed"`.
         - If the user asked to **push**: write `release_status: "pushed"`. If the app setting “Auto mark release on push” is enabled, the Changelog page may auto-promote it to `released` on import.
       - Per-change: include `pushed_at` (ISO string) for ordering (use “now”).
     - Use a **unique filename** so the app imports it: `docs/changelog-import-YYYY-MM-DD-VERSION-N.json` (e.g. `changelog-import-2026-02-11-1.1.5-1.json`, `-2.json`, …).
     - Commit the new file.
     - If this is a **push** workflow: run `git push` after the changelog JSON commit.
   - **When to ask about a new version:** When you think it’s a good time to cut a new version (e.g. after several pushes, end of day, or a clear milestone), **ask the user:** e.g. “Ready to make this a new version? (next pushes would be version 1.1.6)” — only bump the version for future pushes if they say yes. Until then, keep using the current version for every push.
   - **Import:** The app auto-imports when a researcher opens the Changelog page (by filename). No GitHub API or local script.

## When to use each prefix

| Prefix       | Use for |
|-------------|---------|
| **Participant** | What participants see or do: consent, no-consent, questionnaires (PETS, TIAS, Godspeed, TIPI, demographics), feedback UI, practice flow, mic permission/UX, progress bar, alternating mode UI. |
| **Researcher**  | Researcher-only: changelog, batches, response details, time analysis, table/CSV/filters, prompts lab, formality/stats tools, researcher auth, TIPI/batch display, Vapi debug. |
| **Both**        | Clearly touches both participant and researcher surfaces; use only when it really applies. |
| **None**        | No user-facing impact: tooling, CI, docs, deps, refactors without behavior change. |

**Guidance:** Prefer the most specific scope (Participant or Researcher); use Both only when the change really affects both.

## Changelog scope from prefix

Map commit prefix to changelog `scope`: Participant → `participant`, Researcher → `researcher`, Both → `both`, None → `researcher` (or `both` if it affects both).

## Examples

- `Participant: change PETS survey title`
- `Researcher: add batch filter to changelog`
- `Both: rename token_used to is_completed`
- `None: bump deps / update README`
