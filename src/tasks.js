import { STATUSES } from "./constants.js";

// Dates are local calendar days as "YYYY-MM-DD", so they compare as plain strings.
export const today = () => new Date().toLocaleDateString("en-CA");

export function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d + n).toLocaleDateString("en-CA");
}

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
export const shortDate = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return fmt.format(new Date(y, m - 1, d));
};

// Quick-log actions. `status` is where the pipeline moves to (never backwards);
// `next` is the suggested follow-up: [action, due in N days].
export const LOG_TYPES = [
  { value: "commented", label: "Commented", next: ["Send connection request", 1] },
  { value: "invited", label: "Invited (no note)", short: "Invited", status: "invited", next: ["Check if accepted", 5] },
  { value: "invited_note", label: "Invited (with note)", short: "Invited + note", status: "invited", next: ["Check if accepted", 5] },
  { value: "accepted", label: "Accepted", status: "connected", next: ["Send first message", 0] },
  { value: "messaged", label: "Messaged", status: "messaged", next: ["Follow up if no reply", 4] },
  { value: "replied", label: "Replied", status: "replied" },
];

export const logLabel = (type) => {
  const t = LOG_TYPES.find((l) => l.value === type);
  return t ? t.short || t.label : type;
};

// The fields to save when an action is logged on a client.
export function logAction(client, type) {
  const t = LOG_TYPES.find((l) => l.value === type);
  const day = today();
  const patch = { log: [...(client.log || []), { date: day, type, note: "" }] };
  if (t.status && STATUSES.indexOf(t.status) > STATUSES.indexOf(client.status)) patch.status = t.status;
  if (t.next) {
    patch.nextAction = t.next[0];
    patch.nextDue = addDays(day, t.next[1]);
  }
  return patch;
}

// Newest first; entries on the same day keep the order they were logged in, latest on top.
export const logNewestFirst = (log = []) =>
  log.map((e, i) => ({ ...e, i })).sort((a, b) => b.date.localeCompare(a.date) || b.i - a.i);

export const logText = (log = []) =>
  logNewestFirst(log).map((e) => `${e.date} ${logLabel(e.type)}${e.note ? `: ${e.note}` : ""}`).join("; ");

// Due today or earlier, and not archived.
export const isDue = (c) => !c.archived && !!c.nextDue && c.nextDue <= today();
