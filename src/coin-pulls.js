/**
 * Server-side pulls paid in ETH.
 *
 * The table is NOT copied here: frontend/js/coin-pulls-v1.js is imported — the
 * very file the player reads the odds from on the storefront. If there were two
 * tables, they would drift apart on the first balance edit, and they would
 * drift apart silently: the game would keep running, just with odds different
 * from the published ones. In a paid box there is nothing worse than that.
 *
 * THE PRICE IS SET BY AN ENVIRONMENT VARIABLE, not by a constant in the code.
 * You do not deploy on launch day: the price has to be changeable without a
 * deploy. While it is unset, pulls are off — and that is a separate state, not
 * a price of zero.
 *
 * A KILL SWITCH BY CONSTRUCTION: remove PULL_PRICE_CENTS and pulls go dark
 * while the game lives on. The way to stop everything has to be tested in
 * advance, not at the moment you need to stop it.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS = path.join(HERE, "..", "frontend", "js");

let pullTableModule = null;

export async function loadCoinPulls() {
  if (pullTableModule) return pullTableModule;
  await import(path.join(JS, "coin-pulls-v1.js"));
  pullTableModule = globalThis.PackhoodCoinPulls;
  if (!pullTableModule?.table) {
    throw new Error("coin-pulls-v1.js did not expose a table — the module wrapper changed");
  }
  return pullTableModule;
}

/**
 * Pull settings.
 *
 * The price is in cents, not in ETH: the ether rate moves every hour, and a
 * pull priced at a fixed 0.0004 ETH will get twice as expensive or twice as
 * cheap over a week without telling anyone. A price in money is what a person
 * understands; it has to be converted into ETH at payment time at the current
 * rate, not fixed up front.
 */
export function pullSettings(env = process.env) {
  const price = Math.floor(Number(env.PULL_PRICE_CENTS) || 0);
  return {
    enabled: price > 0,
    priceCents: price > 0 ? price : 0,
    // The address that accepts payments for pulls. While it is empty there is
    // nowhere to accept them, and that is one more reason to keep pulls off.
    payTo: String(env.PULL_PAYMENT_ADDRESS || "").trim(),
  };
}

/**
 * What to hand to the storefront.
 *
 * The odds table is ALWAYS served, even when pulls are off: a person deciding
 * whether it is worth it comes to look at exactly that. A hidden block
 * disappears precisely when someone is looking for it.
 *
 * Amounts, on the other hand, are not invented when no price is set: showing
 * "$0.00" where there simply is no price means lying twice — about the price
 * and about the payout.
 */
export async function pullTable(env = process.env) {
  const coinPulls = await loadCoinPulls();
  const settings = pullSettings(env);
  const table = coinPulls.table({ priceCents: settings.priceCents });

  return {
    ...table,
    enabled: settings.enabled && Boolean(settings.payTo),
    reason: !settings.enabled
      ? "price_not_set"
      : !settings.payTo
        ? "payment_address_not_set"
        : null,
    // If the weights ever stop summing to 10000, the storefront is obliged to
    // say so out loud instead of showing odds that do not exist. A silent table
    // with wrong probabilities is exactly the case where we get caught and they
    // are right.
    trustworthy: table.weightsValid && table.expectedBps === coinPulls.PAYOUT_BPS,
  };
}
