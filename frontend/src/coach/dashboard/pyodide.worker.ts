/// <reference lib="webworker" />

import { loadPyodide } from "pyodide";
import type { WorkerRequest, WorkerResponse } from "./pyodide.types";

let pyodide: Awaited<ReturnType<typeof loadPyodide>> | null = null;
let loading: Promise<void> | null = null;

const post = (msg: WorkerResponse) =>
  (self as unknown as Worker).postMessage(msg);

function init() {
  if (loading) return loading;
  loading = (async () => {
    console.log("[pyodide] Loading Python runtime…");
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.3/full/",
    });
    console.log("[pyodide] Python runtime ready");
    post({ type: "ready" });
  })();
  return loading;
}

// Start loading immediately on worker creation
init();

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  if (e.data.type === "run") {
    const { id, code } = e.data;
    try {
      await init();

      pyodide!.runPython(`
import sys, io
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
`);

      pyodide!.runPython(code);

      const stdout = pyodide!.runPython("sys.stdout.getvalue()") as string;
      const stderr = pyodide!.runPython("sys.stderr.getvalue()") as string;
      const output = (stdout + stderr).trimEnd();

      post({ type: "result", id, output: output || "(no output)" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      post({ type: "error", id, error: msg });
    }
  }
};
