import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, CircleAlert, Info, X } from "lucide-react";
import { api, type User } from "../lib/api";

type Theme = "dark" | "light";

interface AppState {
  user: User | null;
  ready: boolean;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
  theme: Theme;
  toggleTheme: () => void;
  toast: (message: string, kind?: ToastKind) => void;
}

type ToastKind = "ok" | "err" | "info";
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  leaving?: boolean;
}

const Ctx = createContext<AppState | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "light" ? "light" : "dark"));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const r = await api.me();
      setUser(r.user);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#000000" : "#f5f5f7");
    try {
      localStorage.setItem("okl:theme", theme);
    } catch {
      return;
    }
  }, [theme]);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), 3600);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  return (
    <Ctx.Provider value={{ user, ready, refresh, setUser, theme, toggleTheme, toast }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast glass${t.leaving ? " out" : ""}`}>
            <span className={`ti ${t.kind}`}>
              {t.kind === "ok" ? <Check /> : t.kind === "err" ? <CircleAlert /> : <Info />}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  actions,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal glass${wide ? " wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-h">
        <h3>{title}</h3>
        <button className="btn ghost icon sm" onClick={onClose} aria-label="Close">
          <X />
        </button>
      </div>
      <div className="modal-b">{children}</div>
      {actions && <div className="modal-f">{actions}</div>}
    </dialog>
  );
}

export function Menu({
  trigger,
  children,
  align = "left",
  label,
}: {
  trigger: (props: { onPointerDown: (e: React.PointerEvent) => void; onKeyDown: (e: React.KeyboardEvent) => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className="dd" ref={wrap}>
      {trigger({
        onPointerDown: (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          setOpen((o) => !o);
        },
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        },
        "aria-expanded": open,
        "aria-haspopup": "menu",
      })}
      <div className={`pop glass menu ${align}${open ? " open" : ""}`} role="menu" aria-label={label}>
        {open && children(close)}
      </div>
    </div>
  );
}

export function Avatar({ src, login, size = 28 }: { src?: string; login: string; size?: number }) {
  return src ? (
    <img className="av" src={src} alt="" width={size} height={size} loading="lazy" />
  ) : (
    <span className="av av-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {login.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Spinner() {
  return <span className="ld-ring" aria-label="Loading" />;
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [2592000, "month"],
    [31536000, "year"],
  ];
  let pick = units[0];
  for (const u of units) if (s >= u[0]) pick = u;
  const n = Math.floor(s / pick[0]);
  return `${n} ${pick[1]}${n === 1 ? "" : "s"} ago`;
}

export function GithubIcon() {
  return (
    <svg className="ic gh" viewBox="0 0 24 24" aria-hidden fill="currentColor" stroke="none">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.39-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
    </svg>
  );
}
