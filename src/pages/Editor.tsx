import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useBlocker, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  ClipboardPaste,
  CopyPlus,
  Download,
  FileJson,
  FilePlus2,
  Image,
  LayoutTemplate,
  Maximize2,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { api, ApiError, loginUrl, type ForkInfo } from "../lib/api";
import { type Key, type Layout, LayoutParseError, bounds, importAny, kleRawText, newMeta, toNative } from "../lib/layout";
import { PRESETS, presetLayout } from "../lib/presets";
import {
  addKey,
  insertKeys,
  keysInRect,
  moveKeys,
  offsetKeys,
  readingOrder,
  removeKeys,
  round4,
  selectionBounds,
  updateKeys,
} from "../lib/editing";
import { downloadKle, downloadNative, downloadPng, downloadSvg, readFileText } from "../lib/files";
import { KeyboardView, U } from "../components/KeyboardView";
import { GithubIcon, Menu, Modal, Spinner, useApp } from "../components/ui";
import { EditorPanel, type Tab } from "./EditorPanel";

interface Doc {
  id: string | null;
  description: string;
  isPublic: boolean;
  fork: ForkInfo | null;
}

interface Draft {
  layout: ReturnType<typeof toNative>;
  doc: Doc;
}

const HISTORY_LIMIT = 300;
const GRIDS = [1, 0.25, 0.125, 0.05];

type Drag =
  | {
      mode: "move";
      pointerId: number;
      sx: number;
      sy: number;
      orig: Key[];
      indices: number[];
      primary: number;
      moved: boolean;
      collapseTo: number | null;
      toggleOff: number | null;
    }
  | { mode: "marquee"; pointerId: number; sx: number; sy: number; x: number; y: number; base: Set<number> };

function capture(el: Element | null, id: number) {
  try {
    el?.setPointerCapture(id);
  } catch {
    return;
  }
}

const draftKey = (path: string) => `okl:draft:${path}`;

function loadDraft(path: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(path));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function Editor() {
  const { id: routeId } = useParams();
  const [params] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const { user, toast } = useApp();

  const [layout, setLayoutState] = useState<Layout | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const past = useRef<Layout[]>([]);
  const future = useRef<Layout[]>([]);
  const lastCoalesce = useRef<{ key: string; t: number }>({ key: "", t: 0 });
  const [, setHistoryTick] = useState(0);

  const [doc, setDoc] = useState<Doc>({ id: null, description: "", isPublic: false, fork: null });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<Tab>("key");
  const [slot, setSlot] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(0.25);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [signInOpen, setSignInOpen] = useState(false);
  const [dropping, setDropping] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<Drag | null>(null);
  const frozenVb = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const clipboard = useRef<{ text: string; keys: Key[] } | null>(null);
  const pasteCount = useRef(0);
  const fitted = useRef(false);
  const skipLoad = useRef<string | null>(null);

  const path = loc.pathname + loc.search;

  const setLayout = useCallback((l: Layout) => {
    layoutRef.current = l;
    setLayoutState(l);
  }, []);

  const reset = useCallback(
    (l: Layout, d: Doc, isDirty = false) => {
      past.current = [];
      future.current = [];
      setLayout(l);
      setDoc(d);
      setDirty(isDirty);
      setSelected(new Set());
      fitted.current = false;
      setHistoryTick((t) => t + 1);
    },
    [setLayout],
  );

  const commit = useCallback(
    (next: Layout, coalesce = "") => {
      const cur = layoutRef.current;
      if (!cur || next === cur) return;
      const now = Date.now();
      const same = coalesce && lastCoalesce.current.key === coalesce && now - lastCoalesce.current.t < 1200;
      if (!same) {
        past.current.push(cur);
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
      }
      lastCoalesce.current = { key: coalesce, t: now };
      future.current = [];
      setLayout(next);
      setDirty(true);
      setHistoryTick((t) => t + 1);
    },
    [setLayout],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev || !layoutRef.current) return;
    future.current.push(layoutRef.current);
    lastCoalesce.current = { key: "", t: 0 };
    setLayout(prev);
    setSelected((s) => new Set([...s].filter((i) => i < prev.keys.length)));
    setDirty(true);
    setHistoryTick((t) => t + 1);
  }, [setLayout]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !layoutRef.current) return;
    past.current.push(layoutRef.current);
    lastCoalesce.current = { key: "", t: 0 };
    setLayout(next);
    setSelected((s) => new Set([...s].filter((i) => i < next.keys.length)));
    setDirty(true);
    setHistoryTick((t) => t + 1);
  }, [setLayout]);

  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    const from = params.get("from");
    const preset = params.get("preset");

    if (routeId && skipLoad.current === routeId) {
      skipLoad.current = null;
      return;
    }

    if (routeId) {
      setLayoutState(null);
      layoutRef.current = null;
      api
        .get(routeId)
        .then((r) => {
          if (cancelled) return;
          if (!r.isOwner) {
            nav(`/editor?from=${encodeURIComponent(routeId)}`, { replace: true });
            return;
          }
          const l = importAny(JSON.stringify(r.layout.data));
          l.meta.name = r.layout.title;
          reset(l, { id: r.layout.id, description: r.layout.description, isPublic: r.layout.public, fork: r.layout.forkedFrom ?? null });
        })
        .catch((e) => !cancelled && setLoadError(e.message));
      return () => {
        cancelled = true;
      };
    }

    const draft = loadDraft(path);
    if (draft) {
      try {
        reset(importAny(JSON.stringify(draft.layout)), { ...draft.doc, id: null }, true);
        return;
      } catch {
        localStorage.removeItem(draftKey(path));
      }
    }

    if (from) {
      setLayoutState(null);
      layoutRef.current = null;
      api
        .get(from)
        .then((r) => {
          if (cancelled) return;
          const l = importAny(JSON.stringify(r.layout.data));
          l.meta.name = `${r.layout.title} remix`.slice(0, 80);
          reset(l, {
            id: null,
            description: r.layout.description,
            isPublic: false,
            fork: { id: r.layout.id, title: r.layout.title, author: r.layout.author },
          });
        })
        .catch((e) => !cancelled && setLoadError(e.message));
      return () => {
        cancelled = true;
      };
    }

    if (preset === "blank") reset({ meta: newMeta({ name: "Untitled layout", backcolor: "#d9d8d2" }), keys: [] }, { id: null, description: "", isPublic: false, fork: null });
    else reset(presetLayout(preset ?? "60"), { id: null, description: "", isPublic: false, fork: null });
    return () => {
      cancelled = true;
    };
  }, [routeId, path]);

  useEffect(() => {
    if (!layout || doc.id || !dirty) return;
    const t = setTimeout(() => {
      try {
        const d: Draft = { layout: toNative(layout), doc };
        localStorage.setItem(draftKey(path), JSON.stringify(d));
      } catch {
        return;
      }
    }, 400);
    return () => clearTimeout(t);
  }, [layout, doc, dirty, path]);

  useEffect(() => {
    if (!dirty || !doc.id) return;
    const on = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", on);
    return () => window.removeEventListener("beforeunload", on);
  }, [dirty, doc.id]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !!doc.id && !saving && currentLocation.pathname !== nextLocation.pathname);

  const sel = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);

  const viewBox = useMemo(() => {
    if (frozenVb.current) return frozenVb.current;
    if (!layout) return { x: -1, y: -1, w: 20, h: 8 };
    const b = layout.keys.length ? bounds(layout.keys) : { minX: 0, minY: 0, maxX: 10, maxY: 4 };
    const x = Math.floor(Math.min(0, b.minX)) - 1;
    const y = Math.floor(Math.min(0, b.minY)) - 1;
    return { x, y, w: Math.max(Math.ceil(b.maxX) + 4, 12) - x, h: Math.max(Math.ceil(b.maxY) + 3, 6) - y };
  }, [layout]);

  const fit = useCallback(() => {
    const el = canvasRef.current;
    const l = layoutRef.current;
    if (!el || !l) return;
    const b = l.keys.length ? bounds(l.keys) : { minX: 0, minY: 0, maxX: 10, maxY: 4 };
    const w = (b.maxX - Math.min(0, b.minX) + 3) * U;
    const h = (b.maxY - Math.min(0, b.minY) + 3) * U;
    const z = Math.max(0.3, Math.min(2, (el.clientWidth - 32) / w, (el.clientHeight - 32) / h));
    setZoom(Math.round(z * 100) / 100);
    el.scrollTo({ left: 0, top: 0 });
  }, []);

  useEffect(() => {
    if (layout && !fitted.current) {
      fitted.current = true;
      requestAnimationFrame(fit);
    }
  }, [layout, fit]);

  const toUnits = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x / U, y: p.y / U };
  }, []);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const onKeyPointerDown = useCallback(
    (index: number, e: RPointerEvent<SVGGElement>) => {
      if (e.button !== 0 || !layoutRef.current) return;
      e.stopPropagation();
      capture(svgRef.current, e.pointerId);
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      const cur = selectedRef.current;
      let next = cur;
      let toggleOff: number | null = null;
      let collapseTo: number | null = null;
      if (additive) {
        if (cur.has(index)) toggleOff = index;
        else next = new Set([...cur, index]);
      } else if (!cur.has(index)) {
        next = new Set([index]);
      } else {
        collapseTo = index;
      }
      if (next !== cur) setSelected(next);
      setTab("key");
      const p = toUnits(e);
      frozenVb.current = null;
      drag.current = {
        mode: "move",
        pointerId: e.pointerId,
        sx: p.x,
        sy: p.y,
        orig: layoutRef.current.keys,
        indices: [...next],
        primary: index,
        moved: false,
        collapseTo,
        toggleOff,
      };
    },
    [toUnits],
  );

  const onBackgroundPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    capture(svgRef.current, e.pointerId);
    const p = toUnits(e);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const base = additive ? new Set(selected) : new Set<number>();
    if (!additive) setSelected(base);
    drag.current = { mode: "marquee", pointerId: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y, base };
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || !layoutRef.current) return;
    const p = toUnits(e);
    if (d.mode === "move") {
      const dx = p.x - d.sx;
      const dy = p.y - d.sy;
      if (!d.moved) {
        if (Math.hypot(dx, dy) * U * zoom < 4) return;
        d.moved = true;
        frozenVb.current = viewBox;
        past.current.push(layoutRef.current);
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
        future.current = [];
        lastCoalesce.current = { key: "", t: 0 };
        setHistoryTick((t) => t + 1);
        setDirty(true);
      }
      const pos = moveKeys(d.orig, d.indices, d.primary, dx, dy, e.altKey ? 0 : grid);
      setLayout({
        meta: layoutRef.current.meta,
        keys: d.orig.map((k, i) => {
          const np = pos.get(i);
          return np ? { ...k, x: np.x, y: np.y } : layoutRef.current!.keys[i] ?? k;
        }),
      });
    } else {
      d.x = p.x;
      d.y = p.y;
      setMarquee({ x: Math.min(d.sx, p.x), y: Math.min(d.sy, p.y), w: Math.abs(p.x - d.sx), h: Math.abs(p.y - d.sy) });
      const hit = keysInRect(layoutRef.current.keys, d.sx, d.sy, p.x, p.y);
      setSelected(new Set([...d.base, ...hit]));
    }
  };

  const endDrag = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.mode === "move") {
      if (!d.moved) {
        if (d.toggleOff !== null) {
          const n = new Set(selectedRef.current);
          n.delete(d.toggleOff);
          setSelected(n);
        } else if (d.collapseTo !== null) setSelected(new Set([d.collapseTo]));
      }
      frozenVb.current = null;
      if (layoutRef.current) setLayout({ ...layoutRef.current });
    } else {
      setMarquee(null);
    }
  };

  const selectAll = () => layout && setSelected(new Set(layout.keys.map((_, i) => i)));

  const doAdd = () => {
    if (!layout) return;
    const r = addKey(layout, sel);
    commit(r.layout);
    setSelected(new Set([r.index]));
    setTab("key");
  };

  const doDelete = () => {
    if (!layout || !selected.size) return;
    commit(removeKeys(layout, selected));
    setSelected(new Set());
  };

  const doDuplicate = () => {
    if (!layout || !sel.length) return;
    const b = selectionBounds(layout, sel);
    const dy = b ? round4(b.maxY - b.minY) : 1;
    const r = insertKeys(layout, offsetKeys(sel.map((i) => layout.keys[i]), 0, dy || 1));
    commit(r.layout);
    setSelected(new Set(r.indices));
  };

  const doRotate = (deg: number) => {
    if (!layout || !sel.length) return;
    const b = selectionBounds(layout, sel)!;
    const shared = sel.every((i) => layout.keys[i].rx === layout.keys[sel[0]].rx && layout.keys[i].ry === layout.keys[sel[0]].ry && layout.keys[i].r);
    const cx = round4(shared ? layout.keys[sel[0]].rx : b.minX);
    const cy = round4(shared ? layout.keys[sel[0]].ry : b.minY);
    commit(
      updateKeys(layout, sel, (k) => {
        if (!k.r && (k.rx !== cx || k.ry !== cy)) {
          k.rx = cx;
          k.ry = cy;
        }
        k.r = round4(((k.r + deg + 540) % 360) - 180);
      }),
      "rotate",
    );
  };

  const stepSelection = (dir: 1 | -1) => {
    if (!layout || !layout.keys.length) return;
    const order = readingOrder(layout.keys);
    const curIdx = sel.length ? order.indexOf(sel[sel.length - 1]) : -1;
    const next = order[(curIdx + dir + order.length) % order.length];
    setSelected(new Set([next]));
    setTab("key");
  };

  const applyImport = (text: string, label: string) => {
    try {
      const l = importAny(text);
      const cur = layoutRef.current;
      commit({ meta: { ...l.meta, name: l.meta.name || cur?.meta.name || "Imported layout" }, keys: l.keys });
      setSelected(new Set());
      fitted.current = false;
      toast(`Imported ${l.keys.length} keys from ${label}`, "ok");
      return true;
    } catch (e) {
      toast(e instanceof LayoutParseError ? e.message : "Could not import that data", "err");
      return false;
    }
  };

  const importFile = async (file: File) => {
    try {
      applyImport(await readFileText(file), file.name);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const save = useCallback(async () => {
    const l = layoutRef.current;
    if (!l || saving) return;
    if (!user) {
      try {
        localStorage.setItem(draftKey(path), JSON.stringify({ layout: toNative(l), doc }));
      } catch {
        setSignInOpen(true);
        return;
      }
      setSignInOpen(true);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: l.meta.name.trim() || "Untitled layout",
        description: doc.description,
        public: doc.isPublic,
        layout: toNative(l),
      };
      if (doc.id) {
        await api.update(doc.id, payload);
        setDirty(false);
        toast("Saved", "ok");
      } else {
        const r = await api.create({ ...payload, forkedFrom: doc.fork?.id });
        localStorage.removeItem(draftKey(path));
        setDirty(false);
        toast(doc.fork ? `Saved your remix of ${doc.fork.title}` : "Saved to your layouts", "ok");
        setDoc((d) => ({ ...d, id: r.layout.id, fork: r.layout.forkedFrom ?? null }));
        skipLoad.current = r.layout.id;
        nav(`/editor/${r.layout.id}`, { replace: true });
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not save", "err");
    } finally {
      setSaving(false);
    }
  }, [user, saving, doc, path, nav, toast]);

  useEffect(() => {
    const isField = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
        return;
      }
      if (isField(e.target) || document.querySelector("dialog[open]")) return;
      const l = layoutRef.current;
      if (!l) return;
      const k = e.key;
      if (mod && k.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && k.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && k.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      } else if (mod && k.toLowerCase() === "d") {
        e.preventDefault();
        doDuplicate();
      } else if (k === "Delete" || k === "Backspace") {
        e.preventDefault();
        doDelete();
      } else if (k === "Escape") {
        setSelected(new Set());
      } else if (k === "[" || k === "]") {
        stepSelection(k === "]" ? 1 : -1);
      } else if (k === "Insert" || (!mod && k.toLowerCase() === "n")) {
        e.preventDefault();
        doAdd();
      } else if (k.startsWith("Arrow") && sel.length) {
        e.preventDefault();
        const step = grid || 0.25;
        const dx = k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0;
        const dy = k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0;
        if (e.shiftKey) {
          commit(
            updateKeys(l, sel, (key) => {
              const nw = Math.max(0.25, round4(key.w + dx));
              const nh = Math.max(0.25, round4(key.h + dy));
              if (key.w2 === key.w) key.w2 = nw;
              if (key.h2 === key.h) key.h2 = nh;
              key.w = nw;
              key.h = nh;
            }),
            "arrow-resize",
          );
        } else {
          commit(
            updateKeys(l, sel, (key) => {
              key.x = round4(key.x + dx);
              key.y = round4(key.y + dy);
            }),
            "arrow-move",
          );
        }
      }
    };
    const onCopy = (e: ClipboardEvent) => {
      if (isField(e.target) || !layoutRef.current || !sel.length) return;
      const keys = sel.map((i) => layoutRef.current!.keys[i]);
      const text = kleRawText({ meta: newMeta(), keys });
      clipboard.current = { text, keys };
      pasteCount.current = 0;
      e.clipboardData?.setData("text/plain", text);
      e.preventDefault();
      if (e.type === "cut") doDelete();
      else toast(`Copied ${keys.length} key${keys.length === 1 ? "" : "s"}`, "info");
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isField(e.target) || !layoutRef.current) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      let keys: Key[] | null = null;
      if (clipboard.current && text === clipboard.current.text) keys = clipboard.current.keys;
      else if (text.trim()) {
        try {
          keys = importAny(text).keys;
        } catch {
          keys = null;
        }
      }
      if (!keys?.length) return;
      e.preventDefault();
      pasteCount.current += 1;
      const off = 0.5 * pasteCount.current;
      const r = insertKeys(layoutRef.current, offsetKeys(keys, off, off));
      commit(r.layout);
      setSelected(new Set(r.indices));
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.max(0.25, Math.min(3, Math.round(z * Math.exp(-e.deltaY * 0.002) * 100) / 100)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [layout === null]);

  if (loadError)
    return (
      <section className="wrap empty-page">
        <h1 className="h1">Could not open this layout</h1>
        <p className="lead">{loadError}</p>
        <button className="btn primary" onClick={() => nav("/editor")}>
          Start a new layout
        </button>
      </section>
    );

  if (!layout)
    return (
      <div className="editor-loading">
        <Spinner />
      </div>
    );

  const status = saving ? "Saving" : doc.id ? (dirty ? "Unsaved changes" : "Saved") : dirty ? "Draft in this browser" : "Not saved";

  return (
    <div className="editor">
      <div className="ed-bar glass">
        <div className="ed-title">
          <input
            className="title-input"
            value={layout.meta.name}
            placeholder="Untitled layout"
            maxLength={80}
            aria-label="Layout name"
            onChange={(e) => commit({ meta: { ...layout.meta, name: e.target.value }, keys: layout.keys }, "name")}
          />
          <span className={`save-state${dirty ? " dirty" : ""}`}>{status}</span>
        </div>
        <div className="ed-tools" role="toolbar" aria-label="Editing tools">
          <button className="btn sm icon ghost" onClick={doAdd} title="Add key (N)" aria-label="Add key">
            <Plus />
          </button>
          <button className="btn sm icon ghost" onClick={doDuplicate} disabled={!sel.length} title="Duplicate (Ctrl+D)" aria-label="Duplicate">
            <CopyPlus />
          </button>
          <button className="btn sm icon ghost" onClick={doDelete} disabled={!sel.length} title="Delete (Del)" aria-label="Delete">
            <Trash2 />
          </button>
          <button className="btn sm icon ghost" onClick={() => doRotate(-15)} disabled={!sel.length} title="Rotate -15 degrees" aria-label="Rotate left">
            <RotateCcw />
          </button>
          <button className="btn sm icon ghost" onClick={() => doRotate(15)} disabled={!sel.length} title="Rotate 15 degrees" aria-label="Rotate right">
            <RotateCw />
          </button>
          <span className="vsep" />
          <button className="btn sm icon ghost" onClick={undo} disabled={!past.current.length} title="Undo (Ctrl+Z)" aria-label="Undo">
            <Undo2 />
          </button>
          <button className="btn sm icon ghost" onClick={redo} disabled={!future.current.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            <Redo2 />
          </button>
          <span className="vsep" />
          <Menu
            label="Templates"
            trigger={(p) => (
              <button className="btn sm ghost" {...p}>
                <LayoutTemplate /> <span className="txt">Templates</span> <ChevronDown className="ic chev" />
              </button>
            )}
          >
            {(close) => (
              <>
                <button
                  className="opt"
                  onClick={() => {
                    close();
                    commit({ meta: { ...layout.meta }, keys: [] });
                    setSelected(new Set());
                  }}
                >
                  <FilePlus2 /> Blank canvas
                </button>
                <div className="sep" />
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className="opt"
                    onClick={() => {
                      close();
                      const pl = presetLayout(p.id);
                      commit({ meta: { ...layout.meta, backcolor: pl.meta.backcolor }, keys: pl.keys });
                      setSelected(new Set());
                      fitted.current = false;
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </>
            )}
          </Menu>
          <Menu
            label="Import"
            trigger={(p) => (
              <button className="btn sm ghost" {...p}>
                <Upload /> <span className="txt">Import</span> <ChevronDown className="ic chev" />
              </button>
            )}
          >
            {(close) => (
              <>
                <button
                  className="opt"
                  onClick={() => {
                    close();
                    fileRef.current?.click();
                  }}
                >
                  <FileJson /> Open JSON file
                </button>
                <button
                  className="opt"
                  onClick={() => {
                    close();
                    setPasteText("");
                    setPasteOpen(true);
                  }}
                >
                  <ClipboardPaste /> Paste JSON or KLE raw data
                </button>
              </>
            )}
          </Menu>
          <Menu
            label="Export"
            trigger={(p) => (
              <button className="btn sm ghost" {...p}>
                <Download /> <span className="txt">Export</span> <ChevronDown className="ic chev" />
              </button>
            )}
          >
            {(close) => (
              <>
                <button className="opt" onClick={() => { close(); downloadNative(layout); }}>
                  <FileJson /> JSON
                </button>
                <button className="opt" onClick={() => { close(); downloadKle(layout); }}>
                  <FileJson /> KLE JSON
                </button>
                <button className="opt" onClick={() => { close(); exportImage("png"); }}>
                  <Image /> PNG image
                </button>
                <button className="opt" onClick={() => { close(); exportImage("svg"); }}>
                  <Image /> SVG image
                </button>
              </>
            )}
          </Menu>
        </div>
        <div className="ed-right">
          <div className="zoom">
            <button className="btn sm icon ghost" onClick={() => setZoom((z) => Math.max(0.25, round4(z - 0.1)))} aria-label="Zoom out">
              <ZoomOut />
            </button>
            <button className="zoom-val" onClick={fit} title="Fit to window">
              {Math.round(zoom * 100)}%
            </button>
            <button className="btn sm icon ghost" onClick={() => setZoom((z) => Math.min(3, round4(z + 0.1)))} aria-label="Zoom in">
              <ZoomIn />
            </button>
            <button className="btn sm icon ghost" onClick={fit} aria-label="Fit to window" title="Fit to window">
              <Maximize2 />
            </button>
          </div>
          <button className="btn sm primary" onClick={save} disabled={saving} title="Save (Ctrl+S)">
            {saving ? <span className="ld-ring sm" /> : <Save />}
            <span className="txt">{doc.id ? "Save" : doc.fork ? "Save remix" : "Save"}</span>
          </button>
        </div>
      </div>

      <div className="ed-main">
        <div
          className={`canvas${dropping ? " over" : ""}`}
          ref={canvasRef}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDropping(true);
            }
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropping(false);
            const f = e.dataTransfer.files[0];
            if (f) importFile(f);
          }}
        >
          <KeyboardView
            ref={svgRef}
            layout={layout}
            selected={selected}
            viewBox={viewBox}
            width={viewBox.w * U * zoom}
            height={viewBox.h * U * zoom}
            className="ed-svg"
            onKeyPointerDown={onKeyPointerDown}
            onBackgroundPointerDown={onBackgroundPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            title={layout.meta.name}
            underlay={
              <g data-editor-only="1">
                <defs>
                  <pattern id="grid-minor" width={U / 4} height={U / 4} patternUnits="userSpaceOnUse">
                    <path d={`M ${U / 4} 0 L 0 0 0 ${U / 4}`} className="grid-minor" />
                  </pattern>
                  <pattern id="grid-major" width={U} height={U} patternUnits="userSpaceOnUse">
                    <rect width={U} height={U} fill="url(#grid-minor)" />
                    <path d={`M ${U} 0 L 0 0 0 ${U}`} className="grid-major" />
                  </pattern>
                </defs>
                <rect x={viewBox.x * U} y={viewBox.y * U} width={viewBox.w * U} height={viewBox.h * U} fill="url(#grid-major)" />
              </g>
            }
          >
            {marquee && (
              <rect
                className="marquee"
                x={marquee.x * U}
                y={marquee.y * U}
                width={marquee.w * U}
                height={marquee.h * U}
              />
            )}
          </KeyboardView>
        </div>
        <EditorPanel
          layout={layout}
          selected={sel}
          commit={commit}
          slot={slot}
          setSlot={setSlot}
          tab={tab}
          setTab={setTab}
          toast={toast}
          description={doc.description}
          setDescription={(v) => {
            setDoc((d) => ({ ...d, description: v }));
            setDirty(true);
          }}
          isPublic={doc.isPublic}
          setPublic={(v) => {
            setDoc((d) => ({ ...d, isPublic: v }));
            setDirty(true);
          }}
          user={user}
          fork={doc.fork}
          docId={doc.id}
        />
      </div>

      <div className="ed-status">
        <span>
          {layout.keys.length} keys{sel.length ? `, ${sel.length} selected` : ""}
        </span>
        <span className="row gap-s">
          <span className="dim">Snap</span>
          <span className="seg mini" role="radiogroup" aria-label="Grid snapping">
            {GRIDS.map((g) => (
              <button key={g} role="radio" aria-checked={grid === g} onClick={() => setGrid(g)}>
                {g}u
              </button>
            ))}
          </span>
        </span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,.txt,application/json,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f);
          e.target.value = "";
        }}
      />

      <Modal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Paste layout data"
        wide
        actions={
          <>
            <button className="btn ghost" onClick={() => setPasteOpen(false)}>
              Cancel
            </button>
            <button
              className="btn primary"
              disabled={!pasteText.trim()}
              onClick={() => {
                if (applyImport(pasteText, "pasted data")) setPasteOpen(false);
              }}
            >
              Import
            </button>
          </>
        }
      >
        <p className="muted small">
          Paste a JSON export from this site, a downloaded keyboard-layout-editor.com JSON file, or the contents of the KLE
          Raw data tab. It replaces the current layout, and you can undo it.
        </p>
        <span className="input ta">
          <textarea className="mono" rows={10} value={pasteText} onChange={(e) => setPasteText(e.target.value)} spellCheck={false} autoFocus />
        </span>
      </Modal>

      <Modal
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        title="Sign in to save"
        actions={
          <>
            <button className="btn ghost" onClick={() => setSignInOpen(false)}>
              Keep editing
            </button>
            <a className="btn primary" href={loginUrl(path)}>
              <GithubIcon /> Sign in with GitHub
            </a>
          </>
        }
      >
        <p className="muted">
          Layouts are saved to your account. Your work stays in this browser as a draft and will be here when you come back.
        </p>
      </Modal>

      <Modal
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        actions={
          <>
            <button className="btn ghost" onClick={() => blocker.reset?.()}>
              Stay
            </button>
            <button className="btn danger-solid" onClick={() => blocker.proceed?.()}>
              Discard changes
            </button>
          </>
        }
      >
        <p className="muted">You have unsaved changes to this layout.</p>
      </Modal>
    </div>
  );

  function exportImage(kind: "png" | "svg") {
    const s = svgRef.current;
    if (!s || !layout) return;
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-99999px;top:0";
    document.body.appendChild(holder);
    const clone = s.cloneNode(true) as SVGSVGElement;
    const b = bounds(layout.keys);
    const pad = 0.3;
    clone.setAttribute("viewBox", `${(b.minX - pad) * U} ${(b.minY - pad) * U} ${(b.maxX - b.minX + pad * 2) * U} ${(b.maxY - b.minY + pad * 2) * U}`);
    holder.appendChild(clone);
    const name = layout.meta.name || "layout";
    const done = () => holder.remove();
    if (kind === "svg") {
      downloadSvg(clone, name);
      done();
    } else downloadPng(clone, name).finally(done);
  }
}
