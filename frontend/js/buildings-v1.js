/**
 * Building catalogue.
 *
 * WHAT A BUILDING IS. It is a share in the payout pool. A building has a coin, a
 * rarity and a power; your share of the pool equals the sum of the powers of the
 * buildings standing in your slots, multiplied by your hold multiplier and
 * divided by the power of the whole world.
 *
 * TWO SOURCES, AND BOTH ARE NEEDED.
 *   Holding gives SLOTS — how many buildings can work for you at all (1 at 100k,
 *   up to 5 at a hundred million). That is demand for the token.
 *   Pulling gives THE BUILDINGS THEMSELVES. That is the ETH inflow and the thing
 *   people pull for.
 * Without holding there is nowhere to put five buildings; without pulls there is
 * nothing to put. If there were only one source, the other would be decoration.
 *
 * WHY POWER RISES SO STEEPLY. A legendary building is forty times stronger than
 * a common one. That is the answer to "I pulled a lot — and I got a mega cool
 * building": the difference has to be big enough to see without a calculator. A
 * flat ladder like 10-20-30-40 gives no reason to keep pulling past the first
 * hit.
 *
 * DUPLICATES ARE NOT WASTED. A second Cat Mint takes a second slot and works
 * alongside the first. A duplicate that turns into "you already have this,
 * sorry" is the fastest way to break a person of the pulling habit.
 *
 * ONE SOURCE OF TRUTH: the server imports this very file.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PackhoodBuildings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WEIGHT_TOTAL = 10000;

  /* THE COINS ARE THE SAME SIX AS IN 6PACK. The list was not invented here: it
   * is taken from the neighbouring project, where the Robinhood Chain six have
   * already been picked — PIPEDOG, CASHCAT, AI, STONKBROKER, DOGO, INDEX. Our
   * own, different six would mean that two of our projects consider different
   * things "the top", and we would have to explain that to the same people.
   *
   * The icons come from the same CDN as there. We cannot draw our own: another
   * project's logo is either taken as is, or it becomes a forgery. The address
   * may one day stop responding, so the ticker sits under the image — if it
   * fails to load, a readable caption remains rather than an empty hole.
   *
   * THE BUILDINGS ARE THE SAME AS IN THE GAME: identifiers from
   * metaprogression.js, letter for letter. This is not a new list next to the old
   * one, but the same one with a coin, a rarity and a power added.
   *
   * EACH COIN HOLDS ONE STRONG BUILDING, and the three starting ones went to the
   * three largest. The rule can be said out loud, and it explains the repeats:
   * the coin says WHAT you are paid in, the building says HOW MUCH.
   *
   * Pairs where the connection reads by itself were kept: Bullseye Yard with
   * INDEX (the bullseye and hitting the index), Quickdraw Yard with STONKBROKER
   * (a fast draw and a fast trade), Training Grounds with AI, Ranger Lodge with
   * DOGO (the watchdog by the house), Huntsman's Hall with CASHCAT — the main
   * hall and the chain's main coin.
   */
  const ICONS = Object.freeze({
    PIPEDOG:     "https://cdn.dexscreener.com/cms/images/4S5N79kV0jhT7y6K?width=800&height=800&quality=95&format=auto",
    CASHCAT:     "https://cdn.dexscreener.com/cms/images/Lq7a3pS9Wn8EuGp0?width=800&height=800&quality=95&format=auto",
    AI:          "https://cdn.dexscreener.com/cms/images/U6RIzs8Fm7Jar6GE?width=800&height=800&quality=95&format=auto",
    STONKBROKER: "https://cdn.dexscreener.com/cms/images/_dQRN4wt4hctn71c?width=800&height=800&quality=95&format=auto",
    INDEX:       "https://cdn.dexscreener.com/cms/images/LTfdhAlnWijozhDa?width=800&height=800&quality=95&format=auto",
    DOGO:        "https://assets.coingecko.com/coins/images/102175491/large/fy8vywsdpyv6zb2j7qtyt6u0dw24.?1786442622",
  });

  /* TEN BUILDINGS — TEN SEATS IN THE CHAIN'S TOP.
   *
   * A building is not tied to a ticker, it is tied to a SEAT: the first building
   * is the chain's first coin, the tenth is the tenth. The rule is stated in one
   * sentence, and the question "why is this one rare" disappears along with the
   * answer "because I arranged it that way".
   *
   * WHY NOT BY TICKER. There were nine buildings for six coins: two buildings
   * shared one coin, while "six coins" sat right next to them on screen — I wrote
   * one thing in the copy and kept another in the catalogue. Tying to a seat
   * fixes this by construction: there are exactly as many seats as buildings.
   *
   * WHAT THIS MEANS FOR THE OWNER. The top changes, and the coin in his building
   * may change with it. That is not a loss: he owns a seat in the top ten, not a
   * particular ticker, and the seat stays with him. An index works the same way —
   * the constituents are revised, the share remains.
   *
   * WEIGHTS AND POWER ARE SET HERE, NOT DERIVED FROM THE SEAT. The draw runs on
   * the weights, and the weights are announced in advance: a weight that depended
   * on live data would change between the promise and the reveal, and the
   * commitment would stop meaning anything. The seat decides WHICH coin is in the
   * building, but not HOW OFTEN it drops.
   *
   * The weights sum to exactly 10000 — the buildings check script in scripts/
   * verifies this.
   */
  const BUILDINGS = Object.freeze([
    Object.freeze({ id: "trainingGrounds", name: "Training Grounds", seat: 10, rarity: "common",    power: 10,  weight: 2200 }),
    Object.freeze({ id: "archeryRange",    name: "Archery Range",    seat: 9,  rarity: "common",    power: 15,  weight: 1800 }),
    Object.freeze({ id: "infirmary",       name: "Infirmary",        seat: 8,  rarity: "common",    power: 20,  weight: 1500 }),
    Object.freeze({ id: "quickdrawYard",   name: "Quickdraw Yard",   seat: 7,  rarity: "rare",      power: 25,  weight: 1200 }),
    Object.freeze({ id: "twinshotRange",   name: "Twinshot Range",   seat: 6,  rarity: "rare",      power: 30,  weight: 1000 }),
    Object.freeze({ id: "bullseyeYard",    name: "Bullseye Yard",    seat: 5,  rarity: "rare",      power: 40,  weight: 800 }),
    // The Forge is the tenth building. The picture was already sitting in images/
    // and was not used anywhere: there was nothing to draw, you just had to look.
    Object.freeze({ id: "forge",           name: "Forge",            seat: 4,  rarity: "epic",      power: 60,  weight: 600,
                    art: "images/building-blacksmith-v1.png" }),
    Object.freeze({ id: "rangerLodge",     name: "Ranger Lodge",     seat: 3,  rarity: "epic",      power: 90,  weight: 450 }),
    Object.freeze({ id: "armoury",         name: "Armoury",          seat: 2,  rarity: "legendary", power: 150, weight: 300 }),
    Object.freeze({ id: "huntsmansHall",   name: "Huntsman's Hall",  seat: 1,  rarity: "legendary", power: 400, weight: 150 }),
  ]).map((b) => Object.freeze({
    ...b,
    // The coin is filled in from live data (see withCoins). It is deliberately
    // absent statically: a hardcoded ticker would diverge from the real top on
    // the same day the constituents change, and would lie silently.
    coin: null,
    icon: null,
    label: b.name,
  }));

  /* Buildings with live coins: seat -> coin from the top.
   *
   * The catalogue stays unchanged, a copy is handed outward. Frozen objects
   * cannot be mutated, and if they could, the server and the client — which
   * import the same file — would start editing one shared list from two places.
   */
  function withCoins(coins = []) {
    const bySeat = {};
    for (const c of coins) if (c && c.rank) bySeat[c.rank] = c;
    return BUILDINGS.map((b) => {
      const c = bySeat[b.seat];
      if (!c) return b;
      const ticker = String(c.sym || "").toUpperCase();
      return Object.freeze({
        ...b,
        coin: ticker,
        // Icon from live data; the static map is a fallback for the six we have
        // already seen. An empty box would read as broken layout.
        icon: c.icon || ICONS[ticker] || null,
        label: `${ticker} ${b.name}`,
      });
    });
  }

  const BY_ID = Object.freeze(Object.fromEntries(BUILDINGS.map((b) => [b.id, b])));

  function weightSum(list = BUILDINGS) {
    return list.reduce((sum, b) => sum + b.weight, 0);
  }

  /** Drop chance in percent, rounded to hundredths for display. */
  function chanceOf(building) {
    return Math.round(building.weight / WEIGHT_TOTAL * 10000) / 100;
  }

  /**
   * Average power of one pull.
   *
   * Needed so the price of a pull can be compared against what it gives without
   * guessing. Computed as an integer in hundredths: a fractional average of
   * "about 34.7" cannot be checked by eye, whereas a whole 3470 either matches or
   * it does not.
   */
  function averagePower(list = BUILDINGS) {
    const total = list.reduce((sum, b) => sum + b.weight * b.power * 100, 0);
    return Math.round(total / weightSum(list));
  }

  /**
   * A building by draw. An integer from 0 to 9999.
   *
   * The type is checked before the value: Number(null) is zero and Number("500")
   * is a number, and both would have slipped through as a legitimate draw. A
   * string containing a number arrives from a request body more often than a
   * number does.
   */
  function buildingForRoll(roll, list = BUILDINGS) {
    if (typeof roll !== "number" || !Number.isInteger(roll)) return null;
    if (roll < 0 || roll >= WEIGHT_TOTAL) return null;
    let threshold = 0;
    for (const building of list) {
      threshold += building.weight;
      if (roll < threshold) return building;
    }
    // We can only get here if the weights do not add up to 10000. Silently
    // returning the last building would mean handing out legendaries by mistake.
    return null;
  }

  /**
   * The player's power: only the buildings that fit into the slots.
   *
   * Slots are the hold's limit, and surplus buildings do NOT work, but they also
   * do NOT disappear: sell the token, lose a slot — the building stays put and
   * switches back on as soon as the holding returns. Taking a thing away because
   * a balance dropped means punishing someone for something that already punished
   * him.
   *
   * The strongest ones go into the slots: a person whose legendary does not work
   * because "you put it in earlier" would decide we are cheating, and in
   * substance he would be right.
   */
  /* ONE SLOT — ONE BUILDING.
   *
   * A slot holds exactly one card. You pulled a cheaper coin — you sit with it
   * until you buy another slot: that is the whole point of buying the token, and
   * without this rule slots are not needed at all.
   *
   * The strongest of what you own go into the slots. A person whose strong
   * building sits idle because "you put it in earlier" would decide we are
   * cheating, and in substance he would be right. The surplus is NOT lost: sell
   * the token, lose a slot — the building lies there and switches back on when the
   * holding returns. Taking a thing away because a balance dropped means punishing
   * someone for something that already punished him.
   */
  function powerFor({ owned = [], slots = 0, multiplier = 1 } = {}) {
    const buildings = owned
      .map((id) => BY_ID[id])
      .filter(Boolean)
      .sort((a, b) => b.power - a.power);
    const slotCount = Number.isInteger(slots) && slots > 0 ? slots : 0;
    const active = buildings.slice(0, slotCount);
    const idle = buildings.slice(slotCount);
    const base = active.reduce((sum, b) => sum + b.power, 0);
    const mult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 0;
    return Object.freeze({
      active: Object.freeze(active),
      idle: Object.freeze(idle),
      basePower: base,
      // In whole hundredths: the pool share is computed from this number, and a
      // fraction here would one day diverge from the same fraction on the server.
      power: Math.round(base * mult * 100),
      slots: slotCount,
      slotsUsed: active.length,
    });
  }

  /* ONE RATE FOR THE WHOLE PROJECT, AND IT LIVES HERE.
   *
   * 0.7% is the creator fee on Pons: 1% is taken from the curve, 30% of that
   * goes to the protocol, the remainder is ours, and all of it goes into the
   * pool. This is the ONLY thing a building promises: a share of turnover, not a
   * sum per day.
   *
   * Written as a number in the catalogue, not at every place it is displayed.
   * The card used to say "$50.00/day" — and that was true right up until the
   * second player: while no building in the world is working, any single one
   * takes the whole pool, and all ten cards showed the same launch fund sum.
   * That is, the card was quoting a person a number that vanishes the moment
   * somebody else shows up. A rate does not behave that way: it does not depend
   * on how many players there are, nor on whether the fund has been started.
   */
  const FEE_RATE = "0.7%";

  return Object.freeze({
    ALL: Object.freeze(BUILDINGS),
    FEE_RATE: FEE_RATE,
    FEE_LINE: FEE_RATE + " of trading",
    ICONS: ICONS,
    BY_ID: BY_ID,
    WEIGHT_TOTAL: WEIGHT_TOTAL,
    weightSum: weightSum,
    chanceOf: chanceOf,
    averagePower: averagePower,
    buildingForRoll: buildingForRoll,
    powerFor: powerFor,
    withCoins: withCoins,
  });
});
