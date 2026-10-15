import { useEffect, useLayoutEffect, useRef } from "react";
import { newTask, shortDate, today } from "./tasks.js";

// Wraps and grows with its content, so the whole task is always visible.
function TaskText({ value, onChange, autoFocus }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const t = ref.current;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    if (autoFocus) ref.current.focus();
  }, []);
  return <textarea ref={ref} rows={1} className="task-text" value={value} placeholder="Task…" onChange={(e) => onChange(e.target.value)} />;
}

// Due-date pill, the task, and a done button that removes it. The pill opens the browser's
// date picker, whose own Clear button removes the date.
function Task({ task, autoFocus, onText, onDue, onDone }) {
  const picker = useRef(null);
  const { due } = task;
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
    <div className={`task ${state}`}>
      <button className="task-due" title={due ? `Due ${due}${state === "overdue" ? " (overdue)" : ""}` : "Set a due date"} onClick={open}>
        {label}
      </button>
      <input ref={picker} className="task-picker" type="date" tabIndex={-1} value={due} onChange={(e) => onDue(e.target.value)} />
      <TaskText value={task.text} onChange={onText} autoFocus={autoFocus} />
      <button className="task-done" title="Done (removes the task)" onClick={onDone}>✓</button>
    </div>
  );
}

// The client's task list. `onChange(tasks, immediate)` saves the whole list; typing is debounced.
export default function Tasks({ tasks, onChange }) {
  const added = useRef(null);
  const edit = (id, fields, immediate) => onChange(tasks.map((t) => (t.id === id ? { ...t, ...fields } : t)), immediate);
  const add = () => {
    const t = newTask();
    added.current = t.id;
    onChange([...tasks, t], true);
  };
  return (
    <div className="tasks">
      {tasks.map((t) => (
        <Task
          key={t.id}
          task={t}
          autoFocus={t.id === added.current}
          onText={(text) => edit(t.id, { text })}
          onDue={(due) => edit(t.id, { due }, true)}
          onDone={() => onChange(tasks.filter((x) => x.id !== t.id), true)}
        />
      ))}
      <button className="task-add" onClick={add}>+ Task</button>
    </div>
  );
}
