/* The project name in one place.
 *
 * WHY THIS FILE EXISTS. The name has already changed once and, by the look of
 * it, will change again. It occurred 452 times in the code, but almost all of
 * that is identifiers like window.LoothoodAccountRuntime and file paths, which
 * the player never sees and which are not worth renaming. There are only a few
 * dozen visible captions. The split happens here: NEW code takes the name from
 * this file, and the old literals are rewritten by the brand rename tool in
 * tools/ with a single command.
 *
 * What we do NOT put here: HTTP header names, the season identifier, paths to
 * css and images. The server knows those, and renaming the client on its own
 * would break CSRF silently — with no error in the console and no trace in the
 * logs.
 */
(function (root) {
  "use strict";

  var BRAND = {
    // How the game is called on screen. The value here has to match what is
    // actually written in the markup: the rename tool takes the old name from
    // here, and if the two diverge it will not find anything to change.
    name: "PONSLOOT",

    // The token symbol, without the dollar sign. The sign is added at display
    // time, otherwise it will one day get doubled inside a template string and
    // come out as $$PONSLOOT.
    //
    // It used to be "LOOT" — shorter and punchier, but that is the ticker of the
    // PREVIOUS game, and next to the name PONSLOOT it reads as a different
    // project. The name and the ticker matching is worth more than brevity:
    // people will search for the token by the word they saw on screen.
    ticker: "PONSLOOT",

    // The domain for outbound links. An empty string means "not bought yet" —
    // and then we do not show the link at all rather than lead nowhere. A buyer
    // has already got a 404 once from an address taken out of search results.
    domain: "",

    // Where to go to get the token. Empty means there is no "buy" button at all,
    // and the panel says in words that the coin is not on sale yet. A button
    // that leads nowhere is worse than a missing one: it looks functional and
    // does nothing.
    //
    // FILLED IN ON LAUNCH DAY, and not before the release on Pons: with
    // bonding-curve launchpads the pool on the exchange is not created
    // immediately, and a link put in ahead of time leads into the void for a
    // while. Verify by opening it, not by copying the address from search
    // results.
    buy: "",

    // The X link. An empty string hides the whole block — that is how the
    // display below works, and the rule stands: a button that can be clicked and
    // leads nowhere is worse than a missing one. The placeholder pointing at the
    // x.com home page has been removed, the real account is in place.
    x: "https://x.com/PonsLoot",

    // The public mirror. It used to point at Loothoodgame/loothood — at a page
    // named after the PREVIOUS name of the game: a person clicked "GitHub" under
    // the word PONSLOOT and landed in LOOTHOOD. That is worse than a missing
    // link: a missing one says nothing, this one confidently leads to the wrong
    // place. Now we have our own organisation.
    //
    // There is only a README there so far. The history of the working
    // repository was deliberately not moved over: history goes into a public
    // repository once and forever, and before that it has to be combed through
    // for keys.
    github: "https://github.com/PonsLoot/ponsloot",

    // The picture with the word on it. Text is renamed in a minute, a wordmark
    // is not: until the file is redrawn the game will be called one thing and
    // show another.
    wordmark: "loothood-wordmark-primary.png",
    mark: "loothood-mark-primary.png"
  };

  BRAND.tickerLabel = "$" + BRAND.ticker;

  root.PackhoodBrand = BRAND;
  // The former name is left as a reference to the same object: if some old code
  // still reaches for it, it gets the truth rather than undefined.
  root.LoothoodBrand = BRAND;

  /* Substituting the X address into the markup.
   *
   * Why the display is driven from here and not from the markup: a button that
   * can be clicked and does nothing is the worst kind of breakage, and a "Follow
   * on X" pointing at "#" looks flawless and does not work. While there is no
   * address the block stays hidden; once one appears it shows up by itself,
   * without editing the HTML.
   */
  function applyLinks() {
    var nodes = document.querySelectorAll("[data-brand-x]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (BRAND.x) {
        node.setAttribute("href", BRAND.x);
        node.hidden = false;
      } else {
        node.hidden = true;
        node.removeAttribute("href");   // without href this is no longer a link and is not clickable
      }
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", applyLinks);
    } else {
      applyLinks();
    }
    // The login screen and the menu are drawn later and by their own code, so we
    // give them a way to call the substitution themselves instead of guessing
    // the moment with a timer.
    BRAND.applyLinks = applyLinks;
  }
})(typeof window !== "undefined" ? window : globalThis);
