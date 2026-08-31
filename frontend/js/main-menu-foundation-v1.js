(function initDesktopMainMenu(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) root.LoothoodDesktopMainMenu = api;
})(typeof window !== "undefined" ? window : globalThis, function desktopMainMenuFactory() {
  "use strict";

  const ASSET_ROOT = "./assets/ui/main-menu-foundation-v1/";
  const SCREENS = Object.freeze([
    "hunt",
    "buildings",
    "pulls",
    "guide",
    "docs",
    "standard-prep",
    "outfitter",
    "marketplace",
    "outfitter-reroll",
    "outfitter-scrap-forge",
    "outfitter-scrap-review",
  ]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatNumber(value) {
    return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("en-US");
  }

  function titleCase(value) {
    const text = String(value || "");
    return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "";
  }

  function asset(file) {
    return `${ASSET_ROOT}${file}`;
  }

  // Art for a named legendary, looked up by its name. The file name is built by
  // the same rule as in tools/sprites/build-manifest.py — otherwise half the
  // links drift away from what actually sits in images.
  function legendaryArt(itemName) {
    const slug = String(itemName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) return "";
    // The path has to be absolute. The value goes into the --lh-item variable,
    // and url() inside a variable is resolved by the browser relative to the
    // stylesheet where the variable is used, not relative to the page: a
    // relative images/… turned into /css/images/… and gave a 404.
    // The version tag is mandatory. The image address did not change when the
    // art was redrawn, and the browser kept serving the old file out of cache:
    // the items had been regenerated and aligned to the bottom, yet the screen
    // still showed the previous ones. Stylesheets had such a tag from the very
    // beginning, item icons did not.
    // Bump it on every regeneration of the set.
    return new URL(`images/item-legendary-${slug}-v1.png?v=2`, document.baseURI).href;
  }

  function symbols() {
    return `
      <svg class="hb-symbols" aria-hidden="true">
        <defs>
          <symbol id="hb-icon-account-settings" viewBox="0 0 48 48"><circle cx="18" cy="15" r="6"/><path d="M7 36c1-8 5-12 11-12 5 0 9 3 11 8"/><circle cx="36" cy="34" r="5"/><path d="M36 24v4M36 40v4M26 34h5M41 34h5M29 27l3 3M40 38l3 3M43 27l-3 3M32 38l-3 3"/></symbol>
          <symbol id="hb-icon-volume" viewBox="0 0 15 15" shape-rendering="crispEdges"><rect x="7" y="1" width="2" height="1"/><rect x="6" y="2" width="3" height="1"/><rect x="13" y="2" width="2" height="1"/><rect x="5" y="3" width="4" height="1"/><rect x="13" y="3" width="2" height="1"/><rect x="4" y="4" width="5" height="1"/><rect x="10" y="4" width="2" height="1"/><rect x="13" y="4" width="2" height="1"/><rect x="1" y="5" width="8" height="1"/><rect x="10" y="5" width="2" height="1"/><rect x="13" y="5" width="2" height="1"/><rect x="1" y="6" width="8" height="1"/><rect x="10" y="6" width="2" height="1"/><rect x="13" y="6" width="2" height="1"/><rect x="1" y="7" width="8" height="1"/><rect x="10" y="7" width="2" height="1"/><rect x="13" y="7" width="2" height="1"/><rect x="1" y="8" width="8" height="1"/><rect x="10" y="8" width="2" height="1"/><rect x="13" y="8" width="2" height="1"/><rect x="4" y="9" width="5" height="1"/><rect x="10" y="9" width="2" height="1"/><rect x="13" y="9" width="2" height="1"/><rect x="5" y="10" width="4" height="1"/><rect x="13" y="10" width="2" height="1"/><rect x="6" y="11" width="3" height="1"/><rect x="13" y="11" width="2" height="1"/><rect x="7" y="12" width="2" height="1"/></symbol>
          <symbol id="hb-icon-muted" viewBox="0 0 15 15" shape-rendering="crispEdges"><rect x="7" y="1" width="2" height="1"/><rect x="6" y="2" width="3" height="1"/><rect x="5" y="3" width="4" height="1"/><rect x="4" y="4" width="5" height="1"/><rect x="1" y="5" width="8" height="1"/><rect x="1" y="6" width="8" height="1"/><rect x="1" y="7" width="8" height="1"/><rect x="1" y="8" width="8" height="1"/><rect x="4" y="9" width="5" height="1"/><rect x="5" y="10" width="4" height="1"/><rect x="6" y="11" width="3" height="1"/><rect x="7" y="12" width="2" height="1"/><path d="M9.5 3.5 L14 8" stroke="currentColor" stroke-width="2" fill="none" shape-rendering="auto"/><path d="M14 3.5 L9.5 8" stroke="currentColor" stroke-width="2" fill="none" shape-rendering="auto"/></symbol>
          <symbol id="hb-nav-hunt" viewBox="0 0 48 48"><path d="M12 7c10 8 10 26 0 34M36 7c-10 8-10 26 0 34M12 24h26M31 18l7 6-7 6"/></symbol>
          <symbol id="hb-nav-settlement" viewBox="0 0 48 48"><path d="M6 23 24 7l18 16M11 21v20h26V21M19 41V28h10v13M8 41h32"/></symbol>
          <symbol id="hb-nav-plots" viewBox="0 0 48 48"><path d="m8 10 10-4 12 4 10-4v32l-10 4-12-4-10 4zM18 6v32M30 10v32"/><path d="m12 30 7-8 6 4 9-10"/></symbol>
          <symbol id="hb-nav-gacha" viewBox="0 0 48 48"><path d="M8 8h32v32H8z"/><path d="m24 13 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z"/></symbol>
          <symbol id="hb-nav-outfitter" viewBox="0 0 48 48"><path d="m15 8 9 5 9-5 8 9-6 7v17H13V24l-6-7zM18 12l6 9 6-9M24 21v20"/></symbol>
          <symbol id="hb-nav-bounties" viewBox="0 0 48 48"><circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="9"/><path d="M24 2v12M24 34v12M2 24h12M34 24h12"/></symbol>
          <symbol id="hb-nav-guide" viewBox="0 0 48 48"><path d="M6 9c8-3 14-1 18 4v29c-4-5-10-7-18-4zM42 9c-8-3-14-1-18 4v29c4-5 10-7 18-4z"/><path d="M11 16h8M11 22h8M29 16h8M29 22h8"/></symbol>
        </defs>
      </svg>`;
  }

  /* GOLD AND TROPHIES COME FROM THE SERVER, NOT FROM THE SAVE.
   *
   * There were two of them, and they diverged. The header showed the number
   * from the browser save, while the shop debited the server-side account: a
   * person saw 230 gold and could not buy an item for 120, because on the
   * server he had zero. The button is greyed out, the reason is invisible, and
   * the number next to it insists the money is there.
   *
   * The truth is the server's: it cannot be faked there, and that is where the
   * payments come from. The save stays as a fallback for the first second,
   * while the shop panel has not answered yet: showing a zero to someone who
   * does have money is the same lie in reverse.
   */
  function walletAmount(field, fromSave) {
    const wallet = window.PackhoodWallet;
    const amount = wallet && Number.isFinite(Number(wallet[field])) ? Number(wallet[field]) : null;
    return amount === null ? fromSave : amount;
  }

  function resource(label, value, file, className = "") {
    const display = formatNumber(value);
    const classes = ["hb-resource", className, Number(value) === 0 ? "is-zero" : ""].filter(Boolean).join(" ");
    return `<div class="${classes}" aria-label="${escapeHtml(label)} ${display}"><img class="hb-resource__icon" src="${asset(file)}" alt=""><span>${display}</span></div>`;
  }

  /* Outbound links live in the header, not at the bottom of the page.
   *
   * At the bottom nobody sees them: whoever scrolls to the end of the menu has
   * already arrived, and the person who needs inviting has not. So X stands next
   * to the name.
   *
   * Until the address is written into brand.js there is no link at all — not a
   * greyed-out one, not a "soon", none. An inactive button occupies space in the
   * most expensive corner of the screen and gives nothing back for it.
   */
  function brandLinks() {
    const brand = window.PackhoodBrand || {};
    if (!brand.x) return "";
    return `<a class="hb-brand-social" href="${escapeHtml(brand.x)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(brand.name || "")} on X">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12.6 0h2.45l-5.35 6.12L16 16h-4.94l-3.87-5.06L2.76 16H.3l5.72-6.54L0 0h5.06l3.5 4.63L12.6 0zm-.86 14.54h1.36L4.32 1.38H2.87l8.87 13.16z"/></svg>
      <span>Follow</span>
    </a>`;
  }

  /* The contract, to the right of Follow.
   *
   * THE FIRST VERSION LOOKED BROKEN, AND THAT WAS MEASURABLE rather than a
   * matter of taste. I gave the chip a height of 26 pixels and the button inside
   * it its own padding, and it grew to forty-two: the button STUCK OUT of the
   * frame that is supposed to hold it. On top of that, three fonts in a row of
   * two neighbours: Follow is set in PixelOperator 13px, and I put the address
   * in monospace 12px inside a box with an inherited 16px. The word COPY on a
   * solid lime fill finished the job: next to the outlined Follow it read as a
   * sticker pasted over the header.
   *
   * Now the chip repeats Follow exactly: the same height, the same font and
   * size, the same border, the same corner radius, a transparent background. It
   * differs in one thing — inside there is a second half, the button, and it is
   * separated by a vertical rule rather than by a border of its own. That way it
   * reads as ONE element with two parts, not as two objects stuck together side
   * by side.
   *
   * AN ICON INSTEAD OF A WORD. "copy" would be a third text style in a row that
   * already has two. An icon made of two rectangles is understood without
   * language and weighs the same as the neighbouring X icon.
   *
   * THE FULL ADDRESS GOES TO THE CLIPBOARD, the shortened one is displayed. A
   * button that puts "0x1234…cdef" in the clipboard looks like it worked and
   * breaks everything further down the chain — the person finds out about it
   * only once he is in his wallet.
   *
   * The node is always drawn and stays hidden while there is no address: that
   * way it does not have to be inserted into the header after the fact, once the
   * response arrives.
   */
  function contractChip() {
    return `<span class="hb-contract" data-contract hidden>
      <code class="hb-contract__addr" data-contract-short></code>
      <button class="hb-contract__copy" type="button" data-contract-copy
              title="Copy contract address" aria-label="Copy contract address">
        <svg class="hb-contract__ico" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="5.5" y="1.5" width="9" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/>
          <path d="M10.5 14.5H3a1.5 1.5 0 0 1-1.5-1.5V4.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <svg class="hb-contract__ok" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 8.5l3.6 3.6L13.5 4.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </span>`;
  }

  /* The wallet chip stands where the player name used to.
   *
   * "PONSLOOT Ranger" said nothing: everyone had the same name and it could
   * not change. What belongs in that spot is the thing people come here for —
   * whether a wallet is linked, and which one. Not linked: a button that links
   * it, rather than a reproachful line of text.
   *
   * The address comes from the account runtime, not from the menu model. The
   * model is about the game, the wallet is about signing in, and routing one
   * through the other would tie together two things that change at different
   * times.
   *
   * I DELETED THIS FUNCTION BY ACCIDENT AND SHIPPED IT. Rewriting the contract
   * chip, I replaced everything between one comment marker and `topbar` —
   * and this function sat in the middle of that range. `topbar` still called
   * it, so `renderApp` threw ReferenceError on every screen and the menu did
   * not render at all. It reached production because I pushed and did not
   * reload the page afterwards; the screenshot I trusted had been taken before
   * the change. Range replacement by text markers is the hazard: it deletes
   * whatever happens to live between them.
   */
  function walletChip(model) {
    const account = window.LoothoodAccountRuntime?.account;
    const wallet = account?.wallets?.[0];
    /* The "Forest P0 · Alpha v0.0.302" line was removed from here.
     *
     * Next to a conversation about payouts, the word "Alpha" reads as a
     * disclaimer: the money is real, but we have not finished. The version
     * number matters when handling complaints, not to the player in the
     * header; it stayed on the entry screen and in Status, where people look
     * for it. Prestige is visible on the hunt card itself.
     *
     * An empty string rather than a deleted variable: it is substituted into
     * both branches below, and removing it from one would make them behave
     * differently. */
    const version = "";
    if (wallet) {
      return `<span class="hb-prestige-stack">
        <a class="hb-wallet-chip is-linked" href="https://robinscan.io/address/${escapeHtml(walletAddress(wallet))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(walletAddress(wallet))}">
          <span class="hb-wallet-dot" aria-hidden="true"></span>${escapeHtml(wallet.maskedAddress || walletAddress(wallet))}
        </a>${version}</span>`;
    }
    return `<span class="hb-prestige-stack">
      <button class="hb-wallet-chip" type="button" data-shell-destination="account-settings" data-focus-key="link-wallet">Link wallet</button>
      ${version}</span>`;
  }

  function walletAddress(wallet) {
    return String(wallet?.address || wallet?.maskedAddress || "");
  }

  function topbar(model) {
    const resources = model.resources;
    return `
      <header class="hb-topbar">
        <div class="hb-brand-lockup">
          <!-- Not a picture: the wordmark file is drawn with the old word, and
               the menu would call the game one thing while showing another. The
               text is set in Alagard — the same font as all the headings. -->
          <img class="hb-mark" src="images/ponsloot-mark-v1.jpg" alt="" width="1252" height="1252"><span class="hb-wordmark hb-wordmark--text">${escapeHtml((window.PackhoodBrand && window.PackhoodBrand.name) || "PONSLOOT")}</span>
          ${brandLinks()}
          <span class="hb-brand-divider" aria-hidden="true"></span>
          ${walletChip(model)}
        </div>
        <div class="hb-resources" aria-label="Resources">
          <!-- THE CONTRACT SITS TO THE LEFT OF THE COINS, not inside the brand
               lockup. It was next to Follow, wedged between the project name
               and the wallet button, and it read as a third piece of branding.
               It is not branding: it is a thing you take with you. Next to the
               counters it lines up with everything else people copy or spend,
               and the left half of the header stays what it is — the name, the
               X link and the way in. -->
          ${contractChip()}
          <!-- TROPHIES AS A SINGLE COUNT. There are three kinds and they drop
               from different bosses, but they are spent identically: a legendary
               costs gold and trophies, any of them. Three separate counters
               would force people to add up in their heads what the game adds up
               at purchase time anyway — and would require a third picture, which
               does not exist in images/.
               Wood and stone are gone (they left with the village) and so are
               tickets (with the season). The resources themselves are still in
               the save: the game still counts them, the header simply stopped
               talking about them. -->
          ${resource("Gold", walletAmount("gold", resources.gold), "resource-gold-v3.png", "hb-resource--gold")}
          ${resource("Trophies", walletAmount("trophies",
              (resources.bossTrophies || 0) + (resources.sheriffsCrests || 0) + (resources.royalSigils || 0)),
            "resource-sheriff-crest-v3.png")}
          <button class="hb-add" type="button" aria-label="Open Account and Settings" title="Account &amp; Settings" data-shell-destination="account-settings" data-focus-key="account-settings"><svg><use href="#hb-icon-account-settings"/></svg></button>
          <button class="hb-audio-toggle" type="button" aria-label="${model.musicMuted ? "Unmute music" : "Mute music"}" aria-pressed="${String(!model.musicMuted)}" title="${model.musicMuted ? "Unmute Forest soundtrack" : "Mute Forest soundtrack"}" data-audio-action="toggle" data-focus-key="menu-audio"><svg aria-hidden="true"><use href="#${model.musicMuted ? "hb-icon-muted" : "hb-icon-volume"}"/></svg></button>
        </div>
      </header>`;
  }

  function navigation(screen = "hunt") {
    const activeDestination = screen === "guide" || screen === "docs"
      ? screen
      : screen === "marketplace"
        ? "marketplace"
        : screen.startsWith("outfitter")
          ? "outfitter"
          : "hunt";
    const marketSvg = '<svg viewBox="0 0 24 24"><path d="M3 4h3l2.2 12h10L21 7H7"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg>';
    const groups = [
      ["Play", [
        ["hunt", "Hunt", "#b7f24a", "hb-nav-hunt", null],
      ]],
      // Buildings is its own group deliberately. It is not part of the camp:
      // the camp is about the game, while buildings are about a share of the
      // pool. Hidden inside "Village" it gets looked for in the village, is not
      // found, and people conclude the mechanic does not exist.
      ["Buildings", [
        ["buildings", "Estate", "#b7f24a", "hb-nav-settlement", null],
        // "Build", not "Pull". The word "pull" is clear to anyone who has
        // played gacha and says nothing to everyone else: it names A MOVEMENT OF
        // THE HAND, not the thing you get. "Build" names the result and matches
        // the section it sits in. The randomness is not hidden by this — the
        // odds are right there on this screen, under the button.
        ["pulls", "Forge", "#b48cff", "hb-nav-gacha", null],
      ]],
      /* THE VILLAGE IS GONE FROM THE CLIENT — screen, markup and handlers alike.
       *
       * It was about building levels, wood and stone, while the game is now
       * about seats in the top and a share of the pool; the village led nowhere
       * in that direction, and its screens had already been unreachable from
       * both states of the shell.
       *
       * BUT THE VILLAGE ECONOMY KEEPS RUNNING UNDER THE HOOD, and that is
       * deliberate: gold and boss trophies are awarded by exactly its code
       * (awardStageBuildingRewards in game.js, on top of js/village-services.js
       * and js/village-economy.js), and gold is what gear in the shop is bought
       * with. Cutting that out would switch off the shop's currency, for the
       * sake of which the village was removed in the first place.
       */
      // Market sits inside Gear rather than in a group of its own: what it
      // sells is exactly what lives in Loadout. Pulls used to belong here too,
      // back when they gave equipment; now they give buildings and live in
      // Buildings, where the thing they hand out actually lives.
      ["Gear", [
        ["outfitter", "Loadout", "#35d0ff", "hb-nav-outfitter", null],
        ["marketplace", "Shop", "#6ea8ff", null, marketSvg],
      ]],
      ["More", [
        ["guide", "Guide", "#8ea89b", "hb-nav-guide", null],
        // The same book glyph, a different colour: Docs and Guide are kin, and
        // drawing them as different objects would pull apart things that stand
        // side by side. Colour tells the roles apart, shape shows the kinship.
        ["docs", "Docs", "#6ea8ff", "hb-nav-guide", null],
      ]],
    ];
    const body = groups.map(([groupName, items]) => {
      const links = items.map(([destination, label, color, symbol, inlineSvg]) => {
        const active = destination === activeDestination;
        const icon = symbol ? `<svg viewBox="0 0 48 48"><use href="#${symbol}"/></svg>` : (inlineSvg || "");
        return `<button class="hb-nav-item${active ? " is-active" : ""}" type="button" data-shell-destination="${destination}" data-focus-key="nav-${destination}" style="--c:${color}"${active ? ' aria-current="page"' : ""}><span class="hb-nav-ic">${icon}</span><span>${label}</span></button>`;
      }).join("");
      return `<div class="hb-nav-group">${groupName}</div>${links}`;
    }).join("");
    /* Sidebar footer: where to go outside the game.
       ------------------------------------------------------------------
       Below the groups there was empty space running the full height — not
       because it was meant that way, but because there are fewer items than
       there is column. The links and the system status fill it for a reason:
       both are looked for not during play but "in between", and there is no
       point burying them in a screen of their own.

       Status is a button, not a line with a dot: a dot that is always green
       stops being read after a week. The button shows the per-system
       breakdown, and only on request — a background poll for decoration's sake
       would mean a request to the server every few seconds from every open
       window. */
    // X has moved from here up to the name: down here it was only seen by
    // someone who is already with us. The address and the code mirror come from
    // js/brand.js, so that the next rename does not mean hunting for them across
    // the files.
    const sideLinks = [
      [(window.PackhoodBrand && window.PackhoodBrand.github) || null, "GitHub",
       '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>'],
    ].map(([href, label, icon]) => (href
      ? `<a class="hb-side-link" href="${href}" target="_blank" rel="noopener noreferrer">${icon}<span>${label}</span></a>`
      : `<span class="hb-side-link is-soon" title="Coming soon">${icon}<span>${label}</span></span>`
    )).join("");

    const footer = `<div class="hb-sidebar-foot">
      <div class="hb-side-links">${sideLinks}</div>
      <button class="hb-side-status" type="button" data-status-open="1" data-focus-key="sidebar-status">
        <span class="hb-side-status__dot" data-state="unknown" aria-hidden="true"></span>
        <span>Status</span>
      </button>
    </div>`;
    return `<nav class="hb-sidebar" aria-label="Main navigation">${body}${footer}</nav>`;
  }

  // Screen header. Key art with no people in it: a generated hero would not
  // match the archer sprite in combat, and the main screen would be showing
  // somebody else's character.
  // The argument is needed because six screens draw this same header, and on
  // Village it hid the settlement's own background — the header covered it up.
  // Key arts are motionless PNGs, and the forest in them looks stopped dead.
  // What we bring to life is not the picture but the air above it: a layer of
  // fireflies over the still. Frames cannot be reproduced by generation (the
  // model draws a new forest every time), whereas a dozen dots drifting along
  // their own paths reads as life and costs nothing.
  function heroImage(src, alt) {
    const url = src || asset("loothood-forest-key-art-v2.png?v=2");
    const text = alt || "A moonlit forest road leading to the outlaw camp";
    // Sixteen, not nine. Nine spread out along a strip more than one thousand
    // three hundred pixels wide, and two or three dots were lit in frame at any
    // one moment: the motion was measurable, but the eye did not read it.
    const flies = Array.from({ length: 16 }, (_, i) =>
      `<i class="hb-firefly" style="--i:${i}"></i>`).join("");
    // No wrapper: .hb-promo-art is positioned absolutely against the scene
    // container, and any layer between the two becomes a new coordinate system
    // for the image — the village art slid 243 pixels up and off the screen.
    // The firefly layer goes in as a sibling and is absolute too, so it never
    // enters the parent's flow and does not change the layout.
    return `<img class="hb-promo-art" src="${url}" alt="${escapeHtml(text)}">` +
      `<span class="hb-fireflies" aria-hidden="true">${flies}</span>`;
  }

  function screenHeading(id, title, focusTarget = true) {
    return `<header class="hb-screen-heading"><h1 id="${id}" tabindex="-1"${focusTarget ? " data-screen-heading" : ""}>${title}</h1>${diamondRule("screen")}</header>`;
  }

  function diamondRule(variant = "panel") {
    return `<span class="hb-diamond-rule hb-diamond-rule--${variant}" aria-hidden="true"></span>`;
  }

  function iconSlot(kind, state) {
    const attr = state ? ` data-bounty-state="${state}"` : "";
    return `<span class="hb-icon-slot hb-icon-slot--${kind}" data-icon-slot="${kind}"${attr} aria-hidden="true"></span>`;
  }

  function renderHunt(model) {
    return `<main class="hb-main" data-screen="hunt">
      <section class="hb-hunt-hero" aria-labelledby="hunt-title">${heroImage()}<div class="hb-hunt-panel">
        ${screenHeading("hunt-title", "Hunt")}
        <article class="hb-hunt-card is-selected"><div class="hb-hunt-card__copy"><h2>Standard Hunt</h2><p>15 Stages · Forest Prestige P${escapeHtml(model.prestige)}</p><p>Bosses: Stages 5, 10 and 15</p>${model.deepestStage > 15 ? `<p class="hb-hunt-record">Deepest: Stage ${escapeHtml(String(model.deepestStage))}</p>` : ""}</div><div class="hb-hunt-actions"><button type="button" class="hb-hunt-armoury" data-shell-destination="outfitter" data-focus-key="hunt-armoury"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/></svg><span>Armory</span></button><button type="button" class="hb-hunt-primary" data-hunt-action="standard" data-focus-key="prepare-standard"><svg class="hb-play" viewBox="0 0 24 24" aria-hidden="true"><rect class="hb-play__socket" width="24" height="24" rx="7"/><g class="hb-play__arrow"><rect x="14" y="4" width="2" height="2"/><rect x="14" y="6" width="4" height="2"/><rect x="14" y="8" width="6" height="2"/><rect x="2" y="10" width="20" height="2"/><rect x="2" y="12" width="20" height="2"/><rect x="14" y="14" width="6" height="2"/><rect x="14" y="16" width="4" height="2"/><rect x="14" y="18" width="2" height="2"/></g></svg><span class="hb-hunt-card__action-label">${model.builderPackActive ? "Continue Village Setup" : "Start Hunt"}</span></button></div></article>
        <!-- THE SEASONAL HUNT HAS BEEN TAKEN OFF THE MAIN SCREEN. Seasons and
             tickets are cut out of the game; a button leading into something cut
             out is the worst kind of breakage: it looks functional. The season
             screen and its endpoints are not deleted, only the way in is gone. -->
        <!-- Into the freed-up space goes the thing a run is made for.
             The numbers are filled in by js/hunt-why-v1.js: how many shards have
             been collected, how many rolls are ready, how much gold is on the
             account. An empty card under the "Start Hunt" button would read as
             "there is nothing beyond this". -->
        <article class="hb-hunt-card hb-hunt-card--haul" id="huntHaul">
          
        </article>
      </div></section>
      <!-- The bottom half of the main screen.
           It used to be an empty section: forty-odd percent of the first thing a
           person sees was a black field. The weekly quests stood here, they were
           removed, and nothing took their place. Emptiness on the main screen
           does not read as "there is nothing here" but as "the game is
           unfinished".
           The contents are drawn by js/hunt-why-v1.js, because they depend on
           the server's answer: whoever has no buildings gets the "what for"
           chain, whoever has some gets his own numbers. -->
      <section class="hb-dashboard" id="huntWhy" aria-label="Why play"></section></main>`;
  }

  function loadoutRows(model, seasonal) {
    return model.loadout.rows.map((row) => `<div${seasonal && row.overCap ? " data-loadout-offender" : ""}><dt>${escapeHtml(row.slot)}</dt><dd>${escapeHtml(row.rarity)}${seasonal ? row.overCap ? " · Over Cap" : " · Legal" : ""}</dd></div>`).join("");
  }

  function foundationControls(model, seasonal) {
    const role = model.foundations.limit === 1 ? "radio" : "checkbox";
    const stateAttribute = role === "radio" ? "aria-checked" : "aria-checked";
    return `${model.foundations.options.map((option) => `<button class="hb-prepare-foundation-option${option.selected ? " is-selected" : ""}" type="button" role="${role}" ${stateAttribute}="${option.selected}" data-menu-foundation="${escapeHtml(option.id)}" data-focus-key="foundation-${escapeHtml(option.id)}">${escapeHtml(option.name)} · ${escapeHtml(option.description)}</button>`).join("")}<p class="hb-prepare-foundation-note">${model.foundations.selectedCount} / ${model.foundations.limit} Foundation${model.foundations.limit === 1 ? "" : "s"} selected for this ${seasonal ? "attempt" : "run"}.</p>`;
  }

  function prestigeControl(model) {
    const prestige = model.prestigeState;
    const current = prestige.current;
    const options = prestige.options.map((option) => {
      const label = option.unlocked ? `P${option.tier}` : `P${option.tier} — ${option.unlockRequirement}`;
      return `<option value="${option.tier}"${option.selected ? " selected" : ""}${option.unlocked ? "" : " disabled"}>${escapeHtml(label)}</option>`;
    }).join("");
    const tierStatus = prestige.options.map((option) => {
      const stateClass = option.selected ? " is-selected" : option.unlocked ? " is-unlocked" : " is-locked";
      const status = option.unlocked ? option.name : `Locked. ${option.unlockRequirement}`;
      return `<span class="${stateClass}" title="${escapeHtml(status)}" aria-label="Prestige P${option.tier}. ${escapeHtml(status)}">P${option.tier}</span>`;
    }).join("");
    return `<div class="hb-prestige-control">
      <label class="hb-prestige-selector"><span aria-hidden="true">‹</span><select aria-label="Forest Prestige tier" data-menu-prestige-tier data-focus-key="prestige-selector">${options}</select><span aria-hidden="true">›</span></label>
      <strong>P${current.tier} · ${escapeHtml(current.name)}</strong>
      <p>${escapeHtml(current.modifier)}</p>
      <small class="hb-value">+${current.effects.hp}% HP · +${current.effects.damage}% Damage · +${current.effects.speed}% Speed · +${current.effects.gold}% Gold</small>
      <div class="hb-prestige-tier-status" aria-label="Forest Prestige unlock status">${tierStatus}</div>
    </div>`;
  }

  function renderPreparation(model, seasonal) {
    const invalidCount = seasonal ? model.loadout.invalidCount : 0;
    const verificationInvalid = (model.loadout.verificationErrors || 0) > 0;
    const invalid = invalidCount > 0 || verificationInvalid;
    const ready = seasonal ? model.seasonalReady : model.standardReady;
    const titleId = seasonal ? "prepare-hunt-title" : "standard-prepare-hunt-title";
    const context = seasonal
      ? `Season ${escapeHtml(model.season.number)} · Active Entry Ticket · ${escapeHtml(model.season.equipmentLabel)}`
      : `Standard Hunt · Forest Prestige P${escapeHtml(model.prestige)}`;
    return `<main class="hb-main ${seasonal ? "hb-seasonal-hunt-preparation" : "hb-standard-hunt-preparation"}" data-screen="${seasonal ? "seasonal-prep" : "standard-prep"}">
      <section class="hb-prepare-hero" aria-labelledby="${titleId}">${heroImage()}<div class="hb-prepare-overview">${screenHeading(titleId, "Start Hunt")}<p class="hb-prepare-season-line">${context}</p><article class="hb-prepare-state"><h2 data-prepare-state-title>${seasonal ? `Attempt 1 · ${ready ? "Ready" : "Not Ready"}` : ready ? "Ready" : "Not Ready"}</h2><ul><li>15-Stage Forest Selected</li><li class="hb-metadata-line" data-loadout-status>${iconSlot("status")}<span>${invalid ? "Loadout Requires Attention" : seasonal ? "Loadout Legal" : "Loadout Selected"}</span></li><li class="hb-metadata-line">${iconSlot("foundation")}<span>${model.foundations.selectedCount === model.foundations.limit ? "Foundation Selected" : `${model.foundations.selectedCount} / ${model.foundations.limit} Foundations Selected`}</span></li></ul></article></div></section>
      <section class="hb-prepare-dashboard" aria-label="Hunt preparation">
        <article class="hb-prepare-rules"><h2>Hunt Rules</h2>${diamondRule("panel")}<dl><div><dt>Route</dt><dd>15-Stage Forest</dd></div>${seasonal ? `<div><dt>Prestige</dt><dd>P${escapeHtml(model.season.prestigeTier)}</dd></div>` : `<div class="hb-prepare-prestige-row"><dt>Prestige</dt><dd>${prestigeControl(model)}</dd></div>`}<div><dt>Bosses</dt><dd>Stages 5, 10 and 15</dd></div><!-- The line "Village — Own Progression" stood before EVERY run and
             named a section cut out of the game. A line a person sees more often
             than any other must not be left as a signpost to nowhere. -->
        <div><dt>Rewards</dt><dd>Gold, trophies, and a shard per boss</dd></div><div><dt>Upgrades</dt><dd>Temporary This Run</dd></div></dl></article>
        <article class="hb-prepare-loadout"><h2>Loadout</h2>${diamondRule("panel")}<dl>${loadoutRows(model, seasonal)}</dl>${seasonal && invalid ? `<p class="hb-prepare-loadout-warning" role="alert">${invalidCount > 0 ? `${invalidCount} Equipped Item${invalidCount === 1 ? "" : "s"} Violates ${escapeHtml(model.season.equipmentLabel)}` : "Equipment Verification Failed"}</p>` : ""}<div class="hb-prepare-panel-action"><button class="hb-ledger-button" type="button" data-hunt-action="change-loadout" data-focus-key="change-loadout">${invalid ? "Review Loadout" : "Change Loadout"}</button></div></article>
        <article class="hb-prepare-foundation"><h2>Foundation</h2>${diamondRule("panel")}<div class="hb-prepare-foundation-list" role="${model.foundations.limit === 1 ? "radiogroup" : "group"}" aria-label="Choose a Foundation">${foundationControls(model, seasonal)}</div><div class="hb-prepare-final-actions"><button class="hb-ledger-button" type="button" data-hunt-action="${seasonal ? "entry-ticket" : "back"}" data-focus-key="prepare-back">${seasonal ? "Back to Entry Ticket" : "Back to Hunt"}</button><button class="hb-ledger-button is-primary" type="button" data-hunt-action="${seasonal ? "begin-seasonal-hunt" : "begin-standard-hunt"}" data-focus-key="begin-hunt"${ready ? "" : ' disabled aria-disabled="true"'}>${seasonal ? "Begin Seasonal Hunt" : "Begin Hunt"} <span aria-hidden="true">»</span></button></div></article>
      </section></main>`;
  }

  function equipmentAffixes(item) {
    return `<ul class="hb-equipment-affixes">${item.affixes.map((affix) => `<li><strong class="hb-value">${escapeHtml(affix.value)}</strong><span>${escapeHtml(affix.label)}</span></li>`).join("")}</ul>`;
  }

  function statMappingRows(rows, options = {}) {
    return (rows || []).map((row) => {
      const before = row.before?.value === undefined ? row.before : `${row.before.value} ${row.before.label}`;
      const after = row.after?.value === undefined ? row.after : `${row.after.value} ${row.after.label}`;
      const state = row.state || "change";
      const label = row.label ? `<span class="hb-stat-mapping-row__label">${escapeHtml(row.label)}</span>` : "";
      const delta = row.deltaLabel === undefined ? "" : `<strong class="hb-stat-delta" data-delta-state="${escapeHtml(state)}">${escapeHtml(row.deltaLabel)}</strong>`;
      const attributes = options.reroll
        ? " data-reroll-change"
        : ` data-comparison-state="${escapeHtml(state)}" data-comparison-stat="${escapeHtml(row.statId || "")}"`;
      return `<div class="hb-stat-mapping-row${options.reroll ? " hb-reroll-change" : " hb-equipment-comparison-row"}" data-stat-mapping-row${attributes}>${label}<span class="hb-stat-mapping-row__before">${escapeHtml(before)}</span><b aria-hidden="true">→</b><strong class="hb-stat-mapping-row__after">${escapeHtml(after)}</strong>${delta}</div>`;
    }).join("");
  }

  function equipmentItem(item, options = {}) {
    const actions = [];
    const displayedState = options.scrap && !item.eligible
      ? item.ineligibleReason
      : item.equipped
        ? "Equipped"
        : item.protected
          ? "Protected"
          : "";
    if (options.manage) {
      actions.push(`<button type="button" data-equipment-action="select:${escapeHtml(item.itemId)}" data-focus-key="equipment-${escapeHtml(item.itemId)}">View</button>`);
    }
    if (options.manage || options.protect) {
      actions.push(`<button type="button" data-equipment-action="protect:${escapeHtml(item.itemId)}" data-focus-key="protect-${escapeHtml(item.itemId)}" aria-pressed="${item.protected}">${item.protected ? "Unprotect" : "Protect"}</button>`);
    }
    if (options.scrap) {
      actions.push(`<label class="hb-equipment-check" data-blocking-class="${escapeHtml(item.blockingClass || "eligible")}"><input type="checkbox" data-equipment-control="scrap-item:${escapeHtml(item.itemId)}" data-focus-key="scrap-${escapeHtml(item.itemId)}"${item.selected ? " checked" : ""}${item.eligible ? "" : " disabled"}><span>${item.eligible ? `${item.scrapValue} Scrap` : escapeHtml(item.ineligibleReason)}</span></label>`);
    }
    return `<article class="hb-equipment-item" data-rarity="${escapeHtml(item.rarity)}" data-slot="${escapeHtml(item.slot)}" data-equipped="${item.equipped}" data-protected="${item.protected}" data-blocking-class="${escapeHtml(item.blockingClass || "eligible")}" data-blocking-classes="${escapeHtml((item.blockingClasses || []).join(" "))}"><header><div><span>${escapeHtml(item.slot)} · ${escapeHtml(item.rarityLabel)}</span><h3>${escapeHtml(item.name)}</h3></div>${displayedState ? `<strong data-equipment-state>${escapeHtml(displayedState)}</strong>` : ""}</header>${item.effect ? `<section class="hb-equipment-effect"><strong>${escapeHtml(item.effect.name)}</strong><p>${escapeHtml(item.effect.description)}</p></section>` : ""}${equipmentAffixes(item)}${actions.length ? `<footer>${actions.join("")}</footer>` : ""}</article>`;
  }

  function outfitterInventoryCard(item, selected) {
    const verdicts = {
      upgrade: { glyph: "▲", label: "Strict upgrade" },
      downgrade: { glyph: "▼", label: "Strict downgrade" },
      mixed: { glyph: "◆", label: "Mixed comparison" },
    };
    const verdict = verdicts[item.comparison?.verdict];
    const marker = item.equipped
      ? '<span class="hb-outfitter-card__equipped">Equipped</span>'
      : verdict
        ? `<span class="hb-outfitter-card__verdict" data-verdict="${escapeHtml(item.comparison.verdict)}" aria-label="${escapeHtml(verdict.label)}" title="${escapeHtml(verdict.label)}">${verdict.glyph}</span>`
        : "";
    return `<button class="hb-outfitter-card${selected ? " is-selected" : ""}" type="button" aria-pressed="${selected}" data-rarity="${escapeHtml(item.rarity)}" data-slot="${escapeHtml(item.slot)}" data-equipped="${item.equipped}" data-protected="${item.protected}" data-equipment-action="select:${escapeHtml(item.itemId)}" data-focus-key="equipment-${escapeHtml(item.itemId)}">${marker}<span class="hb-outfitter-card__caption">${escapeHtml(item.slot)} · ${escapeHtml(item.rarityLabel)}</span><strong class="hb-outfitter-card__name" data-item-name>${escapeHtml(item.name)}</strong>${equipmentAffixes(item)}<span class="hb-outfitter-card__provenance">${escapeHtml(item.provenanceLabel)}</span></button>`;
  }

  function outfitterSelectedDetail(item) {
    const disabled = item.available ? "" : " disabled";
    const actions = `<div class="hb-equipment-actions"><button class="hb-ledger-button is-primary" type="button" data-equipment-action="equip:${escapeHtml(item.itemId)}" data-focus-key="equip-selected"${disabled}>${item.equipped ? "Unequip" : "Equip"}</button><button class="hb-ledger-button" type="button" data-equipment-action="reroll:${escapeHtml(item.itemId)}" data-focus-key="reroll-selected"${disabled}>Reroll a Stat</button></div>`;
    if (item.comparison?.mode === "comparison") {
      const comparison = item.comparison;
      return `<aside class="hb-equipment-panel hb-equipment-detail hb-equipment-comparison" data-verdict="${escapeHtml(comparison.verdict)}" data-overlay-scroll-owner data-scroll-affordance="scrollbar"><h2>Gear Comparison</h2>${diamondRule("panel")}<div class="hb-equipment-comparison__items"><div><span>Equipped</span><strong>${escapeHtml(comparison.equippedName)}</strong></div><div><span>Selected</span><strong>${escapeHtml(comparison.selectedName)}</strong></div></div><div class="hb-equipment-comparison-list" data-stat-union-size="${comparison.rows.length}" aria-label="Equipped and selected stat comparison">${statMappingRows(comparison.rows)}</div>${item.effect ? `<section class="hb-equipment-effect"><strong>${escapeHtml(item.effect.name)}</strong><p>${escapeHtml(item.effect.description)}</p></section>` : ""}${actions}</aside>`;
    }
    const emptyCaption = item.comparison?.mode === "empty" ? '<p class="hb-equipment-comparison-caption">Empty slot — no comparison</p>' : "";
    return `<aside class="hb-equipment-panel hb-equipment-detail" data-overlay-scroll-owner data-scroll-affordance="scrollbar"><h2>Selected Equipment</h2>${diamondRule("panel")}${emptyCaption}${equipmentItem(item)}${actions}</aside>`;
  }

  function equipmentShell(title, screen, body) {
    return `<main class="hb-equipment-screen" data-screen="${screen}">${screenHeading(`${screen}-title`, title)}${body}</main>`;
  }

  function equipmentFilterPanel({ scope, filters, slots, rarities, stats, activeCount, scrollable = false }) {
    const slotChips = [{ id: "all", label: "All Slots" }, ...slots].map((slot) => `<button type="button" aria-pressed="${filters.slot === slot.id}" data-equipment-action="filter-slot:${scope}:${escapeHtml(slot.id)}" data-focus-key="${scope}-filter-slot-${escapeHtml(slot.id)}">${escapeHtml(slot.label)}</button>`).join("");
    const rarityChips = ["all", ...rarities].map((rarity) => `<button type="button" aria-pressed="${filters.rarity === rarity}" data-equipment-action="filter-rarity:${scope}:${escapeHtml(rarity)}" data-focus-key="${scope}-filter-rarity-${escapeHtml(rarity)}">${rarity === "all" ? "All Rarities" : escapeHtml(titleCase(rarity))}</button>`).join("");
    const selectedStats = new Set(filters.stats || []);
    const statGrid = stats.map((stat) => `<button type="button" aria-pressed="${selectedStats.has(stat.id)}" data-equipment-action="filter-stat:${scope}:${escapeHtml(stat.id)}" data-focus-key="${scope}-filter-stat-${escapeHtml(stat.id)}">${escapeHtml(stat.label)}</button>`).join("");
    return `<section class="hb-equipment-filter-panel${scrollable ? " hb-equipment-filter-panel--rail" : ""}" data-equipment-filter-scope="${scope}"${scrollable ? ' data-overlay-scroll-owner data-scroll-affordance="scrollbar"' : ""} aria-label="Equipment filters"><header><strong>Filters</strong>${activeCount ? `<span class="hb-value">${activeCount} active</span>` : ""}<button type="button" data-equipment-action="filter-clear:${scope}" data-focus-key="${scope}-filter-clear"${activeCount ? "" : " disabled"}>Clear</button></header><div class="hb-equipment-filter-groups"><fieldset><legend>Slot</legend><div class="hb-equipment-filter-chips">${slotChips}</div></fieldset><fieldset><legend>Rarity</legend><div class="hb-equipment-filter-chips">${rarityChips}</div></fieldset><fieldset class="hb-equipment-filter-stats"><legend>Stats · all selected required</legend><div class="hb-equipment-stat-grid">${statGrid}</div></fieldset></div></section>`;
  }

  function renderOutfitter(model) {
    const data = model.outfitter;
    const slots = data.slots.map((slot) => {
      const itemName = slot.itemName || "Empty";
      return `<article data-slot-id="${escapeHtml(slot.id)}" data-selection-match="${slot.selectedMatch}" title="${escapeHtml(slot.label)} · ${escapeHtml(itemName)}"><strong>${escapeHtml(slot.label)}</strong><span aria-hidden="true">·</span><span>${escapeHtml(itemName)}</span></article>`;
    }).join("");
    const items = data.items.length
      ? data.items.map((item) => outfitterInventoryCard(item, data.selected?.itemId === item.itemId)).join("")
      : data.activeFilterCount
        ? `<div class="hb-equipment-empty"><p>No equipment matches these filters.</p><button type="button" data-equipment-action="filter-clear:outfitter" data-focus-key="outfitter-empty-clear">Clear Filters</button></div>`
        /* EMPTY FOR TWO DIFFERENT REASONS, AND DIFFERENT THINGS HAVE TO BE SAID.
           The grid does not show what is equipped, so for a person with a full
           set it is empty — and it told him "No owned equipment" right next to a
           "3/240 Owned" counter. Two statements about the same thing, and they
           contradict each other. */
        : data.ownedCount > 0
          ? `<div class="hb-equipment-empty is-all-equipped"><p>Everything you own is equipped.</p></div>`
          : `<div class="hb-equipment-empty"><p>Nothing yet.</p></div>`;
    const selected = data.selected ? outfitterSelectedDetail(data.selected) : `<aside class="hb-equipment-panel hb-equipment-detail" data-overlay-scroll-owner data-scroll-affordance="scrollbar"><h2>Equipment Management</h2>${diamondRule("panel")}<p>Select an owned item to inspect its complete rolls.</p></aside>`;
    const filters = equipmentFilterPanel({ scope: "outfitter", filters: data.filters, slots: data.slotOptions, rarities: data.rarityOptions, stats: data.statOptions, activeCount: data.activeFilterCount, scrollable: true });
    const inventoryHeader = `<header class="hb-outfitter-inventory-header"><div><h2>Owned Equipment</h2>${diamondRule("panel")}</div><div class="hb-outfitter-inventory-header__tools"><p class="hb-outfitter-inventory-status" aria-label="Scrap ${data.scrap}; ${data.ownedCount} of ${data.capacity} equipment owned">Scrap <strong class="hb-value">${data.scrap}</strong> · <strong class="hb-value">${data.ownedCount}/${data.capacity}</strong> Owned</p><nav aria-label="Outfitter tools"><button type="button" data-equipment-action="screen:outfitter-scrap-forge" data-focus-key="open-scrap-forge">Scrap Forge</button><button type="button" data-equipment-action="screen:outfitter-scrap-review" data-focus-key="open-scrap-review">Scrap Equipment</button></nav></div></header>`;
    return equipmentShell("Outfitter", "outfitter", `<section class="hb-equipped-strip" aria-label="Equipped loadout">${slots}</section><section class="hb-outfitter-layout">${filters}<article class="hb-equipment-panel hb-equipment-inventory">${inventoryHeader}<div class="hb-outfitter-grid" data-overlay-scroll-owner data-scroll-affordance="scrollbar">${items}</div></article>${selected}</section>`);
  }

  /* A shop instead of a player-to-player market.
   *
   * A market needs liquidity, and without it you see empty shelves — a screen
   * honestly announcing that there is nobody here. In a "buy" section that is
   * the worst possible thing. The shop sells on behalf of the game and is always
   * full.
   *
   * The old player-to-player market has now been cut out of the client: its
   * screens, dialogs and services are gone. The server endpoints are untouched,
   * so bringing it back means writing the screen again, not the protocol.
   */
  function renderMarketplace(model) {
    return `<main class="hb-main hb-shop-screen" data-screen="marketplace">
      ${screenHeading("shop-title", "Shop")}
      <!-- The caption says WHAT people come here for instead of retelling the
           list underneath it. It used to read "Gear for gold. Legendaries also
           cost boss trophies" — the same thing written on every price line two
           centimetres below. A line that repeats what is already visible
           explains nothing and takes up the space of the one explanation that is
           actually needed here. -->
      <p class="hb-buildings-lede">Deeper runs need better gear. This is where it comes from.</p>
      <section id="shopPanel" class="hb-pull-panel" aria-label="Shop"></section>
    </main>`;
  }

  function renderOutfitterReroll(model) {
    const reroll = model.outfitter.reroll;
    if (!reroll.item) return equipmentShell("Reroll Equipment", "outfitter-reroll", `<section class="hb-equipment-panel hb-equipment-centre"><p>Select an owned item before opening Reroll.</p><button class="hb-ledger-button" type="button" data-equipment-action="screen:outfitter" data-focus-key="reroll-back">Back to Outfitter</button></section>`);
    const lockable = reroll.preserveCount > 0 && reroll.product !== "legendary_effect_reforge";
    const products = reroll.products.map((product) => `<button type="button" class="hb-ledger-button${product.key === reroll.product ? " is-primary" : ""}" data-equipment-action="service:${escapeHtml(product.key)}" aria-pressed="${product.key === reroll.product}" data-focus-key="reroll-service-${escapeHtml(product.key)}"${reroll.candidate || reroll.awaitingCandidate ? " disabled" : ""}><strong>${escapeHtml(product.label)}</strong><span>${product.scrapCost != null ? `${product.scrapCost} scrap` : "scrap price pending"}</span></button>`).join("");
    const rolls = reroll.item.affixes.map((affix, index) => {
      const preserved = reroll.preservedStatIndexes.includes(index);
      return `<button type="button" data-equipment-action="preserve:${index}" data-focus-key="reroll-stat-${index}" aria-pressed="${preserved}"${lockable && !reroll.candidate && !reroll.awaitingCandidate ? "" : " disabled"}><strong>${escapeHtml(affix.value)}</strong><span>${escapeHtml(affix.label)}${preserved ? " · Preserved" : ""}</span></button>`;
    }).join("");
    const payment = reroll.payment || { costLabel: "—", canPay: false, status: "declined", message: "Reroll payment integration pending." };
    const paidDisabled = !payment.canPay || payment.pending;
    const paymentNotice = payment.status === "insufficient_funds"
      ? `Insufficient funds · Shortfall ${payment.shortfallLabel || "—"}`
      : payment.status === "declined"
        ? payment.message || "Reroll payment integration pending."
        : payment.message || "Each Equipment Service requires payment.";
    const changes = statMappingRows(reroll.changes, { reroll: true });
    const candidateEffect = reroll.candidateItem?.effect
      ? `<p><strong>${escapeHtml(reroll.candidateItem.effect.name)}</strong> — ${escapeHtml(reroll.candidateItem.effect.description)}</p>`
      : "";
    const candidate = reroll.candidate
      ? `<article class="hb-equipment-panel hb-reroll-candidate"><h2>Verified Candidate</h2>${diamondRule("panel")}<div class="hb-reroll-change-list">${changes}</div>${candidateEffect}<p>Your owned item is unchanged until you accept.</p><p><strong>Keep Original does not refund this paid service.</strong></p><p class="hb-reroll-payment-state" role="status">${escapeHtml(paymentNotice)}</p><footer><button class="hb-ledger-button is-paid" type="button" data-equipment-action="reroll-again" data-focus-key="reroll-again"${paidDisabled ? " disabled" : ""}>Reroll Again · ${escapeHtml(payment.costLabel)}</button><button class="hb-ledger-button" type="button" data-equipment-action="keep-original" data-focus-key="keep-original">Keep Original</button><button class="hb-ledger-button is-primary" type="button" data-equipment-action="accept-candidate" data-focus-key="accept-candidate">Accept Candidate</button></footer></article>`
      : reroll.awaitingCandidate
        ? `<article class="hb-equipment-panel hb-reroll-candidate"><h2>Creating Candidate</h2>${diamondRule("panel")}<p>Payment was submitted. PONSLOOT is waiting for confirmation and verified randomness.</p><p class="hb-reroll-payment-state" role="status">${escapeHtml(paymentNotice)}</p></article>`
        : `<article class="hb-equipment-panel hb-reroll-candidate"><h2>Equipment Service</h2>${diamondRule("panel")}<p>Choose a service and any stat rolls to preserve. Unlocked rolls are rerolled together.</p><p><strong>You are charged once the wallet transaction confirms, even if you later keep the original.</strong></p><p class="hb-reroll-payment-state" role="status">${escapeHtml(paymentNotice)}</p><button class="hb-ledger-button is-paid" type="button" data-equipment-action="reroll-now" data-focus-key="reroll-now"${paidDisabled ? " disabled" : ""}>Purchase Service · ${escapeHtml(payment.costLabel)}</button></article>`;
    return equipmentShell("Reroll Equipment", "outfitter-reroll", `<section class="hb-equipment-layout hb-equipment-layout--reroll"><article class="hb-equipment-panel"><h2>${escapeHtml(reroll.item.name)}</h2>${diamondRule("panel")}<div class="hb-reroll-services" role="group" aria-label="Choose an Equipment Service">${products}</div><h3>${reroll.preserveCount ? `Choose ${reroll.preserveCount} stat${reroll.preserveCount === 1 ? "" : "s"} to preserve` : reroll.product === "legendary_effect_reforge" ? "All four stat rolls are preserved" : "All stat rolls will change"}</h3><div class="hb-reroll-rolls" role="group" aria-label="Choose stat rolls to preserve">${rolls}</div><button class="hb-ledger-button" type="button" data-equipment-action="screen:outfitter" data-focus-key="reroll-back">Back to Outfitter</button></article>${candidate}</section>`);
  }

  function renderScrapForge(model) {
    const forge = model.outfitter.forge;
    return equipmentShell("Scrap Forge", "outfitter-scrap-forge", `<section class="hb-equipment-layout hb-equipment-layout--forge"><article class="hb-equipment-panel"><h2>Create Equipment</h2>${diamondRule("panel")}<p>Spend Scrap to create one verified account-bound item.</p>${model.outfitter.status ? `<p role="status">${escapeHtml(model.outfitter.status)}</p>` : ""}<div class="hb-equipment-form"><label>Rarity<select data-equipment-control="forge-rarity" data-focus-key="forge-rarity">${forge.rarities.map((rarity) => `<option value="${rarity}"${rarity === forge.rarity ? " selected" : ""}>${escapeHtml(rarity)}</option>`).join("")}</select></label><label>Slot Rule<select data-equipment-control="forge-mode" data-focus-key="forge-mode"><option value="random"${forge.mode === "random" ? " selected" : ""}>Random slot</option><option value="exact"${forge.mode === "exact" ? " selected" : ""}>Exact slot</option></select></label><label>Exact Slot<select data-equipment-control="forge-slot" data-focus-key="forge-slot"${forge.mode === "exact" ? "" : " disabled"}>${forge.slots.map((slot) => `<option value="${escapeHtml(slot.id)}"${slot.id === forge.slot ? " selected" : ""}>${escapeHtml(slot.label)}</option>`).join("")}</select></label></div><dl class="hb-equipment-summary"><div><dt>Affixes</dt><dd class="hb-value">${forge.affixCount}</dd></div><div><dt>Cost</dt><dd class="hb-value">${forge.cost} Scrap</dd></div><div><dt>Balance</dt><dd class="hb-value">${forge.balance} Scrap</dd></div></dl><footer><button class="hb-ledger-button" type="button" data-equipment-action="screen:outfitter" data-focus-key="forge-back">Back to Outfitter</button><button class="hb-ledger-button is-primary" type="button" data-equipment-action="forge" data-focus-key="forge-review"${forge.canCraft ? "" : " disabled"}>${forge.pending ? "Resume Craft" : "Review Craft"}</button></footer></article><aside class="hb-equipment-panel"><h2>Craft Rules</h2>${diamondRule("panel")}<p>Crafted gear can be equipped, rerolled, protected, or recycled for its Standard rarity Scrap value. It remains account-bound and cannot be traded.</p></aside></section>`);
  }

  function renderScrapReview(model) {
    const scrap = model.outfitter.scrapReview;
    const items = scrap.items.length
      ? scrap.items.map((item) => equipmentItem(item, { scrap: true, protect: true })).join("")
      : scrap.activeFilterCount
        ? `<div class="hb-equipment-empty"><p>No equipment matches these filters.</p><button type="button" data-equipment-action="filter-clear:scrap" data-focus-key="scrap-empty-clear">Clear Filters</button></div>`
        : `<div class="hb-equipment-empty"><p>No equipment available for review.</p></div>`;
    const filters = equipmentFilterPanel({ scope: "scrap", filters: scrap.filters, slots: scrap.slots, rarities: scrap.rarities, stats: scrap.statOptions, activeCount: scrap.activeFilterCount });
    return equipmentShell("Scrap Equipment", "outfitter-scrap-review", `<section class="hb-equipment-panel hb-scrap-toolbar">${filters}<div class="hb-scrap-bulk"><label>Bulk Select<select data-equipment-control="scrap-below" data-focus-key="scrap-below">${scrap.rarities.slice(1).map((rarity) => `<option value="${rarity}"${rarity === scrap.bulkBelow ? " selected" : ""}>Below ${escapeHtml(rarity)}</option>`).join("")}</select></label><button type="button" data-equipment-action="select-below" data-focus-key="select-below">Select Visible Below Rarity</button><button type="button" data-equipment-action="clear-scrap" data-focus-key="clear-scrap">Clear Selection</button><p role="status"><strong class="hb-value">${scrap.selectedCount}</strong> selected · <strong class="hb-value">${scrap.projectedScrap}</strong> Scrap projected${model.outfitter.status ? ` · ${escapeHtml(model.outfitter.status)}` : ""}</p></div></section><section class="hb-equipment-layout hb-equipment-layout--scrap"><article class="hb-equipment-panel hb-equipment-inventory"><div class="hb-equipment-scroll" data-overlay-scroll-owner>${items}</div></article><aside class="hb-equipment-panel hb-scrap-summary"><h2>Final Review</h2>${diamondRule("panel")}<p>Scrapping permanently destroys the selected equipment. Standard, Limited, Scrap-crafted, and Tutorial equipment are eligible. Equipped, protected, first-clear reward, Test, and invalid items cannot be selected.</p><footer><button class="hb-ledger-button" type="button" data-equipment-action="screen:outfitter" data-focus-key="scrap-back">Back to Outfitter</button><button class="hb-ledger-button is-danger-hint" type="button" data-equipment-action="confirm-scrap" data-focus-key="confirm-scrap"${scrap.selectedCount ? "" : " disabled"}>Scrap ${scrap.selectedCount} Item${scrap.selectedCount === 1 ? "" : "s"}</button></footer></aside></section>`);
  }

  // The guide used to be a modal window on top of the game: it dimmed the
  // screen and arrived with its own old-style buttons and a round close cross.
  // A screen settles all of that at once — shared frame, shared navigation,
  // shared button style.
  /* The currently open documentation page.
     ------------------------------------------------------------------
     It lives here rather than in the game model: this is static text, and
     giving every page its own screen in the state machine would mean
     describing a move between paragraphs as a move between game modes.

     We tried it the other way — Docs were tabs inside the guide. It did not
     work out in terms of meaning: the guide explains how to play, the
     documentation why the game can be trusted. A tab inside somebody else's
     section made the second an appendix to the first, even though they are
     read at different moments and by different people. */
  let docsPage = "overview";

  function guideSection(section) {
    const entries = section.entries.map((entry) => `
      <article class="hb-guide-entry${entry.key ? " is-key" : ""}">
        <h3>${escapeHtml(entry.name)}</h3>
        <p>${escapeHtml(entry.text)}</p>
      </article>`).join("");
    // The icon is taken from the same sprites that live in the interface.
    // Drawing a separate set for the guide would mean keeping a second system
    // of signs, which sooner or later drifts away from the first.
    // The path has to be absolute. The value goes into the --mark variable, and
    // url() inside a variable is resolved by the browser relative to the
    // stylesheet where the variable is used, not relative to the page: a
    // relative images/… turns into /css/images/… and gives a 404.
    // This is exactly what the legendary icons in Loot Pulls already tripped on.
    const iconUrl = section.icon
      ? new URL("images/" + section.icon, document.baseURI).href
      : "";
    const icon = iconUrl
      ? `<span class="hb-guide-mark" style="--mark:url('${escapeHtml(iconUrl)}')" aria-hidden="true"></span>`
      : "";
    return `
      <section class="hb-guide-section" aria-labelledby="guide-${escapeHtml(section.id)}">
        <header>
          ${icon}
          <div>
            <h2 id="guide-${escapeHtml(section.id)}">${escapeHtml(section.title)}</h2>
            <p>${escapeHtml(section.lede)}</p>
          </div>
        </header>
        <div class="hb-guide-entries">${entries}</div>
      </section>`;
  }

  function renderGuide(model) {
    const content = (typeof window !== "undefined" && window.LOOTHOOD_GUIDE) || null;
    if (!content) {
      return `<main class="hb-guide-screen" data-screen="guide">
        <p role="status">Guide content failed to load.</p>
      </main>`;
    }
    const sections = content.sections.map(guideSection).join("");
    const tours = (model.guide && model.guide.tours ? model.guide.tours : [])
      .map((tour) => `<button class="hb-ledger-button" type="button" data-replay-guidance="${escapeHtml(tour.id)}">${escapeHtml(tour.label)}</button>`)
      .join("");
    const replay = model.guide && model.guide.canReplayTutorial
      ? `<button class="hb-ledger-button is-primary" type="button" data-guide-action="replay-tutorial">Replay Tutorial</button>`
      : "";
    return `<main class="hb-guide-screen" data-screen="guide">
      ${screenHeading("guide-title", "Guide")}
      <p class="hb-guide-lede">How the Hunt actually works. Numbers here match the game, not the marketing.</p>
      <div class="hb-guide-body">${sections}</div>
      <section class="hb-guide-section hb-guide-section--tours" aria-labelledby="guide-tours">
        <header>
          <h2 id="guide-tours">Replay the tips</h2>
          <p>Walk any screen again, or the whole tutorial from the start.</p>
        </header>
        <div class="hb-guide-tours">${replay}${tours}</div>
      </section>
    </main>`;
  }

  /* The documentation screen.
     ------------------------------------------------------------------
     The layout is taken from ordinary technical documentation: a narrow column
     of pages on the left, the text on the right, "next" at the bottom. The
     table of contents on the side is not there for looks — it shows that the
     document is finite: a list of seven items reads as "this can be read
     through", an endless feed does not.

     The "next" button matters more than the contents. Documentation has a
     reading order, and someone who has finished "Verification" should be
     carried on to "Seasons" rather than sent back to the list to choose. */
  function docsBlock(block) {
    if (block.type === "h3") return `<h3>${escapeHtml(block.text)}</h3>`;
    if (block.type === "note") return `<p class="hb-docs-note">${escapeHtml(block.text)}</p>`;
    if (block.type === "code") return `<pre class="hb-docs-code"><code>${escapeHtml(block.text)}</code></pre>`;
    if (block.type === "list") {
      return `<ul class="hb-docs-list">${block.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
    }
    if (block.type === "table") {
      const head = `<tr>${block.head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
      const rows = block.rows
        .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
      return `<div class="hb-docs-tablewrap"><table class="hb-docs-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
    }
    return `<p>${escapeHtml(block.text)}</p>`;
  }

  function renderDocs(model) {
    const content = (typeof window !== "undefined" && window.LOOTHOOD_DOCS) || null;
    if (!content) {
      return `<main class="hb-docs-screen" data-screen="docs"><p role="status">Documentation failed to load.</p></main>`;
    }
    const pages = content.pages;
    const at = Math.max(0, pages.findIndex((p) => p.id === docsPage));
    const page = pages[at] || pages[0];
    const next = pages[at + 1] || null;

    const nav = pages.map((p) => `<button class="${p.id === page.id ? "is-current" : ""}" type="button" data-docs-page="${p.id}" data-focus-key="docs-${p.id}"${p.id === page.id ? ' aria-current="page"' : ""}>${escapeHtml(p.title)}</button>`).join("");

    const body = page.blocks.map(docsBlock).join("");
    const onward = next
      ? `<button class="hb-docs-next" type="button" data-docs-page="${next.id}" data-focus-key="docs-next"><span>Next</span><strong>${escapeHtml(next.title)}</strong><span aria-hidden="true">»</span></button>`
      : `<a class="hb-docs-next" href="verify.html"><span>Check it yourself</span><strong>Verification page</strong><span aria-hidden="true">»</span></a>`;

    return `<main class="hb-docs-screen" data-screen="docs">
      <aside class="hb-docs-nav" aria-label="Documentation pages">
        <p class="hb-docs-nav__title">Docs</p>
        ${nav}
      </aside>
      <article class="hb-docs-body">
        ${screenHeading("docs-title", page.title)}
        <p class="hb-docs-lede">${escapeHtml(page.lede)}</p>
        ${body}
        <footer class="hb-docs-foot">${onward}</footer>
      </article>
    </main>`;
  }


  /* The buildings screen.
   *
   * This is the first place the whole chain is visible at once: the building,
   * its coin, the rarity, the power and the chance of it dropping from a pull.
   * Previously that lived in three different places and in your head.
   *
   * THE ART IS TAKEN FROM WHAT ALREADY EXISTS. All nine buildings already have
   * building_<slug>_forms_v1.png sheets drawn — two frames side by side, the
   * left one being the base form. Drawing new ones would mean making a second
   * version of what is already there and then guessing which one is real.
   *
   * THE COIN IS SHOWN AS A CHIP WITH A TICKER, NOT AS A LOGO. Another project's
   * logo would have to be either taken or imitated — the first is someone
   * else's, the second is a forgery. A ticker in the game font is always correct
   * and survives a change of coin.
   */

  /* The coin card in the corner of a building.
   *
   * Modelled on the cards from 6PACK: a real icon from the same CDN plus the
   * ticker. Under the picture there is text — if the address one day stops
   * responding, a readable caption remains rather than an empty hole. That is
   * exactly how holes appear: the picture is put in place and nobody thinks
   * about it disappearing.
   */
  function buildingSlug(id) {
    // camelCase into snake_case: huntsmansHall -> huntsmans_hall. The game
    // builds the file name in exactly the same way (game.js), and that is the
    // only reason for this formula.
    return id.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  }

  /* The catalogue card. One function for the whole project: it is drawn both on
   * Forge (what you can win) and in the reveal window, and copies of the same
   * card that have drifted apart are a sure way to show different numbers in two
   * places.
   *
   * WHAT IS WRITTEN ON IT reads top to bottom as a single sentence: the picture
   * of the building, the coin's badge and ticker, its place in the top, the
   * chance of winning it and how much it pays per day. Exactly the five things
   * decisions are made on — and nothing more.
   */
  function buildingCard(building, catalogue) {
    /* An absolute address, not a relative one: url() inside a CSS variable is
       resolved relative to the STYLESHEET FILE, and "assets/…" turned into
       "/css/assets/…" — a 404 on all nine. The forge has a picture of its own. */
    const artPath = new URL(building.art || `assets/building_${buildingSlug(building.id)}_forms_v1.png`, document.baseURI).href;
    /* The ticker, the price and the icon are filled in by buildings-panel-v1.js
       by PLACE: which coin sits in which place is known by the live top, not by
       the catalogue. Here there are empty sockets rather than invented values. */
    /* THE WINDOW IS SPLIT 30 TO 70: the coin on the left, the building on the right.
     *
     * That was the intention from the very start, and I broke it twice. First I
     * put the coin in a separate window above — the cards doubled in height.
     * Then I squeezed it into a 24-pixel badge in the corner and stretched the
     * building across the full width: the sprite is drawn 8:9, that is, taller
     * than it is wide, and I was forcing it into a wide box — the building came
     * out flattened and you could not tell what it was. Now the building has its
     * own share of the width and its own aspect ratio, and the window's height
     * is derived from them.
     *
     * THE COIN'S SIDE IS PAINTED IN ITS OWN COLOUR — a trick from 6PACK. The
     * tone is taken from the icon and substituted in by a script; until then a
     * neutral one is used. The ticker sits under the icon ALWAYS, not instead of
     * it: a coin may have no picture (in ninth place that is exactly the case),
     * and an empty corner would read as broken layout. */
    return `<article class="hb-bc" data-rarity="${escapeHtml(building.rarity)}" data-seat="${building.seat}">
      <span class="hb-bc__win" aria-hidden="true">
        <span class="hb-bc__coin"><span class="hb-bc__coin-sym"></span></span>
        <span class="hb-bc__art" style="--building-art: url('${artPath}')"></span>
      </span>
      <div class="hb-bc__head">
        <b class="hb-bc__sym"></b>
        <span class="hb-bc__rank">#${building.seat}</span>
      </div>
      <h3>${escapeHtml(building.name)}</h3>
      <div class="hb-bc__price"></div>
      <!-- The rate, not an amount per day. It is the same for all ten and does
           not depend on the number of players, so it is written straight into
           the markup and does not wait for data from the server: a dash while
           waiting for a response looked like loading. -->
      <p class="hb-bc__stat"><b class="hb-bc__income">${escapeHtml(catalogue.FEE_LINE || "0.7% of trading")}</b><span class="hb-bc__odds">${catalogue.chanceOf(building)}% chance</span></p>
    </article>`;
  }

  function renderBuildings(model) {
    const catalogue = window.PackhoodBuildings;
    if (!catalogue) {
      return `<main class="hb-main" data-screen="buildings">${screenHeading("buildings-title", "Estate")}
        <p class="hb-buildings-note">The building catalogue failed to load. Nothing is shown rather than something invented.</p></main>`;
    }

    /* ESTATE IS ONLY WHAT IS YOURS. The catalogue of all ten has moved to Forge.
     *
     * It used to be the other way round, and that was the screen's main
     * confusion: Estate held all ten cards the player does not have, while Forge
     * was an empty screen with a button. That is, "what I have" showed other
     * people's things, and "what I am rolling for" showed nothing. You should
     * look at the storefront where you pay. */
    return `<main class="hb-main hb-buildings-screen" data-screen="buildings">
      ${screenHeading("buildings-title", "Estate")}
      <p class="hb-buildings-lede">Buildings split a pool of ETH. One slot runs one building — here is your cut of it.</p>
      <div id="holdingsPanel" class="holdings-panel"></div>
      <section id="buildingsPanel" class="hb-pull-panel" aria-label="Your estate"></section>
    </main>`;
  }


  /* The pull screen.
   *
   * A screen of its own rather than a side panel: a pull is the event people
   * come here for, and it needs room. In the corner of somebody else's screen an
   * event does not happen.
   *
   * TWO STEPS ARE SHOWN, NOT HIDDEN. First the server names the fingerprint and
   * the moment before which the reveal is not allowed — and it is visible. Then
   * the reveal hands over the secret, and that is visible too. Behind a single
   * button it would be smoother, but then the commitment turns into a word, and
   * the commitment is the reason to believe the odds.
   */
  function renderPulls(model) {
    const catalogue = window.PackhoodBuildings;
    if (!catalogue) {
      return `<main class="hb-main" data-screen="pulls">${screenHeading("pulls-title", "Forge")}
        <p class="hb-buildings-note">The catalogue failed to load. Nothing is shown rather than something invented.</p></main>`;
    }
    const forgeCards = catalogue.ALL.map((building) => buildingCard(building, catalogue)).join("");

    /* ON FORGE YOU CAN SEE WHAT YOU ARE ROLLING FOR.
     *
     * All ten cards stand here, each with its chance. Rolling blind and then
     * going to another screen to look at the loot is exactly what made it
     * "unclear what you are rolling for". The chance moved onto the card itself:
     * a separate table answered the same question, but in another place, and you
     * had to cross-check it by eye. */
    return `<main class="hb-main hb-pulls-screen" data-screen="pulls">
      ${screenHeading("pulls-title", "Forge")}
      <!-- The point here is that this is the chain's TOP 10, not just "one of
           ten". Ten arbitrary coins and the ten largest coins of a chain are
           different things, and the second is the reason people pay for a
           roll. -->
      <p class="hb-buildings-lede">Every building is a seat in Robinhood Chain’s Top 10. Roll for one, and it pays you ETH daily.</p>
      <section id="pullsStage" class="hb-pull-stage" aria-live="polite"></section>
      <div class="hb-bc-grid">${forgeCards}</div>

    </main>`;
  }

  function renderScreen(model) {
    if (model.screen === "docs") return renderDocs(model);
    if (model.screen === "buildings") return renderBuildings(model);
    if (model.screen === "pulls") return renderPulls(model);
    if (model.screen === "guide") return renderGuide(model);
    if (model.screen === "standard-prep") return renderPreparation(model, false);
    if (model.screen === "outfitter") return renderOutfitter(model);
    if (model.screen === "marketplace") return renderMarketplace(model);
    if (model.screen === "outfitter-reroll") return renderOutfitterReroll(model);
    if (model.screen === "outfitter-scrap-forge") return renderScrapForge(model);
    if (model.screen === "outfitter-scrap-review") return renderScrapReview(model);
    return renderHunt(model);
  }

  function renderApp(model) {
    const loadoutValid = model.screen === "standard-prep"
      ? (model.loadout.verificationErrors || 0) === 0
      : model.loadout.invalidCount === 0 && (model.loadout.verificationErrors || 0) === 0;
    return `<div class="hb-app" data-hb-menu-root data-screen="${escapeHtml(model.screen)}" data-loadout-valid="${loadoutValid}" data-panel-texture="${model.panelTexture ? "on" : "off"}">${symbols()}${topbar(model)}<div class="hb-shell-body">${navigation(model.screen)}${renderScreen(model)}</div></div>`;
  }

  function closestWithDataset(target, root, attribute) {
    let node = target;
    while (node && node !== root) {
      if (node.dataset && Object.prototype.hasOwnProperty.call(node.dataset, attribute)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function createController({ root, getModel, onIntent }) {
    if (!root || typeof getModel !== "function" || typeof onIntent !== "function") throw new TypeError("Desktop menu controller requires root, getModel and onIntent.");
    let screen = "hunt";
    let signature = "";
    let active = true;
    let renderCount = 0;

    function focusHeading() {
      root.querySelector?.("[data-screen-heading]")?.focus?.();
    }

    function render({ moveFocus = false } = {}) {
      if (!active) return false;
      const model = { ...getModel(), screen };
      const nextSignature = JSON.stringify(model);
      if (signature === nextSignature) return false;
      const activeElement = root.ownerDocument?.activeElement;
      const focusKey = activeElement && root.contains?.(activeElement) ? activeElement.dataset?.focusKey : "";
      root.innerHTML = renderApp(model);
      // innerHTML wipes the holding panel's contents out along with everything
      // else, so it has to be restored straight away: first from data already
      // received, so that it does not blink empty, and only then refreshed from
      // the server.
      window.PackhoodHoldingsPanel?.mount();
      window.PackhoodCoinPullsPanel?.mount();
      window.PackhoodBuildingsPanel?.mount();
      window.PackhoodPullsPanel?.mount();
      // The bottom half of the hunt screen. Forgetting it here would bring back
      // the very emptiness it was written for: innerHTML wipes everything, and
      // an unmounted panel does not leave so much as a trace in the console.
      window.PackhoodHuntWhy?.mount();
      window.PackhoodShop?.mount();
      signature = nextSignature;
      renderCount += 1;
      if (moveFocus) focusHeading();
      else if (focusKey) root.querySelector?.(`[data-focus-key="${focusKey}"]`)?.focus?.();
      return true;
    }

    function navigate(nextScreen, options = {}) {
      screen = SCREENS.includes(nextScreen) ? nextScreen : "hunt";
      signature = "";
      render({ moveFocus: options.moveFocus !== false });
    }

    async function dispatchIntent(kind, action, source, event) {
      const result = await onIntent({ kind, action, screen, source, event });
      if (result?.screen) navigate(result.screen);
      else if (result?.refresh !== false) {
        signature = "";
        render({ moveFocus: Boolean(result?.moveFocus) });
      }
    }

    root.addEventListener("click", (event) => {
      // Documentation pages are switched here, ahead of the general intent
      // dispatch: they change nothing in the game except the text on display.
      const docsButton = closestWithDataset(event.target, root, "docsPage");
      if (docsButton && !docsButton.disabled) {
        const next = docsButton.dataset.docsPage;
        if (next && next !== docsPage) {
          docsPage = next;
          signature = "";
          render({ moveFocus: true });
        }
        return;
      }
      const bindings = [
        ["shellDestination", "shell"],
        ["huntAction", "hunt"],
        ["menuFoundation", "foundation"],
        ["menuElemental", "elemental"],
        ["audioAction", "audio"],
        ["equipmentAction", "equipment"],
        // The guide is a screen now, not a window. The old handler for the
        // "show the tips" buttons hung on the window itself and does not reach
        // a screen, so they go through the general intent dispatch.
        ["replayGuidance", "guidance"],
        ["guideAction", "guide-action"],
      ];
      for (const [datasetKey, kind] of bindings) {
        const target = closestWithDataset(event.target, root, datasetKey);
        if (!target || target.disabled) continue;
        void dispatchIntent(kind, target.dataset[datasetKey], target, event);
        return;
      }
    });

    root.addEventListener("change", (event) => {
      const prestige = closestWithDataset(event.target, root, "menuPrestigeTier");
      if (prestige && !prestige.disabled) {
        void dispatchIntent("prestige", prestige.value, prestige, event);
        return;
      }
      const equipment = closestWithDataset(event.target, root, "equipmentControl");
      if (equipment && !equipment.disabled) void dispatchIntent("equipment-control", `${equipment.dataset.equipmentControl}:${equipment.value ?? (equipment.checked ? "1" : "0")}`, equipment, event);
    });

    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && screen.startsWith("outfitter") && screen !== "outfitter") {
        event.preventDefault();
        void dispatchIntent("equipment", "escape", event.target, event);
        return;
      }
    });

    return Object.freeze({
      refresh: render,
      navigate,
      getScreen: () => screen,
      getRenderCount: () => renderCount,
      setActive(value) {
        active = Boolean(value);
        root.hidden = !active;
        if (active) render();
      },
    });
  }

  return Object.freeze({ ASSET_ROOT, SCREENS, createController, escapeHtml, renderApp, legendaryArt });
});
