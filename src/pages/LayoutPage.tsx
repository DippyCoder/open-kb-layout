import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronDown, Download, FileJson, GitFork, Globe, Heart, Image, LayoutTemplate, Link2, Lock, Pencil, Star, Trash2 } from "lucide-react";
import { api, loginUrl, type LayoutInfo } from "../lib/api";
import { type Layout, sanitizeLayout } from "../lib/layout";
import { downloadKle, downloadNative, downloadPng, downloadSvg } from "../lib/files";
import { KeyboardView } from "../components/KeyboardView";
import { Avatar, Menu, Modal, Spinner, timeAgo, useApp } from "../components/ui";
import { NotFound } from "./NotFound";

export function LayoutPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { user, toast } = useApp();
  const [info, setInfo] = useState<LayoutInfo | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setInfo(null);
    setError(null);
    api
      .get(id)
      .then(setInfo)
      .catch((e) => setError({ status: e.status ?? 500, message: e.message }));
  }, [id, user?.id]);

  const layout: Layout | null = useMemo(() => {
    if (!info) return null;
    try {
      return sanitizeLayout(info.layout.data);
    } catch {
      return null;
    }
  }, [info]);

  if (error) return error.status === 404 ? <NotFound message="This layout does not exist or is private." /> : <section className="wrap page-pad"><p className="hint err">{error.message}</p></section>;
  if (!info || !layout) return <section className="wrap page-pad"><Spinner /></section>;

  const l = info.layout;
  const named = { ...layout, meta: { ...layout.meta, name: l.title } };

  const setPublic = async (pub: boolean) => {
    try {
      const r = await api.update(l.id, { public: pub });
      setInfo({ ...info, layout: { ...info.layout, public: r.layout.public } });
      toast(pub ? "Layout is now public" : "Layout is now private", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const feature = async () => {
    try {
      const r = await api.toggleFeatured(l.id);
      setInfo({ ...info, featured: r.featured });
      toast(r.featured ? "Featured on the home page" : "Removed from featured", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const favorite = async () => {
    if (!user) {
      location.href = loginUrl();
      return;
    }
    try {
      const r = await api.toggleFavorite(l.id);
      setInfo({ ...info, favorited: r.favorited, favorites: r.favorites });
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const remove = async () => {
    setConfirm(false);
    try {
      await api.remove(l.id);
      toast("Layout deleted", "ok");
      nav("/me");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Link copied", "ok");
    } catch {
      toast("Could not copy the link", "err");
    }
  };

  return (
    <section className="wrap page-pad">
      <div className="lp-head">
        <div className="stack-s">
          <div className="row">
            {info.isTemplate ? (
              <span className="badge"><LayoutTemplate />Template</span>
            ) : (
              <span className="badge">{l.public ? <Globe /> : <Lock />}{l.public ? "Public" : "Private"}</span>
            )}
            {info.featured && <span className="badge"><Star />Featured</span>}
            <span className="dim small">{layout.keys.length} keys{info.isTemplate ? "" : `, updated ${timeAgo(l.updated)}`}</span>
          </div>
          <h1 className="h1">{l.title}</h1>
          <div className="row">
            <Link className="who" to={`/u/${l.author}`}>
              <Avatar src={l.avatar} login={l.author} size={24} />
              {l.author}
            </Link>
            {l.forkedFrom && (
              <span className="credit">
                <GitFork />
                Remix of{" "}
                <Link to={`/l/${l.forkedFrom.id}`}>{l.forkedFrom.title || "a layout"}</Link> by{" "}
                <Link to={`/u/${l.forkedFrom.author}`}>{l.forkedFrom.author}</Link>
              </span>
            )}
          </div>
        </div>
        <div className="row lp-actions">
          {info.isTemplate ? (
            <Link className="btn primary" to={`/editor?preset=${encodeURIComponent(l.id.replace(/^tpl-/, ""))}`}>
              <Pencil /> Use template
            </Link>
          ) : info.isOwner ? (
            <Link className="btn primary" to={`/editor/${l.id}`}>
              <Pencil /> Edit
            </Link>
          ) : (
            <Link className="btn primary" to={`/editor?from=${encodeURIComponent(l.id)}`}>
              <GitFork /> Remix
            </Link>
          )}
          {l.public && (
            <button
              className={`btn fav${info.favorited ? " on" : ""}`}
              onClick={favorite}
              aria-pressed={info.favorited}
              title={info.favorited ? "Remove from favorites" : "Add to favorites"}
            >
              <Heart /> {info.favorited ? "Favorited" : "Favorite"}
              {info.favorites > 0 && <span className="count">{info.favorites}</span>}
            </button>
          )}
          <Menu
            label="Export"
            align="right"
            trigger={(p) => (
              <button className="btn" {...p}>
                <Download /> Export <ChevronDown className="ic chev" />
              </button>
            )}
          >
            {(close) => (
              <>
                <button className="opt" onClick={() => { close(); downloadNative(named); }}>
                  <FileJson /> JSON
                </button>
                <button className="opt" onClick={() => { close(); downloadKle(named); }}>
                  <FileJson /> KLE JSON
                </button>
                <button className="opt" onClick={() => { close(); if (svg.current) downloadPng(svg.current, l.title); }}>
                  <Image /> PNG image
                </button>
                <button className="opt" onClick={() => { close(); if (svg.current) downloadSvg(svg.current, l.title); }}>
                  <Image /> SVG image
                </button>
                <div className="sep" />
                <button className="opt" onClick={() => { close(); copyLink(); }}>
                  <Link2 /> Copy link
                </button>
              </>
            )}
          </Menu>
          {info.isOwner && (
            <>
              <button className="btn ghost" onClick={() => setPublic(!l.public)}>
                {l.public ? <Lock /> : <Globe />}
                {l.public ? "Make private" : "Make public"}
              </button>
              <button className="btn ghost icon danger" onClick={() => setConfirm(true)} aria-label="Delete layout">
                <Trash2 />
              </button>
            </>
          )}
          {user?.admin && l.public && (
            <button className="btn ghost" onClick={feature} aria-pressed={info.featured}>
              <Star /> {info.featured ? "Unfeature" : "Feature"}
            </button>
          )}
        </div>
      </div>

      <div className="lp-stage glass">
        <KeyboardView ref={svg} layout={named} width="100%" height="100%" title={l.title} />
      </div>

      {(l.description || layout.meta.notes) && (
        <div className="grid lp-notes">
          {l.description && (
            <div className="card glass c6">
              <span className="cap">About</span>
              <p className="prose">{l.description}</p>
            </div>
          )}
          {layout.meta.notes && (
            <div className="card glass c6">
              <span className="cap">Notes</span>
              <p className="prose">{layout.meta.notes}</p>
            </div>
          )}
        </div>
      )}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete layout?"
        actions={
          <>
            <button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button>
            <button className="btn danger-solid" onClick={remove}>Delete</button>
          </>
        }
      >
        <p className="muted">"{l.title}" will be removed permanently.</p>
      </Modal>
    </section>
  );
}
