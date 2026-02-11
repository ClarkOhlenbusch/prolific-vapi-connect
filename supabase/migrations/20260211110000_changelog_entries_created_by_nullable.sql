-- Allow script/CLI imports without a user (e.g. import-changelog.js)
ALTER TABLE public.changelog_entries
ALTER COLUMN created_by DROP NOT NULL;
