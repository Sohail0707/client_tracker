// One-off migration: moves the "NEXT (...)" / "LOG:" block at the top of each active client's remarks
// into the nextAction, nextDue and log fields. Archived clients are not touched.
//
//   node scripts/migrate-next-log.mjs                     dry run: prints before/after, writes nothing
//   node scripts/migrate-next-log.mjs --apply             backs up the changed rows to backups/, then writes
//   node scripts/migrate-next-log.mjs --restore <file>    undo: puts back remarks/nextAction/nextDue/log from a backup
//
// Talks to the production blob store. Uses NETLIFY_AUTH_TOKEN if set, otherwise the token of the logged-in
// Netlify CLI user. NETLIFY_SITE_ID overrides the site (defaults to client-tracker-online).
import { getStore } from "@netlify/blobs";
import fs from "node:fs";
import path from "node:path";

const SITE_ID = process.env.NETLIFY_SITE_ID || "fd736950-d58c-4f46-8c9e-f1996382cc08";
const YEAR = 2026;
const MIGRATION_DAY = new Date().toLocaleDateString("en-CA");
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const TASK_FIELDS = ["remarks", "nextAction", "nextDue", "log"];

function token() {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;
  const dir = process.env.APPDATA ? path.join(process.env.APPDATA, "netlify", "Config") : path.join(process.env.HOME, ".config", "netlify");
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
  return cfg.users[cfg.userId].auth.token;
}

// "Oct 16" → "2026-10-16"; null if it isn't a month + day.
function day(text) {
  const m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})\b/i.exec(text.trim());
  const month = m && MONTHS.indexOf(m[1].toLowerCase());
  if (!m || month < 0) return null;
  return `${YEAR}-${String(month + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

const LOG_PATTERNS = [
  [/^commented\b\s*/i, "commented"],
  [/^invited,?\s+with\s+(a\s+)?(custom\s+)?note\b[.,]?\s*/i, "invited_note"],
  [/^invited,?\s+(no|without)\s+(a\s+)?note\b[.,]?\s*/i, "invited"],
  [/^invited\b[.,]?\s*/i, "invited"],
  [/^accepted\b[.,]?\s*/i, "accepted"],
  [/^messaged\b[.,]?\s*/i, "messaged"],
  [/^replied\b[.,]?\s*/i, "replied"],
];

// "LOG: Oct 15 commented on his post; Oct 16 invited with note." → entries, or null if any part is unclear.
function parseLog(text) {
  const body = text.replace(/^LOG:\s*/i, "").trim();
  if (/^none( yet)?\.?$/i.test(body)) return [];
  const parts = body.split(/;\s*(?=[A-Za-z]{3}\s+\d)/);
  const entries = [];
  for (const part of parts) {
    const date = day(part);
    if (!date) return null;
    const rest = part.trim().replace(/^[a-z]+\.?\s+\d{1,2}\b[,:]?\s*/i, "");
    const match = LOG_PATTERNS.find(([re]) => re.test(rest));
    if (!match) return null;
    const note = rest.replace(match[0], "").replace(/\.$/, "").trim();
    entries.push({ date, type: match[1], note });
  }
  return entries;
}

// Returns the new task fields + remarks, or a reason the row is skipped.
function migrate(remarks) {
  const lines = (remarks || "").split(/\r?\n/);
  const sep = lines.findIndex((l) => l.trim() === "---");
  if (sep < 0) return { skip: "no --- separator" };
  const head = lines.slice(0, sep);
  if (!head.some((l) => /^NEXT\b/.test(l.trim()))) return { skip: "no NEXT line" };

  const out = { nextAction: "", nextDue: "", log: [] };
  const kept = [];
  for (const raw of head) {
    const line = raw.trim();
    const next = /^NEXT\s*(?:\(([^)]*)\))?\s*:\s*(.*)$/.exec(line);
    if (next) {
      const when = (next[1] || "").trim();
      out.nextDue = /^today$/i.test(when) ? MIGRATION_DAY : (when && day(when)) || "";
      if (when && !out.nextDue) return { skip: `unreadable NEXT date "${when}"` };
      out.nextAction = next[2].trim().replace(/\.$/, "");
    } else if (/^LOG:/i.test(line)) {
      const entries = parseLog(line);
      if (!entries) return { skip: `unreadable LOG line "${line}"` };
      out.log.push(...entries);
    } else if (line) {
      kept.push(raw);
    }
  }
  const notes = lines.slice(sep + 1).join("\n");
  out.remarks = kept.length ? `${kept.join("\n")}\n\n${notes}` : notes;
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const store = getStore({ name: "clients", siteID: SITE_ID, token: token() });

  if (args[0] === "--restore") {
    const backup = JSON.parse(fs.readFileSync(args[1], "utf8"));
    for (const old of backup.rows) {
      const current = await store.get(old.id, { type: "json" });
      if (!current) {
        console.log(`skip ${old.name}: no longer exists`);
        continue;
      }
      const next = { ...current };
      for (const f of TASK_FIELDS) {
        if (f in old) next[f] = old[f];
        else delete next[f];
      }
      await store.setJSON(old.id, next);
      console.log(`restored ${old.name}`);
    }
    return;
  }

  const apply = args.includes("--apply");
  const { blobs } = await store.list();
  const rows = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter((r) => r && !r.archived);
  const changes = [];

  for (const row of rows) {
    const result = migrate(row.remarks);
    console.log(`\n=== ${row.name || "(no name)"} [${row.id}]`);
    if (result.skip) {
      console.log(`  SKIP: ${result.skip}`);
      continue;
    }
    if (row.nextAction || row.nextDue || row.log?.length) {
      console.log("  SKIP: already has task fields");
      continue;
    }
    console.log("  BEFORE remarks:\n" + indent(row.remarks));
    console.log("  AFTER  remarks:\n" + indent(result.remarks));
    console.log(`  nextAction: ${JSON.stringify(result.nextAction)}`);
    console.log(`  nextDue:    ${JSON.stringify(result.nextDue)}`);
    console.log(`  log:        ${JSON.stringify(result.log)}`);
    changes.push({ row, result });
  }

  console.log(`\n${changes.length} of ${rows.length} active rows to migrate.`);
  if (!apply) {
    console.log("Dry run: nothing written. Re-run with --apply to write.");
    return;
  }

  fs.mkdirSync("backups", { recursive: true });
  const file = path.join("backups", `clients-before-next-log-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify({ site: SITE_ID, at: new Date().toISOString(), rows: changes.map((c) => c.row) }, null, 2));
  console.log(`Backup written: ${file}`);

  for (const { row, result } of changes) {
    // Re-read so a save made since the dry-run listing isn't overwritten.
    const current = await store.get(row.id, { type: "json" });
    if (current.remarks !== row.remarks) {
      console.log(`skip ${row.name}: remarks changed since listing`);
      continue;
    }
    await store.setJSON(row.id, { ...current, ...result });
    console.log(`migrated ${row.name}`);
  }
}

const indent = (s) => (s || "").split("\n").map((l) => "    | " + l).join("\n");

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
