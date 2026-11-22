import { forwardRef, memo, type PointerEvent as RPointerEvent } from "react";
import { type Key, type Layout, bounds } from "../lib/layout";

export const U = 54;

export function shade(hex: string, amt: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return hex;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt),
  );
  return "#" + ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("");
}

export function luminance(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return 1;
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

export function labelLines(label: string): string[] {
  return label
    .split(/<br\s*\/?>/i)
    .map((l) => l.replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m));
}

const fontPx = (size: number) => 6 + 2 * size;

function KeyLabels({ k, ix, iy, iw, ih, fy, fh }: { k: Key; ix: number; iy: number; iw: number; ih: number; fy: number; fh: number }) {
  const pad = 3;
  const out = [];
  for (let i = 0; i < 12; i++) {
    const label = k.labels[i];
    if (!label) continue;
    const col = i % 3;
    const front = i >= 9;
    const row = front ? 3 : Math.floor(i / 3);
    const size = fontPx(k.textSize[i] || k.defaultTextSize);
    const fs = front ? Math.min(size, Math.max(7, fh - 1)) : size;
    const lines = labelLines(label);
    const lh = fs * 1.08;
    const x = col === 0 ? ix + pad : col === 1 ? ix + iw / 2 : ix + iw - pad;
    const anchor = col === 0 ? "start" : col === 1 ? "middle" : "end";
    let y0: number;
    if (front) y0 = fy + fh / 2 + fs * 0.35;
    else if (row === 0) y0 = iy + pad + fs * 0.8;
    else if (row === 1) y0 = iy + ih / 2 - ((lines.length - 1) * lh) / 2 + fs * 0.35;
    else y0 = iy + ih - pad - (lines.length - 1) * lh - fs * 0.2;
    out.push(
      <text
        key={i}
        x={x}
        y={y0}
        fontSize={fs}
        textAnchor={anchor}
        fill={k.textColor[i] || k.defaultTextColor}
        fontFamily="Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
        fontWeight={500}
      >
        {lines.map((l, li) => (
          <tspan key={li} x={x} dy={li === 0 ? 0 : lh}>
            {l || " "}
          </tspan>
        ))}
      </text>,
    );
  }
  return <>{out}</>;
}

interface KeyCapProps {
  k: Key;
  index: number;
  selected: boolean;
  onPointerDown?: (index: number, e: RPointerEvent<SVGGElement>) => void;
}

export const KeyCap = memo(function KeyCap({ k, index, selected, onPointerDown }: KeyCapProps) {
  const flat = /flat|chiclet/i.test(k.profile);
  const inset = flat ? { l: 3, r: 3, t: 3, b: 3 } : { l: 6, r: 6, t: 3, b: 9 };
  const rects = [{ x: k.x, y: k.y, w: k.w, h: k.h }];
  const second = k.x2 !== 0 || k.y2 !== 0 || k.w2 !== k.w || k.h2 !== k.h;
  if (second) rects.push({ x: k.x + k.x2, y: k.y + k.y2, w: k.w2, h: k.h2 });
  const order = k.stepped ? [...rects].reverse() : rects;
  const side = shade(k.color, -0.24);
  const edge = shade(k.color, -0.5);
  const top = k.color;
  const stepTop = shade(k.color, -0.1);
  const px = (r: { x: number; y: number; w: number; h: number }) => ({
    ox: r.x * U + 1,
    oy: r.y * U + 1,
    ow: r.w * U - 2,
    oh: r.h * U - 2,
    ix: r.x * U + 1 + inset.l,
    iy: r.y * U + 1 + inset.t,
    iw: r.w * U - 2 - inset.l - inset.r,
    ih: r.h * U - 2 - inset.t - inset.b,
  });
  const main = px(rects[0]);
  const transform = k.r ? `rotate(${k.r} ${k.rx * U} ${k.ry * U})` : undefined;

  return (
    <g
      transform={transform}
      opacity={k.ghost ? 0.35 : 1}
      data-index={index}
      onPointerDown={onPointerDown ? (e) => onPointerDown(index, e) : undefined}
      style={onPointerDown ? { cursor: "grab" } : undefined}
    >
      {!k.decal &&
        (k.stepped
          ? order.map((r, i) => {
              const p = px(r);
              const isMain = r === rects[0];
              return (
                <g key={i}>
                  <rect x={p.ox} y={p.oy} width={p.ow} height={p.oh} rx={5} fill={side} stroke={edge} strokeWidth={1} />
                  <rect x={p.ix} y={p.iy} width={p.iw} height={p.ih} rx={4} fill={isMain ? top : stepTop} />
                </g>
              );
            })
          : (
              <>
                {rects.map((r, i) => {
                  const p = px(r);
                  return <rect key={`o${i}`} x={p.ox} y={p.oy} width={p.ow} height={p.oh} rx={5} fill={side} stroke={edge} strokeWidth={1} />;
                })}
                {second &&
                  rects.map((r, i) => {
                    const p = px(r);
                    return <rect key={`s${i}`} x={p.ox + 1} y={p.oy + 1} width={p.ow - 2} height={p.oh - 2} rx={4} fill={side} />;
                  })}
                {rects.map((r, i) => {
                  const p = px(r);
                  return <rect key={`i${i}`} x={p.ix} y={p.iy} width={p.iw} height={p.ih} rx={4} fill={top} stroke={shade(k.color, -0.08)} strokeWidth={0.6} />;
                })}
              </>
            ))}
      {k.nub && !k.decal && (
        <rect x={main.ix + main.iw / 2 - 6} y={main.iy + main.ih - 5} width={12} height={2} rx={1} fill={shade(k.color, -0.35)} />
      )}
      <KeyLabels k={k} ix={main.ix} iy={main.iy} iw={main.iw} ih={main.ih} fy={main.iy + main.ih} fh={inset.b + 1} />
      {selected &&
        rects.map((r, i) => (
          <rect
            key={`sel${i}`}
            className="sel-outline"
            x={r.x * U - 1}
            y={r.y * U - 1}
            width={r.w * U + 2}
            height={r.h * U + 2}
            rx={6}
            fill="none"
          />
        ))}
    </g>
  );
});

export function radiusPx(radii: string): number {
  const m = /([\d.]+)/.exec(radii ?? "");
  return m ? Math.min(60, parseFloat(m[1])) : 6;
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function fitViewBox(layout: Layout, pad = 0.3): ViewBox {
  const b = bounds(layout.keys);
  return { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + pad * 2, h: b.maxY - b.minY + pad * 2 };
}

interface Props {
  layout: Layout;
  selected?: Set<number>;
  viewBox?: ViewBox;
  width?: number | string;
  height?: number | string;
  className?: string;
  background?: boolean;
  onKeyPointerDown?: (index: number, e: RPointerEvent<SVGGElement>) => void;
  onBackgroundPointerDown?: (e: RPointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: RPointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: RPointerEvent<SVGSVGElement>) => void;
  children?: React.ReactNode;
  underlay?: React.ReactNode;
  title?: string;
}

export const KeyboardView = forwardRef<SVGSVGElement, Props>(function KeyboardView(
  { layout, selected, viewBox, width, height, className, background = true, onKeyPointerDown, onBackgroundPointerDown, onPointerMove, onPointerUp, children, underlay, title },
  ref,
) {
  const vb = viewBox ?? fitViewBox(layout);
  const fit = fitViewBox(layout);
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${vb.x * U} ${vb.y * U} ${vb.w * U} ${vb.h * U}`}
      width={width ?? vb.w * U}
      height={height}
      className={className}
      role="img"
      aria-label={title ?? layout.meta.name ?? "Keyboard layout"}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {underlay}
      {background && (
        <rect
          x={fit.x * U}
          y={fit.y * U}
          width={fit.w * U}
          height={fit.h * U}
          rx={radiusPx(layout.meta.radii)}
          fill={layout.meta.backcolor}
          data-bg="1"
        />
      )}
      {layout.keys.map((k, i) => (
        <KeyCap key={i} k={k} index={i} selected={!!selected?.has(i)} onPointerDown={onKeyPointerDown} />
      ))}
      {children}
    </svg>
  );
});
