import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delay = 300, paused = false): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay, paused]);
  return debounced;
}
