import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, FileJson, GitFork, MousePointer2, Search } from "lucide-react";
import { api, type PublicLayout } from "../lib/api";
import { presetLayout } from "../lib/presets";
import { KeyboardView } from "../components/KeyboardView";
import { LayoutCard, PreviewImage } from "../components/LayoutCard";
import { Avatar } from "../components/ui";

export function Home() {
  const nav = useNavigate();
  const [featured, setFeatured] = useState<PublicLayout[] | null>(null);
  const [recent, setRecent] = useState<PublicLayout[]>([]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const demo = useMemo(() => presetLayout("75"), []);

  useEffect(() => {
    api.featured().then((r) => setFeatured(r.layouts)).catch(() => setFeatured([]));
    api.discover({ limit: 6 }).then((r) => setRecent(r.layouts)).catch(() => setRecent([]));
  }, []);

  const items = featured ?? [];
  useEffect(() => {
    if (items.length < 2 || paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % items.length), 6000);
    return () => clearInterval(t);
  }, [items.length, paused]);

  const current = items[active] ?? null;

  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          <p className="eyebrow">Keyboard layout studio</p>
          <h1 className="display">Draw the keyboard you actually want.</h1>
          <p className="lead">
            A fast layout editor for every size, from numpads to split ergos. Import your KLE files, save layouts to your
            GitHub account, and share them with everyone.
          </p>
          <div className="cta-row">
            <Link className="btn primary lg" to="/editor">
              Start a layout
              <ArrowRight />
            </Link>
            <Link className="btn lg" to="/discover">
              <Search />
              Discover
            </Link>
          </div>
        </div>

        <div className="stage-wrap" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
          {current ? (
            <Link to={`/l/${current.id}`} className="stage glass" aria-label={`Open ${current.title}`}>
              <div className="stage-art" key={current.id}>
                <PreviewImage preview={current.preview} title={current.title} />
              </div>
              <div className="stage-caption">
                <span className="cap">Featured</span>
                <b>{current.title}</b>
                <span className="who">
                  <Avatar src={current.avatar} login={current.author} size={20} />
                  {current.author}
                </span>
              </div>
            </Link>
          ) : (
            <button className="stage glass" onClick={() => nav("/editor?preset=75")} aria-label="Open this layout in the editor">
              <div className="stage-art">
                <KeyboardView layout={demo} width="100%" height="100%" />
              </div>
              <div className="stage-caption">
                <span className="cap">{featured === null ? "Loading" : "Try it"}</span>
                <b>75% starter</b>
                <span className="dim small">Open in the editor</span>
              </div>
            </button>
          )}
          {items.length > 1 && (
            <div className="feat-strip" role="list">
              {items.map((l, i) => (
                <Link
                  key={l.id}
                  role="listitem"
                  to={`/l/${l.id}`}
                  className={`feat-thumb${i === active ? " on" : ""}`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  aria-label={`${l.title} by ${l.author}`}
                >
                  <PreviewImage preview={l.preview} title={l.title} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="wrap">
        <div className="grid">
          <div className="card glass c4">
            <span className="ai">
              <MousePointer2 />
            </span>
            <h3>Direct editing</h3>
            <p className="muted small">
              Drag keys with grid snapping, marquee select, resize with the keyboard, rotate clusters and undo anything.
            </p>
          </div>
          <div className="card glass c4">
            <span className="ai">
              <FileJson />
            </span>
            <h3>Speaks KLE</h3>
            <p className="muted small">
              Import keyboard-layout-editor.com JSON or raw data, and export back to it, to JSON, PNG or SVG.
            </p>
          </div>
          <div className="card glass c4">
            <span className="ai">
              <GitFork />
            </span>
            <h3>Remix with credit</h3>
            <p className="muted small">
              Open any public layout in the editor. Your copy keeps a link back to the original author.
            </p>
          </div>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="wrap">
          <div className="sec-head row between">
            <h2>Recently shared</h2>
            <Link className="btn link" to="/discover">
              See all <ArrowRight className="ic" />
            </Link>
          </div>
          <div className="card-grid">
            {recent.map((l) => (
              <LayoutCard
                key={l.id}
                id={l.id}
                title={l.title}
                author={l.author}
                avatar={l.avatar}
                updated={l.updated}
                preview={l.preview}
                keyCount={l.keyCount}
                forked={!!l.forkedFrom}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
