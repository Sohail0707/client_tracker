// Dates are local calendar days as "YYYY-MM-DD", so they compare as plain strings.
export const today = () => new Date().toLocaleDateString("en-CA");

const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
export const shortDate = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return fmt.format(new Date(y, m - 1, d));
};

export const newTask = () => ({ id: crypto.randomUUID(), text: "", due: "" });

// A client's tasks. Clients saved before tasks existed had a single nextAction/nextDue pair.
export function tasksOf(c) {
  if (Array.isArray(c.tasks)) return c.tasks;
  return c.nextAction || c.nextDue ? [{ id: "legacy", text: c.nextAction || "", due: c.nextDue || "" }] : [];
}

// Earliest due date among the client's tasks, or "" if none has one.
export const firstDue = (c) => tasksOf(c).map((t) => t.due).filter(Boolean).sort()[0] || "";

export const tasksText = (c) => tasksOf(c).map((t) => (t.due ? `${t.due} ${t.text}` : t.text)).join("; ");

// Has a task due today or earlier, and not archived.
export const isDue = (c) => {
  const due = firstDue(c);
  return !c.archived && !!due && due <= today();
};

// Clients set to "invited with note" this calendar month, archived included. Older clients
// recorded these invites in the activity log instead.
export function noteInvitesThisMonth(clients) {
  const month = today().slice(0, 7);
  return clients.filter(
    (c) => c.noteInvitedAt?.startsWith(month) || (c.log || []).some((e) => e.type === "invited_note" && e.date.startsWith(month))
  ).length;
}
