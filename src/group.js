import { today } from "./tasks.js";

// "added" groups by the day a client was created, "edited" by the day it was last changed.
export const GROUPS = [
  { value: "none", label: "None" },
  { value: "added", label: "Date added" },
  { value: "edited", label: "Last edited" },
];

const dayOf = (ms) => new Date(ms).toLocaleDateString("en-CA");

// `stamps` holds each client's last-edited time as of the last sort, so a row doesn't jump
// to the Today group while you're typing in it. Clients edited before this existed fall back to created_at.
export const groupDay = (c, key, stamps) =>
  dayOf(key === "edited" ? stamps.get(c.id) || c.updated_at || c.created_at : c.created_at);

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const withYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export function dayLabel(day) {
  const now = today();
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (day === now) return "Today";
  if (day === new Date(Date.now() - 864e5).toLocaleDateString("en-CA")) return "Yesterday";
  return day.slice(0, 4) === now.slice(0, 4) ? weekday.format(date) : withYear.format(date);
}

// Splits already-ordered rows into day groups, newest day first; rows keep their order within a group.
export function groupRows(rows, key, stamps) {
  const groups = new Map();
  for (const c of rows) {
    const day = groupDay(c, key, stamps);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(c);
  }
  return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([day, rows]) => ({ day, rows }));
}
