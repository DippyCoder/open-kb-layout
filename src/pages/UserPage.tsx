import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Ban, CircleCheck, Flag, Undo2 } from "lucide-react";
import { api, reportUrl, type UserProfile } from "../lib/api";
import { LayoutCard } from "../components/LayoutCard";
import { Avatar, Modal, Spinner, useApp } from "../components/ui";

export function UserPage() {
  const { login = "" } = useParams();
  const { user, toast } = useApp();
  const [data, setData] = useState<UserProfile | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setData(null);
    setError("");
    api.user(login).then(setData).catch((e) => setError(e.message));
  }, [login, user?.id]);

  const isSelf = !!user && user.login.toLowerCase() === login.toLowerCase();

  const toggleBan = async () => {
    if (!data) return;
    setConfirm(false);
    setBusy(true);
    try {
      const r = await api.setBan(data.login, !data.banned);
      toast(
        r.banned
          ? `${data.login} is banned${r.hidden ? `, ${r.hidden} layout${r.hidden === 1 ? "" : "s"} hidden` : ""}`
          : `${data.login} is unbanned${r.restored ? `, ${r.restored} layout${r.restored === 1 ? "" : "s"} restored` : ""}`,
        "ok",
      );
      setData(await api.user(login));
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="wrap page-pad">
      <div className="profile-head">
        <Avatar src={data?.avatar} login={login} size={72} />
        <div className="profile-id">
          <p className="eyebrow">Profile</p>
          <h1 className="h1 profile-name">
            {data?.login ?? login}
            {data?.verified && (
              <span className="verified" title={data.official ? "Official account" : "Admin"} aria-label={data.official ? "Official account" : "Admin"}>
                <CircleCheck />
              </span>
            )}
            {data?.canModerate && data.banned && <span className="badge danger">Banned</span>}
          </h1>
          {data?.official ? (
            <span className="dim small">Official Bot</span>
          ) : (
            <a className="dim small" href={`https://github.com/${encodeURIComponent(login)}`} target="_blank" rel="noreferrer">
              github.com/{login}
            </a>
          )}
        </div>
        {data && !data.official && (
          <div className="row profile-actions">
            {!isSelf && (
              <a className="btn ghost sm" href={reportUrl("user", data.login)} target="_blank" rel="noreferrer">
                <Flag /> Report
              </a>
            )}
            {data.canModerate && (
              <button className={`btn sm ${data.banned ? "" : "danger-solid"}`} onClick={() => setConfirm(true)} disabled={busy}>
                {data.banned ? <Undo2 /> : <Ban />}
                {data.banned ? "Unban" : "Ban"}
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="hint err">{error}</p>}
      {!data && !error && <Spinner />}
      {data && !data.layouts.length && (
        <div className="empty glass">
          <p>No public layouts{data.banned && data.canModerate ? " visible while banned" : " yet"}.</p>
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
            favorites={l.favorites}
            template={l.template}
            showAuthor={false}
          />
        ))}
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={data?.banned ? `Unban ${data?.login}?` : `Ban ${data?.login}?`}
        actions={
          <>
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button className={`btn ${data?.banned ? "primary" : "danger-solid"}`} onClick={toggleBan}>
              {data?.banned ? "Unban" : "Ban"}
            </button>
          </>
        }
      >
        <p className="muted">
          {data?.banned
            ? "They can sign in again and their public layouts return to Discover."
            : "They are signed out everywhere, cannot sign in, and their public layouts are hidden from Discover. Their layouts are kept, so unbanning restores them."}
        </p>
      </Modal>
    </section>
  );
}
