import { useEffect, useState } from "react";

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Run an async loader whenever deps change; ignores responses that arrive out of order. */
export function useApi<T>(loader: () => Promise<T>, deps: unknown[], enabled = true): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ data: null, loading: enabled, error: null });

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    loader()
      .then((data) => current && setState({ data, loading: false, error: null }))
      .catch(
        (e: unknown) =>
          current &&
          setState((s) => ({
            ...s,
            loading: false,
            error: e instanceof Error ? e.message : String(e),
          })),
      );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  return state;
}

/** A value that only updates after it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
