import { Link } from "react-router-dom";

export function NotFound({ message = "This page does not exist." }: { message?: string }) {
  return (
    <section className="wrap empty-page">
      <p className="eyebrow">404</p>
      <h1 className="h1">Nothing here</h1>
      <p className="lead">{message}</p>
      <div className="row">
        <Link className="btn primary" to="/">
          Go home
        </Link>
        <Link className="btn" to="/discover">
          Discover layouts
        </Link>
      </div>
    </section>
  );
}
