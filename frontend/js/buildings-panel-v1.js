/* Pulling and owning buildings — inside the Buildings section.
 *
 * WHY HERE AND NOT ON A SEPARATE SCREEN. The pull hands out buildings. While it
 * handed out gear its place was in Gear; now what it hands out lives here — and
 * a person has to see what his pull turned into without going anywhere.
 *
 * TWO STEPS ARE VISIBLE TO THE PLAYER. First the commitment: the server names a
 * fingerprint and a moment before which the reveal is not allowed. Then the
 * reveal: the secret arrives, and it can be run through the function by hand.
 * Hiding those two steps behind a single "pull" button would be more convenient,
 * but then the commitment turns into a word instead of a verifiable thing — and
 * it is the only reason to believe the odds.
 */
(function (root) {
  "use strict";

  let state = null;
  let busy = false;
  let message = "";

  const byId = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  function buildingName(id) {
    return root.PackhoodBuildings?.BY_ID?.[id]?.name || id;
  }

  /* Money in human words.
   *
   * Below a cent we do not round down to zero but write "<$0.01": zero means
   * "they do not pay", while "less than a cent" means "they do pay, just not
   * much", and at launch that will be the most frequent case. Showing it as a
   * zero would be lying in the most sensitive direction.
   */
  function money(usd) {
    const n = Number(usd);
    if (!Number.isFinite(n) || n <= 0) return "$0";
    if (n < 0.01) return "<$0.01";
    if (n < 1000) return `$${n.toFixed(2)}`;
    return `$${Math.round(n).toLocaleString("en-US")}`;
  }

  /* Why a pool source is silent — in words, not in code.
   *
   * Each line names WHAT we are waiting for, because a "0" with no reason reads
   * as "the scheme does not work", when the truth is that it has not started
   * yet. Those are different messages, and whether a person stays or leaves
   * depends on them. */
  const REASONS = {
    token_not_launched: "starts with the token",
    fund_not_started: "not started yet",
    no_fund: "no fund set",
  };

  /* EVERY SOURCE HAS ITS OWN RATE, and it is written next to it.
   *
   * "Pons creator fee — $0" explains nothing: the zero is today's revenue, not
   * how the source is built. A person wants to know HOW MUCH is taken from him,
   * and seeing a zero decides the source is made up.
   *
   * "In-game fees" was also a name about nothing. Now it says it outright: it is
   * a share of the ETH people pay for rolls.
   */
  const RATES = { pons: "0.7% of trading, all of it" };
  const SOURCE_NAMES = { pons: "Pons trading fee" };

  /* THE POOL IS THE FEE, AND NOTHING ELSE.
   *
   * The launch fund has been removed from here entirely: no source row, no note
   * about a lower bound. It is not what the project pays with, it is money put
   * in out of our own pocket so that nothing collapses in the first weeks. While
   * it stood on the screen, people added $50/day to their future income — that
   * is, counted as theirs something that runs out in a month.
   *
   * A zero today is the truth, and it is more honest than a fifty: there is no
   * token yet, so there is no fee either. The "token not launched" line next to
   * it says exactly that.
   */
  function poolBlock(pool) {
    if (!pool || !Array.isArray(pool.sources)) return "";
    const fee = pool.sources.find((source) => source.id === "pons");
    if (!fee) return "";

    const waiting = fee.state === "waiting";
    const right = waiting
      ? `<span class="hb-pool-wait">${esc(REASONS[fee.reason] || "not running")}</span>`
      : `<span class="hb-value">${money(fee.usdPerDay)}<small>/day</small></span>`;

    return `
      <section class="hb-pool" aria-label="Where the payout pool comes from">
        <div class="hb-pool-head">
          <h3>Pool</h3>
          <span class="hb-pool-total">${money(pool.usdPerDay)}<small>/day</small></span>
        </div>
        <dl class="hb-pool-list">
          <div class="hb-pool-row${waiting ? " is-waiting" : ""}">
            <dt>${esc(SOURCE_NAMES.pons)}<small class="hb-pool-rate">${esc(RATES.pons)}</small></dt>
            <dd>${right}</dd>
          </div>
        </dl>
      </section>`;
  }

  /* The player's share.
   *
   * AN EMPTY WORLD IS PRESENTED AS AN ADVANTAGE, BECAUSE IT IS ONE. While nobody
   * has working buildings, the very first one takes the whole pool. That is not
   * a marketing phrase but literally what the formula does — and exactly the
   * thing worth saying to the first person who shows up. Hiding it would be
   * modesty at his expense.
   */
  function shareBlock(data) {
    const share = data.share || {};
    const pool = data.pool || {};
    if (!(data.power > 0)) {
      const first = (data.worldPower || 0) <= 0;
      return `<section class="hb-share is-empty">
        <h3>Your cut</h3>
        <p>${first ? "Nobody is working yet. The first one takes it all." : "Nothing working, nothing earned."}</p>
      </section>`;
    }
    return `<section class="hb-share">
      <h3>Your cut</h3>
      <p class="hb-share-money">${money(share.usdPerDay)}<small>/day</small></p>
      <p class="hb-share-formula">${(share.sharePct || 0).toFixed(1)}% · power ${data.power} of ${Math.max(data.worldPower || 0, data.power)}</p>
      ${share.alone ? '<p class="hb-share-note">Only you are working.</p>' : ""}
    </section>`;
  }

  function markup() {
    if (!state) return '<p class="hb-pull-state">Loading your buildings…</p>';

    // The reason there are no slots matters more than their count: "the token is
    // not launched" and "you hold nothing" are different things, and they must
    // not be mixed up.
    const reason = state.holdingReason === "token_not_launched"
      ? "No slots until the token launches. What you own waits."
      : state.holdingReason === "no_wallet"
        ? "Link a wallet to open slots."
        : state.holdingReason === "read_failed"
          ? "Could not read your holding — our problem, not yours."
          : "";

    const owned = (state.owned || []).map((entry) => entry.buildingId);
    const active = new Set(state.active || []);
    const list = owned.length
      ? owned.map((id) => `<li class="${active.has(id) ? "is-active" : ""}">${esc(buildingName(id))}${active.has(id) ? "" : " <small>idle</small>"}</li>`).join("")
      : '<li class="is-empty">Nothing yet.</li>';

    /* THE ORDER OF THE BLOCKS IS ITSELF THE ANSWER TO "WHAT FOR". Money first:
     * where it comes from and how much of it is yours. Only then the mechanics —
     * slots, power, multiplier. The screen used to open with power and the
     * multiplier, that is, it answered "how does this work" to someone who had
     * not yet grasped "why bother at all". A reason to play does not follow from
     * numbers without money. */
    return `
      ${poolBlock(state.pool)}
      ${shareBlock(state)}
      <div class="hb-pull-head">
        <h3>Yours</h3>
        <span class="hb-pull-count">${state.slotsUsed} of ${state.slots} slots working</span>
      </div>
      ${reason ? `<p class="hb-pull-state">${esc(reason)}</p>` : ""}
      <dl class="hb-pull-facts">
        <div><dt>Power</dt><dd class="hb-value">${state.basePower}</dd></div>
        <div><dt>Hold</dt><dd class="hb-value">×${state.multiplier}</dd></div>
        <div><dt>Rolls</dt><dd class="hb-value">${state.pullsAvailable ?? 0}</dd></div>
        <div><dt>Boss shards</dt><dd class="hb-value">${state.bossShards ?? 0} / ${state.shardsPerRoll ?? 3}</dd></div>
      </dl>
      <ul class="hb-pull-owned">${list}</ul>
      <!-- THE ROLL BUTTONS ARE NO LONGER HERE.
           They stood both here and on Forge — one action in two places, named
           with the same word as the section itself. Hence the "two rolls": a
           person saw "Forge" in the menu and "Forge 1" on another screen and
           took them for different things. You roll on Forge and own in Estate;
           here there is a link over there. -->
      <div class="hb-pull-actions">
        <button class="hb-ledger-button" type="button" data-shell-destination="pulls">Go to Forge</button>
      </div>`;
  }

  /* Income on the catalogue cards.
   *
   * The cards are drawn by the menu, but only the server knows the numbers for
   * them: income depends on the pool and on the world's power. So a card comes
   * out with a dash, and the value is substituted in here — with the same hold
   * multiplier the player has right now, because his question is a specific one:
   * "how much will this bring ME".
   *
   * The formula is called from the shared place (PackhoodPool) rather than
   * rewritten here. A second copy would diverge from the server's one, and would
   * diverge silently — the numbers look plausible whatever the error.
   */
  /* THE AMOUNTS ARE NO LONGER ON THE CARDS, AND THAT IS NOT A SIMPLIFICATION.
   *
   * This used to compute a building's income in dollars per day and put it into
   * the card. The number was correct and misleading at the same time: while not
   * a single building is working in the world, any single one takes the whole
   * pool — so all ten cards carried the same "$50.00/day", and that was the
   * launch fund, not the building's earnings. A second player would show up and
   * the amount would halve without anything breaking.
   *
   * A whole prop had been written to support this: a line above the grid
   * explaining why the ten amounts were identical. A prop that explains a metric
   * is a sign that the metric was chosen wrong. Both are gone.
   *
   * The card now states the RATE (0.7% of turnover) — it is the same for all
   * buildings and does not depend on the number of players or on whether the
   * fund has started. How much that is in money is shown by the Pool block:
   * which also says where the money comes from.
   */
  function removeLegacyNote() {
    // The note may have survived in the markup from a previous version of the page.
    const note = document.getElementById("pullsCatalogueNote");
    if (note) note.remove();
  }


  /* Live coin data on a card: place in the top, price, 24 hours.
   *
   * THE PLACE IS WHAT REPLACED RARITY. "Why is Bullseye Yard rarer than Archery
   * Range" had no answer: I set the rarities by eye. A coin's place in the top 6
   * is an answer nobody has to invent: it is live, verifiable and matches what
   * the player already knows about these coins.
   *
   * The word rarity itself has been taken off the card. Keeping both would have
   * meant putting two disagreeing statements about value side by side.
   */
  /* The coin on the card is the one that currently occupies that PLACE in the top.
   *
   * The card knows its place (data-seat) and knows nothing about the ticker: the
   * composition of the top is live, and a ticker written into the markup would
   * diverge from the real one the very day the composition changes — and would
   * lie silently.
   */
  /* THE COIN'S COLOUR, TAKEN FROM ITS ICON.
   *
   * A trick from 6PACK, along with its reasons. Computed on 32×32: only opaque,
   * non-grey and not almost-black/white pixels are taken, accumulated around the
   * hue circle, and the most saturated bucket wins.
   *
   * THE LIGHTNESS IS SET HERE and not taken from the icon. The card is dark, and
   * the window has to stay dark however bright the coin is: otherwise a glowing
   * rectangle hangs next to a black card.
   *
   * The median saturation, not the mean: a single bright pixel on a white logo
   * would shift the mean noticeably, and the median not at all.
   *
   * The picture goes through our own /api/v1/coins/icon: a canvas holding
   * someone else's image without CORS gets "tainted", getImageData throws, and
   * the colours cannot be obtained at all.
   */
  const NEUTRAL_TONE = { base: "rgba(0,0,0,.34)", hi: "rgba(0,0,0,.25)" };
  const TONE_CACHE = new Map();

  function toneFromImage(img) {
    const N = 32;
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return NEUTRAL_TONE;
    let px;
    try { g.drawImage(img, 0, 0, N, N); px = g.getImageData(0, 0, N, N).data; }
    catch { return NEUTRAL_TONE; }

    const BUCKETS = 24;
    const weight = new Float64Array(BUCKETS), cx = new Float64Array(BUCKETS), cy = new Float64Array(BUCKETS);
    const sats = [];
    let opaque = 0;

    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] / 255 < 0.5) continue;
      opaque++;
      const r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255;
      const maxC = Math.max(r, gg, b), minC = Math.min(r, gg, b), d = maxC - minC;
      if (d < 0.12) continue;                       // grey
      const l = (maxC + minC) / 2;
      if (l < 0.06 || l > 0.96) continue;           // almost black and almost white
      const s = d / (1 - Math.abs(2 * l - 1));
      sats.push(s);
      let h;
      if (maxC === r) h = ((gg - b) / d + 6) % 6;
      else if (maxC === gg) h = (b - r) / d + 2;
      else h = (r - gg) / d + 4;
      h *= 60;
      const k = Math.floor(h / (360 / BUCKETS)) % BUCKETS;
      weight[k] += s;
      cx[k] += Math.cos(h * Math.PI / 180) * s;
      cy[k] += Math.sin(h * Math.PI / 180) * s;
    }
    if (!opaque || !sats.length) return NEUTRAL_TONE;
    sats.sort((a, b) => a - b);
    const median = sats[sats.length >> 1];
    if ((sats.length / opaque) * median < 0.02) return NEUTRAL_TONE;
    let best = 0;
    for (let k = 1; k < BUCKETS; k++) if (weight[k] > weight[best]) best = k;
    const hue = (Math.atan2(cy[best], cx[best]) * 180 / Math.PI + 360) % 360;
    const s = Math.round(Math.min(70, Math.max(14, median * 90)));
    return {
      base: `hsl(${hue.toFixed(0)} ${s}% 9%)`,
      hi: `hsl(${hue.toFixed(0)} ${Math.min(78, s + 8)}% 18%)`,
    };
  }

  function coinTone(url) {
    if (!url) return Promise.resolve(null);
    if (TONE_CACHE.has(url)) return TONE_CACHE.get(url);
    const p = new Promise((done) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => done(toneFromImage(img));
      img.onerror = () => done(null);
      img.src = "/api/v1/coins/icon?u=" + encodeURIComponent(url);
    });
    TONE_CACHE.set(url, p);
    return p;
  }

  function fillCoinsOnCards() {
    const coins = state?.coins || [];
    const bySeat = {};
    for (const coin of coins) if (coin?.rank) bySeat[coin.rank] = coin;

    for (const card of document.querySelectorAll(".hb-bc[data-seat]")) {
      const seat = Number(card.dataset.seat);
      const coin = bySeat[seat];
      const tickerNode = card.querySelector(".hb-bc__sym");
      const priceNode = card.querySelector(".hb-bc__price");
      const coinSide = card.querySelector(".hb-bc__coin");
      const symNode = card.querySelector(".hb-bc__coin-sym");

      if (!coin) {
        // There should be no place without a coin — the top hands out ten. But
        // if the source returned a shorter list, the card stays quiet instead of
        // making something up.
        if (tickerNode) tickerNode.textContent = "";
        if (symNode) symNode.textContent = "";
        if (priceNode) priceNode.textContent = "";
        card.dataset.rank = "";
        continue;
      }

      const symbol = String(coin.sym || "").toUpperCase();
      if (tickerNode) tickerNode.textContent = symbol;
      if (symNode) {
        symNode.textContent = symbol;
        /* The squeeze is computed by MEASUREMENT, not by string length.
         *
         * STONKBROKER did not fit into the coin column. An identical squeeze for
         * everyone would either not have saved it or would have mangled "AI". A
         * formula based on letter count lies too: letters have different widths,
         * and the font is a bitmap one on top of that. So we measure the real
         * width of the caption and squeeze it by exactly as much as it overflows
         * — but no more than by half, because past that boundary it can no
         * longer be read, and it is better to let it stick out. */
        /* THERE IS NO WRAPPING ANY MORE, AND THAT IS THE MAIN POINT.
         *
         * A long ticker used to be allowed to wrap, and it broke mid-word:
         * "TENDI ES", "STONK BROKE R", "CASHC AT". A broken word reads worse
         * than a small one — the eye stumbles and completes the wrong ticker. A
         * ticker is a name, and a name must not be broken.
         *
         * So the line is always a single one, and what does not fit is fixed by
         * two means in sequence: first a light horizontal squeeze (it suits a
         * bitmap font — the letters get narrower, the height and crispness stay
         * the same), and if that is not enough the font shrinks, but not below
         * 9px, past which Alagard turns into mush. Below that limit the line
         * simply sticks out a little: a clipped tail is more honest than a
         * substituted name.
         */
        symNode.style.removeProperty("--sym-squeeze");
        symNode.style.removeProperty("font-size");
        symNode.classList.remove("is-wrapped");

        const avail = coinSide ? coinSide.clientWidth - 6 : 0;
        if (avail > 0) {
          const baseSize = parseFloat(getComputedStyle(symNode).fontSize) || 13;
          const needed = symNode.scrollWidth;

          // 1. The squeeze. Down to 0.78 the letters are still themselves.
          const squeeze = needed > avail ? Math.max(0.78, avail / needed) : 1;
          if (squeeze < 1) symNode.style.setProperty("--sym-squeeze", squeeze.toFixed(3));

          // 2. If the squeeze was not enough — shrink the font by the missing
          //    fraction. scrollWidth does not account for transform, so we
          //    compute the squeezed width ourselves instead of measuring again.
          const squeezed = needed * squeeze;
          if (squeezed > avail) {
            symNode.style.fontSize = `${Math.max(9, baseSize * (avail / squeezed)).toFixed(1)}px`;
          }
        }
      }
      if (priceNode) {
        const arrow = coin.chg24 >= 0 ? "\u25b2" : "\u25bc";
        priceNode.innerHTML = `<span class="hb-bc__spot">${formatPrice(coin.price)}</span>`
          + `<span class="hb-bc__chg ${coin.chg24 >= 0 ? "is-up" : "is-dn"}">${arrow} ${Math.abs(coin.chg24).toFixed(1)}%</span>`;
      }

      /* The icon is inserted once per coin. Compared by address, not by ticker:
         the first read arrives without icons, and the card would decide there
         was nothing left to draw. That is a rake from 6PACK, described over
         there. */
      const iconUrl = coin.icon || "";
      if (coinSide && coinSide.dataset.icon !== iconUrl) {
        coinSide.dataset.icon = iconUrl;
        coinSide.querySelector("img")?.remove();
        if (iconUrl) {
          const picture = new Image();
          picture.alt = "";
          picture.decoding = "async";
          // We show it after loading: an <img> with a broken address draws a
          // broken-image glyph on top of the ticker — worse than the ticker alone.
          picture.onload = () => coinSide.insertBefore(picture, coinSide.firstChild);
          picture.src = iconUrl;
          coinTone(iconUrl).then((tone) => {
            if (!tone || coinSide.dataset.icon !== iconUrl) return;
            card.style.setProperty("--tone", tone.base);
            card.style.setProperty("--tone-hi", tone.hi);
          });
        } else {
          // With no icon there is nowhere to take the tone from — the neutral
          // one remains, and the ticker is visible on the card. An empty square
          // would read as breakage.
          card.style.removeProperty("--tone");
          card.style.removeProperty("--tone-hi");
        }
      }

      /* The card's stripe is coloured by PLACE, not by rarity: otherwise two
       * disagreeing statements about value would stand side by side, and the
       * colour wins. */
      card.dataset.rank = String(seat);
    }

    // The same substitution in the odds table: there the coin badge comes out
    // carrying a place.
    for (const badge of document.querySelectorAll(".hb-coin-badge[data-seat]")) {
      const coin = bySeat[Number(badge.dataset.seat)];
      const symNode = badge.querySelector(".hb-coin-badge__sym");
      if (coin && symNode) symNode.textContent = String(coin.sym || "").toUpperCase();
    }
  }

  /* The coin price in significant figures rather than a fixed number of decimal
     places: PIPEDOG is at 0.0026 and CASHCAT at 0.18, and a common format would
     flatten one of them into a zero. */
  function formatPrice(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return "—";
    if (n >= 1) return `$${n.toFixed(2)}`;
    if (n >= 0.01) return `$${n.toFixed(4)}`;
    return `$${n.toPrecision(3)}`;
  }

  function render() {
    const node = byId("buildingsPanel");
    if (node) node.innerHTML = markup();
    removeLegacyNote();
    fillCoinsOnCards();
  }

  /* On someone else's screen our own panel is absent, but the cards are there —
   * and BOTH kinds of number have to be filled in: the coin and the income. At
   * first I substituted only the coin, and on Forge the income line held a dash:
   * cards with coins, a price and a chance — and silence where it says how much
   * this pays. That is, on the screen where people decide whether to pay, the
   * main number was missing. */
  function refreshView() {
    if (byId("buildingsPanel")) { render(); return; }
    removeLegacyNote();
    fillCoinsOnCards();
  }

  async function load() {
    try {
      const res = await fetch("/api/v1/buildings/me", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state = await res.json();
    } catch (_) {
      // An empty block would read as "the mechanic does not exist". It does, we
      // simply failed to fetch it right now, and those are different words.
      state = state || { slots: 0, slotsUsed: 0, basePower: 0, multiplier: 0,
                         owned: [], active: [], pullsAvailable: 0,
                         holdingReason: "read_failed",
                         // There is no pool and no share — the blocks are simply
                         // not drawn. Drawing them with zeros would mean saying
                         // "they pay zero", when the truth is "we could not get
                         // through".
                         pool: null, share: null, worldPower: 0 };
    }
    refreshView();
  }

  /* THE REVEAL WINDOW: A CHEST THAT OPENS.
   *
   * WHAT WAS HERE AND WHY IT WAS NOT ENOUGH. The window appeared already open,
   * with the card fading in and rising fourteen pixels. Two keyframes, and the
   * only event people come to this screen for was over before the eye caught
   * it. Worse, the second and a half before it — the commit-reveal gate, a real
   * one the server enforces — was spent on a countdown reading "Opening in
   * 1.5s". The most charged moment in the game was a number ticking down.
   *
   * Now that wait is the chest opening. Same forty-nine frames as the trailer,
   * so the ad and the game show the same thing, and the card comes out of the
   * fire rather than appearing next to it.
   *
   * TIMING IS NOT DECORATIVE, IT IS TWO GATES AT ONCE. The card may show only
   * when BOTH have passed: the chest is properly open (2.5 s in — measured, the
   * lid is only half back at 1.5 s) and the server has answered. The server's
   * own gate is 1.5 s, so the animation covers it with room to spare and no one
   * ever sees a refusal for being early. Whichever finishes last decides.
   *
   * VIDEO, NOT FORTY-NINE PNGs. The frames are 32 MB at full size; as one
   * 960x540 clip they are 135 KB. A game that already asks for a lot of art
   * does not get to spend 32 MB on three seconds.
   *
   * IF THE VIDEO DOES NOT PLAY — autoplay refused, the file missing, motion
   * turned off in the system — the poster frame stays and the card appears on a
   * timer. Never a blank rectangle: this is the moment someone is waiting on.
   */
  const CHEST_OPEN_MS = 2500;   // measured on the frames: fully open, fire at full
  const CHEST_TOTAL_MS = 3060;  // 49 frames at 16 per second

  function revealCard(building, index) {
    const artPath = new URL(`assets/building_${slugOf(building.id)}_forms_v1.png`, document.baseURI).href;
    const full = root.PackhoodBuildings?.BY_ID?.[building.id] || building;
    const coin = full.coin || building.coin || "";
    const icon = full.icon || building.icon || "";
    /* The coin comes from the LIVE catalogue, not from the static one.
     *
     * This is where the old window was visibly broken: it took the building
     * straight out of the static catalogue, where `coin` and `icon` are null —
     * they are filled in by withCoins from the live top ten. The result was
     * three empty dark squares where the art should be. */
    const badge = icon
      ? `<img class="hb-reveal-card__coin" src="${esc(icon)}" alt="" decoding="async">`
      : (coin ? `<span class="hb-reveal-card__coin hb-reveal-card__coin--text">${esc(coin)}</span>` : "");
    return `<figure class="hb-reveal-card" data-rarity="${esc(building.rarity || "common")}" style="--i:${index}">
      <div class="hb-reveal-card__win">
        <div class="hb-reveal-card__art" style="--building-art: url('${artPath}')" aria-hidden="true"></div>
        ${badge}
      </div>
      <figcaption>
        <b class="hb-reveal-card__sym">${esc(coin)}</b>
        <strong>${esc(full.name || building.name || building.id)}</strong>
        <span class="hb-reveal-card__power">${building.power ?? full.power ?? "—"} power</span>
      </figcaption>
    </figure>`;
  }

  function slugOf(id) {
    // camelCase to snake_case: huntsmansHall -> huntsmans_hall. The game builds
    // the file name the same way, and that is the only reason for the formula.
    return String(id).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  }

  /* Opens the window and starts the chest. Returns a handle: the caller passes
     the result in when it arrives, or reports a failure. */
  function openChest() {
    /* Listeners hung on the document rather than on the node have to be taken
       off by hand: the node goes away with the window, the document does not.
       Declared here, above every use: further down it sat below `close`, which
       reads it — legal only because close never runs synchronously, and that is
       the kind of "legal only because" that breaks later. */
    const documentListeners = [];
    const overlay = document.createElement("div");
    overlay.className = "hb-reveal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Opening");
    overlay.innerHTML = `
      <div class="hb-reveal__panel">
        <div class="hb-reveal__chest">
          <video class="hb-reveal__video" muted playsinline autoplay preload="auto"
                 poster="images/chest/chest-poster.jpg">
            <source src="images/chest/chest.webm" type="video/webm">
            <source src="images/chest/chest.mp4" type="video/mp4">
          </video>
          <div class="hb-reveal__out" data-reveal-out></div>
        </div>
        <div class="hb-reveal__after" data-reveal-after hidden>
          <p class="hb-reveal__proof" data-reveal-proof></p>
          <button class="hb-ledger-button is-primary" type="button" data-reveal-close>Done</button>
        </div>
      </div>`;

    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKeydown);
      while (documentListeners.length) documentListeners.pop()();
    };
    // Escape closes it: the window covers the whole screen, and someone whose
    // mouse is elsewhere would end up locked in.
    const onKeydown = (event) => { if (event.key === "Escape") close(); };
    overlay.addEventListener("click", (event) => {
      // Only after the card is out. A click during the opening would look like
      // the chest was cancelled, and the roll has already happened by then.
      if (!overlay.dataset.settled) return;
      if (event.target === overlay || event.target?.closest?.("[data-reveal-close]")) close();
    });
    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(overlay);

    const video = overlay.querySelector(".hb-reveal__video");
    /* The promise resolves when the chest is open — by playback if the video
       runs, by timer if it does not. Both are armed: a video that silently
       refuses to play is common enough that a timer-free version would hang. */
    const opened = new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearInterval(timer);
        while (documentListeners.length) documentListeners.pop()();
        resolve();
      };

      /* WHY THIS IS A POLL AND NOT JUST `timeupdate` PLUS A DEADLINE.
       *
       * The first version had a fallback timer that paused the video and let
       * the card out at 2.9 seconds no matter what. On the first roll after a
       * page load the clip is often still arriving — it is only 135 KB, but it
       * is fetched when the window opens — and the timer then paused it at
       * currentTime 0. Caught on the live page: the card came out over a still
       * poster, and playback never happened at all. A safety net that fires on
       * a merely slow start converts "a bit late" into "no animation".
       *
       * So: the deadline no longer pauses anything. It only lets the card out,
       * and a video that started late keeps playing behind it. Only a video
       * that never started at all leaves the poster showing — which is the
       * honest degradation, not a bug.
       */
      const timer = root.setInterval(() => {
        if (video.currentTime * 1000 < CHEST_OPEN_MS) return;
        video.pause?.();
        finish();
      }, 100);

      /* If the clip does run to the end — a very slow start, or a browser that
       * fires no timeupdate — go back to the open frame and hold it. An ended
       * video is exactly what turns the panel black: the browser is free to
       * drop the frame it was showing, and Chrome does. */
      video.addEventListener("ended", () => {
        try { video.currentTime = CHEST_OPEN_MS / 1000; } catch (e) { /* seeking may be refused */ }
        video.pause?.();
        finish();
      });
      video.addEventListener("error", finish);

      /* A REJECTED play() IS NOT THE SAME AS A BROKEN VIDEO.
       *
       * It used to call finish() on any rejection, and the card came out
       * instantly over a motionless poster. The rejection I actually caught was
       * "video-only background media was paused to save power" — Chrome
       * suspends muted, soundless video while the tab is in the background. A
       * person who rolls and switches away for a second comes back to a chest
       * that never opened and a card already lying next to it.
       *
       * So: give up only when the media itself failed (video.error is set).
       * Everything else waits for the ceiling, and the retry below picks the
       * playback back up when the tab returns. */
      const tryPlay = () => video.play?.().catch(() => { if (video.error) finish(); });
      tryPlay();
      const onVisible = () => {
        if (document.visibilityState !== "visible") return;
        if (done || video.ended) return;
        if (video.currentTime * 1000 < CHEST_OPEN_MS) tryPlay();
      };
      document.addEventListener("visibilitychange", onVisible);
      documentListeners.push(() => document.removeEventListener("visibilitychange", onVisible));

      // The ceiling. Nobody waits on a chest for six seconds; past this the
      // card comes out regardless, over whatever the window is showing.
      root.setTimeout(finish, CHEST_OPEN_MS + 2500);
    });

    return {
      overlay,
      opened,
      settle(result) {
        overlay.dataset.settled = "1";
        const catalogue = root.PackhoodBuildings;
        const dropped = (result.results || []).map((e) => ({ ...(catalogue?.BY_ID?.[e.id] || {}), ...e }));
        overlay.querySelector("[data-reveal-out]").innerHTML =
          dropped.map((b, i) => revealCard(b, i)).join("");
        overlay.querySelector("[data-reveal-proof]").innerHTML =
          `secret <code>${esc(String(result.secret).slice(0, 16))}…</code>` +
          ` · commitment <code>${esc(String(result.commitment).slice(0, 16))}…</code>`;
        const after = overlay.querySelector("[data-reveal-after]");
        after.hidden = false;
        overlay.querySelector("[data-reveal-close]")?.focus?.();
        // The frame the chest stopped on stays behind the card. It was paused
        // at the open moment above, not here: by the time settle runs the clip
        // could already have ended, and an ended video is exactly what goes
        // black.
        video.pause?.();
      },
      fail(text) {
        overlay.dataset.settled = "1";
        overlay.querySelector("[data-reveal-out]").innerHTML =
          `<p class="hb-reveal__bad">${esc(text)}</p>`;
        const after = overlay.querySelector("[data-reveal-after]");
        after.hidden = false;
        overlay.querySelector("[data-reveal-close]")?.focus?.();
      },
      close,
    };
  }

  /* The old entry point, kept working: it opens the chest and settles it as
     soon as the chest is open. Callers that already have the result use it. */
  function showRevealPending() { return openChest(); }

  function showReveal(result) {
    const chest = openChest();
    chest.opened.then(() => chest.settle(result));
    return chest;
  }

  function csrf() {
    // The same token the account client uses. The panel has none of its own and
    // must not have one: a second CSRF source would diverge from the first when
    // the session is refreshed, and mutations would start getting 403s with no
    // explanation.
    return root.LoothoodAccountRuntime?.api?.csrfToken || null;
  }

  async function pull(count) {
    if (busy) return;
    busy = true; message = "Committing…"; render();
    try {
      const token = csrf();
      if (!token) throw new Error("secure session needs a refresh — reload the page");
      const commit = await (await fetch("/api/v1/buildings/pull", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-Loothood-CSRF": token },
        body: JSON.stringify({ count }),
      })).json();
      if (commit.code) throw new Error(commit.message || commit.code);

      /* THE CHEST OPENS NOW, NOT AFTER THE ANSWER.
       *
       * The commitment is published, the outcome is already fixed, and the wait
       * that follows is the honesty gate — so it may as well be the animation.
       * Opening the window only after the reveal arrived would put the chest
       * after the moment it exists for. */
      message = "";
      render();
      const chest = showRevealPending();

      // We wait for the announced moment, not for "a bit": the server will
      // reject an early reveal anyway, and showing a person a refusal because we
      // were in a hurry is our fault, not his.
      const waitMs = Math.max(0, new Date(commit.availableAt).getTime() - Date.now()) + 250;
      await new Promise((r) => setTimeout(r, waitMs));

      const result = await (await fetch(`/api/v1/buildings/pull/${commit.pullId}/reveal`, {
        method: "POST", credentials: "include",
        headers: { Accept: "application/json", "X-Loothood-CSRF": token },
      })).json();
      if (result.code) {
        chest.fail(result.message || result.code);
        throw new Error(result.message || result.code);
      }

      // Both gates: the chest must be open AND the answer must be here.
      await chest.opened;
      chest.settle(result);
      await load();
    } catch (e) {
      message = String(e?.message || e).slice(0, 160);
    } finally {
      busy = false;
      render();
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-building-pull]");
    if (button) pull(Number(button.dataset.buildingPull) || 1);
  });

  function mount() {
    /* The panel is mounted even where its own node does not exist.
     *
     * The odds table lives on the Forge screen, and only this panel knows the
     * coins. Bailing out when buildingsPanel was absent used to be correct —
     * there was nothing to draw. Now there is work left on someone else's
     * screen: substituting tickers for places. Without it the "Coin" column
     * would stay filled with numbers forever, and nobody would ever see the
     * mistake — the numbers look exactly as intended. */
    const own = byId("buildingsPanel");
    if (!own && !document.querySelector("[data-seat]")) return;
    if (own) render();
    else fillCoinsOnCards();
    load();
  }

  // showReveal is exposed outwards: rolling now happens on Forge, while the
  // reveal window lives here. A second copy of the same window would diverge
  // from the first in look and wording.
  root.PackhoodBuildingsPanel = { mount, refresh: load, showReveal, openChest };
})(typeof window !== "undefined" ? window : globalThis);
