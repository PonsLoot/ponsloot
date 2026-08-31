// The replay worker.
// ---------------------------------------------------------------------------
// One job: take a season manifest, the recorded packets and the loadout, run
// the same core the client played on, and send the outcome back. It lives in
// its own thread because a full-run replay is seconds of raw CPU, and on the
// request thread those seconds belong to every other player too.
//
// THE CORE HAS TO BE LOADED HERE, IN THIS THREAD.
//
// A worker does not inherit the parent's module state: it re-imports
// season-manifest.js from scratch, and in that fresh copy CORE is null until
// loadRunCore() fills it. Without this call the replay threw "Call loadRunCore()
// first", the endpoint read that as a rejected recording, and EVERY season run
// came back 422 — an honest player would have been told their run could not be
// verified, with the reason pointing at our own initialisation.
//
// It failed in the way that is hardest to notice: the server logged nothing,
// because from its point of view nothing had gone wrong — a run was refused,
// and runs do legitimately get refused.
//
// Loaded once, on the first job: the promise is cached, so later jobs wait on
// the same load instead of starting their own.

import { parentPort } from "node:worker_threads";
import * as MANIFEST from "./season-manifest.js";

let corePromise = null;
function core() {
  if (!corePromise) corePromise = MANIFEST.loadRunCore();
  return corePromise;
}

parentPort.on("message", async ({ jobId, manifest, packets, loadout }) => {
  try {
    await core();
    const { outcome } = MANIFEST.replayAttempt({ manifest, packets, loadout });
    parentPort.postMessage({ jobId, outcome });
  } catch (err) {
    parentPort.postMessage({ jobId, error: String((err && err.message) || "replay_failed").slice(0, 300) });
  }
});
