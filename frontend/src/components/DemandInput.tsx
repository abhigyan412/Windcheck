import { useEffect, useState } from "react";
import type { Demand } from "../types";
import { Segmented } from "./common";

type InputMode = "none" | "flat" | "paste";

interface Props {
  hours: number;
  /** pending = the user chose to give demand but it isn't valid yet. */
  onChange: (demand: Demand, pending: boolean) => void;
}

// Illustrative winter weekday shape (MW): low overnight, evening peak around 17:00-18:00.
const EXAMPLE_PROFILE = [
  24000, 23000, 22500, 22000, 22000, 23000, 26000, 30000, 32000, 32500, 32500, 32000, 31500, 31000,
  31000, 32000, 34000, 36000, 36000, 34500, 32500, 30500, 28000, 26000,
];
const EXAMPLE_TEXT = EXAMPLE_PROFILE.join(", ");

function parseValues(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(Number);
}

/** Demand as one flat MW value, or one value per hour (typed, pasted or from a CSV file). */
export function DemandInput({ hours, onChange }: Props) {
  const [mode, setMode] = useState<InputMode>("flat");
  const [flat, setFlat] = useState("30000");
  const [pasted, setPasted] = useState(EXAMPLE_TEXT);

  const values = parseValues(pasted);
  const flatValue = Number(flat);
  let error: string | null = null;
  if (mode === "flat" && (flat === "" || !Number.isFinite(flatValue) || flatValue < 0)) {
    error = "Enter a demand of 0 MW or more.";
  } else if (mode === "paste") {
    if (values.some((v) => !Number.isFinite(v) || v < 0)) error = "Values must be numbers ≥ 0.";
    else if (values.length !== hours)
      error = `Enter exactly ${hours} numbers, one per hour (you have ${values.length}).`;
  }

  const demand: Demand =
    error !== null || mode === "none" ? null : mode === "flat" ? flatValue : values;
  const pending = error !== null;
  const key = JSON.stringify([demand, pending]);

  useEffect(() => {
    onChange(demand, pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function onFile(file: File) {
    const text = await file.text();
    // First numeric value on each line, so a "hour,demand" CSV works too.
    const nums = text
      .split(/\r?\n/)
      .map((line) =>
        line
          .split(/[,;\t]/)
          .map(Number)
          .find((v) => Number.isFinite(v) && !Number.isNaN(v)),
      )
      .filter((v): v is number => v !== undefined);
    const perHour = nums.length > hours ? nums.slice(-hours) : nums;
    setPasted(perHour.join("\n"));
    setMode("paste");
  }

  return (
    <div className="controls" style={{ alignItems: "flex-start" }}>
      <div className="field">
        Your demand
        <Segmented
          label="Demand input"
          value={mode}
          onChange={setMode}
          options={[
            { value: "flat", label: "Flat value" },
            { value: "paste", label: "Hour by hour" },
            { value: "none", label: "No demand" },
          ]}
        />
      </div>
      {mode === "flat" && (
        <label className="field">
          MW every hour
          <input
            type="number"
            min={0}
            step={500}
            value={flat}
            onChange={(e) => setFlat(e.target.value)}
            style={{ width: 140 }}
          />
        </label>
      )}
      {mode === "paste" && (
        <label className="field" style={{ flex: "1 1 260px" }}>
          <span>
            Your customers&apos; demand for each hour, 00:00 → 23:00 ({hours} numbers in MW, comma
            or newline separated) ·{" "}
            <strong>
              {values.length}/{hours}
            </strong>
          </span>
          <textarea rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <span style={{ color: "var(--muted)" }}>
            Pre-filled with an example winter day (low overnight, evening peak). Replace it with
            your own forecast.{" "}
            {pasted !== EXAMPLE_TEXT && (
              <button type="button" className="link" onClick={() => setPasted(EXAMPLE_TEXT)}>
                Reset to example
              </button>
            )}
          </span>
        </label>
      )}
      <label className="field">
        or upload CSV
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>
      {error && (
        <div className="inline-error" style={{ flexBasis: "100%" }}>
          {error}
        </div>
      )}
    </div>
  );
}
