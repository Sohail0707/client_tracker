import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, UnauthorizedError } from "./api.js";
import { ACTIVITY_LEVELS, PROFILE_TYPES, STATUSES, cap } from "./constants.js";
import ClientRow from "./ClientRow.jsx";
import Lightbox from "./Lightbox.jsx";
import { SORTS, sortClients } from "./sort.js";

const CSV_COLS = ["name", "profile", "email", "website", "industry", "status", "activity", "type", "message", "remarks"];
// Values from older versions of the activity field (e.g. "< 1 month") count as not set.
const activityOf = (c) => (ACTIVITY_LEVELS.some((l) => l.value === c.activity) ? c.activity : "");
// Clients created before the type field existed count as not set.
const typeOf = (c) => (PROFILE_TYPES.some((t) => t.value === c.type) ? c.type : "");

// The chosen sort is remembered per browser. Storage can be unavailable (private mode), so never rely on it.
const SORT_STORAGE_KEY = "client-tracker:sort";
const loadSort = () => {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY);
    return SORTS.some((s) => s.value === v) ? v : "newest";
  } catch {
    return "newest";
  }
};

export default function App() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortKey, setSortKey] = useState(loadSort);
  // Row order is fixed when the list loads or the sort changes, not on every edit,
  // so a row never jumps away while you're typing in it.
  const [order, setOrder] = useState([]);
  const [focusId, setFocusId] = useState(null);
  // The last row interacted with stays highlighted, so it's easy to find after visiting a link.
  const [selectedId, setSelectedId] = useState(null);
  const [user, setUser] = useState(null);
  const [signedOut, setSignedOut] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const timers = useRef({});
  // Latest clients, so back-to-back edits (e.g. two uploads finishing together) build on each other.
  const clientsRef = useRef(clients);
  clientsRef.current = clients;
  const closeLightbox = useCallback(() => setLightbox(null), []);

  const fail = (e, prefix = "") => (e instanceof UnauthorizedError ? setSignedOut(true) : setError(prefix + e.message));

  useEffect(() => {
    Promise.all([api.me(), api.list()])
      .then(([me, list]) => {
        setUser(me.login);
        setClients(list);
        setOrder(sortClients(list, sortKey).map((c) => c.id));
      })
      .catch(fail)
      .finally(() => setLoading(false));
  }, []);

  // Dropping a file outside a remarks box would otherwise navigate away from the app.
  useEffect(() => {
    const block = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files") && e.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  function changeSort(value) {
    setSortKey(value);
    setOrder(sortClients(clientsRef.current, value).map((c) => c.id));
    try {
      localStorage.setItem(SORT_STORAGE_KEY, value);
    } catch {}
  }

  // Clients added since the last sort appear on top until the next sort.
  const ordered = useMemo(() => {
    const byId = new Map(clients.map((c) => [c.id, c]));
    const known = new Set(order);
    return [...clients.filter((c) => !known.has(c.id)), ...order.map((id) => byId.get(id)).filter(Boolean)];
  }, [clients, order]);

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return ordered.filter(
      (c) =>
        (!filter || c.status === filter) &&
        (activityFilter === "all" || activityOf(c) === activityFilter) &&
        (typeFilter === "all" || typeOf(c) === typeFilter) &&
        (!q || [c.name, c.profile, c.email, c.website, c.industry, c.message, c.remarks].join(" ").toLowerCase().includes(q))
    );
  }, [ordered, query, filter, activityFilter, typeFilter]);

  function update(id, field, value, delay = 400) {
    clientsRef.current = clientsRef.current.map((c) => (c.id === id ? { ...c, [field]: value } : c));
    setClients(clientsRef.current);
    const key = id + field;
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      api.update(id, { [field]: value }).catch((e) => fail(e, "Save failed: "));
    }, delay);
  }

  const imagesOf = (id) => clientsRef.current.find((c) => c.id === id)?.images || [];
  const addImages = (id, ids) => update(id, "images", [...imagesOf(id), ...ids], 0);
  const removeImage = (id, imageId) => update(id, "images", imagesOf(id).filter((i) => i !== imageId), 0);

  async function add() {
    try {
      const c = await api.create();
      setQuery("");
      setFilter("");
      setActivityFilter("all");
      setTypeFilter("all");
      setClients((cs) => [c, ...cs]);
      setFocusId(c.id);
      setSelectedId(c.id);
    } catch (e) {
      fail(e);
    }
  }

  async function remove(id) {
    if (!confirm("Delete this client?")) return;
    try {
      await api.remove(id);
      setClients((cs) => cs.filter((c) => c.id !== id));
    } catch (e) {
      fail(e);
    }
  }

  function exportCsv() {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [CSV_COLS.join(","), ...clients.map((c) => CSV_COLS.map((k) => esc(k === "activity" ? activityOf(c) : k === "type" ? typeOf(c) : c[k])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "clients.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (signedOut) {
    return (
      <div className="signin">
        <h1>Client Tracker</h1>
        <p>Sign in to continue.</p>
        <a className="button" href="/auth/login">Sign in with GitHub</a>
      </div>
    );
  }

  return (
    <main>
      <header>
        <h1>
          Clients<small>{visible.length} of {clients.length}</small>
        </h1>
        <input className="control search" type="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="control" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{cap(s)}</option>
          ))}
        </select>
        <select className="control" value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}>
          <option value="all">All activity</option>
          {ACTIVITY_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>{l.label} activity</option>
          ))}
          <option value="">Activity not set</option>
        </select>
        <select className="control" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          {PROFILE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
          <option value="">Type not set</option>
        </select>
        <select className="control" value={sortKey} onChange={(e) => changeSort(e.target.value)} title="Sort clients">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>Sort: {s.label}</option>
          ))}
        </select>
        <button className="ghost" onClick={exportCsv}>Export CSV</button>
        <button onClick={add}>+ Add client</button>
        {user && (
          <a className="signout" href="/auth/logout" title={`Signed in as ${user}`}>Sign out</a>
        )}
      </header>

      {error && <div className="error" onClick={() => setError("")}>{error}</div>}

      <div className="list">
        <div className="list-head">
          <div>Client</div><div>Contact</div><div>Status</div><div>Draft message</div><div>Remarks</div>
        </div>
        {visible.map((c) => (
          <ClientRow
            key={c.id}
            client={c}
            autoFocus={c.id === focusId}
            selected={c.id === selectedId}
            onSelect={setSelectedId}
            onChange={update}
            onAddImages={addImages}
            onRemoveImage={removeImage}
            onOpenImage={(images, index) => setLightbox({ images, index })}
            onError={fail}
            onDelete={remove}
          />
        ))}
        {!loading && visible.length === 0 && (
          <div className="empty">{clients.length ? "No clients match." : "No clients yet. Click “Add client”."}</div>
        )}
      </div>

      {lightbox && <Lightbox images={lightbox.images} start={lightbox.index} onClose={closeLightbox} />}
    </main>
  );
}
