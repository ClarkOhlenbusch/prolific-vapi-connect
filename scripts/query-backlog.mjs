#!/usr/bin/env node
/**
 * Dumps the researcher backlog (errors + features) with comments and linked responses.
 * Use this to load current backlog state into a Claude conversation.
 *
 * Usage:  node scripts/query-backlog.mjs
 *         node scripts/query-backlog.mjs --json        (raw JSON output)
 *         node scripts/query-backlog.mjs --open-only   (skip resolved/shipped)
 *
 * Requires .env with:
 *   VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
 *   SUPABASE_SERVICE_ROLE_KEY (recommended — bypasses RLS; add to .env if missing)
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// ── env loading ──────────────────────────────────────────────────────────────
const loadDotEnv = (filename) => {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
};
loadDotEnv(".env.local");
loadDotEnv(".env");

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("ERROR: Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}

const key = SERVICE_KEY || ANON_KEY;
const usingServiceKey = Boolean(SERVICE_KEY);

const supabase = createClient(SUPABASE_URL, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── flags ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const openOnly = args.includes("--open-only");

// ── queries ──────────────────────────────────────────────────────────────────
const [itemsRes, commentsRes, linksRes] = await Promise.all([
  supabase
    .from("researcher_backlog_items")
    .select("*")
    .order("display_order", { ascending: true })
    .order("updated_at", { ascending: false }),
  supabase
    .from("backlog_item_comments")
    .select("*")
    .order("created_at", { ascending: true }),
  supabase
    .from("backlog_item_responses")
    .select("*")
    .order("created_at", { ascending: true }),
]);

if (itemsRes.error) {
  console.error("ERROR fetching backlog items:", itemsRes.error.message);
  if (!usingServiceKey) {
    console.error(
      "\nHint: RLS may be blocking the anon key. Add SUPABASE_SERVICE_ROLE_KEY to .env\n" +
      "      (find it in Supabase Dashboard → Project Settings → API → service_role key)"
    );
  }
  process.exit(1);
}

const items = itemsRes.data ?? [];
const comments = commentsRes.data ?? [];
const links = linksRes.data ?? [];

// Fetch prolific IDs for all linked response_ids
const allResponseIds = [
  ...new Set([
    ...items.map((i) => i.linked_response_id).filter(Boolean),
    ...links.map((l) => l.response_id),
  ]),
];

let prolificById = {};
if (allResponseIds.length > 0) {
  const { data: responses } = await supabase
    .from("experiment_responses")
    .select("id, prolific_id")
    .in("id", allResponseIds);
  if (responses) {
    for (const r of responses) prolificById[r.id] = r.prolific_id;
  }
}

// ── JSON mode ────────────────────────────────────────────────────────────────
if (jsonMode) {
  console.log(JSON.stringify({ items, comments, links, prolificById }, null, 2));
  process.exit(0);
}

// ── helpers ──────────────────────────────────────────────────────────────────
const commentsByItem = {};
for (const c of comments) {
  if (!commentsByItem[c.backlog_item_id]) commentsByItem[c.backlog_item_id] = [];
  commentsByItem[c.backlog_item_id].push(c);
}

const linksByItem = {};
for (const l of links) {
  if (!linksByItem[l.backlog_item_id]) linksByItem[l.backlog_item_id] = [];
  linksByItem[l.backlog_item_id].push(l);
}

const fmt = (iso) => iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—";
const pad = (s, n = 72) => "─".repeat(n);

const TERMINAL_DONE = ["resolved", "shipped"];

const printItem = (item) => {
  const itemLinks = linksByItem[item.id] ?? [];
  const itemComments = commentsByItem[item.id] ?? [];

  const primaryLink = item.linked_response_id
    ? `${prolificById[item.linked_response_id] ?? item.linked_response_id.slice(0, 8) + "…"}`
    : null;
  const extraLinks = itemLinks.map(
    (l) => prolificById[l.response_id] ?? l.response_id.slice(0, 8) + "…"
  );
  const allLinks = [...(primaryLink ? [primaryLink + " (primary)"] : []), ...extraLinks];

  console.log(`  [${item.priority.toUpperCase()}] ${item.title}`);
  console.log(`  Status: ${item.status}  |  Updated: ${fmt(item.updated_at)}`);
  if (item.details) {
    const preview = item.details.length > 200
      ? item.details.slice(0, 200).trimEnd() + "…"
      : item.details;
    console.log(`  Details: ${preview.replace(/\n/g, "\n           ")}`);
  }
  if (allLinks.length > 0) {
    console.log(`  Linked responses: ${allLinks.join(", ")}`);
  }
  if (itemComments.length > 0) {
    console.log(`  Comments (${itemComments.length}):`);
    for (const c of itemComments) {
      console.log(`    [${fmt(c.created_at)}] ${c.text}`);
    }
  }
  console.log(`  ID: ${item.id}`);
};

// ── print ────────────────────────────────────────────────────────────────────
const errors = items.filter((i) => i.item_type === "error");
const features = items.filter((i) => i.item_type === "feature");

const openErrors = errors.filter((i) => !TERMINAL_DONE.includes(i.status));
const doneErrors = errors.filter((i) => TERMINAL_DONE.includes(i.status));
const openFeatures = features.filter((i) => !TERMINAL_DONE.includes(i.status));
const doneFeatures = features.filter((i) => TERMINAL_DONE.includes(i.status));

const now = new Date().toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
console.log(`\n${"═".repeat(72)}`);
console.log(` RESEARCHER BACKLOG  —  ${now}  (${usingServiceKey ? "service key" : "anon key"})`);
console.log(`${"═".repeat(72)}\n`);

// Errors
console.log(`ERRORS  (${openErrors.length} open${doneErrors.length ? `, ${doneErrors.length} resolved` : ""})`);
console.log(pad());
if (openErrors.length === 0) {
  console.log("  (none open)");
} else {
  for (const item of openErrors) {
    printItem(item);
    console.log();
  }
}

if (!openOnly && doneErrors.length > 0) {
  console.log(`  — Resolved (${doneErrors.length}) —`);
  for (const item of doneErrors) {
    console.log(`  [RESOLVED] ${item.title}`);
  }
  console.log();
}

// Features
console.log(`\nFEATURES  (${openFeatures.length} open${doneFeatures.length ? `, ${doneFeatures.length} shipped` : ""})`);
console.log(pad());
if (openFeatures.length === 0) {
  console.log("  (none open)");
} else {
  for (const item of openFeatures) {
    printItem(item);
    console.log();
  }
}

if (!openOnly && doneFeatures.length > 0) {
  console.log(`  — Shipped (${doneFeatures.length}) —`);
  for (const item of doneFeatures) {
    console.log(`  [SHIPPED] ${item.title}`);
  }
  console.log();
}

console.log(`${"═".repeat(72)}`);
console.log(` Total: ${items.length} items  |  ${comments.length} comments  |  ${links.length} extra links`);
console.log(`${"═".repeat(72)}\n`);
