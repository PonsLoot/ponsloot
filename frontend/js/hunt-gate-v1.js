/* The Hunt gate, client side.
   ------------------------------------------------------------------
   Asks the server whether runs are open. When the gate is closed every
   button that leads into a run - the hb main-menu cards and the Begin
   Hunt button of the prepare flow - goes grey, reads "Closed till launch", and a click is swallowed at
   capture phase before any game handler. The hb menu re-renders its
   DOM on navigation, so a MutationObserver re-applies the state.

   Fails OPEN on purpose: if this request breaks, the game must not.
   Competitive paths are enforced server side as well, so this file is
   a courtesy, not the security boundary. */
(function () {
  "use strict";
  const gate = { open: true, message: null, checked: false };
  window.HuntGate = gate;

  const BUTTONS = [
    '[data-hunt-action="standard"]',
    '[data-hunt-action="begin-standard-hunt"]',
  ].join(", ");
  const LABEL = "Closed till launch";

  const css = document.createElement("style");
  css.textContent = [
    "[data-hunt-gate-closed] {",
    "  filter: grayscale(1) brightness(0.62) !important;",
    "  cursor: not-allowed !important;",
    "}",
    "#huntGateToast {",
    "  position: fixed; left: 50%; top: 16%; transform: translateX(-50%);",
    "  background: rgba(10, 16, 10, 0.96); color: #eaf5ee;",
    "  border: 1px solid #7af035; border-radius: 8px;",
    "  padding: 10px 18px; font: 600 15px/1.4 system-ui, sans-serif;",
    "  z-index: 99999; pointer-events: none; opacity: 0;",
    "  transition: opacity .25s ease;",
    "}",
  ].join("\n");
  document.head.appendChild(css);

  let toastTimer = null;
  function toast(text) {
    let el = document.getElementById("huntGateToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "huntGateToast";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = "0"; }, 2600);
  }

  function labelNode(btn) {
    return btn.querySelector(".hb-hunt-card__action-label") || btn;
  }

  function applyUi() {
    for (const btn of document.querySelectorAll(BUTTONS)) {
      const node = labelNode(btn);
      if (!gate.open) {
        if (btn.dataset.huntGateLabel === undefined) btn.dataset.huntGateLabel = node.textContent;
        node.textContent = LABEL;
        btn.setAttribute("data-hunt-gate-closed", "");
        btn.setAttribute("aria-disabled", "true");
      } else if (btn.dataset.huntGateLabel !== undefined) {
        node.textContent = btn.dataset.huntGateLabel;
        delete btn.dataset.huntGateLabel;
        btn.removeAttribute("data-hunt-gate-closed");
        btn.removeAttribute("aria-disabled");
      }
    }
  }

  // The hb- menu re-renders its screens whole - after every re-render we put
  // the closed state back on the buttons. Cheap: while the gate is open the
  // observer does nothing.
  let applyQueued = false;
  new MutationObserver(() => {
    if (gate.open || applyQueued) return;
    applyQueued = true;
    setTimeout(() => { applyQueued = false; applyUi(); }, 300);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Capture phase: earlier than any of the game's own handlers.
  document.addEventListener("click", (event) => {
    if (gate.open) return;
    const hit = event.target && event.target.closest && event.target.closest(BUTTONS);
    if (!hit) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toast(gate.message || "The Hunt opens at launch.");
  }, true);

  async function refresh() {
    try {
      const res = await fetch("/api/v1/gate", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        gate.open = data.huntsOpen !== false;
        gate.message = data.message || null;
        gate.checked = true;
      }
    } catch { /* fail open */ }
    applyUi();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }
  setInterval(refresh, 60000);
})();
