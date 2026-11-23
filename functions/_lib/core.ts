import { stringify } from "smol-toml";
import type { LayoutRow, UserStore } from "../../worker/store";

export interface Env {
  KV: KVNamespace;
  STORE: DurableObjectNamespace<UserStore>;
  DB: D1Database;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ADMIN_LOGINS?: string;
  SITE_URL?: string;
  DEV_LOGIN?: string;
}

export interface SessionUser {
  id: number;
  login: string;
  name: string;
  avatar: string;
}

export type StoredLayout = LayoutRow;

export const LAYOUT_LIMIT = 100;
export const SESSION_COOKIE = "okl_session";
export const SESSION_TTL = 60 * 60 * 24 * 30;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...init.headers },
  });

export function randomId(bytes = 24): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomBase36(len: number): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  const buf = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(buf, (b) => chars[b % 36]).join("");
}

export const newLayoutId = (uid: number) => `${uid.toString(36)}-${randomBase36(10)}`;

export function ownerOf(id: string): number | null {
  const m = /^([0-9a-z]{1,12})-[0-9a-z]{10}$/.exec(id);
  if (!m) return null;
  const n = parseInt(m[1], 36);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function cookie(name: string, value: string, maxAge: number, req: Request) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function currentUser(req: Request, env: Env): Promise<SessionUser | null> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{48}$/.test(token)) return null;
  return env.KV.get<SessionUser>(`sess:${token}`, "json");
}

export async function requireUser(req: Request, env: Env): Promise<SessionUser> {
  const u = await currentUser(req, env);
  if (!u) throw new HttpError(401, "Sign in to do that");
  return u;
}

export const isAdminLogin = (env: Env, login: string) =>
  (env.ADMIN_LOGINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(login.toLowerCase());

export const isAdmin = (env: Env, u: SessionUser | null) => !!u && isAdminLogin(env, u.login);

export function store(env: Env, uid: number) {
  return env.STORE.get(env.STORE.idFromName(String(uid)));
}

export const profileOf = (u: SessionUser) => ({ id: u.id, login: u.login, name: u.name, avatar: u.avatar });

export function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined && x !== null) out[k] = clean(x);
    return out as T;
  }
  return v;
}

export function toToml(data: Record<string, unknown>): string {
  return stringify(clean(data));
}

export const FAVORITE_LIMIT = 500;

let dbReady: Promise<unknown> | null = null;

export async function db(env: Env): Promise<D1Database> {
  dbReady ??= env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS favorites (uid INTEGER NOT NULL, layout_id TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY (uid, layout_id))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS favorites_layout ON favorites (layout_id)"),
  ]).catch((e) => {
    dbReady = null;
    throw e;
  });
  await dbReady;
  return env.DB;
}

export async function favoriteCounts(env: Env): Promise<Map<string, number>> {
  const d = await db(env);
  const { results } = await d.prepare("SELECT layout_id, COUNT(*) AS n FROM favorites GROUP BY layout_id").all<{ layout_id: string; n: number }>();
  return new Map(results.map((r) => [r.layout_id, r.n]));
}

