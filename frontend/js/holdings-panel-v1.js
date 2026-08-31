/* The holding panel in the village.
 *
 * Shows: how much of the token sits in the wallet, which threshold that is, how
 * many buildings are working, what the rate multiplier is and how much is
 * missing to reach the next threshold.
 *
 * THREE STATES, AND THEY ARE DIFFERENT. "The token is not launched yet", "the
 * wallet is not linked" and "you hold zero" are three different reasons for the
 * buildings staying quiet, and a person has to see his own, not a generic one.
 * Merging them into a single "0 buildings" would mean telling people, before the
 * token launch, that they had sold everything.
 *
 * THE THRESHOLDS ARE ALWAYS VISIBLE, even when there is no token. A hidden block
 * disappears exactly when someone is looking for it: a person deciding whether
 * to buy the token comes to look at precisely this ladder.
 *
 * The request goes out when the village is opened, not in the background. Polling
 * in the background for the sake of a live number means hitting the node from
 * every open tab every few seconds, and the free RPC will be the first to notice.
 */
(function (root) {
  "use strict";

  /* The name of our own coin and where to go and get it — from brand.js, in one
     place. Written out a second time here, it would diverge from the brand on
     the very first rename, and a person would see two different tickers on one
     screen. */
  const COIN = (root.PackhoodBrand && root.PackhoodBrand.ticker) || "PONSLOOT";

  /* The wallet-linking button — right inside the panel.
   *
   * The panel said "link a wallet" and did not say WHERE. Linking lives in the
   * account settings, which you have to think to reach through the cog in the
   * header. An instruction without a button is a task we handed to the person
   * instead of solving it.
   *
   * It leads to the same place as the cog: one linking screen, not a second one
   * next to it. */
  /* THE CONTRACT ADDRESS, IN FULL, WHERE HOLDING IS EXPLAINED.
   *
   * The header chip shows it shortened — 0xe934…bf50 — which is enough to
   * recognise an address you already know and useless for telling which one it
   * is. This screen is the one that says "hold the token", so this is where the
   * question "which token" gets asked, and it gets the whole forty-two
   * characters, selectable, with the same copy button as the header.
   *
   * Hidden entirely while there is no address: an empty field labelled Contract
   * on a screen about holding a token reads as "the token exists and something
   * is broken", which is worse than saying nothing.
   *
   * The value comes from the shared chip module, so there is one source. Two
   * places reading the address separately is how they end up disagreeing on the
   * day it changes.
   */
  function contractLine() {
    const address = root.PonslootContract?.address?.();
    if (!address) return "";
    return `<div class="holdings-panel__contract">
      <span class="holdings-panel__contract-label">Contract</span>
      <code class="holdings-panel__contract-addr" title="${escapeHtml(address)}">${escapeHtml(address)}</code>
      <button class="holdings-panel__contract-copy" type="button" data-contract-copy
              aria-label="Copy contract address">copy</button>
    </div>`;
  }

  function walletButton() {
    return `<button class="hb-ledger-button is-primary" type="button" data-shell-destination="account-settings">Link wallet</button>`;
  }

  function buyLink() {
    const url = (root.PackhoodBrand && root.PackhoodBrand.buy) || "";
    // There must be no button leading nowhere: a click without consequences is
    // the worst kind of breakage, it looks functional. No address — no button.
    if (!url) return `<p class="holdings-panel__note">${COIN} is not on sale yet.</p>`;
    return `<a class="hb-ledger-button is-primary" href="${url}" target="_blank" rel="noopener noreferrer">Buy ${COIN}</a>`;
  }

  const MIN_GAP_BETWEEN_REQUESTS = 20_000;
  let lastFetchedAt = 0;
  let inFlight = false;

  const byId = (id) => document.getElementById(id);

  function formatNumber(n) {
    return Number(n || 0).toLocaleString("en-US");
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"]/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }

  function ladder(summary) {
    const tiers = (summary.tiers || []).filter((tier) => tier.hold > 0);
    return tiers.map((tier) => {
      const reached = summary.enabled && summary.tier >= tier.tier;
      return `<li class="${reached ? "is-reached" : ""}">
        <span class="holdings-panel__ladder-name">${escapeHtml(tier.name)}</span>
        <span class="holdings-panel__ladder-hold">${formatNumber(tier.hold)}</span>
        <span class="holdings-panel__ladder-gain">${tier.buildings} bld · ×${tier.multiplier}</span>
      </li>`;
    }).join("");
  }

  // The last response received. Without it every menu redraw would show an empty
  // block for the duration of the request — a flicker that reads as breakage.
  let cache = null;

  function markup(summary) {
    if (!summary) {
      return `<div class="holdings-panel__head"><h2>Holding</h2></div>
        <p class="holdings-panel__state">Reading your holding…</p>`;
    }

    // The reason matters more than the number: first we explain why things are
    // the way they are, and only then show the figures. The other way round a
    // person reads a zero and leaves.
    let state;
    if (!summary.enabled && summary.reason === "token_not_launched") {
      state = `${COIN} is not launched yet. Holding it will open slots.`;
    } else if (summary.reason === "no_wallet") {
      state = "Link a wallet to open slots.";
    } else if (summary.reason === "read_failed") {
      state = "Could not read the chain. Your holding is untouched.";
    } else if (summary.held === 0) {
      state = `Hold ${formatNumber(100000)} ${COIN} → 1 slot. Each slot runs one seat.`;
    } else if (summary.atCap) {
      state = "Top threshold — 5 slots, the most there is.";
    } else if (summary.next) {
      state = `${formatNumber(summary.next.short)} more ${COIN} → ${summary.next.buildings} slots`;
    } else {
      state = "";
    }

    const known = summary.enabled && summary.reason !== "read_failed";

    /* "Holding" with no object is a heading about nothing: holding WHAT? Now it
     * says so outright, and in the same place says WHY you would hold: slots.
     * The threshold ladder is folded away under a spoiler — five rows with
     * numbers like 100,000 and 100,000,000 announced, first thing, a volume the
     * person does not have, and said nothing about what it gets you. A single
     * "how much until the next one" line answers the same question and takes up
     * one line of space.
     *
     * The button leads to buying the token, not to pulling: without the token
     * there are zero slots, and any other action on this screen is premature for
     * a newcomer. */
    return `
      <div class="holdings-panel__head">
        <h2>Your ${escapeHtml(COIN)}</h2>
        <span class="holdings-panel__tier">${summary.enabled ? `${summary.buildings} slots` : "Not launched"}</span>
      </div>
      <p class="holdings-panel__state">${escapeHtml(state)}</p>
      ${summary.enabled ? `<dl class="holdings-panel__facts">
        <div><dt>Held</dt><dd>${known ? formatNumber(summary.held) : "—"}</dd></div>
        <div><dt>Payout rate</dt><dd>×${summary.multiplier}</dd></div>
      </dl>` : ""}
      ${contractLine()}
      <div class="holdings-panel__actions">
        ${summary.reason === "no_wallet" ? walletButton() : buyLink()}
      </div>
      <details class="holdings-panel__more">
        <summary>How holding pays</summary>
        <p class="holdings-panel__note">Hold ${escapeHtml(COIN)} and slots open. Each slot runs one seat; the rate multiplies what it pays. Nothing is locked — we only read the balance.</p>
        <ol class="holdings-panel__ladder">${ladder(summary)}</ol>
        ${launchAndEarly(summary)}
      </details>`;
  }

  /* The launch fund and how many wallets are already linked.
   *
   * These are the only two things that honestly make entering early more
   * profitable. A multiplier applied to everyone at once gives nobody anything:
   * the pool is split proportionally to shares. Real extra money in the pool and
   * a small number of participants, on the other hand, do give something, and
   * both numbers are verifiable.
   *
   * Both are shown only if there is something to show. A line saying "fund: $0"
   * and "participants: —" sounds like an excuse and works against us.
   */
  /* There used to be a line about the launch fund here — "$50/day, 30d left,
     $1,500". Removed: the fund is not what the project pays with, and it has no
     business being on the storefront. What is left is only what tells the player
     about his own share. */
  function launchAndEarly(summary) {
    const parts = [];
    if (Number.isInteger(summary.holders) && summary.holders > 0) {
      parts.push(`<strong>${formatNumber(summary.holders)}</strong> wallets linked. The pool splits between everyone — early is worth more.`);
    }
    if (!parts.length) return "";
    return `<div class="holdings-panel__launch">${parts.map((text) => `<p>${text}</p>`).join("")}</div>`;
  }

  function render() {
    const node = byId("holdingsPanel");
    if (!node) return;
    node.innerHTML = markup(cache);
  }

  async function refresh({ force = false } = {}) {
    if (inFlight) return;
    if (!force && Date.now() - lastFetchedAt < MIN_GAP_BETWEEN_REQUESTS) return;
    if (!byId("holdingsPanel")) return;
    inFlight = true;
    try {
      const response = await fetch("/api/v1/holdings/me", {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      cache = await response.json();
      lastFetchedAt = Date.now();
      render();
    } catch (e) {
      // The panel must not disappear because of a failed request: a vanished
      // block reads as "this mechanic does not exist", and it does. We do not
      // throw away data already received either — yesterday's truth beats
      // emptiness.
      if (!cache) cache = { enabled: true, reason: "read_failed", held: 0, buildings: 0, multiplier: 0.4, tiers: [] };
      render();
    } finally {
      inFlight = false;
    }
  }

  /* The entry point for the menu: it calls mount after every redraw, because
   * innerHTML wipes the panel's contents out along with the whole screen. First
   * we draw from the cache so that nothing blinks, then we refresh from the
   * server. */
  function mount() {
    if (!byId("holdingsPanel")) return;
    render();
    refresh();
  }

  root.PackhoodHoldingsPanel = { refresh, mount };
})(typeof window !== "undefined" ? window : globalThis);
