/* A roll for beating a boss.
 *
 * THIS IS WHAT THE CHAIN WAS MISSING. "Play and you get a roll" was stated on the
 * main screen, but in practice a run led to buildings by no route at all:
 * buildings were only obtained for ETH, and the first step of the chain was a
 * promise with no code behind it. Now there is code.
 *
 * FOR A WIN, NOT FOR TIME SPENT. The boss on floors 5 and 10 gives one roll, the
 * final one on floor 15 gives three. A reward for something you can lose,
 * otherwise it is not a reward but an attendance payment.
 *
 * THE REQUEST GOES OUT ONCE PER BOSS. A game event can arrive twice (a redraw, a
 * replayed scene), and the server rejects such a repeat on a uniqueness
 * constraint — but there is no point firing a request that is known to give
 * nothing.
 *
 * THE RUN IDENTIFIER is what the server needs to tell "the second boss of the
 * same run" apart from "the same boss a second time". It lives in the tab's
 * memory and changes on every start: there is no reason to put it into storage —
 * a run does not survive a reload.
 */
(function (root) {
  "use strict";

  let runId = null;
  const claimed = new Set();

  function startNewRun() {
    runId = (root.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2));
    claimed.clear();
  }

  function csrf() {
    // The same token as the other panels use. Having our own would open a second
    // session.
    return root.LoothoodAccountRuntime?.api?.csrfToken || null;
  }

  async function requestRoll(stage) {
    if (!runId) startNewRun();
    if (claimed.has(stage)) return;
    claimed.add(stage);

    const token = csrf();
    if (!token) return;   // the session has not come up yet — stay silent, this is not the player's problem

    try {
      const response = await fetch("/api/v1/buildings/rolls/boss", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json",
                   "X-Loothood-CSRF": token },
        body: JSON.stringify({ runId: runId, stage: stage }),
      });
      const result = await response.json();
      if (result?.granted > 0) {
        // The panels display the roll count; without a refresh the person would
        // see the old number and decide the reward never arrived.
        root.PackhoodBuildingsPanel?.refresh?.();
        root.PackhoodPullsPanel?.refresh?.();
        root.PackhoodHuntWhy?.refresh?.();
        announce(result.granted);
      }
    } catch (_) {
      /* The network let us down — stay quiet. The roll was either recorded on the
         server or it was not, and there is no point shouting about it in the
         middle of a fight: the player will see the counter on the Forge. */
    }
  }

  /* A short banner. Not a dialog: it appears during a fight, and a dialog in the
     middle of a fight is an obstruction, not a reward. */
  function announce(count) {
    const el = document.createElement("div");
    el.className = "hb-roll-toast";
    el.setAttribute("role", "status");
    el.textContent = count === 1 ? "+1 forge roll" : `+${count} forge rolls`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  /* A NEW RUN IS RECOGNISED BY THE FLOOR, not by a start event.
   *
   * I first subscribed to "loothood:runstarted" — no such event exists in the
   * game. The listener would have stayed silent, the run identifier would never
   * have changed, and a second run would have brought in no rolls at all: the
   * server would have rejected everything as a repeat of the same bosses of the
   * same run. The rejection would have arrived quietly, with granted: 0, and
   * would have looked like "the reward does not work".
   *
   * Bosses within a run go strictly upwards: 5, 10, 15. A floor no higher than
   * one already counted means a new run has started.
   */
  let lastStage = 0;

  root.addEventListener("loothood:bossdefeated", (ev) => {
    const stage = Math.trunc(Number(ev?.detail?.stage));
    if (!Number.isFinite(stage) || stage <= 0) return;
    if (!runId || stage <= lastStage) startNewRun();
    lastStage = stage;
    requestRoll(stage);
  });

  /* End of a run: gold and trophies go to the server-side account.
   *
   * The same run identifier as the shards use — and that is not a coincidence but
   * a requirement: the server tells a repeat from a new run by it alone, and two
   * different identifiers for one run would mean a double payout.
   */
  root.addEventListener("loothood:runfinished", async (ev) => {
    const stage = Math.trunc(Number(ev?.detail?.stage) || 0);
    const gold = Math.max(0, Math.trunc(Number(ev?.detail?.gold) || 0));
    if (!runId || !stage) return;

    const token = csrf();
    if (!token) return;
    try {
      const response = await fetch("/api/v1/runs/finish", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json",
                   "X-Loothood-CSRF": token },
        body: JSON.stringify({ runId: runId, stage: stage, gold: gold }),
      });
      const result = await response.json();
      if (result?.credited) {
        root.PackhoodShop?.refresh?.();
        // The run is closed: the next one must get a new identifier, otherwise
        // the server will treat it as a repeat and pay nothing.
        runId = null;
        lastStage = 0;
      }
    } catch (_) { /* the network let us down — the account is unharmed, the run simply is not counted */ }
  });

  root.PackhoodBossRolls = { newRun: () => { startNewRun(); lastStage = 0; } };
})(typeof window !== "undefined" ? window : globalThis);
