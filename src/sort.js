import { ACTIVITY_LEVELS, STATUSES } from "./constants.js";

const byNewest = (a, b) => b.created_at - a.created_at;
// Text sort with empty values last, so unfilled rows don't crowd the top.
const byText = (key) => (a, b) => {
  const x = (a[key] || "").trim().toLowerCase();
  const y = (b[key] || "").trim().toLowerCase();
  if (!x !== !y) return x ? -1 : 1;
  return x.localeCompare(y) || byNewest(a, b);
};
const activityRank = (c) => {
  const i = ACTIVITY_LEVELS.findIndex((l) => l.value === c.activity);
  return i === -1 ? ACTIVITY_LEVELS.length : i; // not set (or a legacy value) goes last
};

// Activity sorts high → low (not set last); status follows the pipeline, fresh → client; text sorts A–Z.
export const SORTS = [
  { value: "newest", label: "Newest", compare: byNewest },
  { value: "oldest", label: "Oldest", compare: (a, b) => a.created_at - b.created_at },
  { value: "activity", label: "Activity", compare: (a, b) => activityRank(a) - activityRank(b) || byNewest(a, b) },
  { value: "status", label: "Status", compare: (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || byNewest(a, b) },
  { value: "name", label: "Name", compare: byText("name") },
  { value: "industry", label: "Industry", compare: byText("industry") },
];

export const sortClients = (clients, sortKey) => {
  const sort = SORTS.find((s) => s.value === sortKey) || SORTS[0];
  return [...clients].sort(sort.compare);
};
