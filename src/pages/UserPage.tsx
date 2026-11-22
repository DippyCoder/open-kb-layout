import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type PublicLayout } from "../lib/api";
import { LayoutCard } from "../components/LayoutCard";
import { Avatar, Spinner } from "../components/ui";

export function UserPage() {
  const { login = "" } = useParams();
  const [data, setData] = useState<{ login: string; avatar: string; layouts: PublicLayout[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(null);
    api.user(login).then(setData).catch((e) => setError(e.message));
  }, [login]);

  return (
    <section className="wrap page-pad">
      <div className="profile-head">
        <Avatar src={data?.avatar} login={login} size={72} />
        <div>
          <p className="eyebrow">Profile</p>
          <h1 className="h1">{data?.login ?? login}</h1>
          <a className="dim small" href={`https://github.com/${encodeURIComponent(login)}`} target="_blank" rel="noreferrer">
            github.com/{login}
          </a>
        </div>
      </div>
      {error && <p className="hint err">{error}</p>}
      {!data && !error && <Spinner />}
      {data && !data.layouts.length && (
        <div className="empty glass">
          <p>No public layouts yet.</p>
        </div>
      )}
      <div className="card-grid">
        {data?.layouts.map((l) => (
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
            showAuthor={false}
          />
        ))}
      </div>
    </section>
  );
}
