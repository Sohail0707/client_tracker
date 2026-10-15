import { useEffect, useRef, useState } from "react";
import { LOG_TYPES, logLabel, logNewestFirst, shortDate, today } from "./tasks.js";

// Closes a popover on an outside click or Escape.
function useDismiss(open, setOpen, ref) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
}

// Due-date pill plus the next action. The pill opens the browser's date picker,
// whose own Clear button removes the date.
export function NextAction({ action, due, onAction, onDue }) {
  const picker = useRef(null);
  const now = today();
  const state = !due ? "none" : due < now ? "overdue" : due === now ? "today" : "later";
  const label = !due ? "+ date" : state === "today" ? "Today" : shortDate(due);
  const open = () => {
    try {
      picker.current.showPicker();
    } catch {
      picker.current.focus();
    }
  };
  return (
    <div className={`next ${state}`}>
      <button className="next-due" title={due ? `Due ${due}${state === "overdue" ? " (overdue)" : ""}` : "Set a due date"} onClick={open}>
        {label}
      </button>
      <input ref={picker} className="next-picker" type="date" tabIndex={-1} value={due} onChange={(e) => onDue(e.target.value)} />
      <input className="next-action" value={action} title={action} placeholder="Next action…" onChange={(e) => onAction(e.target.value)} />
    </div>
  );
}

const SHOWN = 3;

// Quick-log menu and the dated activity log, newest first.
export function ActivityLog({ log = [], onLog, onRemove }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);
  const entries = logNewestFirst(log);
  const shown = all ? entries : entries.slice(0, SHOWN);

  return (
    <div className="log" ref={ref}>
      <button className="log-add" onClick={() => setOpen((o) => !o)} title="Log an action">+ Log</button>
      {open && (
        <div className="activity-menu log-menu" role="menu">
          {LOG_TYPES.map((t) => (
            <button key={t.value} role="menuitem" className="activity-option" onClick={() => (onLog(t.value), setOpen(false))}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {shown.length > 0 && (
        <ul className="log-list">
          {shown.map((e) => (
            <li key={e.i} title={e.note || undefined}>
              <span className="log-date">{shortDate(e.date)}</span> {logLabel(e.type)}
              {e.note && <span className="log-note"> · {e.note}</span>}
              <button className="log-del" title="Remove entry" onClick={() => onRemove(e.i)}>✕</button>
            </li>
          ))}
          {entries.length > SHOWN && (
            <li>
              <button className="log-more" onClick={() => setAll((a) => !a)}>{all ? "Show less" : `+${entries.length - SHOWN} more`}</button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
