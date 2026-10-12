import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PROFILE_TYPES, STATUSES, cap } from "./constants.js";
import ActivityLevel from "./ActivityLevel.jsx";
import Remarks from "./Remarks.jsx";

const toHref = (v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

const icons = {
  linkedin: (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M0 1.15C0 .51.53 0 1.18 0h13.64C15.47 0 16 .51 16 1.15v13.7c0 .64-.53 1.15-1.18 1.15H1.18C.53 16 0 15.49 0 14.85V1.15zm4.94 12.25V6.17h-2.4v7.23h2.4zM3.74 5.18c.84 0 1.36-.55 1.36-1.25-.02-.7-.52-1.25-1.34-1.25-.82 0-1.36.54-1.36 1.25 0 .7.52 1.25 1.33 1.25h.01zm4.91 8.22V9.36c0-.22.02-.43.08-.59.17-.43.57-.88 1.23-.88.87 0 1.22.66 1.22 1.63v3.88h2.4V9.25c0-2.22-1.18-3.25-2.76-3.25-1.28 0-1.85.7-2.17 1.19v.03h-.01l.01-.03V6.17h-2.4c.03.68 0 7.23 0 7.23h2.4z" />
    </svg>
  ),
  email: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
      <path d="M2 4.5l6 4.5 6-4.5" />
    </svg>
  ),
  website: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M1.5 8h13M8 1.5c1.8 1.9 2.6 4 2.6 6.5S9.8 12.6 8 14.5M8 1.5C6.2 3.4 5.4 5.5 5.4 8s.8 4.6 2.6 6.5" />
    </svg>
  ),
};

function Field({ value, onChange, type = "text", placeholder = "—", className, autoFocus }) {
  return (
    <input
      type={type}
      value={value}
      title={value}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// Shown while a link field isn't being edited, so long URLs fit their column.
const shortUrl = (v) => v.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");

function ContactField({ icon, value, onChange, type, placeholder, link }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="contact-field">
      {icons[icon]}
      <input
        type={type}
        value={link && !editing ? shortUrl(value) : value}
        title={value}
        placeholder={placeholder}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={(e) => onChange(e.target.value)}
      />
      {link && (
        <a href={value ? toHref(value) : undefined} target="_blank" rel="noopener noreferrer" className={value ? "on" : ""} title="Open link">↗</a>
      )}
    </div>
  );
}

const MESSAGE_MAX_HEIGHT = 180;

// Grows with its content up to MESSAGE_MAX_HEIGHT, then scrolls.
function MessageField({ value, onChange }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const t = ref.current;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, MESSAGE_MAX_HEIGHT)}px`;
    t.style.overflowY = t.scrollHeight > MESSAGE_MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} placeholder="Outreach draft…" onChange={(e) => onChange(e.target.value)} />;
}

function CopyButton({ text, onError }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      onError(e, "Copy failed: ");
    }
  }

  return (
    <button className={`copy${copied ? " copied" : ""}`} onClick={copy} title="Copy draft message">
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

export default function ClientRow({ client: c, autoFocus, selected, onSelect, onChange, onAddImages, onRemoveImage, onOpenImage, onError, onDelete }) {
  const set = (field) => (value) => onChange(c.id, field, value);
  return (
    <div className={`row${selected ? " selected" : ""}`} onMouseDown={() => onSelect(c.id)} onFocus={() => onSelect(c.id)}>
      <div className="cell client">
        <Field className="name" value={c.name} placeholder="Name" onChange={set("name")} autoFocus={autoFocus} />
        <Field className="industry" value={c.industry} placeholder="Industry" onChange={set("industry")} />
      </div>
      <div className="cell contact">
        <ContactField icon="linkedin" value={c.profile} placeholder="LinkedIn profile" onChange={set("profile")} link />
        <ContactField icon="email" type="email" value={c.email} placeholder="Email" onChange={set("email")} />
        <ContactField icon="website" value={c.website} placeholder="Website" onChange={set("website")} link />
      </div>
      <div className="cell status-cell">
        <select className="status" data-s={c.status} value={c.status} onChange={(e) => set("status")(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{cap(s)}</option>
          ))}
        </select>
        <ActivityLevel value={c.activity ?? ""} onChange={set("activity")} />
        <select className="profile-type" data-t={c.type || "unset"} value={c.type ?? ""} onChange={(e) => set("type")(e.target.value)} title="Profile type">
          <option value="">Type: not set</option>
          {PROFILE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="cell message" data-label="Draft message">
        <MessageField value={c.message ?? ""} onChange={set("message")} />
        {c.message?.trim() && <CopyButton text={c.message} onError={onError} />}
      </div>
      <div className="cell remarks" data-label="Remarks">
        <Remarks
          text={c.remarks}
          images={c.images}
          onText={set("remarks")}
          onAddImages={(ids) => onAddImages(c.id, ids)}
          onRemoveImage={(imageId) => onRemoveImage(c.id, imageId)}
          onOpen={onOpenImage}
          onError={onError}
        />
      </div>
      <button className="del" title="Delete client" onClick={() => onDelete(c.id)}>✕</button>
    </div>
  );
}
