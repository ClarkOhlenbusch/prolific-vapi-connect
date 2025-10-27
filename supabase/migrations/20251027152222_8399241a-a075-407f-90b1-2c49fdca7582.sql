-- Fix search_path for security
ALTER FUNCTION set_session_expiration() SET search_path = public;
ALTER FUNCTION prevent_delete() SET search_path = public;