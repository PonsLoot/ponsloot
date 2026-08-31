/**
 * Hold tiers and buildings.
 *
 * THE KEY DECISION: a building is not bought, it is granted for holding the
 * token in your wallet. Buying raised a question with no good answer — what to
 * do with the token that was paid. The treasury piles it up as an overhang above
 * the market; handing it back to holders is new money paying old money, whatever
 * you call it; selling it kills the price. With holding, the token is not spent
 * at all: hold it and your buildings work, sell it and they stop. Demand is
 * constant, supply comes only from those who leave.
 *
 * NOTHING IS LOCKED. We read balanceOf on the player's wallet. Not staking, not
 * a lock, not a deposit: the token stays with him the whole time, and we could
 * not take it even by mistake. As a side effect this removes a whole class of
 * breakages — nothing to unlock, nothing to get stuck in a contract, nobody to
 * lose the vault key.
 *
 * A CAP IS MANDATORY. Without one, a single whale occupies every building in the
 * world and takes the whole pool. That is why both the number of buildings and
 * the multiplier hit a ceiling: past the fifth tier there is no point holding
 * more, and that is visible from the table.
 *
 * ONE SOURCE OF TRUTH. The server imports THIS file (see src/holdings.js) and
 * calls these same functions. A second list of the same tiers would drift from
 * the first on the very first balance patch, and silently.
 *
 * The base multiplier 0.4 and the cap 2.5 are taken from Curve, where this
 * scheme has worked since 2020: with no token you get 40% of the maximum, with
 * enough held you get two and a half times the base. The numbers are not made up
 * but proven by someone else's years of experience, and that is the only reason
 * to take exactly these.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PackhoodHoldings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* Tiers in whole tokens, and deliberately round ones: a hundred thousand, a
   * million, five, twenty, a hundred. A person has to be able to retell the
   * ladder out loud without looking at the screen — "you hold a mil, you get two
   * buildings". A tier like 250,000 does not survive that retelling, and it is
   * precisely the retelling that brings in the next player.
   *
   * Whole numbers also because a person should not have to read
   * 249999.99999999997, and comparing fractions after dividing by decimals will
   * one day miss by the last digit for exactly the person who is exactly on the
   * tier. */
  const TIERS = Object.freeze([
    Object.freeze({ tier: 0, name: "Drifter",      hold: 0,           buildings: 0, multiplier: 0.4 }),
    Object.freeze({ tier: 1, name: "Camp",         hold: 100_000,     buildings: 1, multiplier: 1.0 }),
    Object.freeze({ tier: 2, name: "Steading",     hold: 1_000_000,   buildings: 2, multiplier: 1.4 }),
    Object.freeze({ tier: 3, name: "Hamlet",       hold: 5_000_000,   buildings: 3, multiplier: 1.8 }),
    Object.freeze({ tier: 4, name: "Stronghold",   hold: 20_000_000,  buildings: 4, multiplier: 2.2 }),
    Object.freeze({ tier: 5, name: "Free Company", hold: 100_000_000, buildings: 5, multiplier: 2.5 }),
  ]);

  const MAX_TIER = TIERS[TIERS.length - 1];

  /**
   * Balance in whole tokens, from a wei string and decimals.
   *
   * We divide AS INTEGERS and only downwards. Through Number, a balance of 50
   * million tokens with 18 decimals does not fit into a double without loss, and
   * for someone sitting exactly on a tier the tier would not be counted — which
   * is the worst kind of bug: he sees the right number on screen and gets
   * nothing for it.
   */
  function tokensFromWei(weiString, decimals = 18) {
    let wei;
    try {
      wei = BigInt(String(weiString ?? "0").trim() || "0");
    } catch (_) {
      return 0;
    }
    if (wei <= 0n) return 0;
    const divisor = 10n ** BigInt(Math.max(0, Math.min(36, Number(decimals) || 0)));
    const whole = wei / divisor;
    // The tier never exceeds 50 million, so it fits into a Number with room to
    // spare; anything larger we clamp to the maximum — it makes no difference to
    // the tiers any more.
    return whole > 1_000_000_000_000n ? 1_000_000_000_000 : Number(whole);
  }


  /**
   * The launch fund.
   *
   * WHY NOT "×3 MULTIPLIER AT LAUNCH". The pool is split proportionally to
   * shares, and a multiplier applied to everyone at once does not change a
   * cent — it only looks generous. Somebody will do that arithmetic and publish
   * it, and they will be right.
   *
   * There are exactly two real ways to make the start more generous, and both
   * are here. The first is to put REAL extra money into the pool: a finite sum
   * spread over days, with an address you can see. The second is to show that
   * there are still few holders and each one's share is large; that is true
   * anyway, it just has to not be hidden.
   *
   * The fund is finite and declared as a number. The promise "we will top it up
   * until we get bored" ends with us getting bored at the worst possible moment,
   * and that is what people remember.
   */
  function launchFund({ totalUsd = 0, days = 0, startedAt = null, now = Date.now() } = {}) {
    const total = Number(totalUsd) > 0 ? Number(totalUsd) : 0;
    const dayCount = Number.isInteger(days) && days > 0 ? days : 0;
    const startMs = startedAt ? Date.parse(startedAt) : NaN;

    if (!total || !dayCount || !Number.isFinite(startMs)) {
      return Object.freeze({ active: false, totalUsd: total, days: dayCount, perDayUsd: 0,
                             daysLeft: 0, spentUsd: 0, leftUsd: total });
    }

    const perDay = total / dayCount;
    // Math.floor, not round: half a day into the day, half a day has passed, NOT
    // a whole one. Rounding up would gift a day that never happened, and the
    // fund would run out earlier than announced — at exactly the moment people
    // are looking at it.
    const daysPassed = Math.max(0, Math.floor((now - startMs) / 86_400_000));
    const daysLeft = Math.max(0, dayCount - daysPassed);
    const spent = Math.min(total, perDay * Math.min(daysPassed, dayCount));

    return Object.freeze({
      active: daysLeft > 0 && now >= startMs,
      totalUsd: total,
      days: dayCount,
      perDayUsd: perDay,
      daysLeft: daysLeft,
      spentUsd: spent,
      leftUsd: Math.max(0, total - spent),
    });
  }

  /** The tier that this holding corresponds to. */
  function tierForHolding(wholeTokens) {
    const held = Number.isFinite(wholeTokens) && wholeTokens > 0 ? Math.floor(wholeTokens) : 0;
    let found = TIERS[0];
    for (const tier of TIERS) {
      if (held >= tier.hold) found = tier;
    }
    return found;
  }

  /** The next tier and how much is missing to reach it. null — already at the cap. */
  function nextTier(wholeTokens) {
    const held = Number.isFinite(wholeTokens) && wholeTokens > 0 ? Math.floor(wholeTokens) : 0;
    const next = TIERS.find((t) => t.hold > held);
    if (!next) return null;
    return Object.freeze({ ...next, short: next.hold - held });
  }

  /**
   * The full hold summary. This is what goes both to the interface and to the
   * accrual.
   *
   * enabled=false means "there is no token yet" — not an error and not a zero.
   * The difference matters: zero says "you hold nothing", while the absence of a
   * token says "there is nothing to hold yet", and on screen those have to be
   * different words.
   */
  function summarise({ weiBalance = "0", decimals = 18, enabled = true,
                       launch = null, holders = null } = {}) {
    const held = tokensFromWei(weiBalance, decimals);
    const tier = tierForHolding(held);
    return Object.freeze({
      // How many wallets currently clear at least the first tier. At launch this
      // is single digits, and each one's share is large — that is the real reason
      // to come early, as opposed to a made-up multiplier.
      holders: Number.isInteger(holders) && holders >= 0 ? holders : null,
      launch: launch || launchFund({}),
      enabled: Boolean(enabled),
      held: held,
      tier: tier.tier,
      tierName: tier.name,
      buildings: tier.buildings,
      multiplier: tier.multiplier,
      atCap: tier.tier === MAX_TIER.tier,
      next: nextTier(held),
      tiers: TIERS,
    });
  }

  return Object.freeze({
    TIERS: TIERS,
    MAX_TIER: MAX_TIER,
    tokensFromWei: tokensFromWei,
    launchFund: launchFund,
    tierForHolding: tierForHolding,
    nextTier: nextTier,
    summarise: summarise,
  });
});
