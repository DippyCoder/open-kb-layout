import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, FilePlus2, Heart } from "lucide-react";
import { api, loginUrl, type Preview } from "../lib/api";
import { toPreview } from "../lib/layout";
import { PRESETS, presetLayout } from "../lib/presets";
import { PreviewImage } from "../components/LayoutCard";
import { GithubIcon, Modal, Spinner, useApp } from "../components/ui";

export type PickSource =
  | { kind: "blank" }
  | { kind: "preset"; id: string }
  | { kind: "layout"; id: string; title: string; author: string; own: boolean };

interface Item {
  id: string;
  title: string;
  sub: string;
  preview: Preview | null;
  source: PickSource;
}

function Tile({ item, onPick }: { item: Item; onPick: (s: PickSource) => void }) {
  return (
    <button className="tp-item" onClick={() => onPick(item.source)}>
      <span className="tp-art">
        {item.preview ? <PreviewImage preview={item.preview} title={item.title} /> : <FilePlus2 className="ic" />}
      </span>
      <span className="tp-meta">
        <b>{item.title}</b>
        <span className="dim">{item.sub}</span>
      </span>
    </button>
  );
}

export function TemplatePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (s: PickSource) => void }) {
  const { user } = useApp();
  const [favorites, setFavorites] = useState<Item[] | null>(null);
  const [saved, setSaved] = useState<Item[] | null>(null);
  const [error, setError] = useState("");

  const presets = useMemo<Item[]>(
    () => [
      { id: "blank", title: "Blank canvas", sub: "Start from nothing", preview: null, source: { kind: "blank" } },
      ...PRESETS.map((p) => {
        const l = presetLayout(p.id);
        return { id: p.id, title: p.name, sub: `${l.keys.length} keys`, preview: toPreview(l), source: { kind: "preset", id: p.id } as PickSource };
      }),
    ],
    [],
  );

  useEffect(() => {
    if (!open || !user) return;
    setError("");
    api
      .favorites()
      .then((r) =>
        setFavorites(
          r.layouts.map((l) => ({
            id: l.id,
            title: l.title,
            sub: l.template ? "Template" : `by ${l.author}`,
            preview: l.preview,
            source: l.template
              ? { kind: "preset", id: l.id.replace(/^tpl-/, "") }
              : { kind: "layout", id: l.id, title: l.title, author: l.author, own: l.author === user.login },
          })),
        ),
      )
      .catch((e) => setError(e.message));
    api
      .mine()
      .then((r) =>
        setSaved(
          r.layouts.map((l) => ({
            id: l.id,
            title: l.title,
            sub: l.public ? "Public" : "Private",
            preview: l.preview,
            source: { kind: "layout", id: l.id, title: l.title, author: l.author, own: true },
          })),
        ),
      )
      .catch((e) => setError(e.message));
  }, [open, user]);

  const pick = (s: PickSource) => {
    onClose();
    onPick(s);
  };

  const signIn = (
    <a className="btn sm" href={loginUrl()}>
      <GithubIcon /> Sign in
    </a>
  );

  return (
    <Modal open={open} onClose={onClose} title="Start from a template" wide>
      <div className="tp">
        <section className="tp-sec">
          <div className="tp-head">
            <span className="cap">Templates</span>
          </div>
          <div className="tp-grid">
            {presets.map((i) => (
              <Tile key={i.id} item={i} onPick={pick} />
            ))}
          </div>
        </section>

        <section className="tp-sec">
          <div className="tp-head">
            <span className="cap">Favorites</span>
            <Link className="btn sm ghost" to="/discover" onClick={onClose}>
              <Compass /> Discover
            </Link>
          </div>
          {!user ? (
            <div className="tp-empty">
              <p className="dim">Sign in to keep favorites here.</p>
              {signIn}
            </div>
          ) : favorites === null ? (
            <Spinner />
          ) : favorites.length ? (
            <div className="tp-grid">
              {favorites.map((i) => (
                <Tile key={i.id} item={i} onPick={pick} />
              ))}
            </div>
          ) : (
            <div className="tp-empty">
              <Heart className="ic" />
              <p className="dim">Favorite layouts in Discover and they show up here.</p>
            </div>
          )}
        </section>

        <section className="tp-sec">
          <div className="tp-head">
            <span className="cap">Saved layouts</span>
          </div>
          {!user ? (
            <div className="tp-empty">
              <p className="dim">Sign in to start from your own layouts.</p>
              {signIn}
            </div>
          ) : saved === null ? (
            <Spinner />
          ) : saved.length ? (
            <div className="tp-grid">
              {saved.map((i) => (
                <Tile key={i.id} item={i} onPick={pick} />
              ))}
            </div>
          ) : (
            <div className="tp-empty">
              <p className="dim">Layouts you save show up here.</p>
            </div>
          )}
        </section>
        {error && <p className="hint err">{error}</p>}
      </div>
    </Modal>
  );
}
