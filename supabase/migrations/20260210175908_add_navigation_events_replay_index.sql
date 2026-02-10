-- Optimize session replay queries on the navigation_events table.
-- Without this index, queries filtering by prolific_id + event_type (especially
-- for 'session_replay_chunk' rows with large metadata payloads) can exceed the
-- Supabase statement timeout for participants with many events.

create index concurrently if not exists navigation_events_replay_idx
  on navigation_events (prolific_id, event_type, call_id, created_at);
