import { type Layout, serializeKle, toNative } from "./layout";

export function slug(name: string) {
  return (name || "layout").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "layout";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadNative(layout: Layout) {
  downloadBlob(new Blob([JSON.stringify(toNative(layout), null, 2)], { type: "application/json" }), `${slug(layout.meta.name)}.json`);
}

export function downloadKle(layout: Layout) {
  downloadBlob(new Blob([JSON.stringify(serializeKle(layout), null, 2)], { type: "application/json" }), `${slug(layout.meta.name)}.kle.json`);
}

function svgMarkup(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll(".sel-outline,.marquee,[data-editor-only]").forEach((n) => n.remove());
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  const [, , w, h] = (clone.getAttribute("viewBox") ?? "0 0 100 100").split(" ").map(Number);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  return { markup: new XMLSerializer().serializeToString(clone), w, h };
}

export function downloadSvg(svg: SVGSVGElement, name: string) {
  const { markup } = svgMarkup(svg);
  downloadBlob(new Blob([markup], { type: "image/svg+xml" }), `${slug(name)}.svg`);
}

export async function downloadPng(svg: SVGSVGElement, name: string, scale = 2) {
  const { markup, w, h } = svgMarkup(svg);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Could not render image"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w * scale);
    canvas.height = Math.ceil(h * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (blob) downloadBlob(blob, `${slug(name)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function readFileText(file: File): Promise<string> {
  if (file.size > 2_000_000) return Promise.reject(new Error("That file is larger than 2 MB"));
  return file.text();
}
