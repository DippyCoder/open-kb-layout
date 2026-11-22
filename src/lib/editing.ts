import { type Key, type Layout, bounds, cloneKey, keyCorners, newKey, sortKeys } from "./layout";

export function updateKeys(layout: Layout, indices: Iterable<number>, fn: (k: Key) => void): Layout {
  const set = new Set(indices);
  if (!set.size) return layout;
  return {
    meta: layout.meta,
    keys: layout.keys.map((k, i) => {
      if (!set.has(i)) return k;
      const c = cloneKey(k);
      fn(c);
      return c;
    }),
  };
}

export function common<T>(keys: Key[], get: (k: Key) => T): T | undefined {
  if (!keys.length) return undefined;
  const first = get(keys[0]);
  for (let i = 1; i < keys.length; i++) if (get(keys[i]) !== first) return undefined;
  return first;
}

const rot = (x: number, y: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

export function keyCenter(k: Key): [number, number] {
  const [dx, dy] = rot(k.x + k.w / 2 - k.rx, k.y + k.h / 2 - k.ry, k.r);
  return [k.rx + dx, k.ry + dy];
}

export function moveKeys(
  orig: Key[],
  indices: number[],
  primary: number,
  dx: number,
  dy: number,
  grid: number,
): Map<number, { x: number; y: number }> {
  const p = orig[primary];
  let sdx = dx;
  let sdy = dy;
  if (grid > 0 && p) {
    const [lx, ly] = rot(dx, dy, -p.r);
    const nx = Math.round((p.x + lx) / grid) * grid - p.x;
    const ny = Math.round((p.y + ly) / grid) * grid - p.y;
    [sdx, sdy] = rot(nx, ny, p.r);
  }
  const out = new Map<number, { x: number; y: number }>();
  for (const i of indices) {
    const k = orig[i];
    const [lx, ly] = rot(sdx, sdy, -k.r);
    out.set(i, { x: round4(k.x + lx), y: round4(k.y + ly) });
  }
  return out;
}

export const round4 = (v: number) => Math.round(v * 10000) / 10000;

export function keysInRect(keys: Key[], x0: number, y0: number, x1: number, y1: number): number[] {
  const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0];
  const out: number[] = [];
  keys.forEach((k, i) => {
    const [cx, cy] = keyCenter(k);
    if (cx >= ax && cx <= bx && cy >= ay && cy <= by) out.push(i);
  });
  return out;
}

export function readingOrder(keys: Key[]): number[] {
  const sorted = sortKeys(keys);
  return sorted.map((k) => keys.indexOf(k));
}

export function nextKeyPosition(layout: Layout, selected: number[]): Partial<Key> {
  if (selected.length) {
    const last = layout.keys[selected[selected.length - 1]];
    return { x: last.x + last.w, y: last.y, r: last.r, rx: last.rx, ry: last.ry, color: last.color, defaultTextColor: last.defaultTextColor, profile: last.profile };
  }
  if (!layout.keys.length) return { x: 0, y: 0 };
  const b = bounds(layout.keys.filter((k) => !k.r));
  const plain = layout.keys.filter((k) => !k.r);
  return { x: 0, y: plain.length ? b.maxY : 0 };
}

export function addKey(layout: Layout, selected: number[]): { layout: Layout; index: number } {
  const k = newKey(nextKeyPosition(layout, selected));
  return { layout: { meta: layout.meta, keys: [...layout.keys, k] }, index: layout.keys.length };
}

export function removeKeys(layout: Layout, indices: Set<number>): Layout {
  return { meta: layout.meta, keys: layout.keys.filter((_, i) => !indices.has(i)) };
}

export function insertKeys(layout: Layout, keys: Key[]): { layout: Layout; indices: number[] } {
  const start = layout.keys.length;
  return {
    layout: { meta: layout.meta, keys: [...layout.keys, ...keys] },
    indices: keys.map((_, i) => start + i),
  };
}

export function offsetKeys(keys: Key[], dx: number, dy: number): Key[] {
  return keys.map((k) => {
    const c = cloneKey(k);
    c.x = round4(c.x + dx);
    c.y = round4(c.y + dy);
    if (c.r) {
      c.rx = round4(c.rx + dx);
      c.ry = round4(c.ry + dy);
    }
    return c;
  });
}

export type AlignMode = "left" | "right" | "top" | "bottom";

export function alignKeys(layout: Layout, indices: number[], mode: AlignMode): Layout {
  const ks = indices.map((i) => layout.keys[i]);
  if (ks.length < 2) return layout;
  const target =
    mode === "left"
      ? Math.min(...ks.map((k) => k.x))
      : mode === "right"
        ? Math.max(...ks.map((k) => k.x + k.w))
        : mode === "top"
          ? Math.min(...ks.map((k) => k.y))
          : Math.max(...ks.map((k) => k.y + k.h));
  return updateKeys(layout, indices, (k) => {
    if (mode === "left") k.x = target;
    else if (mode === "right") k.x = round4(target - k.w);
    else if (mode === "top") k.y = target;
    else k.y = round4(target - k.h);
  });
}

export function selectionBounds(layout: Layout, indices: number[]) {
  const pts = indices.flatMap((i) => keyCorners(layout.keys[i]));
  if (!pts.length) return null;
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxX: Math.max(...pts.map((p) => p[0])),
    maxY: Math.max(...pts.map((p) => p[1])),
  };
}
