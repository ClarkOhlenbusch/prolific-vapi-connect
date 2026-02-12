#!/usr/bin/env node
/**
 * Fetches the latest changelog version from the database.
 * Tries (1) RPC get_latest_changelog_version() with anon key, then
 * (2) direct SELECT with service_role key (bypasses RLS).
 * Prints the version string to stdout for the push skill.
 *
 * Requires .env or .env.local with:
 *   - VITE_SUPABASE_URL (or SUPABASE_URL)
 *   - VITE_SUPABASE_PUBLISHABLE_KEY (or SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY)
 * For direct table read when RPC is missing: SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
 *
 * Run with DEBUG=1 for diagnostic output to stderr.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";

const loadDotEnv = (filename) => {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
};

loadDotEnv(".env.local");
loadDotEnv(".env");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function debug(msg) {
  if (DEBUG) {
    process.stderr.write(`[get-latest-changelog-version] ${msg}\n`);
  }
}

function maskUrl(url) {
  if (!url || url.length < 20) return "(not set)";
  try {
    const u = new URL(url);
    return `${u.origin.replace(/^https?:\/\//, "")} (project ref: ${u.hostname.split(".")[0] || "?"})`;
  } catch {
    return "(invalid url)";
  }
}

/** Compare version strings segment-by-segment; returns -1 | 0 | 1 */
function compareVersions(va, vb) {
  const parts = (v) => (v || "").split(".").map((p) => parseInt(p, 10) || 0);
  const a = parts(va);
  const b = parts(vb);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const na = a[i] ?? 0;
    const nb = b[i] ?? 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.error(
      "Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY/VITE_SUPABASE_PUBLISHABLE_KEY. Set in .env or .env.local."
    );
    process.exit(1);
  }

  debug(`Supabase URL: ${maskUrl(SUPABASE_URL)}`);
  debug(`Using anon key: ${SUPABASE_PUBLISHABLE_KEY ? "yes" : "no"}`);
  debug(`Using service_role key: ${SUPABASE_SERVICE_ROLE_KEY ? "yes" : "no"}`);

  // 1) Try RPC first (works with anon key after migration 20260211210000_rpc_get_latest_changelog_version)
  const anonClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const { data: rpcVersion, error: rpcError } = await anonClient.rpc(
    "get_latest_changelog_version"
  );

  if (!rpcError && rpcVersion != null && String(rpcVersion).trim() !== "") {
    debug("Got version via RPC get_latest_changelog_version()");
    process.stdout.write(String(rpcVersion).trim());
    return;
  }

  if (rpcError) {
    debug(`RPC error: ${rpcError.message} (code: ${rpcError.code})`);
    // If function doesn't exist yet, try service_role path
    if (rpcError.code === "42883" || rpcError.message?.includes("does not exist")) {
      debug("RPC not found — run migration 20260211210000_rpc_get_latest_changelog_version.sql on your Supabase project (e.g. Lovable).");
    }
  } else if (rpcVersion == null || String(rpcVersion).trim() === "") {
    debug("RPC returned empty — no changelog_entries in DB or RPC returned null.");
  }

  // 2) Fallback: direct table read with service_role (bypasses RLS)
  if (SUPABASE_SERVICE_ROLE_KEY) {
    debug("Trying direct SELECT with service_role key (bypasses RLS).");
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data: rows, error: tableError } = await serviceClient
      .from("changelog_entries")
      .select("version");

    if (!tableError && rows?.length > 0) {
      const versions = rows.map((r) => r.version).filter(Boolean);
      const latest = versions.reduce((a, b) =>
        compareVersions(a, b) >= 0 ? a : b
      );
      debug(`Got version via table SELECT (${rows.length} rows).`);
      process.stdout.write(latest);
      return;
    }

    if (tableError) {
      debug(`Table SELECT error: ${tableError.message}`);
    } else {
      debug("Table SELECT returned 0 rows.");
    }
  } else {
    debug("No SUPABASE_SERVICE_ROLE_KEY — cannot fall back to direct table read.");
  }

  // Failed
  console.error("Could not get latest changelog version.");
  console.error("");
  console.error("Reason: changelog_entries is protected by RLS (researchers only).");
  console.error("  • Deploy the RPC: run migration 20260211210000_rpc_get_latest_changelog_version.sql");
  console.error("    on your Supabase project (e.g. in Lovable: run this SQL in the SQL editor).");
  console.error("  • Or set SUPABASE_SERVICE_ROLE_KEY in .env.local to bypass RLS for this script.");
  console.error("");
  console.error("Run with DEBUG=1 for details: DEBUG=1 node scripts/get-latest-changelog-version.mjs");
  process.exit(1);
}

main();
