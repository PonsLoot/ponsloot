/**
 * Payout pool: where the money comes from and how much of it is yours.
 *
 * WHY THIS FILE EXISTS AT ALL. The buildings screen used to show drop chance
 * and power — two numbers from which a player cannot derive a single reason to
 * play. "22%" answers a question nobody asked; the question people actually ask
 * is "how much money is that". The design doc (ZAMYSEL.md) states this as a
 * direct rule: the storefront shows a formula and today's number, not a yield
 * percentage. The formula and the number live here.
 *
 * THE SOURCES ARE NAMED OUT LOUD, EACH ONE SEPARATELY. The pool does not come
 * out of nowhere, and the player has to see what fills it — otherwise the
 * payout looks like emission, and he has already seen emission in Axie and
 * StepN and knows how it ends. That is why sources are handed out as a list
 * rather than a single total, and why each one carries its own state.
 *
 * THERE WERE THREE SOURCES, NOW THERE ARE TWO. The third was "in-game fees" — a
 * share of the ETH paid for a roll. A roll no longer costs ETH: it costs three
 * boss shards, i.e. playing. A source that is zero by construction sat on the
 * storefront labelled "starts when builds are paid in ETH" and promised a paid
 * roll that does not exist in the game. A promise beyond the code is exactly
 * what must not be here, and it also confused the arithmetic: "0.7% of trading"
 * sat next to "20%", and that read as "of your 0.7%, we take twenty percent".
 *
 * The Pons fee goes into the pool IN FULL. We take no cut from it.
 *
 * A SOURCE'S STATE IS NOT A ZERO. Zero means "this much came in today"; "not
 * switched on yet" means something else entirely, and the two must not be
 * conflated. A source that is not running has to say so in words rather than
 * pretend to be empty: otherwise the first person to look decides the scheme
 * does not work, when in fact it has simply not been started.
 *
 * THE CAP. No more is paid out than came in over the same period. The rate
 * floats with volume, and nobody is left holding an unfulfilled promise: volume
 * dropped — it dropped for everyone at once, and the same day. A fixed yield
 * percentage is impossible here by construction, and that is the main thing
 * separating this scheme from the dead ones.
 *
 * ONE SOURCE OF TRUTH. The server imports THIS file and calls these same
 * functions — as is already done for the hold tiers in holdings-v1.js. A second
 * copy of the same formula would drift from the first on the first economy
 * patch, and silently.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PackhoodPool = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

  /**
   * One pool source.
   *
   * `state` is read by a human and decides what to write on screen:
   *   running — the source is working, `usdPerDay` is its contribution today;
   *   waiting — the source is declared but not switched on yet, and `reason`
   *             says what we are waiting for;
   *   empty   — the source is working, but brought in nothing over the day.
   *
   * Splitting waiting from empty is not pedantry. "Fee is 0 because there is no
   * token yet" and "fee is 0 because nobody traded today" call for different
   * actions from the player and different words from us.
   */
  function source(id, label, usdPerDay, { waiting = null } = {}) {
    const amount = Math.max(0, num(usdPerDay));
    return Object.freeze({
      id,
      label,
      usdPerDay: amount,
      state: waiting ? "waiting" : isAmountEmpty(amount) ? "empty" : "running",
      reason: waiting || null,
    });
  }
  const isAmountEmpty = (n) => !(n > 0);

  /**
   * The pool for one day.
   *
   * ONLY THE FEE PAYS. The launch fund is no longer here, neither as a summand
   * nor as a backstop, and this is the third — and final — edit to this same
   * spot.
   *
   * At first the fund stood as a source next to the fee, and the two were added
   * together: the screen said "pool $50/day", of which the fee gave zero and the
   * fund gave fifty. Then I made it a backstop covering the gap up to a floor —
   * which was more honest, but $50 and $1,500 still ended up on screen.
   *
   * And they should not be there at all. The fund is money Alexander puts in
   * himself so that nothing collapses in the first weeks. It is not part of the
   * economy and not what the project pays with: it is insurance, and there is
   * nothing to tell the player about it. All the player needs to see is how much
   * the fees brought in. Zero today is the truth: there is no token yet.
   *
   * The argument "let people see that we put money in" fails a single question:
   * what will a person do with that number? He will add it to his future income
   * — that is, count as his own something that runs out in a month.
   *
   * @param ponsUsd24h      creator fee on Pons over the day, in dollars
   * @param tokenLaunched   whether the token has launched — without it there is
   *                        no fee at all
   */
  function poolPerDay({ ponsUsd24h = 0, tokenLaunched = false } = {}) {
    const fee = tokenLaunched ? Math.max(0, num(ponsUsd24h)) : 0;

    const sources = [
      // The rate is in the name, because a zero without a rate reads as "there
      // is no source". Zero is today's revenue; 0.7% is how the source is built.
      source(
        "pons",
        "Pons trading fee",
        fee,
        { waiting: tokenLaunched ? null : "token_not_launched" },
      ),
    ];

    return Object.freeze({
      sources: Object.freeze(sources),
      feesUsdPerDay: fee,
      usdPerDay: fee,
      liveCount: sources.filter((s) => s.state !== "waiting").length,
    });
  }

  /**
   * The player's share of the pool.
   *
   * THE HONEST EMPTY-WORLD CASE. While nobody has working buildings, world power
   * is zero, and dividing by it would give NaN or, worse, a silent zero. The
   * truth here is different and better than any advertising: the very first
   * working building takes the whole pool. That is not a promise about the
   * future but a description of how the formula computes right now — and exactly
   * what is worth showing to the first person who shows up.
   *
   * `power` and `worldPower` arrive in hundredths (see powerFor in
   * buildings-v1.js): a share is a ratio, so the unit cancels out and there is
   * no need to convert them to whole numbers. All that matters is that both
   * values be in THE SAME units, which is why both come from the same function.
   */
  function shareFor({ power = 0, worldPower = 0, usdPerDay = 0 } = {}) {
    const mine = Math.max(0, num(power));
    const world = Math.max(0, num(worldPower));
    const pool = Math.max(0, num(usdPerDay));

    if (mine <= 0) {
      return Object.freeze({ sharePct: 0, usdPerDay: 0, worldEmpty: world <= 0, alone: false });
    }
    // World power cannot be smaller than your own: if it arrives smaller, the
    // world summary has fallen behind your own figure, and lying in the player's
    // favour here is more dangerous than lying in ours — he will do the maths
    // and not get what was promised.
    const denominator = Math.max(world, mine);
    const share = mine / denominator;
    return Object.freeze({
      sharePct: share * 100,
      usdPerDay: pool * share,
      worldEmpty: false,
      alone: share >= 1,
    });
  }

  /**
   * How much one building brings in if you put it into a working slot.
   *
   * This is the very number the player came to this screen for: not "22% chance"
   * but "this much per day". It is computed as the building's share of world
   * power AFTER it appears — that is, the building dilutes the world with
   * itself, and on an empty world this formula honestly gives the whole pool
   * rather than infinity.
   */
  function buildingIncome({ buildingPower = 0, multiplier = 1, worldPower = 0, usdPerDay = 0 } = {}) {
    const mult = Math.max(0, num(multiplier, 1));
    const own = Math.max(0, num(buildingPower)) * mult * 100; // in the same hundredths
    if (own <= 0) return Object.freeze({ usdPerDay: 0, sharePct: 0 });
    const world = Math.max(0, num(worldPower)) + own;
    const share = own / world;
    return Object.freeze({ usdPerDay: Math.max(0, num(usdPerDay)) * share, sharePct: share * 100 });
  }

  return Object.freeze({
    poolPerDay: poolPerDay,
    shareFor: shareFor,
    buildingIncome: buildingIncome,
  });
});
