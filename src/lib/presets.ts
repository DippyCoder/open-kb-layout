import { type Layout, parseKle } from "./layout";

const ALPHA = "#ecebe6";
const MOD = "#45464d";
const ACCENT = "#e0603f";
const MOD_TEXT = "#f2f1ec";
const ALPHA_TEXT = "#26262b";

const alpha = { c: ALPHA, t: ALPHA_TEXT };
const mod = { c: MOD, t: MOD_TEXT };
const accent = { c: ACCENT, t: "#ffffff" };

const numRow = ["~\n`", "!\n1", "@\n2", "#\n3", "$\n4", "%\n5", "^\n6", "&\n7", "*\n8", "(\n9", ")\n0", "_\n-", "+\n="];
const qRow = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "{\n[", "}\n]"];
const aRow = ["A", "S", "D", "F", "G", "H", "J", "K", "L", ":\n;", "\"\n'"];
const zRow = ["Z", "X", "C", "V", "B", "N", "M", "<\n,", ">\n.", "?\n/"];
const fRow = (gap: number) => [
  accent, "Esc", { ...mod, x: 1 }, "F1", "F2", "F3", "F4", { x: gap }, "F5", "F6", "F7", "F8", { x: gap }, "F9", "F10", "F11", "F12",
];

const bottom = [
  { ...mod, w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { ...alpha, w: 6.25 }, "",
  { ...mod, w: 1.25 }, "Alt", { w: 1.25 }, "Win", { w: 1.25 }, "Menu", { w: 1.25 }, "Ctrl",
];

const sixty = (): unknown[][] => [
  [alpha, ...numRow, { ...mod, w: 2 }, "Backspace"],
  [{ ...mod, w: 1.5 }, "Tab", alpha, ...qRow, { w: 1.5 }, "|\n\\"],
  [{ ...mod, w: 1.75 }, "Caps Lock", alpha, ...aRow, { ...accent, w: 2.25 }, "Enter"],
  [{ ...mod, w: 2.25 }, "Shift", alpha, ...zRow, { ...mod, w: 2.75 }, "Shift"],
  bottom,
];

const navCluster = [
  ["PrtSc", "Scroll", "Pause"],
  ["Ins", "Home", "PgUp"],
  ["Del", "End", "PgDn"],
];

function tkl(): unknown[][] {
  const s = sixty();
  return [
    [...fRow(0.5), { x: 0.25 }, ...navCluster[0]],
    [{ y: 0.5 }, ...s[0], { ...mod, x: 0.25 }, ...navCluster[1]],
    [...s[1], { ...mod, x: 0.25 }, ...navCluster[2]],
    s[2],
    [...s[3], { ...mod, x: 1.25 }, "↑"],
    [...bottom, { ...mod, x: 0.25 }, "←", "↓", "→"],
  ];
}

function full(): unknown[][] {
  const t = tkl();
  return [
    t[0],
    [...t[1], { x: 0.25 }, "Num", "/", "*", "-"],
    [...t[2], { ...alpha, x: 0.25 }, "7\nHome", "8\n↑", "9\nPgUp", { ...mod, h: 2 }, "+"],
    [...t[3], { ...alpha, x: 3.5 }, "4\n←", "5", "6\n→"],
    [...t[4], { ...alpha, x: 1.25 }, "1\nEnd", "2\n↓", "3\nPgDn", { ...accent, h: 2 }, "Enter"],
    [...t[5], { ...alpha, x: 0.25, w: 2 }, "0\nIns", ".\nDel"],
  ];
}

function sixtyFive(): unknown[][] {
  const s = sixty();
  return [
    [...s[0], mod, "Del"],
    [...s[1], mod, "PgUp"],
    [...s[2], mod, "PgDn"],
    [{ ...mod, w: 2.25 }, "Shift", alpha, ...zRow, { ...mod, w: 1.75 }, "Shift", "↑", "End"],
    [
      { ...mod, w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { ...alpha, w: 6.25 }, "",
      mod, "Alt", "Fn", "Ctrl", "←", "↓", "→",
    ],
  ];
}

function seventyFive(): unknown[][] {
  const s = sixtyFive();
  return [
    [accent, "Esc", mod, "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "PrtSc", "Del"],
    [alpha, ...numRow, { ...mod, w: 2 }, "Backspace", "Home"],
    [...s[1].slice(0, -1), "End"],
    [...s[2].slice(0, -1), "PgUp"],
    [...s[3].slice(0, -1), "PgDn"],
    s[4],
  ];
}

function iso(): unknown[][] {
  const s = sixty();
  return [
    s[0],
    [{ ...mod, w: 1.5 }, "Tab", alpha, ...qRow, { ...accent, x: 0.25, w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25 }, "Enter"],
    [{ ...mod, w: 1.75 }, "Caps Lock", alpha, ...aRow, "~\n#"],
    [{ ...mod, w: 1.25 }, "Shift", alpha, "|\n\\", ...zRow, { ...mod, w: 2.75 }, "Shift"],
    bottom,
  ];
}

function ortho(): unknown[][] {
  return [
    [mod, "Tab", alpha, "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", mod, "Bksp"],
    [mod, "Esc", alpha, "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", mod, "'"],
    [mod, "Shift", alpha, "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", accent, "Enter"],
    [mod, "Fn", "Ctrl", "Alt", "Super", "Lower", { ...alpha, w: 2 }, "", mod, "Raise", "←", "↓", "↑", "→"],
  ];
}

function numpad(): unknown[][] {
  return [
    [mod, "Num", "/", "*", "-"],
    [alpha, "7", "8", "9", { ...mod, h: 2 }, "+"],
    [alpha, "4", "5", "6"],
    [alpha, "1", "2", "3", { ...accent, h: 2 }, "Enter"],
    [{ ...alpha, w: 2 }, "0", "."],
  ];
}

function split(): unknown[][] {
  const left = [
    ["Esc", "1", "2", "3", "4", "5"],
    ["Tab", "Q", "W", "E", "R", "T"],
    ["Ctrl", "A", "S", "D", "F", "G"],
    ["Shift", "Z", "X", "C", "V", "B"],
  ];
  const right = [
    ["6", "7", "8", "9", "0", "Bksp"],
    ["Y", "U", "I", "O", "P", "\\"],
    ["H", "J", "K", "L", ";", "'"],
    ["N", "M", ",", ".", "/", "Shift"],
  ];
  const rows: unknown[][] = left.map((l, i) => [
    mod, l[0], alpha, ...l.slice(1), { x: 3 }, ...right[i].slice(0, 5), mod, right[i][5],
  ]);
  rows.push([{ ...mod, r: 15, rx: 4, ry: 4.25 }, "Super", accent, "Space"]);
  rows.push([{ ...mod, r: -15, rx: 11, ry: 4.25, x: -2 }, "Enter", "Alt"]);
  return rows;
}

export interface Preset {
  id: string;
  name: string;
  rows: () => unknown[][];
}

export const PRESETS: Preset[] = [
  { id: "full", name: "Full size ANSI", rows: full },
  { id: "tkl", name: "Tenkeyless ANSI", rows: tkl },
  { id: "75", name: "75%", rows: seventyFive },
  { id: "65", name: "65%", rows: sixtyFive },
  { id: "60", name: "60% ANSI", rows: sixty },
  { id: "iso", name: "60% ISO", rows: iso },
  { id: "ortho", name: "Ortholinear 4x12", rows: ortho },
  { id: "split", name: "Split with thumbs", rows: split },
  { id: "numpad", name: "Numpad", rows: numpad },
];

export function presetLayout(id: string): Layout {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[4];
  const layout = parseKle(p.rows());
  for (const k of layout.keys) if (k.labels[0] === "F" || k.labels[0] === "J") k.nub = true;
  layout.meta.name = p.name;
  layout.meta.backcolor = "#d9d8d2";
  return layout;
}
