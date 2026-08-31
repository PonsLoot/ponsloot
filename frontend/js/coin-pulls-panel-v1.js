/* The coin drop odds table in the pulls window.
 *
 * WHY IT SITS NEXT TO THE BUTTON. Odds you have to dig for in a help section do
 * not count as published — neither for the person deciding whether to pull, nor
 * for the one who later asks why nothing dropped for him.
 *
 * WHAT IS STATED HERE PLAINLY. The expected return is lower than the price, and
 * by exactly how much. Hiding that is pointless: anyone can work it out from the
 * table, and a discrepancy between the promise and the arithmetic that someone
 * finds on their own costs more than an honestly stated number.
 *
 * The table is the same for everyone and does not depend on the player, so it is
 * requested once per page load rather than every time the window is opened.
 */
(function (root) {
  "use strict";

  let data = null;
  let requested = false;

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"]/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }

  function money(cents) {
    if (!centsValid(cents)) return "—";
    return "$" + (cents / 100).toFixed(cents < 100 ? 2 : cents % 100 ? 2 : 0);
  }

  function centsValid(cents) {
    return Number.isFinite(cents) && cents > 0;
  }

  function markup(table) {
    if (!table) return '<p class="coin-odds__state">Loading the odds…</p>';

    // If the weights stopped adding up to 10000, or the expectation diverged
    // from what was promised, the odds must not be shown: they are no longer the
    // ones written down. A silent table with wrong probabilities is exactly the
    // case where we get caught and they are right.
    if (table.trustworthy === false) {
      return '<p class="coin-odds__state coin-odds__state--bad">The odds table failed its own check, so it is not being shown. Pulls are unavailable until this is fixed.</p>';
    }

    let state;
    if (table.reason === "price_not_set") {
      state = "Pulls are not open yet. These are the odds they will use.";
    } else if (table.reason === "payment_address_not_set") {
      state = "Pulls are not open yet: there is nowhere to take payment.";
    } else if (table.reason === "read_failed") {
      state = "Could not load the odds just now.";
    } else {
      state = `A pull costs ${money(table.priceCents)}. On average it returns ${money(table.expectedCents)} in coins — ${table.payoutPercent}% of the price. The remaining ${table.housePercent}% is the game's cut.`;
    }

    const rows = (table.tiers || []).map((tier) => `
      <li>
        <span class="coin-odds__name">${escapeHtml(tier.name)}</span>
        <span class="coin-odds__coin">${escapeHtml(tier.coin)}</span>
        <span class="coin-odds__chance">${tier.chance}%</span>
        <span class="coin-odds__value">${tier.payoutCents ? money(tier.payoutCents) : "—"}</span>
      </li>`).join("");

    return `
      <h3 class="coin-odds__title">Coin pull odds</h3>
      <p class="coin-odds__state">${escapeHtml(state)}</p>
      <ol class="coin-odds__list">
        <li class="coin-odds__head">
          <span>Tier</span><span>Coin</span><span>Chance</span><span>Pays</span>
        </li>
        ${rows}
      </ol>
      <p class="coin-odds__note">Odds are published and add up to 100%. Coins come from the treasury and are real — what you win is yours.</p>`;
  }

  function render() {
    const node = document.getElementById("coinPullsOdds");
    if (!node) return;
    node.innerHTML = markup(data);
  }

  async function load() {
    if (requested) { render(); return; }
    requested = true;
    render();
    try {
      const response = await fetch("/api/v1/pulls/coins", {
        credentials: "include", cache: "no-store", headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
    } catch (_) {
      // An empty table would read as "there are no odds", but there are — we
      // simply failed to fetch them right now. The difference matters precisely
      // here.
      data = { reason: "read_failed", tiers: [], trustworthy: true };
    }
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }

  /* The menu calls mount after every redraw: innerHTML wipes the panel out along
   * with the whole screen. The data is already loaded — we draw from it and do
   * not repeat the request: the table is the same for everyone and does not
   * depend on the player. */
  function mount() {
    if (!document.getElementById("coinPullsOdds")) return;
    if (data) render();
    else load();
  }

  root.PackhoodCoinPullsPanel = { refresh: load, mount };
})(typeof window !== "undefined" ? window : globalThis);
