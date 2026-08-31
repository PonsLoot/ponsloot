/* The bottom half of the main screen: why play at all.
 *
 * WHAT USED TO BE HERE. An empty section taking up 43% of the height of the
 * first screen. It used to be occupied by weekly quests; those were removed
 * together with the old gacha, and the space stayed. An empty field under the
 * "Start Hunt" button does not read as "nothing is meant to be here" — it reads
 * as "the game is unfinished", and it is the first thing a newcomer sees.
 *
 * TWO STATES, NOT ONE. A newcomer needs a reason, an owner needs his numbers.
 * Showing the first one his zero income is pointless, explaining how the game
 * works to the second is insulting. So the screen looks at whether the person
 * has buildings and says whatever is appropriate.
 *
 * THE CHAIN NAMES A CONNECTION YOU CANNOT SEE FROM THE MENU. The Hunt, Buildings
 * and Build entries stand separately, and nothing about them implies that one
 * leads to another. Three steps in a row with a button to the next one is
 * precisely the answer to "what am I doing and what for" that was missing.
 *
 * WHAT IS NOT HERE AND NEVER WILL BE: promises beyond the code. A step that does
 * not work yet says so outright. A site promising more than what is written has
 * already happened in cipher — there a page assured people that a program handed
 * out the prize while it was being handed out by hand.
 */
(function (root) {
  "use strict";

  let state = null;

  const byId = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  function money(usd) {
    const n = Number(usd);
    if (!Number.isFinite(n) || n <= 0) return "$0";
    if (n < 0.01) return "<$0.01";
    if (n < 1000) return `$${n.toFixed(2)}`;
    return `$${Math.round(n).toLocaleString("en-US")}`;
  }

  /* One step of the chain.
   *
   * `state` decides the look: done — already finished, next — the thing to do
   * right now, later — too early for that yet. Exactly one step may be next,
   * otherwise the chain stops pointing in a direction and turns into a list.
   */
  function step(n, title, text, stepState, button) {
    return `<li class="hb-why-step is-${stepState}">
      <span class="hb-why-num">${n}</span>
      <div class="hb-why-body">
        <h3>${esc(title)}</h3>
        <p>${esc(text)}</p>
        ${button ? `<button class="hb-ledger-button${stepState === "next" ? " is-primary" : ""}" type="button" data-shell-destination="${esc(button.to)}">${esc(button.label)}</button>` : ""}
      </div>
    </li>`;
  }

  function chain(data) {
    const ownedCount = (data?.owned || []).length;
    const rollsAvailable = data?.pullsAvailable || 0;

    // The order of the steps is the order of the actions, not of their
    // importance. The first step is the one a person can take right now and for
    // free: the game has to start with the game, not with a wallet.
    const runStep = ownedCount || rollsAvailable ? "done" : "next";
    const rollStep = ownedCount ? "done" : rollsAvailable ? "next" : "later";
    const shareStep = ownedCount ? "next" : "later";

    /* The heading "Why play" sounded like a question aimed at someone who has
     * not decided anything yet — almost a reproach. "Start here" beckons forward
     * and asks nothing. The captions have been shortened to one line: a long
     * explanation on screen goes unread, a short one at least catches the eye. */
    return `
      <div class="hb-why">
        <h2 class="hb-why-title">Start here</h2>
        <ol class="hb-why-chain">
          <!-- THERE WAS A PROMISE OF A FREE PULL FOR A RUN HERE, AND IT HAD TO
               BE TAKEN DOWN. The run is computed by the client alone — the
               server sees the submitted result, not the game. Handing out
               something that costs ETH for it means giving it to anyone who
               sends a single request by hand. The mechanism for the honest
               version already exists: the verifier replays the run with a bot.
               The pull has to be hung on a VERIFIED run, not on a submitted one,
               and that is a separate piece of work.
               Until then the step tells the truth about what a run gives today. -->
          ${step(1, "Play a run", "Upgrade your gear through the stages.", runStep, { to: "outfitter", label: "Loadout" })}
          ${step(2, "Roll a building", "A seat in Robinhood Chain's Top 10.", rollStep, { to: "pulls", label: "Forge" })}
          ${step(3, "It pays you ETH", "Every day, a share of the pool.", shareStep, { to: "buildings", label: "Estate" })}
        </ol>
      </div>`;
  }

  /* The owner's summary.
   *
   * The numbers are the same as on the buildings screen and are taken from the
   * same server response — so that the main screen and the buildings section
   * cannot diverge from each other. Two storefronts showing the same thing
   * diverge on the very first patch, and people believe whichever shows more.
   */
  function ownerSummary(data) {
    const share = data.share || {};
    const pool = data.pool || {};
    const working = data.slotsUsed || 0;
    const total = (data.owned || []).length;
    const paying = (pool.usdPerDay || 0) > 0;

    return `
      <div class="hb-why hb-why--owner">
        <h2 class="hb-why-title">Your estate</h2>
        <dl class="hb-why-facts">
          <div><dt>Earning</dt><dd class="hb-why-money">${money(share.usdPerDay)}<small>/day</small></dd></div>
          <div><dt>Your share</dt><dd>${(share.sharePct || 0).toFixed(1)}%</dd></div>
          <div><dt>Working</dt><dd>${working} of ${total}</dd></div>
          <div><dt>Pool</dt><dd>${money(pool.usdPerDay)}<small>/day</small></dd></div>
        </dl>
        ${paying ? "" : '<p class="hb-why-note">The pool has not started paying yet. Your buildings keep their share for when it does.</p>'}
        ${working < total ? `<p class="hb-why-note">${total - working} building${total - working === 1 ? " is" : "s are"} idle — hold more of the token to open slots.</p>` : ""}
        <button class="hb-ledger-button is-primary" type="button" data-shell-destination="buildings">Open Estate</button>
      </div>`;
  }

  /* The haul card on the main screen.
   *
   * THE HEADING IS GONE ENTIRELY. It used to say "What a run pays" — a phrase no
   * living person writes: it explains the obvious and sounds like a caption
   * under a diagram. The numbers with their labels say the same thing and more
   * briefly, and a heading above two numbers is a line spent on saying "two
   * numbers are coming up".
   *
   * The layout is the same as on the other hunt cards: copy on the left, values
   * on the right. That is exactly the layout I botched here — the dl sat under
   * the text instead of standing next to it, and the card sprawled.
   */
  function haul() {
    const node = byId("huntHaul");
    if (!node) return;
    const perRoll = state?.shardsPerRoll ?? 3;
    const shards = state?.bossShards ?? 0;
    const rolls = state?.pullsAvailable ?? 0;

    node.innerHTML = `
      <div class="hb-hunt-card__copy">
        <h2>Shards</h2>
        <p>Each boss drops one. ${perRoll} make a forge roll.</p>
      </div>
      <dl class="hb-haul">
        <div><dt>Shards</dt><dd class="hb-value">${shards}/${perRoll}</dd></div>
        <div><dt>Rolls</dt><dd class="hb-value">${rolls}</dd></div>
      </dl>`;
  }

  function render() {
    haul();
    const node = byId("huntWhy");
    if (!node) return;
    // Until the server answers — the chain without numbers, not emptiness and
    // not a "loading". Emptiness on the main screen is exactly the breakage
    // being fixed here, and substituting it for the second the load takes would
    // be ridiculous.
    node.innerHTML = state && (state.owned || []).length ? ownerSummary(state) : chain(state);
  }

  async function load() {
    try {
      const res = await fetch("/api/v1/buildings/me", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state = await res.json();
    } catch (_) {
      // Could not reach it — we show the chain. It is always true and promises
      // nothing with numbers, so a network error does not turn into a lie on
      // screen.
      state = state || null;
    }
    render();
  }

  function mount() {
    if (!byId("huntWhy")) return;
    render();
    load();
  }

  root.PackhoodHuntWhy = { mount, refresh: load };
})(typeof window !== "undefined" ? window : globalThis);
