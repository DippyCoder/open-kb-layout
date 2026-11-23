import { PRESETS, presetLayout } from "../../src/lib/presets";
import { toNative, toPreview } from "../../src/lib/layout";

export const TEMPLATE_AUTHOR = "Bot";
export const TEMPLATE_AVATAR = "/bot.svg";
const TEMPLATE_DATE = "2026-11-01T00:00:00.000Z";
const PREFIX = "tpl-";

export const isTemplateId = (id: string) => id.startsWith(PREFIX);

export interface TemplateEntry {
  id: string;
  title: string;
  description: string;
  author: string;
  avatar: string;
  updated: string;
  keyCount: number;
  preview: ReturnType<typeof toPreview>;
  data: ReturnType<typeof toNative>;
}

let cache: TemplateEntry[] | null = null;

export function templates(): TemplateEntry[] {
  cache ??= PRESETS.map((p) => {
    const layout = presetLayout(p.id);
    return {
      id: PREFIX + p.id,
      title: p.name,
      description: p.description,
      author: TEMPLATE_AUTHOR,
      avatar: TEMPLATE_AVATAR,
      updated: TEMPLATE_DATE,
      keyCount: layout.keys.length,
      preview: toPreview(layout),
      data: toNative(layout),
    };
  });
  return cache;
}

export const findTemplate = (id: string) => templates().find((t) => t.id === id) ?? null;

export function templateValue(t: TemplateEntry) {
  const { data: _data, ...v } = t;
  return v;
}
