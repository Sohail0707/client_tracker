// Outreach pipeline, in order.
export const STATUSES = ["fresh", "invited", "connected", "messaged", "replied", "call", "client"];

// LinkedIn activity tiers, set by eye from the client's Activity tab. ACTIVITY_REQUIREMENTS applies to every tier.
export const ACTIVITY_LEVELS = [
  { value: "high", label: "High", hint: "Posted or commented in the last 3 months, and active in 4+ of the last 6 months" },
  { value: "medium", label: "Medium", hint: "Reactions or reposts in 3+ of the last 6 months, latest within 6 weeks (no comments needed)" },
  { value: "low", label: "Low", hint: "Any activity in 3+ of the last 12 months, latest within 3 months" },
];

export const ACTIVITY_REQUIREMENTS = "Must still own/run the firm · photo + firm in headline · 200+ connections";

export const cap = (s) => s[0].toUpperCase() + s.slice(1);
