import { useState } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import type { Signal } from "@preact/signals";

export function useSignalState<T>(signal: Signal<T>): T {
  const [value, setValue] = useState(() => signal.value);

  useSignalEffect(() => {
    setValue(signal.value);
  });

  return value;
}
