import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { GitFork, Globe, Lock } from "lucide-react";
import { previewToLayout } from "../lib/layout";
import type { Preview } from "../lib/api";
import { KeyboardView } from "./KeyboardView";
import { Avatar, timeAgo } from "./ui";

export const PreviewImage = memo(function PreviewImage({ preview, title }: { preview: Preview | null; title: string }) {
  const layout = useMemo(() => (preview ? previewToLayout(preview) : null), [preview]);
  if (!layout || !layout.keys.length) return <div className="kb-empty">No keys yet</div>;
  return <KeyboardView layout={layout} width="100%" height="100%" title={title} />;
});

interface Props {
  id: string;
  title: string;
  author: string;
  avatar: string;
  updated: string;
  preview: Preview | null;
  keyCount?: number;
  isPublic?: boolean;
  forked?: boolean;
  showAuthor?: boolean;
}

export function LayoutCard({ id, title, author, avatar, updated, preview, keyCount, isPublic, forked, showAuthor = true }: Props) {
  return (
    <Link to={`/l/${id}`} className="lcard glass">
      <div className="lcard-art">
        <PreviewImage preview={preview} title={title} />
      </div>
      <div className="lcard-meta">
        <div className="lcard-title">
          <b>{title}</b>
          {isPublic !== undefined && (
            <span className="badge" title={isPublic ? "Public" : "Private"}>
              {isPublic ? <Globe /> : <Lock />}
              {isPublic ? "Public" : "Private"}
            </span>
          )}
        </div>
        <div className="lcard-sub">
          {showAuthor && (
            <span className="who">
              <Avatar src={avatar} login={author} size={18} />
              {author}
            </span>
          )}
          {forked && (
            <span className="dim" title="Remix">
              <GitFork />
            </span>
          )}
          <span className="dim">{keyCount !== undefined ? `${keyCount} keys, ` : ""}{timeAgo(updated)}</span>
        </div>
      </div>
    </Link>
  );
}
