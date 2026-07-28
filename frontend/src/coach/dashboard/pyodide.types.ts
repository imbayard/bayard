/** Messages sent from the main thread to the Pyodide worker */
export type WorkerRequest = {
  type: "run";
  id: number;
  code: string;
};

/** Messages sent from the Pyodide worker back to the main thread */
export type WorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: number; output: string }
  | { type: "error"; id: number; error: string };
