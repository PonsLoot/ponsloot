/**
 * The payout pool on the server side.
 *
 * THE FORMULA IS NOT HERE: this file imports frontend/js/payout-pool-v1.js — the
 * very one the player reads the on-screen numbers from — and calls its
 * functions. The hold tiers (src/holdings.js) and the building catalogue
 * (src/building-pulls.js) are wired the same way. A second copy of the same
 * formula would drift from the first on the first economy patch, and silently:
 * nobody checks whether two numbers still agree until somebody complains about
 * being underpaid.
 *
 * THE SERVER'S JOB IS ONLY TO FETCH THE QUANTITIES. How many fees came in over
 * the day, what the world's power is, whether the token has launched — those are
 * facts, not arithmetic. The shared module does the computing.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS = path.join(HERE, "..", "frontend", "js");

let formula = null;

export async function loadPool() {
  if (formula) return formula;
  await import(path.join(JS, "payout-pool-v1.js"));
  formula = globalThis.PackhoodPool;
  if (!formula?.poolPerDay) {
    throw new Error("payout-pool-v1.js did not hand over the formula — the module wrapper has changed");
  }
  return formula;
}

/**
 * Pool settings from the environment.
 *
 * `paidBuilds` is an EXPLICIT SWITCH, not something inferred from other
 * variables.
 *
 * I first derived it like this: there is a price and there is a treasury
 * address, therefore builds are paid for. On the staging box that gave the right
 * answer, and on production the wrong one, and I only saw it because I opened
 * the live server response. The treasury on production was configured LONG ago
 * and for something entirely different: season tickets go through it. Nobody
 * credits builds at all — the payment watcher does not know about them, and that
 * is written down in STATUS.md as a separate item.
 *
 * The storefront price would have looked like a working source with a fresh
 * zero: "there are fees, it is just that nobody built today". In reality you
 * cannot build for ETH at all. That is exactly the distinction waiting and empty
 * exist for in the formula — and inferring from neighbouring variables erased it.
 *
 * The general rule: the flag "this part of the economy is switched on" must not
 * be inferred from traces of another part. The coincidence holds right up until
 * the first divergence in settings, and the divergence will show up on the
 * storefront rather than in the logs.
 *
 * It is switched on with BUILD_PAYMENTS=on in one move, once the watcher learns
 * to credit builds. Off by default: a source that declares itself working is a
 * promise issued by silence.
 */
export function poolSettings(env = process.env) {
  const price = Math.floor(Number(env.PULL_PRICE_CENTS) || 0);
  const token = String(env.TOKEN_ADDRESS || "").trim();
  const payments = String(env.BUILD_PAYMENTS || "").trim().toLowerCase();
  return {
    priceCents: price,
    // feeSharePct was removed along with the "roll fees" source: a roll costs
    // three boss shards, not ETH, and there is nothing to withhold a share from.
    // The Pons fee goes into the pool in full.
    paidBuilds: price > 0 && (payments === "on" || payments === "true" || payments === "1"),
    tokenLaunched: /^0x[0-9a-fA-F]{40}$/.test(token),
  };
}

/**
 * World power and fees for the day — with two queries, not by selecting every
 * account.
 *
 * WHY POWER IS COMPUTED AS BASE POWER, WITHOUT MULTIPLIERS. The multiplier
 * depends on the token balance in the wallet, i.e. on reading the chain for
 * EVERY owner. That cannot be done on every screen render: a hundred owners means
 * a hundred node requests per visit to the menu, and the first rush would take
 * down the free RPC (this has already happened on BNB).
 *
 * While there is no token, everyone's multiplier is the same, and the share by
 * base power MATCHES the real one — an identical multiplier cancels out in the
 * numerator and the denominator. So today this is not an approximation but an
 * exact value.
 *
 * When the token launches, the multipliers will diverge, and that is when world
 * power will have to be computed by a background job and stored in a table. This
 * is written down here rather than kept in someone's head, because on launch day
 * it will be forgotten: the screen will keep working and keep showing a slightly
 * inflated share to those who hold little.
 */
export async function worldPower(query, catalogue) {
  const { rows } = await query(
    "SELECT building_id, COUNT(*)::int AS n FROM building_holdings GROUP BY building_id");
  let base = 0;
  for (const row of rows) {
    const building = catalogue.BY_ID[row.building_id];
    if (building) base += building.power * row.n;
  }
  // In the same hundredths as powerFor: a share is a ratio, but both values are
  // required to be in the same units, otherwise it drifts by a factor of a
  // hundred and nobody notices.
  return Math.round(base * 100);
}

/**
 * Fees over the last 24 hours, in dollars.
 *
 * SETTLED builds are counted (`status='settled'`), not requests: a request lives
 * until it is revealed and may never be revealed. The column here is
 * `settled_at`, and that is not a detail — I first wrote `revealed_at` going by
 * the meaning "revealed", no such column exists, and the query would have failed
 * on the very first render of the screen. The schema in db.js calls things by
 * their real names, and that is what you check against, not a dictionary.
 */
export async function feesLast24h(query, { priceCents = 0 } = {}) {
  if (!(priceCents > 0)) return 0;
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM building_pulls
     WHERE status='settled' AND settled_at > now() - interval '24 hours'`);
  return ((rows[0]?.n || 0) * priceCents) / 100;
}
