# Changelog: active batch & participant/researcher scope

## Goal
- For each **version**: record which batch was active when that version was live (researcher sets it manually; no hardcoded link).
- For each **change line**: note whether it affected **participant experience**, **researcher dashboard**, or **both** (researcher can change this).

## 1. Active batch (per version)

- **Storage**: Add nullable `active_batch_label` (text) to `changelog_entries`. Store the batch name/label as text (no FK), so it stays correct if batches are renamed or removed.
- **UI**:
  - **Add entry**: Optional field "Active batch (when this version was live)" — text input. Optional dropdown or autocomplete from existing batch names (e.g. from `experiment_batches.name` or distinct `experiment_responses.batch_label`) to help pick; researcher can still type freely.
  - **Edit entry**: Same field editable when editing the version.
  - **Display**: Under version/date/description, show e.g. "Active batch: Main Collection" when set.

## 2. Scope per change (participant / researcher / both)

- **Storage**: Add `scope` to `changelog_changes`: one of `participant` | `researcher` | `both`, default `both`.
- **UI**:
  - **Add entry (each change row)**: Add a select "Affects: Participant experience | Researcher dashboard | Both" (default "Both").
  - **Edit change**: Allow changing scope when editing a change line.
  - **Display**: Show a small badge per change, e.g. "Participant", "Researcher", or "Both".

## 3. Import from JSON

- Extend draft format: optional `active_batch_label` on the entry; each change can have optional `scope` (`participant` | `researcher` | `both`).
- When importing, map these into the new columns.

## 4. Changelog command (draft file)

- When generating `docs/researcher-changelog-latest.json`, include optional `active_batch_label` and per-change `scope` (default `both`; infer from commit message if possible, e.g. "dashboard" → `researcher`).
