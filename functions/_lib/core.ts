import { parse, stringify } from "smol-toml";

export interface Env {
  KV: KVNamespace;
  BUCKET: R2Bucket;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ADMIN_LOGINS?: string;
  DEV_LOGIN?: string;
}

export interface SessionUser {
  id: number;
  login: string;
  name: string;
  avatar: string;
}

export interface StoredLayout {
  id: string;
  title: string;
  description: string;
  public: boolean;
  created: string;
  updated: string;
  forked_from?: string;
  forked_from_title?: string;
  forked_from_author?: string;
  data: string;
}

export interface UserFile {
  user: SessionUser & { created: string };
  layouts: StoredLayout[];
}

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

export const isAdmin = (env: Env, u: SessionUser | null) =>
  !!u &&
  (env.ADMIN_LOGINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(u.login.toLowerCase());

const fileKey = (uid: number) => `users/${uid}.toml`;

export async function readUserFile(env: Env, uid: number): Promise<{ file: UserFile | null; etag: string | null }> {
  const obj = await env.BUCKET.get(fileKey(uid));
  if (!obj) return { file: null, etag: null };
  const parsed = parse(await obj.text()) as unknown as UserFile;
  parsed.layouts ??= [];
  return { file: parsed, etag: obj.etag };
}

function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined && x !== null) out[k] = clean(x);
    return out as T;
  }
  return v;
}

export async function mutateUserFile<T>(
  env: Env,
  user: SessionUser,
  fn: (file: UserFile) => T | Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { file, etag } = await readUserFile(env, user.id);
    const f: UserFile = file ?? {
      user: { ...user, created: new Date().toISOString() },
      layouts: [],
    };
    f.user = { ...f.user, id: user.id, login: user.login, name: user.name, avatar: user.avatar };
    const result = await fn(f);
    const body = stringify(clean(f) as unknown as Record<string, unknown>);
    const put = await env.BUCKET.put(fileKey(user.id), body, {
      httpMetadata: { contentType: "application/toml" },
      ...(etag ? { onlyIf: { etagMatches: etag } } : {}),
    });
    if (put) return result;
  }
  throw new HttpError(409, "Your layouts changed elsewhere, please try again");
}
