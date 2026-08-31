/* The pull screen: three states, and all three are visible.
 *
 *   idle       — how many pulls you have and what they will turn into;
 *   committed  — the server named the fingerprint and the moment of reveal, the
 *                countdown is running;
 *   revealed   — the secret arrived along with the buildings, shown as cards
 *                with their art.
 *
 * WHY THE COUNTDOWN IS VISIBLE. A second and a half could just as well be waited
 * out silently, and nobody would notice a thing. But then the commitment stays a
 * word in the documentation instead of a thing the player saw with his own eyes.
 * The fingerprint on screen BEFORE the result is the only thing that separates
 * this from "the server made up what you got".
 *
 * WHY THE SECRET IS SHOWN AFTERWARDS. So there is something to check with. A
 * secret without a fingerprint proves nothing, a fingerprint without a secret
 * proves nothing either; the pair is what has meaning, and both have to reach
 * the player's eyes.
 */
(function (root) {
  "use strict";

  let state = null;         // response of /api/v1/buildings/me
  let stage = "idle";       // idle | committed | revealed
  let pending = null;
  let revealed = null;
  let chest = null;         // the open reveal window, while a roll is in flight
  let error = "";
  let timer = null;

  const byId = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  function slug(id) {
    return id.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  }

  function coinBadge(building) {
    const full = root.PackhoodBuildings?.BY_ID?.[building.id] || building;
    const img = full.icon
      ? `<img class="hb-coin-badge__icon" src="${esc(full.icon)}" alt="" loading="lazy" decoding="async" onerror="var b=this.closest('.hb-coin-badge'); this.remove(); if(b) b.classList.add('is-textonly')">`
      : "";
    return `<span class="hb-coin-badge">${img}<span class="hb-coin-badge__sym">${esc(building.coin || "#" + building.seat)}</span></span>`;
  }

  function card(building) {
    // An absolute address: a relative one inside a CSS variable is resolved
    // against the stylesheet file and turns into /css/assets/… — that is how we
    // have already caught 404s.
    const artPath = new URL(`assets/building_${slug(building.id)}_forms_v1.png`, document.baseURI).href;
    const full = root.PackhoodBuildings?.BY_ID?.[building.id];
    const label = full?.label || building.name || building.id;
    return `<figure class="hb-drop-card" data-rarity="${esc(building.rarity)}">
      <div class="hb-drop-card__artwrap">
        <div class="hb-drop-card__art" style="--building-art: url('${artPath}')" aria-hidden="true"></div>
        ${coinBadge(building)}
      </div>
      <figcaption>
        <strong>${esc(label)}</strong>
        <span class="hb-drop-card__power">Power ${building.power}</span>
      </figcaption>
    </figure>`;
  }

  function markup() {
    if (!state) return '<p class="hb-pull-state">Loading…</p>';

    const available = state.pullsAvailable || 0;

    if (stage === "committed") {
      const remaining = Math.max(0, new Date(pending.availableAt) - Date.now());
      return `
        <div class="hb-pull-stage__committed">
          <p class="hb-pull-state">Outcome named before the roll. It cannot change.</p>
          <p class="hb-commit">commitment <code>${esc(String(pending.commitment).slice(0, 24))}…</code></p>
          <p class="hb-countdown">Opening in ${(remaining / 1000).toFixed(1)}s</p>
        </div>`;
    }

    if (stage === "revealed") {
      return `
        <div class="hb-pull-stage__revealed">
          <div class="hb-drop-row">${revealed.results.map(card).join("")}</div>
          <p class="hb-pull-state">Check it: run this secret through the same function.</p>
          <p class="hb-commit">secret <code>${esc(String(revealed.secret).slice(0, 24))}…</code><br>
             commitment <code>${esc(String(revealed.commitment).slice(0, 24))}…</code></p>
          <div class="hb-pull-actions">
            <button class="hb-ledger-button is-primary" type="button" data-pull-action="again"${available ? "" : " disabled"}>Roll again</button>
          </div>
          <p class="hb-pull-note">${available} build${available === 1 ? "" : "s"} left.</p>
        </div>`;
    }

    return `
      <div class="hb-pull-stage__idle">
        <p class="hb-pull-count">${available} roll${available === 1 ? "" : "s"} available</p>
        <p class="hb-pull-note">Beat a boss for a shard. ${state.shardsPerRoll ?? 3} shards make a roll — you have ${state.bossShards ?? 0}.</p>
        <div class="hb-pull-actions">
          <button class="hb-ledger-button is-primary" type="button" data-pull-action="1"${available > 0 ? "" : " disabled"}>Roll 1</button>
          <button class="hb-ledger-button" type="button" data-pull-action="10"${available >= 10 ? "" : " disabled"}>Roll 10</button>
        </div>
        ${error ? `<p class="hb-pull-state hb-pull-state--bad" role="status">${esc(error)}</p>` : ""}
        <!-- A PURCHASE FOR ETH WAS PROMISED HERE. The line "Builds are bought
             with ETH. None yet." is a leftover from paid builds: a roll costs
             three boss shards, there is no ETH in it at all, and the line stood
             right underneath the explanation about shards and contradicted it. -->
      </div>`;
  }

  function render() {
    const node = byId("pullsStage");
    if (node) node.innerHTML = markup();
  }

  async function load() {
    try {
      const res = await fetch("/api/v1/buildings/me", { credentials: "include", cache: "no-store" });
      state = res.ok ? await res.json() : (state || { pullsAvailable: 0 });
    } catch (_) {
      state = state || { pullsAvailable: 0 };
    }
    render();
  }

  function csrf() {
    return root.LoothoodAccountRuntime?.api?.csrfToken || null;
  }

  async function pull(count) {
    error = "";
    try {
      const token = csrf();
      if (!token) throw new Error("Session needs a refresh — reload.");
      const res = await fetch("/api/v1/buildings/pull", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-Loothood-CSRF": token },
        body: JSON.stringify({ count }),
      });
      pending = await res.json();
      if (pending.code) throw new Error(pending.message || pending.code);

      stage = "committed";
      /* The chest starts opening the moment the commitment is published. The
         wait that follows is the honesty gate, and it is exactly as long as the
         chest needs — so the gate and the animation are the same second and a
         half instead of a countdown standing in for both. */
      chest = root.PackhoodBuildingsPanel?.openChest?.() || null;
      render();
      // The countdown is drawn, not waited out: the commitment has to catch the
      // player's eye, otherwise it only lives in the documentation.
      clearInterval(timer);
      timer = setInterval(render, 100);

      const waitMs = Math.max(0, new Date(pending.availableAt) - Date.now()) + 200;
      await new Promise((r) => setTimeout(r, waitMs));
      clearInterval(timer);

      const result = await (await fetch(`/api/v1/buildings/pull/${pending.pullId}/reveal`, {
        method: "POST", credentials: "include",
        headers: { Accept: "application/json", "X-Loothood-CSRF": token },
      })).json();
      if (result.code) throw new Error(result.message || result.code);

      revealed = result;
      stage = "revealed";
      /* The reveal window is the shared one, from buildings-panel-v1.js.
       *
       * A second one of our own would diverge from it in look and wording: the
       * same event would look different depending on where you rolled from. If
       * the buildings panel is somehow not loaded, the built-in view below is
       * what remains — simpler, but not empty.
       *
       * The chest was opened at commit time (see below), so here we only hand
       * it the answer. If it is not there — the panel did not load — we fall
       * back to the window that settles itself. */
      if (chest) { await chest.opened; chest.settle(result); }
      else root.PackhoodBuildingsPanel?.showReveal?.(result);
      await load();
    } catch (e) {
      clearInterval(timer);
      error = String(e?.message || e).slice(0, 160);
      // The chest must not stay hanging open on an error: it would look as if
      // the roll is still going while the panel below already says it failed.
      if (chest) { chest.fail(error); chest = null; }
      stage = "idle";
      render();
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-pull-action]");
    if (!button) return;
    const action = button.dataset.pullAction;
    if (action === "again") { stage = "idle"; render(); return; }
    pull(Number(action) || 1);
  });

  /* WARMING THE CHEST.
   *
   * The clip is fetched when the reveal window opens, which is the one moment
   * it must not be fetched: the roll has happened and the person is waiting.
   * Requesting it once when the Forge screen appears puts it in the HTTP cache
   * a few seconds early, and the first roll plays like every one after it.
   *
   * Failure is ignored on purpose — this is a nicety, and a warm-up that
   * reports errors would be noisier than the problem it solves. */
  let warmed = false;
  function warmChest() {
    if (warmed) return;
    warmed = true;
    fetch("images/chest/chest.webm", { cache: "force-cache" }).catch(() => {});
  }

  function mount() {
    warmChest();
    if (!byId("pullsStage")) return;
    render();
    load();
  }

  root.PackhoodPullsPanel = { mount, refresh: load };
})(typeof window !== "undefined" ? window : globalThis);
