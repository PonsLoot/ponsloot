/* The shop.
 *
 * WHAT USED TO BE IN THIS PLACE. A player-to-player market. It needs liquidity,
 * and without it you see empty shelves — that is, a screen honestly reporting
 * that nobody is here. The only thing worse than an empty screen is an empty
 * screen in the "buy" section.
 *
 * The shop sells on behalf of the game and is always stocked. Prices and the
 * charge live on the server (src/shop.js); here there is only display and the
 * click: a price computed in the browser is an offer, not a price.
 *
 * WHAT IS BOUGHT IS A RARITY, NOT AN ITEM. Which exact item drops within that
 * rarity is decided by the same draw as in crafting — with the same commitment.
 * A shop where money buys exactly the legendary you want would devalue both
 * other ways of getting it.
 */
(function (root) {
  "use strict";

  let state = null;
  let busy = false;
  let message = "";

  const byId = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  const NAMES = {
    common: "Common", uncommon: "Uncommon", rare: "Rare",
    epic: "Epic", legendary: "Legendary",
  };

  const num = (n) => Number(n || 0).toLocaleString("en-US");

  function formatPrice(price) {
    const parts = [`${num(price.gold)} gold`];
    if (price.trophies > 0) parts.push(`${price.trophies} trophies`);
    return parts.join(" + ");
  }

  function canAfford(price) {
    const wallet = state?.wallet || {};
    return (wallet.gold || 0) >= price.gold && (wallet.trophies || 0) >= price.trophies;
  }

  function markup() {
    if (!state) return '<p class="hb-pull-state">Loading the shop…</p>';
    const wallet = state.wallet || {};

    const rows = (state.offers || []).map((offer) => {
      const affordable = canAfford(offer.random) && !busy;
      return `<div class="hb-shop-row" data-rarity="${esc(offer.rarity)}">
        <span class="hb-shop-name">${esc(NAMES[offer.rarity] || offer.rarity)}</span>
        <span class="hb-shop-price">${esc(formatPrice(offer.random))}</span>
        <button class="hb-ledger-button${affordable ? " is-primary" : ""}" type="button"
                data-shop-buy="${esc(offer.rarity)}"${affordable ? "" : " disabled"}>Buy</button>
      </div>`;
    }).join("");

    return `
      <div class="hb-shop-wallet">
        <div><dt>Gold</dt><dd class="hb-value">${num(wallet.gold)}</dd></div>
        <div><dt>Boss trophies</dt><dd class="hb-value">${num(wallet.trophies)}</dd></div>
      </div>
      <div class="hb-shop-list">${rows}</div>
      ${message ? `<p class="hb-pull-state" role="status">${esc(message)}</p>` : ""}
      <p class="hb-pull-note">Gold comes from runs. Trophies come from bosses — stages 5, 10 and 15.</p>`;
  }

  /* The top bar after a purchase.
   *
   * The number in the top bar is drawn when the screen is rendered, and a
   * purchase does not re-render the screen — the panel only changes itself. So
   * after the charge it said 900 down below while up top it still said 1020:
   * one and the same figure in two places, and the one that catches the eye
   * first was lying.
   *
   * Re-rendering the whole screen would have been simpler, but then the line
   * "Bought. Check your Loadout" would have gone with it — that is, the
   * confirmation of the purchase would disappear at the very moment of the
   * purchase. We patch two nodes in place.
   */
  function updateTopbar() {
    const wallet = root.PackhoodWallet;
    if (!wallet) return;
    const rows = document.querySelectorAll(".hb-topbar .hb-resource");
    const write = (node, name, value) => {
      if (!node) return;
      const text = Number(value || 0).toLocaleString("en-US");
      const digits = node.querySelector("span");
      if (digits) digits.textContent = text;
      node.setAttribute("aria-label", `${name} ${text}`);
      node.classList.toggle("is-zero", Number(value || 0) === 0);
    };
    write(rows[0], "Gold", wallet.gold);
    write(rows[1], "Trophies", wallet.trophies);
  }

  function render() {
    const node = byId("shopPanel");
    if (node) node.innerHTML = markup();
  }

  async function load() {
    try {
      const response = await fetch("/api/v1/shop", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state = await response.json();
      /* The wallet is put into a shared place: the menu top bar reads it from
       * there.
       *
       * Otherwise there are two numbers about the same money on the screen —
       * from the save in the top bar and from the server here — and they
       * diverge. A person sees 230 gold up top and a grey button costing 120
       * down below, because on the server they have zero. */
      root.PackhoodWallet = {
        gold: state?.wallet?.gold ?? 0,
        trophies: state?.wallet?.trophies ?? 0,
      };
      updateTopbar();
    } catch (_) {
      // Could not reach it — we keep what we had. Zeroing the wallet on the
      // purchase screen is not allowed: the person will decide the money is
      // gone.
      state = state || { offers: [], wallet: { gold: 0, trophies: 0 } };
    }
    render();
    collectUnfinishedPurchases();
  }

  /* Paid for, but not revealed.
   *
   * A little over a second passes between the money being charged and the item
   * being revealed. Anyone who closed the tab at that moment would be left
   * without the item forever: the server is holding it, but does not reveal it
   * by itself, and there is nobody to ask about it. The server already returns
   * the list of unfinished requests — for exactly this case. We collect them.
   */
  async function collectUnfinishedPurchases() {
    try {
      const response = await fetch("/api/v1/gacha/state", { credentials: "include", cache: "no-store" });
      if (!response.ok) return;
      const snapshot = await response.json();
      const pending = Array.isArray(snapshot?.pendingCrafts) ? snapshot.pendingCrafts : [];
      if (!pending.length) return;
      for (const request of pending) await settle(request);
      await root.PackhoodInventory?.refresh?.();
      message = pending.length === 1
        ? "An unfinished purchase was collected — check your Loadout."
        : `${pending.length} unfinished purchases were collected — check your Loadout.`;
      render();
    } catch (_) { /* quietly: this is a pickup, not an action by the person */ }
  }

  function csrf() {
    return root.LoothoodAccountRuntime?.api?.csrfToken || null;
  }

  function itemName(item) {
    const rarity = NAMES[item.rarity] || item.rarity || "";
    const slot = String(item.slot || "").replace(/^\w/, (ch) => ch.toUpperCase());
    return [rarity, slot].filter(Boolean).join(" ") || "Gear";
  }

  /* The second step of a purchase: the reveal.
   *
   * Before the moment named by the server it answers randomness_unavailable —
   * so first we wait, then we ask. A couple of retries in case the browser
   * clock is slightly ahead of the server's: they will always drift apart, and
   * losing a paid-for item because of that is not allowed. */
  async function settle(request) {
    const id = request?.craftRequestId;
    if (!id) return null;
    const readyAt = Date.parse(request?.randomness?.availableAt || "") || 0;
    const waitMs = Math.max(0, readyAt - Date.now()) + 250;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 8000)));

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const token = csrf();
        const answer = await (await fetch(`/api/v1/equipment/crafts/${encodeURIComponent(id)}/settle`, {
          method: "POST", credentials: "include",
          headers: { Accept: "application/json", "X-Loothood-CSRF": token || "" },
        })).json();
        if (answer?.result) return answer.result;
        if (answer?.code !== "randomness_unavailable") return null;
      } catch (_) { /* network — we try again */ }
      await new Promise((r) => setTimeout(r, 700));
    }
    return null;
  }

  async function buy(rarity) {
    if (busy) return;
    busy = true; message = "Buying…"; render();
    try {
      const token = csrf();
      if (!token) throw new Error("secure session needs a refresh — reload the page");
      const request = await (await fetch("/api/v1/shop/buy", {
        method: "POST", credentials: "include",
        headers: {
          "Content-Type": "application/json", Accept: "application/json",
          "X-Loothood-CSRF": token,
          // A key on the purchase: without it a repeated request after a
          // dropped connection would charge the money twice. The same technique
          // as in crafting.
          "Idempotency-Key": (root.crypto?.randomUUID?.() || String(Date.now()) + Math.random()),
        },
        body: JSON.stringify({ rarity }),
      })).json();
      if (request.code) throw new Error(request.message || request.code);

      /* A PURCHASE IS TWO STEPS, AND NOBODY WAS DOING THE SECOND ONE.
       *
       * The shop reuses the crafting machinery, and that machinery is built as
       * a commitment: the server first records a request with the fingerprint
       * of a secret and the moment before which it may not be revealed, and
       * only then, in a separate request, reveals it and puts the item into the
       * inventory. The button did the first step and stopped there.
       *
       * From the outside it looked like this: the gold was charged, the caption
       * said "bought", and in Loadout — "No owned equipment". The money is
       * gone, the item is not there. Worse than if the purchase simply did not
       * work: a button that does not work is visible immediately.
       *
       * We wait for the reveal moment (the server keeps it in
       * randomness.availableAt) and finish the reveal. A little over a second
       * is exactly the pause that makes the commitment verifiable; it must not
       * be removed. */
      message = "Rolling…";
      render();
      const item = await settle(request);
      // The game holds its own snapshot of the inventory and knows nothing
      // about the purchase: without this request the item would appear in
      // Loadout only after a page reload, and the person goes there straight
      // away.
      await root.PackhoodInventory?.refresh?.();
      message = item
        ? `${itemName(item)} — it is in your Loadout.`
        : "Bought. It will appear in your Loadout shortly.";
      await load();
    } catch (e) {
      message = String(e?.message || e).slice(0, 160);
    } finally {
      busy = false;
      render();
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-shop-buy]");
    if (button) buy(button.dataset.shopBuy);
  });

  function mount() {
    if (!byId("shopPanel")) return;
    render();
    load();
  }

  /* The wallet is read IMMEDIATELY on load, not only when entering the shop.
     The top bar hangs on every screen, and until the first visit to the shop it
     would show the number from the save — that is, exactly the divergence being
     fixed here. */
  load();

  root.PackhoodShop = { mount, refresh: load };
})(typeof window !== "undefined" ? window : globalThis);
