import type { Key } from "./layout";

export interface KeyTemplate {
  id: string;
  name: string;
  group: "Standard" | "Special" | "Controls";
  key: Partial<Key>;
}

const center = (label: string) => ["", "", "", "", label, "", "", "", "", "", "", ""];
const wide = (w: number, label = ""): Partial<Key> => (label ? { w, w2: w, labels: center(label) } : { w, w2: w });

export const KEY_TEMPLATES: KeyTemplate[] = [
  { id: "1u", name: "1u key", group: "Standard", key: wide(1) },
  { id: "1.25u", name: "1.25u modifier", group: "Standard", key: wide(1.25) },
  { id: "1.5u", name: "1.5u Tab", group: "Standard", key: wide(1.5, "Tab") },
  { id: "1.75u", name: "1.75u Caps Lock", group: "Standard", key: wide(1.75, "Caps Lock") },
  { id: "2u", name: "2u Backspace", group: "Standard", key: wide(2, "Backspace") },
  { id: "2.25u", name: "2.25u Shift", group: "Standard", key: wide(2.25, "Shift") },
  { id: "2.75u", name: "2.75u Shift", group: "Standard", key: wide(2.75, "Shift") },
  { id: "6.25u", name: "6.25u Spacebar", group: "Standard", key: wide(6.25) },
  { id: "7u", name: "7u Spacebar", group: "Standard", key: wide(7) },
  { id: "iso", name: "ISO Enter", group: "Special", key: { w: 1.25, h: 2, x2: -0.25, y2: 0, w2: 1.5, h2: 1, labels: center("Enter") } },
  { id: "bae", name: "Big-ass Enter", group: "Special", key: { w: 1.5, h: 2, x2: -0.75, y2: 1, w2: 2.25, h2: 1, labels: center("Enter") } },
  { id: "stepped", name: "Stepped Caps Lock", group: "Special", key: { w: 1.75, h: 1, w2: 1.25, h2: 1, stepped: true, labels: center("Caps Lock") } },
  { id: "2uv", name: "2u vertical (numpad)", group: "Special", key: { w: 1, h: 2, w2: 1, h2: 2, labels: center("+") } },
  { id: "knob", name: "Knob", group: "Controls", key: { knob: true, color: "#3a3a3e", defaultTextColor: "#e6e6e6" } },
  { id: "knob2", name: "Large knob", group: "Controls", key: { knob: true, w: 2, h: 2, w2: 2, h2: 2, color: "#3a3a3e", defaultTextColor: "#e6e6e6" } },
  { id: "decal", name: "Text label", group: "Controls", key: { decal: true, w: 2, w2: 2, labels: center("Label") } },
];
