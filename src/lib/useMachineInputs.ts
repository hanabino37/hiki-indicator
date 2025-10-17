import { useEffect, useRef, useState } from "react";

const KEY = (machineId: string) => `hiki:inputs:${machineId}`;
const VERSION = 1; // 将来のスキーマ変更用

type Inputs = Record<string, any>;

function safeParse(json: string | null): Inputs | null {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

export function useMachineInputs(machineId: string, initial: Inputs) {
  const [inputs, setInputs] = useState<Inputs>(initial);
  const loadedRef = useRef(false);

  // load on machine change
  useEffect(() => {
    const raw = localStorage.getItem(KEY(machineId));
    const data = safeParse(raw);
    if (data?.__v === VERSION && data?.payload) {
      setInputs({ ...initial, ...data.payload });
    } else {
      setInputs(initial);
    }
    loadedRef.current = true;
  }, [machineId]);

  // save on change (debounced-ish)
  useEffect(() => {
    if (!loadedRef.current) return;
    const handle = setTimeout(() => {
      localStorage.setItem(
        KEY(machineId),
        JSON.stringify({ __v: VERSION, payload: inputs })
      );
    }, 200);
    return () => clearTimeout(handle);
  }, [machineId, inputs]);

  const reset = () => setInputs(initial);

  return { inputs, setInputs, reset };
}
