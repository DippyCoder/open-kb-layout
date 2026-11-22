import type { PreviewKey } from "./layout";

export interface User {
  id: number;
  login: string;
  name: string;
  avatar: string;
  admin?: boolean;
}

export interface ForkInfo {
  id: string;
  title: string;
  author: string;
}

export interface Preview {
  bg: string;
  keys: PreviewKey[];
}

export interface LayoutSummary {
  id: string;
  title: string;
  description: string;
  public: boolean;
  created: string;
  updated: string;
  author: string;
  avatar: string;
  forkedFrom?: ForkInfo;
  preview: Preview | null;
}

export interface LayoutFull extends Omit<LayoutSummary, "preview"> {
  data: unknown;
}

export interface PublicLayout {
  id: string;
  title: string;
  description: string;
  author: string;
  avatar: string;
  updated: string;
  keyCount: number;
  forkedFrom?: ForkInfo;
  preview: Preview;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export interface SavePayload {
  title?: string;
  description?: string;
  public?: boolean;
  layout?: unknown;
  forkedFrom?: string;
}

export const api = {
  me: () => call<{ user: User | null }>("GET", "/me"),
  logout: () => call<{ ok: true }>("POST", "/auth/logout"),
  mine: () => call<{ layouts: LayoutSummary[] }>("GET", "/layouts"),
  get: (id: string) => call<{ layout: LayoutFull; isOwner: boolean; featured: boolean }>("GET", `/layouts/${encodeURIComponent(id)}`),
  create: (p: SavePayload) => call<{ layout: LayoutFull }>("POST", "/layouts", p),
  update: (id: string, p: SavePayload) => call<{ layout: LayoutFull }>("PUT", `/layouts/${encodeURIComponent(id)}`, p),
  remove: (id: string) => call<{ ok: true }>("DELETE", `/layouts/${encodeURIComponent(id)}`),
  discover: (params: { q?: string; sort?: string; offset?: number; limit?: number }) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
    return call<{ total: number; offset: number; layouts: PublicLayout[] }>("GET", `/discover?${s}`);
  },
  featured: () => call<{ curated: boolean; layouts: PublicLayout[]; canCurate: boolean }>("GET", "/featured"),
  toggleFeatured: (id: string) => call<{ featured: boolean }>("POST", `/featured/${encodeURIComponent(id)}`),
  user: (login: string) => call<{ login: string; avatar: string; layouts: PublicLayout[] }>("GET", `/users/${encodeURIComponent(login)}`),
};

export const loginUrl = (next = location.pathname + location.search) => `/api/auth/login?next=${encodeURIComponent(next)}`;
