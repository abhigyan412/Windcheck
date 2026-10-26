import { useState } from "react";
import { api } from "./api";
import { AccuracyView } from "./components/AccuracyView";
import { ErrorBanner, Loading } from "./components/common";
import { ReplayView } from "./components/ReplayView";
import { useApi } from "./useApi";

type Tab = "replay" | "accuracy";
const TAB_KEY = "wfm.tab";

function initialTab(): Tab {
  const fromUrl = new URLSearchParams(window.location.search).get("tab");
  if (fromUrl === "replay" || fromUrl === "accuracy") return fromUrl;
  try {
    return localStorage.getItem(TAB_KEY) === "accuracy" ? "accuracy" : "replay";
  } catch {
    return "replay";
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const range = useApi(() => api.range(), []);

  function selectTab(t: Tab) {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // storage unavailable: tab just isn't remembered
    }
  }

  return (
    <div className="container">
      <header className="app">
        <div>
          <h1>Wind Forecast Monitor</h1>
          <p>How much GB wind can you count on when you buy day-ahead? · January 2026</p>
        </div>
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "replay"} onClick={() => selectTab("replay")}>
            Decision replay
          </button>
          <button
            role="tab"
            aria-selected={tab === "accuracy"}
            onClick={() => selectTab("accuracy")}
          >
            Accuracy
          </button>
        </nav>
      </header>

      {range.error && <ErrorBanner message={range.error} />}
      {range.loading && <Loading />}
      {range.data &&
        (tab === "replay" ? (
          <ReplayView range={range.data} />
        ) : (
          <AccuracyView range={range.data} />
        ))}

      <footer>
        Data: Elexon BMRS — FUELHH (wind actuals) and WINDFOR (wind forecasts). All times UK. Error
        = forecast − actual; positive means the forecast was too high and you'd be short.
      </footer>
    </div>
  );
}
