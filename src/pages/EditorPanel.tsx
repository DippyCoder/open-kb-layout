import { useEffect, useRef, useState } from "react";
import {
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Copy,
  GitFork,
  Globe,
  Lock,
} from "lucide-react";
import { Link } from "react-router-dom";
import { type Key, type Layout, LayoutParseError, kleRawText, parseKleText, sanitizeLayout } from "../lib/layout";
import { type AlignMode, alignKeys, common, round4, updateKeys } from "../lib/editing";
import type { ForkInfo, User } from "../lib/api";
import { loginUrl } from "../lib/api";

export type Commit = (next: Layout, coalesce?: string) => void;
export type Tab = "key" | "layout" | "raw";

const SWATCHES = [
  "#f5f5f0", "#ecebe6", "#cccccc", "#9a9aa0", "#45464d", "#232326", "#111111",
  "#e0603f", "#e8a33d", "#e6d34a", "#6fbf73", "#3e9fd6", "#5b6ad0", "#b05ad0",
];
const PROFILES = ["", "DCS", "DSA", "SA", "OEM", "CHERRY", "MT3", "FLAT"];
const WIDTHS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.75, 3, 6.25, 7];
const SLOT_NAMES = [
  "Top left", "Top center", "Top right",
  "Center left", "Center", "Center right",
  "Bottom left", "Bottom center", "Bottom right",
  "Front left", "Front center", "Front right",
];

const fmt = (v: number | undefined) => (v === undefined ? "" : String(round4(v)));

function NumField({
  label,
  value,
  onChange,
  step = 0.25,
  min = -1000,
  max = 1000,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
  }, [value]);
  const apply = (v: number) => onChange(Math.max(min, Math.min(max, round4(v))));
  return (
    <label className="nf">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={text}
        placeholder={value === undefined ? "Mixed" : ""}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          setText(fmt(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) apply(v);
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const base = value ?? 0;
          const s = e.shiftKey ? step * 4 : step;
          const v = round4(base + (e.key === "ArrowUp" ? s : -s));
          setText(fmt(v));
          apply(v);
        }}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
  allowEmpty,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  allowEmpty?: string;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  const six = (v: string) => (/^#[0-9a-f]{3}$/i.test(v) ? "#" + v.slice(1).split("").map((c) => c + c).join("") : v.slice(0, 7));
  return (
    <div className="cf">
      <span className="label">{label}</span>
      <div className="cf-row">
        <label className="cf-swatch" style={{ background: value || "transparent" }}>
          <input
            type="color"
            value={six(value || "#000000")}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label} picker`}
          />
        </label>
        <input
          className="cf-text"
          value={text}
          placeholder={value === undefined ? "Mixed" : allowEmpty ?? ""}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) || (allowEmpty !== undefined && v === "")) onChange(v);
          }}
          aria-label={`${label} hex`}
        />
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={!!value}
        ref={(el) => {
          if (el) el.indeterminate = value === undefined;
        }}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="box" aria-hidden>
        <svg viewBox="0 0 16 16">
          <path className="p-check" d="M3.5 8.5l3 3 6-7" />
          <path className="p-dash" d="M4 8h8" />
        </svg>
      </span>
      <span>{label}</span>
    </label>
  );
}

interface KeyPanelProps {
  layout: Layout;
  selected: number[];
  commit: Commit;
  slot: number;
  setSlot: (n: number) => void;
}

function KeyPanel({ layout, selected, commit, slot, setSlot }: KeyPanelProps) {
  const keys = selected.map((i) => layout.keys[i]).filter(Boolean);
  if (!keys.length)
    return (
      <div className="panel-empty">
        <p className="muted">Select a key to edit it.</p>
        <ul className="tips small dim">
          <li><span className="kbd">Click</span> select, <span className="kbd">Shift</span> add to selection</li>
          <li>Drag on empty space to box select</li>
          <li><span className="kbd">Arrows</span> move, <span className="kbd">Shift</span>+<span className="kbd">Arrows</span> resize</li>
          <li><span className="kbd">Alt</span> while dragging turns off snapping</li>
          <li><span className="kbd">Ctrl</span>+<span className="kbd">D</span> duplicate, <span className="kbd">Del</span> delete</li>
          <li><span className="kbd">[</span> <span className="kbd">]</span> previous and next key</li>
          <li>Drop a JSON file on the canvas to import it</li>
        </ul>
      </div>
    );

  const set = (fn: (k: Key) => void, key: string) => commit(updateKeys(layout, selected, fn), key);
  const g = <T,>(f: (k: Key) => T) => common(keys, f);
  const hasSecond = keys.some((k) => k.x2 || k.y2 || k.w2 !== k.w || k.h2 !== k.h);

  return (
    <div className="panel-body">
      <section className="psec">
        <div className="psec-h">
          <span className="cap">Labels</span>
          <span className="dim small">{SLOT_NAMES[slot]}</span>
        </div>
        <div className="label-grid">
          {Array.from({ length: 12 }, (_, i) => {
            const v = g((k) => k.labels[i]);
            return (
              <input
                key={i}
                className={`lg-cell${i >= 9 ? " front" : ""}${slot === i ? " on" : ""}`}
                value={v ?? ""}
                placeholder={v === undefined ? "Mixed" : ""}
                aria-label={`${SLOT_NAMES[i]} label`}
                onFocus={() => setSlot(i)}
                onChange={(e) => {
                  const val = e.target.value;
                  set((k) => {
                    k.labels[i] = val;
                  }, `label-${i}`);
                }}
              />
            );
          })}
        </div>
        <div className="two">
          <ColorField
            label="Label color"
            value={g((k) => k.textColor[slot])}
            allowEmpty="Default"
            onChange={(v) => set((k) => void (k.textColor[slot] = v), `tc-${slot}`)}
          />
          <NumField
            label="Label size"
            value={g((k) => k.textSize[slot] || k.defaultTextSize)}
            step={1}
            min={1}
            max={9}
            onChange={(v) => set((k) => void (k.textSize[slot] = v === k.defaultTextSize ? 0 : v), `ts-${slot}`)}
          />
        </div>
      </section>

      <section className="psec">
        <span className="cap">Keycap</span>
        <ColorField label="Keycap color" value={g((k) => k.color)} onChange={(v) => set((k) => void (k.color = v), "color")} />
        <div className="swatches">
          {SWATCHES.map((c) => (
            <button
              key={c}
              className="sw"
              style={{ background: c }}
              aria-label={`Keycap color ${c}`}
              onClick={() => set((k) => void (k.color = c), "")}
            />
          ))}
        </div>
        <div className="two">
          <ColorField label="Text color" value={g((k) => k.defaultTextColor)} onChange={(v) => set((k) => void (k.defaultTextColor = v), "dtc")} />
          <NumField label="Text size" value={g((k) => k.defaultTextSize)} step={1} min={1} max={9} onChange={(v) => set((k) => void (k.defaultTextSize = v), "dts")} />
        </div>
        <label className="sel-field">
          <span className="label">Profile</span>
          <select
            className="input select-native"
            value={g((k) => k.profile) ?? ""}
            onChange={(e) => set((k) => void (k.profile = e.target.value), "")}
          >
            {g((k) => k.profile) === undefined && <option value="">Mixed</option>}
            {PROFILES.map((p) => (
              <option key={p} value={p}>
                {p || "Default"}
              </option>
            ))}
          </select>
        </label>
        <div className="toggles">
          <Toggle label="Homing nub" value={g((k) => k.nub)} onChange={(v) => set((k) => void (k.nub = v), "")} />
          <Toggle label="Stepped" value={g((k) => k.stepped)} onChange={(v) => set((k) => void (k.stepped = v), "")} />
          <Toggle label="Ghosted" value={g((k) => k.ghost)} onChange={(v) => set((k) => void (k.ghost = v), "")} />
          <Toggle label="Decal" value={g((k) => k.decal)} onChange={(v) => set((k) => void (k.decal = v), "")} />
          <Toggle label="Knob" value={g((k) => k.knob)} onChange={(v) => set((k) => void (k.knob = v), "")} />
        </div>
      </section>

      <section className="psec">
        <span className="cap">Size and position</span>
        <div className="four">
          <NumField label="X" value={g((k) => k.x)} onChange={(v) => set((k) => void (k.x = v), "x")} />
          <NumField label="Y" value={g((k) => k.y)} onChange={(v) => set((k) => void (k.y = v), "y")} />
          <NumField
            label="W"
            value={g((k) => k.w)}
            min={0.25}
            max={100}
            onChange={(v) =>
              set((k) => {
                if (k.w2 === k.w) k.w2 = v;
                k.w = v;
              }, "w")
            }
          />
          <NumField
            label="H"
            value={g((k) => k.h)}
            min={0.25}
            max={100}
            onChange={(v) =>
              set((k) => {
                if (k.h2 === k.h) k.h2 = v;
                k.h = v;
              }, "h")
            }
          />
        </div>
        <div className="chips">
          {WIDTHS.map((w) => (
            <button
              key={w}
              className="chip"
              aria-pressed={g((k) => k.w) === w && !hasSecond}
              onClick={() =>
                set((k) => {
                  k.w = k.w2 = w;
                  k.h = k.h2 = 1;
                  k.x2 = k.y2 = 0;
                }, "")
              }
            >
              {w}u
            </button>
          ))}
          <button
            className="chip"
            onClick={() =>
              set((k) => {
                Object.assign(k, { w: 1.25, h: 2, x2: -0.25, y2: 0, w2: 1.5, h2: 1 });
              }, "")
            }
          >
            ISO Enter
          </button>
          <button
            className="chip"
            onClick={() =>
              set((k) => {
                Object.assign(k, { w: 1.5, h: 2, x2: -0.75, y2: 1, w2: 2.25, h2: 1 });
              }, "")
            }
          >
            Big Enter
          </button>
          <button
            className="chip"
            onClick={() =>
              set((k) => {
                Object.assign(k, { w: 1.75, h: 1, x2: 0, y2: 0, w2: 1.25, h2: 1, stepped: true });
              }, "")
            }
          >
            Stepped Caps
          </button>
        </div>
        <details className="sub" open={hasSecond}>
          <summary>Second rectangle</summary>
          <div className="four">
            <NumField label="X2" value={g((k) => k.x2)} onChange={(v) => set((k) => void (k.x2 = v), "x2")} />
            <NumField label="Y2" value={g((k) => k.y2)} onChange={(v) => set((k) => void (k.y2 = v), "y2")} />
            <NumField label="W2" value={g((k) => k.w2)} min={0.25} max={100} onChange={(v) => set((k) => void (k.w2 = v), "w2")} />
            <NumField label="H2" value={g((k) => k.h2)} min={0.25} max={100} onChange={(v) => set((k) => void (k.h2 = v), "h2")} />
          </div>
        </details>
      </section>

      <section className="psec">
        <span className="cap">Rotation</span>
        <div className="three">
          <NumField label="Angle" value={g((k) => k.r)} step={5} min={-360} max={360} onChange={(v) => set((k) => void (k.r = v), "r")} />
          <NumField label="Center X" value={g((k) => k.rx)} onChange={(v) => set((k) => void (k.rx = v), "rx")} />
          <NumField label="Center Y" value={g((k) => k.ry)} onChange={(v) => set((k) => void (k.ry = v), "ry")} />
        </div>
        <button
          className="btn sm ghost"
          onClick={() =>
            set((k) => {
              k.rx = k.x;
              k.ry = k.y;
            }, "")
          }
        >
          Rotate around top left corner
        </button>
      </section>

      {keys.length > 1 && (
        <section className="psec">
          <span className="cap">Align {keys.length} keys</span>
          <div className="row">
            {(
              [
                ["left", AlignStartVertical, "Align left edges"],
                ["right", AlignEndVertical, "Align right edges"],
                ["top", AlignStartHorizontal, "Align top edges"],
                ["bottom", AlignEndHorizontal, "Align bottom edges"],
              ] as [AlignMode, typeof AlignStartVertical, string][]
            ).map(([mode, Icon, label]) => (
              <button key={mode} className="btn sm icon" aria-label={label} title={label} onClick={() => commit(alignKeys(layout, selected, mode))}>
                <Icon />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

interface LayoutPanelProps {
  layout: Layout;
  commit: Commit;
  description: string;
  setDescription: (v: string) => void;
  isPublic: boolean;
  setPublic: (v: boolean) => void;
  user: User | null;
  fork: ForkInfo | null;
  docId: string | null;
}

function LayoutPanel({ layout, commit, description, setDescription, isPublic, setPublic, user, fork, docId }: LayoutPanelProps) {
  const setMeta = (patch: Partial<Layout["meta"]>, key: string) => commit({ meta: { ...layout.meta, ...patch }, keys: layout.keys }, key);
  return (
    <div className="panel-body">
      <section className="psec">
        <label className="ctl">
          <span className="label">Name</span>
          <span className="input">
            <input value={layout.meta.name} maxLength={80} placeholder="Untitled layout" onChange={(e) => setMeta({ name: e.target.value }, "name")} />
          </span>
        </label>
        <label className="ctl">
          <span className="label">Description</span>
          <span className="input ta">
            <textarea value={description} maxLength={500} rows={3} placeholder="What is this layout for?" onChange={(e) => setDescription(e.target.value)} />
          </span>
        </label>
        {user ? (
          <label className="switch">
            <input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />
            <span className="track" aria-hidden>
              <span className="knob" />
            </span>
            <span className="stack-xs">
              <span className="row gap-s">
                {isPublic ? <Globe className="ic" /> : <Lock className="ic" />}
                {isPublic ? "Public" : "Private"}
              </span>
              <span className="dim small">{isPublic ? "Listed on Discover, anyone can view and remix" : "Only you can see it"}</span>
            </span>
          </label>
        ) : (
          <p className="dim small">
            <a href={loginUrl()}>Sign in</a> to save this layout and share it.
          </p>
        )}
        {fork && (
          <p className="credit small">
            <GitFork className="ic" /> Remix of <Link to={`/l/${fork.id}`}>{fork.title || "a layout"}</Link> by{" "}
            <Link to={`/u/${fork.author}`}>{fork.author}</Link>
          </p>
        )}
        {docId && (
          <Link className="btn sm ghost" to={`/l/${docId}`}>
            Open layout page
          </Link>
        )}
      </section>
      <section className="psec">
        <span className="cap">Keyboard</span>
        <div className="two">
          <ColorField label="Case color" value={layout.meta.backcolor} onChange={(v) => setMeta({ backcolor: v }, "backcolor")} />
          <NumField
            label="Corner radius"
            value={parseFloat(layout.meta.radii) || 0}
            step={2}
            min={0}
            max={60}
            onChange={(v) => setMeta({ radii: `${v}px` }, "radii")}
          />
        </div>
        <label className="ctl">
          <span className="label">Designer</span>
          <span className="input">
            <input value={layout.meta.author} maxLength={120} placeholder="Optional" onChange={(e) => setMeta({ author: e.target.value }, "author")} />
          </span>
        </label>
        <label className="ctl">
          <span className="label">Notes</span>
          <span className="input ta">
            <textarea value={layout.meta.notes} rows={4} maxLength={4000} placeholder="Switches, keycap set, build notes" onChange={(e) => setMeta({ notes: e.target.value }, "notes")} />
          </span>
        </label>
        <p className="dim small">{layout.keys.length} keys</p>
      </section>
    </div>
  );
}

function RawPanel({ layout, commit, toast }: { layout: Layout; commit: Commit; toast: (m: string, k?: "ok" | "err") => void }) {
  const [text, setText] = useState(() => kleRawText(layout));
  const [error, setError] = useState("");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) {
      setText(kleRawText(layout));
      setError("");
    }
  }, [layout]);
  return (
    <div className="panel-body raw">
      <p className="dim small">
        Raw data in keyboard-layout-editor.com format. Edits apply as you type once the data is valid.
      </p>
      <textarea
        className="raw-ta"
        spellCheck={false}
        value={text}
        onFocus={() => (focused.current = true)}
        onBlur={() => (focused.current = false)}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const next = sanitizeLayout(parseKleText(e.target.value));
            setError("");
            commit({ meta: { ...next.meta, name: layout.meta.name || next.meta.name }, keys: next.keys }, "raw");
          } catch (err) {
            setError(err instanceof LayoutParseError ? err.message : "Invalid data");
          }
        }}
        aria-label="Raw KLE data"
      />
      <div className="row between">
        <span className={`hint${error ? " err" : " ok"}`}>{error || "Valid"}</span>
        <button
          className="btn sm"
          onClick={() =>
            navigator.clipboard.writeText(text).then(
              () => toast("Raw data copied", "ok"),
              () => toast("Could not copy", "err"),
            )
          }
        >
          <Copy /> Copy
        </button>
      </div>
    </div>
  );
}

export function EditorPanel(
  props: KeyPanelProps &
    Omit<LayoutPanelProps, "commit" | "layout"> & {
      tab: Tab;
      setTab: (t: Tab) => void;
      toast: (m: string, k?: "ok" | "err") => void;
    },
) {
  const { tab, setTab } = props;
  const tabs: [Tab, string][] = [
    ["key", props.selected.length > 1 ? `Keys (${props.selected.length})` : "Key"],
    ["layout", "Layout"],
    ["raw", "Raw data"],
  ];
  return (
    <aside className="panel glass" aria-label="Properties">
      <div className="seg panel-tabs" role="tablist">
        {tabs.map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} aria-checked={tab === t} onClick={() => setTab(t)}>
            {l}
          </button>
        ))}
      </div>
      <div className="panel-scroll">
        {tab === "key" && <KeyPanel layout={props.layout} selected={props.selected} commit={props.commit} slot={props.slot} setSlot={props.setSlot} />}
        {tab === "layout" && (
          <LayoutPanel
            layout={props.layout}
            commit={props.commit}
            description={props.description}
            setDescription={props.setDescription}
            isPublic={props.isPublic}
            setPublic={props.setPublic}
            user={props.user}
            fork={props.fork}
            docId={props.docId}
          />
        )}
        {tab === "raw" && <RawPanel layout={props.layout} commit={props.commit} toast={props.toast} />}
      </div>
    </aside>
  );
}
