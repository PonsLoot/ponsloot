/* The contract address in the header: show it and let people copy it.
 *
 * WHY A SEPARATE FILE. The chip's markup is drawn by the menu, but it does not
 * live by the menu's rules: the address arrives from the server once per load
 * and never changes afterwards, while the menu is redrawn on every transition
 * between screens. Keeping the request inside the menu would mean poking the
 * server on every click in the navigation.
 *
 * WHAT HAPPENS HERE, in order:
 *   asked /api/v1/token once;
 *   there is no address — the chip stays hidden, and that is the end of it;
 *   there is an address — remembered it, showed it shortened, the button puts
 *   the full one in the clipboard.
 *
 * WHY A SUBSCRIPTION TO THE REDRAW AND NOT A ONE-OFF SUBSTITUTION. The menu
 * rebuilds the header wholesale, and the node we filled in disappears along with
 * it. My first attempt did exactly that: the chip appeared, and after switching
 * to Forge it vanished — and it looked like a random glitch, because on Hunt it
 * was there. So the filling is hung on a MutationObserver: a new chip showed up,
 * we fill that one in too.
 */
(function (root) {
  "use strict";

  var address = null;        // the full one, for the clipboard
  var asked = false;

  function shorten(value) {
    // 0x plus 40 characters does not fit in the header on any screen, laptop
    // ones included. Six in front and four at the back — the same shape as the
    // wallet in the header, and people recognise it without explanation.
    return value.slice(0, 6) + "…" + value.slice(-4);
  }

  function fillChips() {
    if (!address) return;
    var chips = document.querySelectorAll("[data-contract]");
    for (var i = 0; i < chips.length; i++) {
      var chip = chips[i];
      if (chip.dataset.contractReady === "1") continue;
      var shortNode = chip.querySelector("[data-contract-short]");
      if (shortNode) shortNode.textContent = shorten(address);
      /* The tooltip is set HERE, and not once after the server responds.
       *
       * That is how it was done at first — and on the live site it turned out
       * empty: the menu rebuilds the header, new chips arrive without a title,
       * and they were filled in by an observer that knew nothing about the
       * tooltip. From the outside it looked flawless: the address is shown, the
       * button works — and yet the full address is nowhere on the screen, and
       * someone whose clipboard did not work has no way to get it. It was only
       * found because I read the title on the node in production instead of
       * trusting my own code. */
      chip.title = address;
      chip.hidden = false;
      chip.dataset.contractReady = "1";
    }
  }

  /* Copying.
   *
   * navigator.clipboard is not available everywhere and is silently absent in an
   * insecure context — on the http test stand there is none at all. Hence the
   * fallback path through an invisible field and execCommand: it is old, but it
   * works where the new API does not exist, and "the button is pressed and
   * nothing happens" is the worst kind of breakage, because it looks functional.
   */
  function copyToClipboard(text) {
    if (root.navigator && root.navigator.clipboard && root.isSecureContext) {
      return root.navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var field = document.createElement("textarea");
        field.value = text;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        var succeeded = document.execCommand("copy");
        document.body.removeChild(field);
        succeeded ? resolve() : reject(new Error("execCommand refused"));
      } catch (e) { reject(e); }
    });
  }

  /* Feedback — by swapping a CLASS, not by swapping the contents.
   *
   * This used to rewrite textContent, and the button jumped around in width:
   * "copy" and "copied" are of different lengths, and there is a frame next to
   * it that twitched because of that. Now both icons sit inside the button and
   * one of them is shown. */
  function flash(button, className) {
    button.classList.remove("is-done", "is-failed");
    button.classList.add(className);
    root.setTimeout(function () { button.classList.remove(className); }, 1500);
  }

  document.addEventListener("click", function (e) {
    var button = e.target.closest && e.target.closest("[data-contract-copy]");
    if (!button || !address) return;
    e.preventDefault();
    copyToClipboard(address).then(
      function () { flash(button, "is-done"); },
      // Saying "it did not work" is more honest than showing a tick and leaving
      // the person to paste nothing. The full address is in the chip's tooltip
      // meanwhile.
      function () { flash(button, "is-failed"); }
    );
  });

  function ask() {
    if (asked) return Promise.resolve();
    asked = true;
    return fetch("/api/v1/token", { credentials: "same-origin" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.launched || !data.address) return;   // no token — the chip stays quiet
        address = String(data.address);
        fillChips();
      })
      .catch(function () { /* the network dropped — the chip simply will not appear */ });
  }

  function watch() {
    if (!document.body) return;
    // The menu redraws the header wholesale, and the filled-in node disappears
    // along with it. The observer catches a new one appearing and fills it in.
    new MutationObserver(function () {
      var chips = document.querySelectorAll("[data-contract]");
      for (var i = 0; i < chips.length; i++) {
        if (chips[i].dataset.contractReady !== "1") { fillChips(); break; }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function start() { ask(); watch(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  root.PonslootContract = {
    address: function () { return address; },
    refresh: function () { asked = false; return ask(); },
  };
})(typeof window !== "undefined" ? window : globalThis);
