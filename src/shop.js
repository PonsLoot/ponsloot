/**
 * Shop: gear for gold, legendaries for gold plus boss trophies.
 *
 * HOW THIS DIFFERS FROM THE MARKETPLACE WE USED TO HAVE. That one was
 * player-to-player, and it needs liquidity: without it you see empty shelves,
 * which is the worst possible outcome — a screen announcing that nobody is
 * here. The shop sells on behalf of the game and is always stocked.
 *
 * PRICES. The reference point is a run up to the fifteenth stage, which yields
 * about 900 gold (the cap is 60 per stage) and three trophies. From that:
 *
 *   common item        120  — seven or eight per run, "dropped in and bought
 *                             something";
 *   uncommon           320  — three per run;
 *   rare               900  — exactly one full run;
 *   epic              2400  — three runs;
 *   legendary         6000 + 6 trophies — seven runs, and the trophies require
 *                     reaching the bosses rather than farming the first stages.
 *
 * That is how shops that do not suffocate you are built: the common tier is
 * bought right away and often, the top tier costs weeks but is visible from day
 * one, and the path to it can be worked out in your head. A legendary
 * deliberately cannot be bought for plain gold — otherwise grinding the first
 * stages would bypass the bosses, and a trophy is exactly the signature that
 * you cleared them.
 *
 * THERE IS NO PICKING A SPECIFIC LEGENDARY. You buy a rarity; the item inside
 * it drops at random — by the same roll as in crafting. A shop where money buys
 * exactly the legendary you need devalues every other way of getting it, and we
 * have two of those.
 */

export const PRICES = Object.freeze({
  common:    Object.freeze({ gold: 120,  trophies: 0 }),
  uncommon:  Object.freeze({ gold: 320,  trophies: 0 }),
  rare:      Object.freeze({ gold: 900,  trophies: 0 }),
  epic:      Object.freeze({ gold: 2400, trophies: 0 }),
  legendary: Object.freeze({ gold: 6000, trophies: 6 }),
});

/* Markup for choosing the slot.
 *
 * Taken from crafting, where it already exists: a random item is cheaper than
 * an exact one. A separate number of our own next to someone else's would drift
 * apart from it on the very first balance patch, and the player would see the
 * same service priced differently in two places.
 */
export const SLOT_CHOICE_MARKUP = 1.6;

export function purchasePrice(rarity, slot) {
  const base = PRICES[rarity];
  if (!base) return null;
  const multiplier = slot ? SLOT_CHOICE_MARKUP : 1;
  return {
    gold: Math.round(base.gold * multiplier),
    trophies: base.trophies,
  };
}

/** Storefront for the screen: what is on sale and for how much. */
export function storefront() {
  return Object.entries(PRICES).map(([rarity, price]) => ({
    rarity,
    random: { ...price },
    exact: purchasePrice(rarity, "chest"),
  }));
}
