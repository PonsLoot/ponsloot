/**
 * Pulls for ETH: the coin drop table.
 *
 * WHAT THIS IS. The player pays for a pull in ETH, and a REAL coin drops out of
 * it — the one the treasury bought with what was collected. Not a token
 * substitute, not a promise: the amount and the coin are named in advance, the
 * odds are published.
 *
 * THE ODDS ARE PUBLISHED. This is not a courtesy. A paid box with real value
 * inside and hidden odds is what burned everyone who tried it, and is outright
 * illegal in a number of countries. A published table also settles the eternal
 * "I never get anything" argument: anyone can do the maths.
 *
 * THE RETURN IS LOWER THAN THE PRICE, AND THAT IS WRITTEN DOWN. The expected
 * value equals 80% of the pull price. The remaining 20% is the game's cut, and
 * it is named as a number rather than hidden in the weights. The opposite —
 * promising a return greater than or equal to the price — would mean paying out
 * of nowhere, and no such source exists.
 *
 * THE ARITHMETIC IS INTEGER. Both the weights and the values are expressed in
 * ten-thousandths — one unit for the whole file. The expected value is computed
 * as an integer and has to match EXACTLY: the check compares against 8000 with
 * no tolerance. A sum of fractions that is "approximately equal" to the target is
 * a way of not noticing that the table has drifted on some later edit.
 *
 * ONE SOURCE OF TRUTH: the server imports this same file (src/coin-pulls.js).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PackhoodCoinPulls = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // The share of the price returned as coins, in ten-thousandths. 8000 = 80%.
  const PAYOUT_BPS = 8000;

  // Weights in ten-thousandths: they must add up to exactly 10000.
  // The value is ALSO in ten-thousandths of the price: 2500 = a quarter of the
  // price, 500000 = fifty prices. There is one unit of measure for the whole
  // file — previously the weights were in ten-thousandths and the value in
  // hundredths, and the expected value came out as 80 instead of 8000. The error
  // did not stand out: both numbers looked plausible.
  //
  // Each rung has its own coin, because "CASHCAT dropped" is an event, while
  // "0.0004 ETH dropped" is a line in a balance. Nobody pulls for the second.
  const TIERS = Object.freeze([
    Object.freeze({ id: "scrap",    name: "Scrap",    coin: "CASHCAT", weight: 6195, value: 2500 }),
    Object.freeze({ id: "purse",    name: "Purse",    coin: "CASHCAT", weight: 2935, value: 7500 }),
    Object.freeze({ id: "cache",    name: "Cache",    coin: "PONS",    weight: 700,  value: 25000 }),
    Object.freeze({ id: "vault",    name: "Vault",    coin: "ETH",     weight: 150,  value: 100000 }),
    Object.freeze({ id: "jackpot",  name: "Jackpot",  coin: "ETH",     weight: 20,   value: 500000 }),
  ]);

  const WEIGHT_TOTAL = 10000;

  /** Sum of the weights. Must be exactly 10000, otherwise the odds are lying. */
  function weightSum(tiers = TIERS) {
    return tiers.reduce((sum, t) => sum + t.weight, 0);
  }

  /**
   * Expected return in ten-thousandths of the price, as an integer.
   *
   * Integer arithmetic and no rounding: if it ever stops matching PAYOUT_BPS, the
   * check has to fail rather than shrug at the third decimal place.
   */
  function expectedBps(tiers = TIERS) {
    const total = tiers.reduce((sum, t) => sum + t.weight * t.value, 0);
    // We divide by the sum of the weights, not by 10000: if the weights have
    // drifted, the error must surface in the weight-sum check rather than be
    // smeared across the result here.
    return Math.round(total / weightSum(tiers));
  }

  /** A rung's chance in percent, for display.
   *
   * Rounded to hundredths right here: without this, 2935 weights gave
   * 29.349999999999998, and a number like that on the storefront reads not as
   * "honest odds" but as sloppiness. Two decimal places are enough: the rarest
   * outcome is 0.2%. */
  function chanceOf(tier) {
    return Math.round(tier.weight / WEIGHT_TOTAL * 10000) / 100;
  }

  /**
   * Picking a rung from the draw number.
   *
   * Takes an INTEGER from 0 to 9999 — not a fraction. A fraction would have to be
   * multiplied and rounded, and it is precisely the rounding that shifts the
   * boundary between rungs by one ten-thousandth, and the rarest outcome lives in
   * exactly that strip.
   */
  function tierForRoll(roll, tiers = TIERS) {
    // The type is checked BEFORE the value: Number(null) is zero and
    // Number("500") is a number, and both were slipping into the draw as a
    // legitimate roll. A string containing a number arrives from a request body
    // more often than a number does.
    if (typeof roll !== "number" || !Number.isInteger(roll)) return null;
    const n = roll;
    if (n < 0 || n >= WEIGHT_TOTAL) return null;
    let threshold = 0;
    for (const tier of tiers) {
      threshold += tier.weight;
      if (n < threshold) return tier;
    }
    // We can only end up here if the weights do not add up to 10000. Staying
    // silent is not an option: silently returning the last rung would mean
    // handing out jackpots by mistake.
    return null;
  }

  /**
   * The table, for display and for the server.
   *
   * priceCents is the pull price in cents. Zero means "the price has not been set
   * yet": in that case no amounts are invented, only the odds are shown.
   */
  function table({ priceCents = 0 } = {}) {
    const price = Number.isFinite(priceCents) && priceCents > 0 ? Math.floor(priceCents) : 0;
    return Object.freeze({
      payoutBps: PAYOUT_BPS,
      payoutPercent: PAYOUT_BPS / 100,
      housePercent: (10000 - PAYOUT_BPS) / 100,
      priceCents: price,
      expectedCents: price ? Math.round(price * PAYOUT_BPS / 10000) : 0,
      weightsSum: weightSum(),
      weightsValid: weightSum() === WEIGHT_TOTAL,
      expectedBps: expectedBps(),
      tiers: TIERS.map((t) => Object.freeze({
        ...t,
        chance: chanceOf(t),
        // How much that is in cents at the current price. Zero means there is no
        // price, and a dash should be shown rather than "$0.00": a zero reads as
        // "empty".
        payoutCents: price ? Math.round(price * t.value / 10000) : 0,
      })),
    });
  }

  return Object.freeze({
    TIERS: TIERS,
    WEIGHT_TOTAL: WEIGHT_TOTAL,
    PAYOUT_BPS: PAYOUT_BPS,
    weightSum: weightSum,
    expectedBps: expectedBps,
    chanceOf: chanceOf,
    tierForRoll: tierForRoll,
    table: table,
  });
});
