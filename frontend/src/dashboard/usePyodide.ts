import { useEffect, useRef, useState, useCallback } from "react";
import type { WorkerRequest, WorkerResponse } from "./pyodide.types";

const TIMEOUT_MS = 10_000;

let worker: Worker | null = null;
let workerReady = false;
let msgId = 0;
const pending = new Map<number, {
  resolve: (v: string) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

function createWorker() {
  worker = new Worker(new URL("./pyodide.worker.ts", import.meta.url), { type: "module" });

  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    if (msg.type === "ready") {
      workerReady = true;
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(msg.id);
    if (msg.type === "result") p.resolve(msg.output);
    else p.reject(new Error(msg.error));
  };

  worker.onerror = () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Error: Script used too much memory and was terminated."));
    }
    pending.clear();
    worker?.terminate();
    worker = null;
    workerReady = false;
  };
}

export function usePyodide() {
  const [loading, setLoading] = useState(!workerReady);
  const loadingRef = useRef(!workerReady);

  useEffect(() => {
    if (!worker) createWorker();

    const onMsg = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === "ready" && loadingRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    };
    worker!.addEventListener("message", onMsg);
    return () => { worker?.removeEventListener("message", onMsg); };
  }, []);

  const runCode = useCallback((code: string): Promise<string> => {
    if (!worker) createWorker();
    const id = ++msgId;

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          worker?.terminate();
          worker = null;
          workerReady = false;
          setLoading(true);
          loadingRef.current = true;
          reject(new Error("Error: Script timed out after 10 seconds and was terminated."));
        }
      }, TIMEOUT_MS);

      pending.set(id, { resolve, reject, timer });

      const msg: WorkerRequest = { type: "run", id, code };
      worker!.postMessage(msg);
    });
  }, []);

  return { runCode, loading };
}
