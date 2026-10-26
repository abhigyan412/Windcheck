import { BarChart3, Moon, PlayCircle, Sun, Wind } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "./api";
import { AccuracyView } from "./components/AccuracyView";
import { ErrorBanner, Skeleton } from "./components/common";
import { ReplayView } from "./components/ReplayView";
import { useApi } from "./useApi";

type Tab = "replay" | "accuracy";
type Theme = "light" | "dark";
const TAB_KEY = "wfm.tab";
const THEME_KEY = "wfm.theme";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable: preference just isn't remembered
  }
}

function initialTab(): Tab {
  const fromUrl = new URLSearchParams(window.location.search).get("tab");
  if (fromUrl === "replay" || fromUrl === "accuracy") return fromUrl;
  return read(TAB_KEY) === "accuracy" ? "accuracy" : "replay";
}

function initialTheme(): Theme {
  const saved = read(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const range = useApi(() => api.range(), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function selectTab(t: Tab) {
    setTab(t);
    write(TAB_KEY, t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    write(THEME_KEY, next);
  }

  return (
    <>
      <header className="appbar">
        <div className="appbar-inner">
          <div className="brand">
            <span className="brand-mark">
              <Wind size={17} strokeWidth={2.4} />
            </span>
            <span>
              Windcheck
              <small>Day-ahead wind intelligence</small>
            </span>
          </div>
          <nav className="nav" role="tablist" aria-label="Views">
            <button role="tab" aria-selected={tab === "replay"} onClick={() => selectTab("replay")}>
              <PlayCircle size={16} /> Decision replay
            </button>
            <button
              role="tab"
              aria-selected={tab === "accuracy"}
              onClick={() => selectTab("accuracy")}
            >
              <BarChart3 size={16} /> Forecast accuracy
            </button>
          </nav>
          <div className="appbar-right">
            <span className="data-pill">
              <span className="live-dot" /> GB wind · Elexon BMRS · Jan 2026
            </span>
            <button
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        {range.error && <ErrorBanner message={range.error} />}
        {range.loading && <Skeleton height={420} />}
        {range.data &&
          (tab === "replay" ? (
            <ReplayView range={range.data} />
          ) : (
            <AccuracyView range={range.data} />
          ))}

        <footer className="footer">
          <span>
            Data: Elexon BMRS — FUELHH (actual wind) and WINDFOR (wind forecasts). All times UK.
          </span>
          <span>Error = forecast − actual · positive means the forecast was too high</span>
        </footer>
      </main>
    </>
  );
}
