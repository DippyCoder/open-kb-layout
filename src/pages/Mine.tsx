import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Globe, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { api, loginUrl, type LayoutSummary } from "../lib/api";
import { LayoutCard } from "../components/LayoutCard";
import { GithubIcon, Modal, Spinner, useApp } from "../components/ui";

export function Mine() {
  const { user, ready, toast } = useApp();
  const [items, setItems] = useState<LayoutSummary[] | null>(null);
  const [confirm, setConfirm] = useState<LayoutSummary | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!user) return;
    api
      .mine()
      .then((r) => setItems(r.layouts))
      .catch((e) => {
        toast(e.message, "err");
        setItems([]);
      });
  }, [user, toast]);

  if (!ready) return <section className="wrap page-pad"><Spinner /></section>;
  if (!user)
    return (
      <section className="wrap empty-page">
        <p className="eyebrow">My layouts</p>
        <h1 className="h1">Sign in to save layouts</h1>
        <p className="lead">Your layouts are stored with your GitHub account. You can keep them private or share them.</p>
        <a className="btn primary" href={loginUrl()}>
          <GithubIcon /> Sign in with GitHub
        </a>
      </section>
    );

  const togglePublic = async (l: LayoutSummary) => {
    setBusy(l.id);
    try {
      const r = await api.update(l.id, { public: !l.public });
      setItems((xs) => xs?.map((x) => (x.id === l.id ? { ...x, public: r.layout.public, updated: r.layout.updated } : x)) ?? null);
      toast(r.layout.public ? "Layout is now public" : "Layout is now private", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  };

  const remove = async (l: LayoutSummary) => {
    setConfirm(null);
    setBusy(l.id);
    try {
      await api.remove(l.id);
      setItems((xs) => xs?.filter((x) => x.id !== l.id) ?? null);
      toast("Layout deleted", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="wrap page-pad">
      <div className="sec-head row between">
        <div className="stack-s">
          <p className="eyebrow">My layouts</p>
          <h1 className="h1">Your workbench</h1>
        </div>
        <Link className="btn primary" to="/editor">
          <Plus /> New layout
        </Link>
      </div>
      {items === null && <Spinner />}
      {items && !items.length && (
        <div className="empty glass">
          <p>You have not saved any layouts yet.</p>
          <Link className="btn" to="/editor">
            Open the editor
          </Link>
        </div>
      )}
      <div className="card-grid">
        {items?.map((l) => (
          <div key={l.id} className={`mine-item${busy === l.id ? " busy" : ""}`}>
            <LayoutCard
              id={l.id}
              title={l.title}
              author={l.author}
              avatar={l.avatar}
              updated={l.updated}
              preview={l.preview}
              isPublic={l.public}
              forked={!!l.forkedFrom}
              showAuthor={false}
            />
            <div className="mine-actions">
              <Link className="btn sm" to={`/editor/${l.id}`}>
                <Pencil /> Edit
              </Link>
              <button className="btn sm ghost" onClick={() => togglePublic(l)} disabled={busy === l.id}>
                {l.public ? <Lock /> : <Globe />}
                {l.public ? "Make private" : "Make public"}
              </button>
              <button className="btn sm ghost icon danger" onClick={() => setConfirm(l)} aria-label={`Delete ${l.title}`}>
                <Trash2 />
              </button>
            </div>
          </div>
        ))}
      </div>
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete layout?"
        actions={
          <>
            <button className="btn ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button className="btn danger-solid" onClick={() => confirm && remove(confirm)}>
              Delete
            </button>
          </>
        }
      >
        <p className="muted">
          "{confirm?.title}" will be removed permanently{confirm?.public ? " and disappear from Discover" : ""}.
        </p>
      </Modal>
    </section>
  );
}
