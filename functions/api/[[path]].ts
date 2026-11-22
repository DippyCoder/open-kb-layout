import {
  type Env,
  type SessionUser,
  type StoredLayout,
  HttpError,
  LAYOUT_LIMIT,
  SESSION_COOKIE,
  SESSION_TTL,
  cookie,
  currentUser,
  getCookie,
  isAdmin,
  json,
  newLayoutId,
  ownerOf,
  profileOf,
  randomId,
  requireUser,
  store,
  toToml,
} from "../_lib/core";
import { sanitizeLayout, toNative, toPreview, LayoutParseError } from "../../src/lib/layout";

type Ctx = EventContext<Env, string, Record<string, unknown>>;

interface PubMeta {
  t: string;
  a: string;
  d: string;
  u: string;
  n: number;
}

interface PubValue {
  id: string;
  title: string;
  description: string;
  author: string;
  avatar: string;
  updated: string;
  keyCount: number;
  forkedFrom?: { id: string; title: string; author: string };
  preview: ReturnType<typeof toPreview>;
}

const MAX_DATA = 400_000;

export const onRequest = async (ctx: Ctx): Promise<Response> => {
  try {
    return await route(ctx);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, { status: e.status });
    if (e instanceof LayoutParseError) return json({ error: e.message }, { status: 400 });
    console.error(e);
    return json({ error: "Something went wrong" }, { status: 500 });
  }
};

async function route({ request: req, env }: Ctx): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const m = req.method;

  if (m !== "GET" && m !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin) throw new HttpError(403, "Cross-origin request blocked");
  }

  const [a, b, c] = parts;
  if (a === "auth") {
    if (b === "login" && m === "GET") return login(req, env, url);
    if (b === "callback" && m === "GET") return callback(req, env, url);
    if (b === "logout" && m === "POST") return logout(req, env);
    if (b === "dev" && m === "GET") return devLogin(req, env, url);
  }
  if (a === "me" && !b && m === "GET") {
    const u = await currentUser(req, env);
    return json({ user: u ? { ...u, admin: isAdmin(env, u) } : null });
  }
  if (a === "layouts") {
    if (!b && m === "GET") return listMine(req, env);
    if (!b && m === "POST") return createLayout(req, env);
    if (b && !c && m === "GET") return getLayout(req, env, b);
    if (b && !c && m === "PUT") return updateLayout(req, env, b);
    if (b && !c && m === "DELETE") return deleteLayout(req, env, b);
  }
  if (a === "export" && !b && m === "GET") return exportToml(req, env);
  if (a === "discover" && m === "GET") return discover(env, url);
  if (a === "featured" && !b && m === "GET") return featured(req, env);
  if (a === "featured" && b && m === "POST") return toggleFeatured(req, env, b);
  if (a === "users" && b && m === "GET") return userPage(env, b);
  throw new HttpError(404, "Not found");
}

async function login(req: Request, env: Env, url: URL) {
  if (!env.GITHUB_CLIENT_ID && env.DEV_LOGIN === "1") {
    const dev = new URL("/api/auth/dev", url.origin);
    dev.searchParams.set("next", safeNext(url.searchParams.get("next")));
    if (url.searchParams.get("as")) dev.searchParams.set("login", url.searchParams.get("as")!);
    return new Response(null, { status: 302, headers: { location: dev.pathname + dev.search } });
  }
  if (env.SITE_URL && url.origin !== env.SITE_URL) {
    return Response.redirect(`${env.SITE_URL}${url.pathname}${url.search}`, 302);
  }
  if (!env.GITHUB_CLIENT_ID) throw new HttpError(500, "GitHub OAuth is not configured");
  const state = randomId(16);
  const next = safeNext(url.searchParams.get("next"));
  const gh = new URL("https://github.com/login/oauth/authorize");
  gh.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  gh.searchParams.set("redirect_uri", `${url.origin}/api/auth/callback`);
  gh.searchParams.set("scope", "read:user");
  gh.searchParams.set("state", state);
  gh.searchParams.set("allow_signup", "true");
  const headers = new Headers({ location: gh.toString() });
  headers.append("set-cookie", cookie("okl_state", `${state}|${next}`, 600, req));
  return new Response(null, { status: 302, headers });
}

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

async function startSession(req: Request, env: Env, user: SessionUser, next: string) {
  const token = randomId(24);
  await env.KV.put(`sess:${token}`, JSON.stringify(user), { expirationTtl: SESSION_TTL });
  const headers = new Headers({ location: next });
  headers.append("set-cookie", cookie(SESSION_COOKIE, token, SESSION_TTL, req));
  headers.append("set-cookie", cookie("okl_state", "", 0, req));
  return new Response(null, { status: 302, headers });
}

async function callback(req: Request, env: Env, url: URL) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const [expected, next] = (getCookie(req, "okl_state") ?? "").split("|");
  if (!code || !state || !expected || state !== expected) throw new HttpError(400, "Login expired, please try again");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/auth/callback`,
    }),
  });
  const tok = (await tokenRes.json()) as { access_token?: string };
  if (!tok.access_token) throw new HttpError(400, "GitHub did not accept the login");

  const userRes = await fetch("https://api.github.com/user", {
    headers: { authorization: `Bearer ${tok.access_token}`, "user-agent": "open-kb-layout", accept: "application/vnd.github+json" },
  });
  if (!userRes.ok) throw new HttpError(502, "Could not read your GitHub profile");
  const gh = (await userRes.json()) as { id: number; login: string; name: string | null; avatar_url: string };
  return startSession(req, env, { id: gh.id, login: gh.login, name: gh.name ?? "", avatar: gh.avatar_url }, safeNext(next));
}

async function devLogin(req: Request, env: Env, url: URL) {
  if (env.DEV_LOGIN !== "1") throw new HttpError(404, "Not found");
  const login = (url.searchParams.get("login") ?? "dev").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 39) || "dev";
  let id = 0;
  for (const ch of login) id = (id * 31 + ch.charCodeAt(0)) % 1_000_000_000;
  return startSession(req, env, { id: id + 1, login, name: login, avatar: "" }, safeNext(url.searchParams.get("next")));
}

async function logout(req: Request, env: Env) {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) await env.KV.delete(`sess:${token}`);
  return json({ ok: true }, { headers: { "set-cookie": cookie(SESSION_COOKIE, "", 0, req) } });
}

function summarize(l: StoredLayout, owner: { login: string; avatar: string }) {
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    public: l.public,
    created: l.created,
    updated: l.updated,
    author: owner.login,
    avatar: owner.avatar,
    forkedFrom: l.forked_from
      ? { id: l.forked_from, title: l.forked_from_title ?? "", author: l.forked_from_author ?? "" }
      : undefined,
  };
}

async function listMine(req: Request, env: Env) {
  const u = await requireUser(req, env);
  const rows = await store(env, u.id).list();
  const layouts = rows
    .map((l) => {
      let preview = null;
      try {
        preview = toPreview(sanitizeLayout(JSON.parse(l.data)));
      } catch {
        preview = null;
      }
      return { ...summarize(l, u), preview };
    })
    .sort((x, y) => y.updated.localeCompare(x.updated));
  return json({ layouts });
}

async function readBody(req: Request) {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) throw new HttpError(415, "Expected JSON");
  const text = await req.text();
  if (text.length > MAX_DATA + 10_000) throw new HttpError(413, "Layout is too large");
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

function prepare(body: Record<string, unknown>) {
  const layout = sanitizeLayout(body.layout);
  const title = String(body.title ?? layout.meta.name ?? "").trim().slice(0, 80) || "Untitled layout";
  const description = String(body.description ?? "").trim().slice(0, 500);
  layout.meta.name = title;
  const data = JSON.stringify(toNative(layout));
  if (data.length > MAX_DATA) throw new HttpError(413, "Layout is too large");
  return { layout, title, description, data, isPublic: body.public === true };
}

async function syncIndex(env: Env, user: SessionUser, l: StoredLayout) {
  const key = `pub:${l.id}`;
  if (!l.public) {
    await env.KV.delete(key);
    return;
  }
  const layout = sanitizeLayout(JSON.parse(l.data));
  const value: PubValue = {
    id: l.id,
    title: l.title,
    description: l.description,
    author: user.login,
    avatar: user.avatar,
    updated: l.updated,
    keyCount: layout.keys.length,
    forkedFrom: l.forked_from
      ? { id: l.forked_from, title: l.forked_from_title ?? "", author: l.forked_from_author ?? "" }
      : undefined,
    preview: toPreview(layout),
  };
  const metadata: PubMeta = {
    t: l.title.slice(0, 80),
    a: user.login,
    d: l.description.slice(0, 160),
    u: l.updated,
    n: layout.keys.length,
  };
  await env.KV.put(key, JSON.stringify(value), { metadata });
}

async function loadLayout(env: Env, id: string) {
  const uid = ownerOf(id);
  if (!uid) return null;
  return store(env, uid).get(id);
}

async function createLayout(req: Request, env: Env) {
  const u = await requireUser(req, env);
  const body = await readBody(req);
  const p = prepare(body);
  let fork: { id: string; title: string; author: string } | null = null;
  if (typeof body.forkedFrom === "string") {
    const src = await loadLayout(env, body.forkedFrom);
    if (src && src.layout.public && src.owner.id !== u.id) {
      fork = { id: src.layout.id, title: src.layout.title, author: src.owner.login };
    }
  }
  const now = new Date().toISOString();
  const row: StoredLayout = {
    id: newLayoutId(u.id),
    title: p.title,
    description: p.description,
    public: p.isPublic,
    created: now,
    updated: now,
    ...(fork ? { forked_from: fork.id, forked_from_title: fork.title, forked_from_author: fork.author } : {}),
    data: p.data,
  };
  const res = await store(env, u.id).create(profileOf(u), row, LAYOUT_LIMIT);
  if (!res.ok) throw new HttpError(403, "You have reached the maximum number of saved layouts. Delete one to save another.");
  const stored = res.value;
  await syncIndex(env, u, stored);
  return json({ layout: { ...summarize(stored, u), data: JSON.parse(stored.data) } }, { status: 201 });
}

async function getLayout(req: Request, env: Env, id: string) {
  const u = await currentUser(req, env);
  const found = await loadLayout(env, id);
  const isOwner = !!found && !!u && found.owner.id === u.id;
  if (!found || (!found.layout.public && !isOwner)) throw new HttpError(404, "Layout not found");
  const featuredIds = (await env.KV.get<string[]>("featured", "json")) ?? [];
  return json({
    layout: { ...summarize(found.layout, found.owner), data: JSON.parse(found.layout.data) },
    isOwner,
    featured: featuredIds.includes(id),
  });
}

async function updateLayout(req: Request, env: Env, id: string) {
  const u = await requireUser(req, env);
  if (ownerOf(id) !== u.id) throw new HttpError(403, "You can only edit your own layouts");
  const body = await readBody(req);
  const s = store(env, u.id);
  const found = await s.get(id);
  if (!found) throw new HttpError(404, "Layout not found");
  const l: StoredLayout = { ...found.layout };
  if (body.layout !== undefined) {
    const p = prepare({ ...body, title: body.title ?? l.title, description: body.description ?? l.description });
    l.title = p.title;
    l.description = p.description;
    l.data = p.data;
  } else {
    if (typeof body.title === "string") l.title = body.title.trim().slice(0, 80) || l.title;
    if (typeof body.description === "string") l.description = body.description.trim().slice(0, 500);
  }
  if (typeof body.public === "boolean") l.public = body.public;
  l.updated = new Date().toISOString();
  const res = await s.update(profileOf(u), l, found.layout.updated);
  if (!res.ok) {
    if (res.reason === "missing") throw new HttpError(404, "Layout not found");
    throw new HttpError(409, "This layout changed elsewhere, reload and try again");
  }
  const stored = res.value;
  await syncIndex(env, u, stored);
  return json({ layout: { ...summarize(stored, u), data: JSON.parse(stored.data) } });
}

async function deleteLayout(req: Request, env: Env, id: string) {
  const u = await requireUser(req, env);
  if (ownerOf(id) !== u.id) throw new HttpError(403, "You can only delete your own layouts");
  if (!(await store(env, u.id).remove(id))) throw new HttpError(404, "Layout not found");
  await env.KV.delete(`pub:${id}`);
  return json({ ok: true });
}

async function allPublic(env: Env) {
  const out: { id: string; meta: PubMeta }[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const page = await env.KV.list<PubMeta>({ prefix: "pub:", cursor });
    for (const k of page.keys) if (k.metadata) out.push({ id: k.name.slice(4), meta: k.metadata });
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  return out;
}

async function values(env: Env, ids: string[]) {
  const got = await Promise.all(ids.map((id) => env.KV.get<PubValue>(`pub:${id}`, "json")));
  return got.filter((v): v is PubValue => !!v);
}

async function discover(env: Env, url: URL) {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const author = (url.searchParams.get("author") ?? "").trim().toLowerCase();
  const sort = url.searchParams.get("sort") === "keys" ? "keys" : "recent";
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(48, Math.max(1, parseInt(url.searchParams.get("limit") ?? "24", 10) || 24));
  const terms = q.split(/\s+/).filter(Boolean);
  let items = await allPublic(env);
  if (author) items = items.filter((i) => i.meta.a.toLowerCase() === author);
  if (terms.length) {
    items = items.filter((i) => {
      const hay = `${i.meta.t} ${i.meta.a} ${i.meta.d}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }
  items.sort((x, y) => (sort === "keys" ? y.meta.n - x.meta.n : 0) || y.meta.u.localeCompare(x.meta.u));
  const page = items.slice(offset, offset + limit);
  return json({ total: items.length, offset, layouts: await values(env, page.map((p) => p.id)) });
}

async function featured(req: Request, env: Env) {
  const ids = (await env.KV.get<string[]>("featured", "json")) ?? [];
  let layouts = await values(env, ids);
  let curated = true;
  if (!layouts.length) {
    curated = false;
    const recent = (await allPublic(env)).sort((x, y) => y.meta.u.localeCompare(x.meta.u)).slice(0, 6);
    layouts = await values(env, recent.map((r) => r.id));
  }
  const u = await currentUser(req, env);
  return json({ curated, layouts, canCurate: isAdmin(env, u) });
}

async function toggleFeatured(req: Request, env: Env, id: string) {
  const u = await requireUser(req, env);
  if (!isAdmin(env, u)) throw new HttpError(403, "Only admins can feature layouts");
  const ids = (await env.KV.get<string[]>("featured", "json")) ?? [];
  const on = !ids.includes(id);
  if (on && !(await env.KV.get(`pub:${id}`))) throw new HttpError(400, "Only public layouts can be featured");
  const next = on ? [id, ...ids].slice(0, 12) : ids.filter((x) => x !== id);
  await env.KV.put("featured", JSON.stringify(next));
  return json({ featured: on });
}

async function userPage(env: Env, login: string) {
  const items = (await allPublic(env))
    .filter((i) => i.meta.a.toLowerCase() === login.toLowerCase())
    .sort((x, y) => y.meta.u.localeCompare(x.meta.u));
  const layouts = await values(env, items.slice(0, 100).map((i) => i.id));
  return json({ login: layouts[0]?.author ?? login, avatar: layouts[0]?.avatar ?? "", layouts });
}

async function exportToml(req: Request, env: Env) {
  const u = await requireUser(req, env);
  const s = store(env, u.id);
  const [profile, rows] = await Promise.all([s.profile(), s.list()]);
  const layouts = rows.map(({ data, ...rest }) => {
    let layout: unknown = null;
    try {
      layout = toNative(sanitizeLayout(JSON.parse(data)));
    } catch {
      layout = null;
    }
    return { ...rest, layout };
  });
  const body = toToml({
    format: "open-kb-layout-account",
    version: 1,
    exported: new Date().toISOString(),
    user: profile ?? { ...profileOf(u), created: new Date().toISOString() },
    layouts,
  });
  const name = u.login.replace(/[^a-zA-Z0-9-]/g, "") || "layouts";
  return new Response(body, {
    headers: {
      "content-type": "application/toml; charset=utf-8",
      "content-disposition": `attachment; filename="${name}-layouts.toml"`,
      "cache-control": "no-store",
    },
  });
}

