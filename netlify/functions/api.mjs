import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const config = { path: ["/api/*", "/auth/*"] };

const STATUSES = ["fresh", "invited", "connected", "messaged", "replied", "call", "client"];
// Statuses from the first version of the pipeline, mapped onto the current one.
const LEGACY_STATUS = { "message sent": "messaged", "got reply": "replied", hired: "client" };
const withStatus = (row) => (LEGACY_STATUS[row.status] ? { ...row, status: LEGACY_STATUS[row.status] } : row);
const FIELDS = ["name", "profile", "email", "website", "industry", "status", "activity", "message", "remarks"];
const ACTIVITY = ["", "high", "medium", "low"];
const SESSION_COOKIE = "ct_session";
const STATE_COOKIE = "ct_oauth_state";
const SESSION_DAYS = 365;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 50;
const UUID = /^[0-9a-f-]{36}$/;

const env = (k) => process.env[k] || "";
// `netlify dev` sets NETLIFY_DEV; it is never set on deployed sites.
const isLocalDev = () => env("NETLIFY_DEV") === "true";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

const redirect = (location, cookies = []) => {
  const headers = new Headers({ location, "cache-control": "no-store" });
  cookies.forEach((c) => headers.append("set-cookie", c));
  return new Response(null, { status: 302, headers });
};

const cookie = (name, value, maxAge) =>
  `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;

function readCookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

const hmac = (data) => crypto.createHmac("sha256", env("SESSION_SECRET")).update(data).digest("hex");

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const allowedUsers = () =>
  env("ALLOWED_GITHUB_USERS").split(",").map((u) => u.trim().toLowerCase()).filter(Boolean);

// Session cookie format: <login>.<expiresAtMs>.<hmac>
function currentUser(req) {
  if (isLocalDev()) return "local-dev";
  const [login, expires, sig] = readCookie(req, SESSION_COOKIE).split(".");
  if (!login || !expires || !sig) return null;
  if (!safeEqual(sig, hmac(`${login}.${expires}`)) || Date.now() > Number(expires)) return null;
  return allowedUsers().includes(login.toLowerCase()) ? login : null;
}

async function handleAuth(req, url, action) {
  const callback = `${url.origin}/auth/callback`;

  if (action === "login") {
    const state = crypto.randomBytes(16).toString("hex");
    const gh = new URL("https://github.com/login/oauth/authorize");
    gh.searchParams.set("client_id", env("GITHUB_CLIENT_ID"));
    gh.searchParams.set("redirect_uri", callback);
    gh.searchParams.set("scope", "read:user");
    gh.searchParams.set("state", state);
    return redirect(gh.toString(), [cookie(STATE_COOKIE, state, 600)]);
  }

  if (action === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expected = readCookie(req, STATE_COOKIE);
    if (!code || !state || !expected || !safeEqual(state, expected)) {
      return new Response("Login failed: invalid state. Go back and try again.", { status: 400 });
    }

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: env("GITHUB_CLIENT_ID"),
        client_secret: env("GITHUB_CLIENT_SECRET"),
        code,
        redirect_uri: callback,
      }),
    }).then((r) => r.json());
    if (!tokenRes.access_token) {
      return new Response(`Login failed: ${tokenRes.error_description || "no access token"}`, { status: 400 });
    }

    const user = await fetch("https://api.github.com/user", {
      headers: { authorization: `Bearer ${tokenRes.access_token}`, "user-agent": "client-tracker" },
    }).then((r) => r.json());

    if (!user.login || !allowedUsers().includes(user.login.toLowerCase())) {
      return new Response(`GitHub user "${user.login}" is not allowed.`, { status: 403 });
    }

    const expires = Date.now() + SESSION_DAYS * 86400e3;
    const value = `${user.login}.${expires}.${hmac(`${user.login}.${expires}`)}`;
    return redirect("/", [cookie(SESSION_COOKIE, value, SESSION_DAYS * 86400), cookie(STATE_COOKIE, "", 0)]);
  }

  if (action === "logout") return redirect("/", [cookie(SESSION_COOKIE, "", 0)]);

  return json({ error: "Not found" }, 404);
}

function clean(body = {}) {
  const out = {};
  for (const f of FIELDS) if (typeof body[f] === "string") out[f] = body[f].slice(0, 5000);
  if (out.status && !STATUSES.includes(out.status)) delete out.status;
  if ("activity" in out && !ACTIVITY.includes(out.activity)) delete out.activity;
  if (Array.isArray(body.images)) out.images = body.images.filter((i) => UUID.test(i)).slice(0, MAX_IMAGES);
  return out;
}

async function handleApi(req, parts, user) {
  if (parts[0] === "me") return json({ login: user });
  if (parts[0] === "images") return handleImages(req, parts[1]);
  if (parts[0] !== "clients") return json({ error: "Not found" }, 404);

  const store = getStore({ name: "clients", consistency: "strong" });
  const images = getStore({ name: "images", consistency: "strong" });
  const id = parts[1];

  if (!id && req.method === "GET") {
    const { blobs } = await store.list();
    const rows = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean).map(withStatus);
    rows.sort((a, b) => b.created_at - a.created_at);
    return json(rows);
  }

  if (!id && req.method === "POST") {
    const row = {
      name: "", profile: "", email: "", website: "", industry: "", status: "fresh", activity: "", message: "", remarks: "", images: [],
      ...clean(await req.json().catch(() => ({}))),
      id: crypto.randomUUID(),
      created_at: Date.now(),
    };
    await store.setJSON(row.id, row);
    return json(row, 201);
  }

  if (id && req.method === "PATCH") {
    const current = await store.get(id, { type: "json" });
    if (!current) return json({ error: "Not found" }, 404);
    const next = { ...withStatus(current), ...clean(await req.json().catch(() => ({}))) };
    await store.setJSON(id, next);
    const removed = (current.images || []).filter((i) => !(next.images || []).includes(i));
    await Promise.all(removed.map((i) => images.delete(i)));
    return json(next);
  }

  if (id && req.method === "DELETE") {
    const current = await store.get(id, { type: "json" });
    await Promise.all((current?.images || []).map((i) => images.delete(i)));
    await store.delete(id);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handleImages(req, id) {
  const images = getStore({ name: "images", consistency: "strong" });

  if (!id && req.method === "POST") {
    const type = req.headers.get("content-type") || "";
    if (!/^image\/(png|jpeg|webp|gif)$/.test(type)) return json({ error: "Unsupported image type" }, 415);
    const data = await req.arrayBuffer();
    if (data.byteLength > MAX_IMAGE_BYTES) return json({ error: "Image too large (max 5 MB)" }, 413);
    const newId = crypto.randomUUID();
    await images.set(newId, data, { metadata: { type } });
    return json({ id: newId }, 201);
  }

  if (id && UUID.test(id) && req.method === "GET") {
    const blob = await images.getWithMetadata(id, { type: "arrayBuffer" });
    if (!blob) return json({ error: "Not found" }, 404);
    return new Response(blob.data, {
      headers: { "content-type": blob.metadata.type, "cache-control": "private, max-age=31536000, immutable" },
    });
  }

  return json({ error: "Not found" }, 404);
}

export default async (req) => {
  const url = new URL(req.url);
  const [section, ...parts] = url.pathname.split("/").filter(Boolean);

  if (!isLocalDev()) {
    const missing = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "SESSION_SECRET", "ALLOWED_GITHUB_USERS"].filter((k) => !env(k));
    if (missing.length) return json({ error: `Server is missing env vars: ${missing.join(", ")}` }, 500);
  }

  if (section === "auth") return handleAuth(req, url, parts[0]);

  const user = currentUser(req);
  if (!user) return json({ error: "Not signed in" }, 401);
  return handleApi(req, parts, user);
};
