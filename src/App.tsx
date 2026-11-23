import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, LogOut, Moon, Plus, Sun, User as UserIcon } from "lucide-react";
import { Avatar, GithubIcon, Menu, useApp } from "./components/ui";
import { api, loginUrl } from "./lib/api";
import { Home } from "./pages/Home";
import { Discover } from "./pages/Discover";
import { LayoutPage } from "./pages/LayoutPage";
import { Editor } from "./pages/Editor";
import { Mine } from "./pages/Mine";
import { UserPage } from "./pages/UserPage";
import { NotFound } from "./pages/NotFound";

export function Logo() {
  return (
    <svg className="ic logo" viewBox="0 0 24 24" aria-hidden>
      <rect x="2.5" y="5" width="19" height="14" rx="3.5" />
      <path d="M6.5 9.5h1M10 9.5h1M13.5 9.5h1M17 9.5h.5M6.5 12.5h1M10 12.5h4M17 12.5h.5M8 15.5h8" />
    </svg>
  );
}

function Nav() {
  const { user, theme, toggleTheme, setUser, toast } = useApp();
  const nav = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const logout = async () => {
    await api.logout().catch(() => null);
    setUser(null);
    toast("Signed out", "ok");
    nav("/");
  };

  return (
    <header className={`nav-wrap${scrolled ? " scrolled" : ""}`}>
      <nav className="nav wrap" aria-label="Main">
        <Link to="/" className="brand">
          <Logo />
          <span>Open KB Layout</span>
        </Link>
        <div className="nav-links">
          <NavLink to="/editor">
            Editor
          </NavLink>
          <NavLink to="/discover">Discover</NavLink>
          {user && <NavLink to="/me">My layouts</NavLink>}
        </div>
        <button className="btn ghost icon sm" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
        {user ? (
          <Menu
            label="Account"
            align="right"
            trigger={(p) => (
              <button className="btn ghost sm acct" {...p} aria-label="Account menu">
                <Avatar src={user.avatar} login={user.login} size={24} />
                <span className="txt">{user.login}</span>
              </button>
            )}
          >
            {(close) => (
              <>
                <Link className="opt" to="/editor" onClick={close}>
                  <Plus /> New layout
                </Link>
                <Link className="opt" to="/me" onClick={close}>
                  <LayoutGrid /> My layouts
                </Link>
                <Link className="opt" to={`/u/${user.login}`} onClick={close}>
                  <UserIcon /> Public profile
                </Link>
                <div className="sep" />
                <button
                  className="opt"
                  onClick={() => {
                    close();
                    logout();
                  }}
                >
                  <LogOut /> Sign out
                </button>
              </>
            )}
          </Menu>
        ) : (
          <a className="btn primary sm" href={loginUrl()}>
            <GithubIcon />
            <span className="txt">Sign in</span>
          </a>
        )}
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer wrap">
      <div className="row between">
        <Link to="/" className="brand small">
          <Logo />
          <span>Open KB Layout</span>
        </Link>
        <div className="row footer-links">
          <Link to="/editor">Editor</Link>
          <Link to="/discover">Discover</Link>
          <a href="https://www.keyboard-layout-editor.com/" rel="noreferrer" target="_blank">
            Inspired by KLE
          </a>
          <a href="https://github.com/DippyCoder/open-kb-layout" rel="noreferrer" target="_blank" className="gh-link">
            <GithubIcon /> Source on GitHub
          </a>
          <span className="dim">MIT License</span>
        </div>
      </div>
    </footer>
  );
}

export function App() {
  const loc = useLocation();
  const isEditor = loc.pathname.startsWith("/editor");
  const prev = useRef(loc.pathname);
  useEffect(() => {
    if (prev.current !== loc.pathname) window.scrollTo(0, 0);
    prev.current = loc.pathname;
  }, [loc.pathname]);

  return (
    <div className={`page${isEditor ? " page-editor" : ""}`}>
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/l/:id" element={<LayoutPage />} />
          <Route path="/editor" element={<Editor />} />
          <Route path="/editor/:id" element={<Editor />} />
          <Route path="/me" element={<Mine />} />
          <Route path="/u/:login" element={<UserPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!isEditor && <Footer />}
    </div>
  );
}
