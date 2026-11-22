export interface Key {
  x: number;
  y: number;
  w: number;
  h: number;
  x2: number;
  y2: number;
  w2: number;
  h2: number;
  r: number;
  rx: number;
  ry: number;
  color: string;
  labels: string[];
  textColor: string[];
  textSize: number[];
  defaultTextColor: string;
  defaultTextSize: number;
  profile: string;
  nub: boolean;
  ghost: boolean;
  stepped: boolean;
  decal: boolean;
  sm: string;
  sb: string;
  st: string;
}

export interface Meta {
  name: string;
  author: string;
  notes: string;
  backcolor: string;
  radii: string;
  extra: Record<string, unknown>;
}

export interface Layout {
  meta: Meta;
  keys: Key[];
}

export const LABEL_COUNT = 12;
export const DEFAULT_KEY_COLOR = "#cccccc";
export const DEFAULT_TEXT_COLOR = "#000000";
export const DEFAULT_TEXT_SIZE = 3;
export const DEFAULT_BACKCOLOR = "#eeeeee";

const blank12 = <T>(v: T): T[] => Array.from({ length: LABEL_COUNT }, () => v);

export function newKey(partial: Partial<Key> = {}): Key {
  return {
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    x2: 0,
    y2: 0,
    w2: 1,
    h2: 1,
    r: 0,
    rx: 0,
    ry: 0,
    color: DEFAULT_KEY_COLOR,
    labels: blank12(""),
    textColor: blank12(""),
    textSize: blank12(0),
    defaultTextColor: DEFAULT_TEXT_COLOR,
    defaultTextSize: DEFAULT_TEXT_SIZE,
    profile: "",
    nub: false,
    ghost: false,
    stepped: false,
    decal: false,
    sm: "",
    sb: "",
    st: "",
    ...partial,
  };
}

export function newMeta(partial: Partial<Meta> = {}): Meta {
  return { name: "", author: "", notes: "", backcolor: DEFAULT_BACKCOLOR, radii: "6px", extra: {}, ...partial };
}

export function cloneKey(k: Key): Key {
  return { ...k, labels: [...k.labels], textColor: [...k.textColor], textSize: [...k.textSize] };
}

export function cloneLayout(l: Layout): Layout {
  return { meta: { ...l.meta, extra: { ...l.meta.extra } }, keys: l.keys.map(cloneKey) };
}

const LABEL_MAP = [
  [0, 6, 2, 8, 9, 11, 3, 5, 1, 4, 7, 10],
  [1, 7, -1, -1, 9, 11, 4, -1, -1, -1, -1, 10],
  [3, -1, 5, -1, 9, 11, -1, -1, 4, -1, -1, 10],
  [4, -1, -1, -1, 9, 11, -1, -1, -1, -1, -1, 10],
  [0, 6, 2, 8, 10, -1, 3, 5, 1, 4, 7, -1],
  [1, 7, -1, -1, 10, -1, 4, -1, -1, -1, -1, -1],
  [3, -1, 5, -1, 10, -1, -1, -1, 4, -1, -1, -1],
  [4, -1, -1, -1, 10, -1, -1, -1, -1, -1, -1, -1],
];

function reorderIn<T>(items: T[], align: number, empty: T): T[] {
  const out = blank12(empty);
  for (let i = 0; i < items.length && i < LABEL_COUNT; i++) {
    const target = LABEL_MAP[align]?.[i] ?? -1;
    if (items[i] && target >= 0) out[target] = items[i];
  }
  return out;
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

export class LayoutParseError extends Error {}

export function parseKle(rows: unknown[]): Layout {
  const meta = newMeta();
  const keys: Key[] = [];
  const cur = newKey();
  let curTextSize: number[] = [];
  let curTextColorKle: string[] = blank12("");
  let align = 4;
  const cluster = { x: 0, y: 0 };

  rows.forEach((row, ri) => {
    if (Array.isArray(row)) {
      row.forEach((item) => {
        if (typeof item === "string") {
          const k = cloneKey(cur);
          k.w2 = cur.w2 === 0 ? cur.w : cur.w2;
          k.h2 = cur.h2 === 0 ? cur.h : cur.h2;
          k.labels = reorderIn(item.split("\n"), align, "");
          k.textSize = reorderIn(curTextSize, align, 0);
          k.textColor = [...curTextColorKle];
          for (let i = 0; i < LABEL_COUNT; i++) {
            if (!k.labels[i]) {
              k.textSize[i] = 0;
              k.textColor[i] = "";
            }
            if (k.textSize[i] === k.defaultTextSize) k.textSize[i] = 0;
            if (k.textColor[i] === k.defaultTextColor) k.textColor[i] = "";
          }
          keys.push(k);
          cur.x += cur.w;
          cur.w = cur.h = 1;
          cur.x2 = cur.y2 = cur.w2 = cur.h2 = 0;
          cur.nub = cur.stepped = cur.decal = false;
        } else if (item && typeof item === "object") {
          const p = item as Record<string, unknown>;
          if (p.r != null) cur.r = num(p.r, 0);
          if (p.rx != null) cur.rx = cluster.x = num(p.rx, 0);
          if (p.ry != null) cur.ry = cluster.y = num(p.ry, 0);
          if (p.rx != null || p.ry != null) {
            cur.x = cluster.x;
            cur.y = cluster.y;
          }
          if (p.a != null) align = Math.max(0, Math.min(7, num(p.a, 4)));
          if (p.f != null) {
            cur.defaultTextSize = num(p.f, DEFAULT_TEXT_SIZE);
            curTextSize = [];
          }
          if (p.f2 != null) for (let i = 1; i < LABEL_COUNT; i++) curTextSize[i] = num(p.f2, 0);
          if (Array.isArray(p.fa)) curTextSize = p.fa.map((v) => num(v, 0));
          if (p.p != null) cur.profile = str(p.p);
          if (p.c != null) cur.color = str(p.c, DEFAULT_KEY_COLOR);
          if (p.t != null) {
            const split = str(p.t).split("\n");
            if (split[0] !== "") cur.defaultTextColor = split[0];
            curTextColorKle = reorderIn(split, align, "");
          }
          if (p.x != null) cur.x += num(p.x, 0);
          if (p.y != null) cur.y += num(p.y, 0);
          if (p.w != null) cur.w = cur.w2 = num(p.w, 1);
          if (p.h != null) cur.h = cur.h2 = num(p.h, 1);
          if (p.x2 != null) cur.x2 = num(p.x2, 0);
          if (p.y2 != null) cur.y2 = num(p.y2, 0);
          if (p.w2 != null) cur.w2 = num(p.w2, 0);
          if (p.h2 != null) cur.h2 = num(p.h2, 0);
          if (p.n != null) cur.nub = !!p.n;
          if (p.l != null) cur.stepped = !!p.l;
          if (p.d != null) cur.decal = !!p.d;
          if (p.g != null) cur.ghost = !!p.g;
          if (p.sm != null) cur.sm = str(p.sm);
          if (p.sb != null) cur.sb = str(p.sb);
          if (p.st != null) cur.st = str(p.st);
        }
      });
      cur.y += 1;
      cur.x = cur.rx;
    } else if (row && typeof row === "object" && ri === 0) {
      const m = row as Record<string, unknown>;
      for (const [k, v] of Object.entries(m)) {
        if (k === "name") meta.name = str(v);
        else if (k === "author") meta.author = str(v);
        else if (k === "notes") meta.notes = str(v);
        else if (k === "backcolor") meta.backcolor = str(v, DEFAULT_BACKCOLOR);
        else if (k === "radii") meta.radii = str(v);
        else meta.extra[k] = v;
      }
    } else {
      throw new LayoutParseError("Unexpected row data");
    }
  });
  return { meta, keys };
}

function reorderOut(k: Key) {
  const order = [7, 5, 6, 4, 3, 1, 2, 0];
  for (const align of order) {
    const labels = blank12("");
    const sizes = blank12(0);
    const colors = blank12("");
    let ok = true;
    for (let i = 0; i < LABEL_COUNT && ok; i++) {
      if (!k.labels[i]) continue;
      const j = LABEL_MAP[align].indexOf(i);
      if (j < 0) ok = false;
      else {
        labels[j] = k.labels[i];
        sizes[j] = k.textSize[i];
        colors[j] = k.textColor[i];
      }
    }
    if (ok) return { align, labels, sizes, colors };
  }
  return { align: 0, labels: [...k.labels], sizes: [...k.textSize], colors: [...k.textColor] };
}

const trimEnd = <T>(arr: T[], isEmpty: (v: T) => boolean) => {
  const out = [...arr];
  while (out.length && isEmpty(out[out.length - 1])) out.pop();
  return out;
};

const round = (v: number) => Math.round(v * 1e6) / 1e6;

export function sortKeys(keys: Key[]): Key[] {
  return [...keys].sort(
    (a, b) =>
      (a.r + 360) % 360 - (b.r + 360) % 360 || a.rx - b.rx || a.ry - b.ry || a.y - b.y || a.x - b.x,
  );
}

export function serializeKle(layout: Layout): unknown[] {
  const out: unknown[] = [];
  const m: Record<string, unknown> = {};
  if (layout.meta.backcolor && layout.meta.backcolor !== DEFAULT_BACKCOLOR) m.backcolor = layout.meta.backcolor;
  if (layout.meta.name) m.name = layout.meta.name;
  if (layout.meta.author) m.author = layout.meta.author;
  if (layout.meta.notes) m.notes = layout.meta.notes;
  if (layout.meta.radii && layout.meta.radii !== "6px") m.radii = layout.meta.radii;
  Object.assign(m, layout.meta.extra);
  if (Object.keys(m).length) out.push(m);

  const cur = {
    x: 0,
    y: -1,
    r: 0,
    rx: 0,
    ry: 0,
    c: DEFAULT_KEY_COLOR,
    t: DEFAULT_TEXT_COLOR,
    g: false,
    p: "",
    a: 4,
    f: DEFAULT_TEXT_SIZE,
    fa: "[]",
    sm: "",
    sb: "",
    st: "",
  };
  let cluster = { r: 0, rx: 0, ry: 0 };
  let row: unknown[] = [];
  let newRow = true;

  for (const key of sortKeys(layout.keys)) {
    const props: Record<string, unknown> = {};
    const o = reorderOut(key);
    const clusterChanged = key.r !== cluster.r || key.rx !== cluster.rx || key.ry !== cluster.ry;
    const rowChanged = key.y !== cur.y;
    if (row.length && (rowChanged || clusterChanged)) {
      out.push(row);
      row = [];
      newRow = true;
    }
    if (newRow) {
      cur.y += 1;
      if (key.ry !== cluster.ry || key.rx !== cluster.rx) cur.y = key.ry;
      cur.x = key.rx;
      cluster = { r: key.r, rx: key.rx, ry: key.ry };
      newRow = false;
    }
    if (key.r !== cur.r) props.r = cur.r = key.r;
    if (key.rx !== cur.rx) props.rx = cur.rx = key.rx;
    if (key.ry !== cur.ry) props.ry = cur.ry = key.ry;
    const dy = round(key.y - cur.y);
    if (dy !== 0) props.y = dy;
    cur.y += dy;
    const dx = round(key.x - cur.x);
    if (dx !== 0) props.x = dx;
    cur.x += dx + key.w;
    if (key.color !== cur.c) props.c = cur.c = key.color;

    const colors = [...o.colors];
    if (!colors[0]) colors[0] = key.defaultTextColor;
    else for (let i = 1; i < LABEL_COUNT; i++) if (!colors[i] && o.labels[i]) colors[i] = key.defaultTextColor;
    const t = trimEnd(colors, (c) => !c).join("\n");
    if (t !== cur.t) props.t = cur.t = t;
    if (key.ghost !== cur.g) props.g = cur.g = key.ghost;
    if (key.profile !== cur.p) props.p = cur.p = key.profile;
    if (key.sm !== cur.sm) props.sm = cur.sm = key.sm;
    if (key.sb !== cur.sb) props.sb = cur.sb = key.sb;
    if (key.st !== cur.st) props.st = cur.st = key.st;
    if (o.align !== cur.a) props.a = cur.a = o.align;
    if (key.defaultTextSize !== cur.f) {
      props.f = cur.f = key.defaultTextSize;
      cur.fa = "[]";
    }
    const fa = trimEnd(o.sizes, (s) => !s);
    const faKey = JSON.stringify(fa);
    if (faKey !== cur.fa) {
      props.fa = fa;
      cur.fa = faKey;
    }
    if (key.w !== 1) props.w = key.w;
    if (key.h !== 1) props.h = key.h;
    if (key.w2 !== key.w) props.w2 = key.w2;
    if (key.h2 !== key.h) props.h2 = key.h2;
    if (key.x2) props.x2 = key.x2;
    if (key.y2) props.y2 = key.y2;
    if (key.nub) props.n = true;
    if (key.stepped) props.l = true;
    if (key.decal) props.d = true;
    if (Object.keys(props).length) row.push(props);
    row.push(trimEnd(o.labels, (l) => !l).join("\n"));
  }
  if (row.length) out.push(row);
  return out;
}

function relaxedToJson(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let s = "";
      while (j < text.length && text[j] !== ch) {
        if (text[j] === "\\") {
          s += text[j] + (text[j + 1] ?? "");
          j += 2;
        } else {
          s += ch === "'" && text[j] === '"' ? '\\"' : text[j];
          j++;
        }
      }
      out += '"' + s + '"';
      i = j + 1;
    } else if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_$]/.test(text[j])) j++;
      const word = text.slice(i, j);
      let k = j;
      while (k < text.length && /\s/.test(text[k])) k++;
      out += text[k] === ":" && !["true", "false", "null"].includes(word) ? `"${word}"` : word;
      i = j;
    } else if (ch === ",") {
      let k = i + 1;
      while (k < text.length && /\s/.test(text[k])) k++;
      if (text[k] !== "]" && text[k] !== "}") out += ch;
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

export function parseRelaxed(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    return parseRelaxedFallback(t);
  }
}

function parseRelaxedFallback(t: string): unknown {
  const relaxed = relaxedToJson(t);
  try {
    return JSON.parse(relaxed);
  } catch {
    return JSON.parse("[" + relaxed + "]");
  }
}

export function parseKleText(text: string): Layout {
  let data: unknown;
  try {
    data = parseRelaxed(text);
  } catch {
    throw new LayoutParseError("Could not read that as JSON or KLE raw data");
  }
  if (!Array.isArray(data)) throw new LayoutParseError("KLE data must be an array of rows");
  if (data.some((v) => typeof v === "string")) data = [data];
  return parseKle(data as unknown[]);
}

export function kleRawText(layout: Layout): string {
  return serializeKle(layout)
    .map((row) => JSON.stringify(row))
    .join(",\n");
}

export const NATIVE_FORMAT = "open-kb-layout";

type CompactKey = Partial<Key>;

export function toNative(layout: Layout) {
  const base = newKey();
  const keys = layout.keys.map((k) => {
    const c: CompactKey = {};
    for (const f of Object.keys(base) as (keyof Key)[]) {
      const v = k[f];
      const d = base[f];
      if (Array.isArray(v)) {
        if (v.some((x) => x)) (c as Record<string, unknown>)[f] = trimEnd(v as unknown[], (x) => !x);
      } else if (f === "w2" ? v !== k.w : f === "h2" ? v !== k.h : v !== d) {
        (c as Record<string, unknown>)[f] = v;
      }
    }
    return c;
  });
  return { format: NATIVE_FORMAT, version: 1, meta: layout.meta, keys };
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const color = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);
const clampN = (v: unknown, d: number, lo = -1000, hi = 1000) => Math.max(lo, Math.min(hi, num(v, d)));
const text = (v: unknown, max: number) => str(v).slice(0, max);

export const MAX_KEYS = 1000;

export function sanitizeLayout(input: unknown): Layout {
  if (!input || typeof input !== "object") throw new LayoutParseError("Layout must be an object");
  const src = input as { meta?: Record<string, unknown>; keys?: unknown };
  if (!Array.isArray(src.keys)) throw new LayoutParseError("Layout is missing a keys array");
  if (src.keys.length > MAX_KEYS) throw new LayoutParseError(`A layout can have at most ${MAX_KEYS} keys`);
  const m = src.meta ?? {};
  const extra: Record<string, unknown> = {};
  if (m.extra && typeof m.extra === "object" && JSON.stringify(m.extra).length < 4000) Object.assign(extra, m.extra);
  const meta = newMeta({
    name: text(m.name, 120),
    author: text(m.author, 120),
    notes: text(m.notes, 4000),
    backcolor: color(m.backcolor, DEFAULT_BACKCOLOR),
    radii: text(m.radii, 40) || "6px",
    extra,
  });
  const keys = src.keys.map((raw) => {
    const k = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const w = clampN(k.w, 1, 0.05, 100);
    const h = clampN(k.h, 1, 0.05, 100);
    const arr = <T>(v: unknown, f: (x: unknown) => T, empty: T): T[] => {
      const a = Array.isArray(v) ? v : [];
      return Array.from({ length: LABEL_COUNT }, (_, i) => (a[i] == null ? empty : f(a[i])));
    };
    return newKey({
      x: clampN(k.x, 0),
      y: clampN(k.y, 0),
      w,
      h,
      x2: clampN(k.x2, 0, -100, 100),
      y2: clampN(k.y2, 0, -100, 100),
      w2: clampN(k.w2, w, 0.05, 100),
      h2: clampN(k.h2, h, 0.05, 100),
      r: clampN(k.r, 0, -360, 360),
      rx: clampN(k.rx, 0),
      ry: clampN(k.ry, 0),
      color: color(k.color, DEFAULT_KEY_COLOR),
      labels: arr(k.labels, (x) => text(x, 200), ""),
      textColor: arr(k.textColor, (x) => color(x, ""), ""),
      textSize: arr(k.textSize, (x) => clampN(x, 0, 0, 9), 0),
      defaultTextColor: color(k.defaultTextColor, DEFAULT_TEXT_COLOR),
      defaultTextSize: clampN(k.defaultTextSize, DEFAULT_TEXT_SIZE, 1, 9),
      profile: text(k.profile, 40),
      nub: !!k.nub,
      ghost: !!k.ghost,
      stepped: !!k.stepped,
      decal: !!k.decal,
      sm: text(k.sm, 40),
      sb: text(k.sb, 40),
      st: text(k.st, 40),
    });
  });
  return { meta, keys };
}

export function importAny(textInput: string): Layout {
  let data: unknown;
  try {
    data = parseRelaxed(textInput);
  } catch {
    throw new LayoutParseError("That file is not valid JSON");
  }
  if (Array.isArray(data)) return sanitizeLayout(parseKleText(textInput));
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.keys)) return sanitizeLayout(o);
    if (Array.isArray(o.layout)) return sanitizeLayout(parseKle(o.layout));
  }
  throw new LayoutParseError("Unrecognised layout format");
}

export function bounds(keys: Key[]) {
  if (!keys.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const k of keys) {
    for (const [x, y] of keyCorners(k)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

export function keyCorners(k: Key): [number, number][] {
  const rects = [
    [k.x, k.y, k.w, k.h],
    [k.x + k.x2, k.y + k.y2, k.w2, k.h2],
  ];
  const a = (k.r * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const pts: [number, number][] = [];
  for (const [x, y, w, h] of rects) {
    for (const [px, py] of [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ]) {
      const dx = px - k.rx;
      const dy = py - k.ry;
      pts.push([k.rx + dx * cos - dy * sin, k.ry + dx * sin + dy * cos]);
    }
  }
  return pts;
}

export interface PreviewKey {
  x: number;
  y: number;
  w: number;
  h: number;
  x2?: number;
  y2?: number;
  w2?: number;
  h2?: number;
  r?: number;
  rx?: number;
  ry?: number;
  c: string;
}

export function toPreview(layout: Layout): { bg: string; keys: PreviewKey[] } {
  const keys = layout.keys.slice(0, 400).map((k) => {
    const p: PreviewKey = { x: round(k.x), y: round(k.y), w: k.w, h: k.h, c: k.color };
    if (k.x2 || k.y2 || k.w2 !== k.w || k.h2 !== k.h) Object.assign(p, { x2: k.x2, y2: k.y2, w2: k.w2, h2: k.h2 });
    if (k.r) Object.assign(p, { r: k.r, rx: k.rx, ry: k.ry });
    return p;
  });
  return { bg: layout.meta.backcolor, keys };
}

export function previewToLayout(p: { bg: string; keys: PreviewKey[] }): Layout {
  return {
    meta: newMeta({ backcolor: p.bg }),
    keys: p.keys.map((k) =>
      newKey({
        x: k.x,
        y: k.y,
        w: k.w,
        h: k.h,
        x2: k.x2 ?? 0,
        y2: k.y2 ?? 0,
        w2: k.w2 ?? k.w,
        h2: k.h2 ?? k.h,
        r: k.r ?? 0,
        rx: k.rx ?? 0,
        ry: k.ry ?? 0,
        color: k.c,
      }),
    ),
  };
}
