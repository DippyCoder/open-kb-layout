import { DurableObject } from "cloudflare:workers";

export interface Profile {
  id: number;
  login: string;
  name: string;
  avatar: string;
  created: string;
}

export interface LayoutRow {
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

type Result<T = undefined> = { ok: true; value: T } | { ok: false; reason: "limit" | "missing" | "conflict" };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profile (k INTEGER PRIMARY KEY CHECK (k = 1), id INTEGER NOT NULL, login TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS layouts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  public INTEGER NOT NULL,
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  forked_from TEXT,
  forked_from_title TEXT,
  forked_from_author TEXT,
  data TEXT NOT NULL
);`;

type Row = Record<string, SqlStorageValue>;

function toLayout(r: Row): LayoutRow {
  const l: LayoutRow = {
    id: String(r.id),
    title: String(r.title),
    description: String(r.description),
    public: r.public === 1,
    created: String(r.created),
    updated: String(r.updated),
    data: String(r.data),
  };
  if (r.forked_from != null) {
    l.forked_from = String(r.forked_from);
    l.forked_from_title = String(r.forked_from_title ?? "");
    l.forked_from_author = String(r.forked_from_author ?? "");
  }
  return l;
}

export class UserStore extends DurableObject {
  private ready = false;

  private get sql() {
    return this.ctx.storage.sql;
  }

  private hasData(): boolean {
    if (this.ready) return true;
    this.ready = this.sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'layouts'").toArray().length > 0;
    return this.ready;
  }

  private ensure(p: Omit<Profile, "created">) {
    if (!this.ready) {
      this.sql.exec(SCHEMA);
      this.ready = true;
    }
    this.sql.exec(
      `INSERT INTO profile (k, id, login, name, avatar, created) VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT (k) DO UPDATE SET id = excluded.id, login = excluded.login, name = excluded.name, avatar = excluded.avatar`,
      p.id,
      p.login,
      p.name,
      p.avatar,
      new Date().toISOString(),
    );
  }

  profile(): Profile | null {
    if (!this.hasData()) return null;
    const r = this.sql.exec("SELECT id, login, name, avatar, created FROM profile WHERE k = 1").toArray()[0];
    return r ? { id: Number(r.id), login: String(r.login), name: String(r.name), avatar: String(r.avatar), created: String(r.created) } : null;
  }

  list(): LayoutRow[] {
    if (!this.hasData()) return [];
    return this.sql.exec("SELECT * FROM layouts ORDER BY updated DESC").toArray().map(toLayout);
  }

  get(id: string): { layout: LayoutRow; owner: Profile } | null {
    if (!this.hasData()) return null;
    const r = this.sql.exec("SELECT * FROM layouts WHERE id = ?", id).toArray()[0];
    const owner = this.profile();
    return r && owner ? { layout: toLayout(r), owner } : null;
  }

  create(p: Omit<Profile, "created">, l: LayoutRow, limit: number): Result<LayoutRow> {
    this.ensure(p);
    const count = Number(this.sql.exec("SELECT COUNT(*) AS n FROM layouts").one().n);
    if (count >= limit) return { ok: false, reason: "limit" };
    this.sql.exec(
      `INSERT INTO layouts (id, title, description, public, created, updated, forked_from, forked_from_title, forked_from_author, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      l.id,
      l.title,
      l.description,
      l.public ? 1 : 0,
      l.created,
      l.updated,
      l.forked_from ?? null,
      l.forked_from_title ?? null,
      l.forked_from_author ?? null,
      l.data,
    );
    return { ok: true, value: l };
  }

  update(p: Omit<Profile, "created">, l: LayoutRow, expectedUpdated: string): Result<LayoutRow> {
    if (!this.hasData()) return { ok: false, reason: "missing" };
    this.ensure(p);
    const cur = this.sql.exec("SELECT updated FROM layouts WHERE id = ?", l.id).toArray()[0];
    if (!cur) return { ok: false, reason: "missing" };
    if (cur.updated !== expectedUpdated) return { ok: false, reason: "conflict" };
    this.sql.exec(
      "UPDATE layouts SET title = ?, description = ?, public = ?, updated = ?, data = ? WHERE id = ?",
      l.title,
      l.description,
      l.public ? 1 : 0,
      l.updated,
      l.data,
      l.id,
    );
    return { ok: true, value: l };
  }

  remove(id: string): boolean {
    if (!this.hasData()) return false;
    return this.sql.exec("DELETE FROM layouts WHERE id = ?", id).rowsWritten > 0;
  }
}

export default {
  fetch: () => new Response("Not found", { status: 404 }),
} satisfies ExportedHandler;
