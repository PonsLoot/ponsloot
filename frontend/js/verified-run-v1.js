/* Verifiable ordinary run.
 *
 * The run goes through the same deterministic core that used to belong only to
 * the season, and it is written into packets. At the end the server replays the
 * recording and takes the floor FROM THE REPLAY. From that moment on, gold and
 * shards stop being whatever the client reported about itself.
 *
 * THE ATTEMPT CONTROLLER IS UNTOUCHED. It takes an api object and calls four
 * methods on it by name; we hand it a set with the same names, but on the
 * routes of the ordinary run. The debugged recording and commitment code stays
 * as it is — a second copy of it "for ordinary runs" would drift away from the
 * first.
 *
 * IF THE VERIFIABLE RUN DID NOT START — WE PLAY THE ORDINARY ONE. Network, a
 * build update, a server failure: none of that must get in the way of a person
 * playing. Rewards in such a run go down the old, narrowed path — that is worse
 * than a verified one, and incomparably better than "the button does not work".
 */
(function (root) {
  "use strict";

  const VERSION = "packhood-verified-run-v1";

  function makeIdempotencyKey(prefix) {
    const random = root.crypto?.randomUUID?.()
      || String(Date.now()) + Math.random().toString(16).slice(2);
    return `${prefix}:${random}`;
  }

  /* A set of methods under the names the controller expects.
   *
   * loadVerifierSeason returns the manifest of the ordinary run: the controller
   * checks its fields against the issued attempt ticket and will not start
   * without that check. The method name stayed seasonal — renaming it would
   * mean editing the controller, and the controller is not about the season, it
   * is about verifiable runs in general.
   */
  function api(client) {
    return {
      loadVerifierSeason: () => client.loadVerifierRunManifest(),
      issueVerifierAttempt: (body, idempotencyKey) => client.issueVerifierRun(body, idempotencyKey),
      submitVerifierPacket: (id, body) => client.submitVerifierPacket(id, body),
      finalizeVerifierAttempt: (id, body) => client.finishVerifierRun(id, body),
    };
  }

  /* A short banner saying that the run is verifiable.
   *
   * It is not there for looks. Verifiability is an invisible thing: the run
   * looks the same whether it is on or not, and the only way to find out was
   * the network tab in the debugger. An invisible state that rewards depend on
   * breaks silently sooner or later — and today that is exactly what happened
   * with the verifier flag the server was not returning.
   *
   * The same banner as the one used for shards: a second, separate look for a
   * message about one and the same event — a run — would drift away from the
   * first.
   */
  function banner(text) {
    const node = document.createElement("div");
    node.className = "hb-roll-toast";
    node.setAttribute("role", "status");
    node.textContent = text;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4000);
  }

  /**
   * Opens a verifiable attempt and hands back a controller ready for combat.
   * Returns null if it could not be started — then call the ordinary run.
   */
  async function begin({ loadout, wallet = null } = {}) {
    const client = root.LoothoodAccountRuntime?.api;
    // The module hands out the controller CLASS, not a factory: at first I was
    // calling createAttemptController, which does not exist there, and the
    // start would have failed every time — and failed quietly, into the "play
    // the ordinary one" branch, meaning the verifiable run would never have
    // switched on and nobody would have noticed.
    const MODULE = root.LoothoodCompetitiveVerifierClient;
    if (!client || !MODULE?.CompetitiveAttemptController) return null;

    try {
      const controller = new MODULE.CompetitiveAttemptController({
        api: api(client),
        idempotencyKey: makeIdempotencyKey,
      });
      await controller.begin({ loadout, wallet });
      banner("Verified run — rewards counted by the server");
      return controller;
    } catch (e) {
      // Returning null silently is not allowed: if the verifiable run fails to
      // start for everyone, that has to be visible, not guessed at from why the
      // rewards are smaller.
      console.warn("[verified-run] did not start, playing the ordinary run:", e?.code || e?.message || e);
      return null;
    }
  }

  /**
   * Closes the attempt and asks the server to count the reward from the replay.
   * Returns whatever it counted, or null.
   */
  async function finish(controller) {
    if (!controller) return null;
    try {
      const result = await controller.finalize();
      // The panels show shards, rolls and gold — without a refresh the person
      // sees the old numbers and decides the run was not counted.
      root.PackhoodBuildingsPanel?.refresh?.();
      root.PackhoodPullsPanel?.refresh?.();
      root.PackhoodHuntWhy?.refresh?.();
      root.PackhoodShop?.refresh?.();
      return result;
    } catch (e) {
      console.warn("[verified-run] did not close:", e?.code || e?.message || e);
      return null;
    }
  }

  root.PackhoodVerifiedRun = { VERSION, begin, finish };
})(typeof window !== "undefined" ? window : globalThis);
