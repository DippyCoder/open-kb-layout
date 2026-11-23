import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, X } from "lucide-react";
import { api, type PublicLayout } from "../lib/api";
import { LayoutCard } from "../components/LayoutCard";
import { Spinner } from "../components/ui";

const PAGE = 24;

export function Discover() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const sortParam = params.get("sort");
  const sort = sortParam === "popular" ? sortParam : "recent";
  const [input, setInput] = useState(q);
  const [items, setItems] = useState<PublicLayout[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const req = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      if (input !== q) setParams((p) => {
        const n = new URLSearchParams(p);
        if (input) n.set("q", input);
        else n.delete("q");
        return n;
      }, { replace: true });
    }, 180);
    return () => clearTimeout(t);
  }, [input, q, setParams]);

  useEffect(() => {
    const id = ++req.current;
    setLoading(true);
    setError("");
    api
      .discover({ q, sort, limit: PAGE })
      .then((r) => {
        if (id !== req.current) return;
        setItems(r.layouts);
        setTotal(r.total);
      })
      .catch((e) => id === req.current && setError(e.message))
      .finally(() => id === req.current && setLoading(false));
  }, [q, sort]);

  const more = async () => {
    setLoading(true);
    try {
      const r = await api.discover({ q, sort, limit: PAGE, offset: items.length });
      setItems((x) => [...x, ...r.layouts]);
      setTotal(r.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const setParam = (key: string, value: string, fallback: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (value === fallback) n.delete(key);
      else n.set(key, value);
      return n;
    });

  return (
    <section className="wrap page-pad">
      <div className="sec-head">
        <p className="eyebrow">Discover</p>
        <h1 className="h1">Layouts and templates</h1>
        <p className="lead">Browse what people have built and the built-in templates. Open any of them to view, export, remix or favorite.</p>
      </div>
      <div className="toolbar-row">
        <label className="input search">
          <Search className="ic" />
          <input
            type="search"
            placeholder="Search by name, author or description"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Search layouts"
          />
          {input && (
            <button className="ibtn" onClick={() => setInput("")} aria-label="Clear search">
              <X className="ic" />
            </button>
          )}
        </label>
        <div className="seg" role="radiogroup" aria-label="Sort">
          {[
            ["recent", "Recent"],
            ["popular", "Likes"],
          ].map(([v, l]) => (
            <button key={v} role="radio" aria-checked={sort === v} onClick={() => setParam("sort", v, "recent")}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="dim small result-count">
        {loading && !items.length ? "Searching" : `${total} layout${total === 1 ? "" : "s"}${q ? ` matching "${q}"` : ""}`}
      </p>
      {error && <p className="hint err">{error}</p>}
      <div className="card-grid">
        {items.map((l) => (
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
            favorites={l.favorites}
            template={l.template}
          />
        ))}
      </div>
      {!loading && !items.length && !error && (
        <div className="empty glass">
          <p>No public layouts {q ? "match that search" : "yet"}.</p>
        </div>
      )}
      <div className="row center more-row">
        {loading && <Spinner />}
        {!loading && items.length < total && (
          <button className="btn" onClick={more}>
            Load more
          </button>
        )}
      </div>
    </section>
  );
}
