/**
 * Top 10 coins of Robinhood Chain. We read the chain ourselves.
 *
 * AT FIRST I WENT TO 6PACK FOR THIS, and that was a mistake: our screen stopped
 * working until somebody redeployed a project that is not ours. Tying two
 * different repositories together with a live request for the sake of a
 * ten-line list means creating a dependency nobody will see until it falls off.
 * What was taken from there is HOW it is built, not where to get the data.
 *
 * WHAT EXACTLY WAS TAKEN (all of it paid for over there with someone else's
 * days of debugging):
 *
 *  — TWO SOURCES OF PAIRS. The explorer's token list is sorted by market cap
 *    and truncated, and DELTA, AI, YOLO and INDEX do not make it in even though
 *    they have millions in liquidity. The word search picks them up.
 *
 *  — IN BATCHES OF TEN. On thirty addresses DexScreener silently returns zero
 *    pairs: not an error, not an empty list with a note — just zero, as if
 *    there were nothing on the chain. On ten it answers honestly.
 *
 *  — POOLS ARE SUMMED, THE PRICE IS TAKEN FROM THE DEEPEST ONE. One token —
 *    one place, and it can have close to a hundred pools.
 *
 *  — POOL LIVENESS. Turnover has to be at least half a percent of depth.
 *    Without this the first place went to a bloated pool with not a single
 *    trade: one ticker had 128 million in "liquidity" and zero turnover, while
 *    the real one traded on 36 thousand. For us this is not cosmetics: a place
 *    in the top decides which coin stands in the building a person pays for.
 *
 *  — WHAT IS NOT A COIN. Stablecoins and wrappers, tokenised stocks, LP tokens.
 *
 * A SOURCE FAILURE DOES NOT TAKE THE GAME DOWN. No answer — we serve the last
 * known result with an age marker; no such result either — an empty list, and
 * the buildings honestly say nothing about a coin. An empty top must not look
 * like "there is nothing on this chain".
 */

const CHAIN_KEY = "robinhood";
const EXPLORER = "https://robinhoodchain.blockscout.com";

const API = {
  tokens: EXPLORER + "/api/v2/tokens?type=ERC-20",
  pairs: "https://api.dexscreener.com/tokens/v1/" + CHAIN_KEY + "/",
  search: "https://api.dexscreener.com/latest/dex/search?q=",
};

const SEARCH_WORDS = ["robinhood", "USDG", "hood", "index", "delta", "cat",
                      "dog", "ai", "yolo", "stonk"];

/* Fallback list of addresses. The explorer is free and goes down; the list
   exists so that there is something to show, not so that it is accurate. In the
   code and not in an environment variable: somebody would forget to set the
   variable, and there would be nothing to notice it with. */
const FALLBACK_TOKENS = [
  "0x5Cb6F181081301b44905F3ae15419112ecaBd8A6", // PIPEDOG
  "0x020bfC650A365f8BB26819deAAbF3E21291018b4", // CASHCAT
  "0xe934e36A439C94017B64a3FecE66AF12099aBF50", // STONKBROKER
  "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", // NVDA
  "0x39dBED3a2bd333467115dE45665cC57F813C4571", // PONS
  "0xb8Fa8010833463Aac5595b55B9045479239EfF79", // WTH
  "0x57C0E45cB534413D1C20A4240955d6bB250BB4F1", // UP
  "0x45242320DBB855EeA8Fd36804C6487E10E97FCF9", // TENDIES
  "0x7FE995a80075dF3Dc8Ae11A9b82c7FE4202CD87f", // HMM
  "0x56910D4409F3a0C78C64DD8D0545FF0705389870", // Index
  "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", // SPCX
  "0x6245e67affA44a23077f0Ea7f981a8DC743a0c47", // FRONG
  "0x5f62C57e5C537887117EeF828b7E3Ad41C009FEb", // GOOD
  "0x232CDFc415D10b673845D83Dc02ba2eaBe7e30d1", // IF
  "0xCA9c78Dd337A67F6e0077F65F5E9218719d30eDf", // NET
  "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", // SPY
  "0xF8BC08092C06dB6148114DCf82AF881F1085f92b", // WOOD
  "0xc6911796042b15d7Fa4F6CDe69e245DdCd3d9c31", // VIRTUAL
];

const NOT_COINS = new Set(["WETH", "ETH", "USDG", "USDE", "USDC", "USDT",
                           "USDS", "USR", "DAI", "SYRUPUSDG", "WSTETH", "WBTC"]);
const STOCK = /(•\s*Robinhood Token|\bInc\.|\bCorp\.|\bCorporation\b|\bClass [A-C]\b|\bETF\b|\bTrust\b|\bplc\b|\bN\.V\.|\bS\.A\.|\bCo\.|\bHoldings?\b|\bGroup\b|\bLtd\b)/i;
const LP = /(\bLP\b|rLP|Liquidity Token|Rebasing)/i;

const BATCH = 10;
const TIMEOUT_MS = 12000;
const LIVENESS = 0.005;      // 24h turnover against depth

/* Thresholds of a real market.
 *
 * Sorting by market cap on its own produces absurdities: VIRTUAL came out first
 * with 446 million in "market cap" against 200 thousand of depth — 0.045%. That
 * is not the first coin of the network, it is a number with no market behind
 * it: there is nothing to sell there, nowhere to buy, and giving such a coin
 * first place would tie a building someone pays ether for to a void.
 *
 * Both thresholds together, not one or the other. The ratio alone would cut off
 * large coins with honest but small pools; the absolute one alone would let
 * through a bloated market cap with respectable-looking depth.
 *
 * The numbers were picked by measuring the chain's live market: real coins have
 * a depth-to-market-cap ratio from 1.6% (PONS) to 28% (PIPEDOG), while VIRTUAL
 * sits at 0.045%. Half a percent is below every real one and an order of
 * magnitude above the painted one. */
const DEPTH_TO_MCAP = 0.005;
const DEPTH_MINIMUM = 200_000;
const PLACES = 10;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = null;
let inFlight = null;

/** A request with a time cap and retries: hanging is worse than failing. */
async function request(url, attempts = 3, fetchImpl = globalThis.fetch) {
  let lastError;
  for (let k = 0; k < attempts; k++) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, { signal: abort.signal, headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("response " + response.status);
      return await response.json();
    } catch (e) {
      lastError = e;
      if (k === attempts - 1) throw new Error(url.slice(0, 60) + " — " + e.message);
      await new Promise((r) => setTimeout(r, 700 * (k + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function tokenAddresses(fetchImpl) {
  try {
    const d = await request(API.tokens, 2, fetchImpl);
    const list = (d.items || []).map((t) => t.address || t.address_hash).filter(Boolean);
    if (!list.length) throw new Error("empty token list");
    return { list, source: "blockscout" };
  } catch (e) {
    return { list: FALLBACK_TOKENS.slice(), source: "fallback", why: e.message };
  }
}

/** Pairs by address, in batches. A failed batch does not drag the rest down. */
async function pairsByAddresses(addresses, fetchImpl) {
  const batches = [];
  for (let i = 0; i < addresses.length; i += BATCH) batches.push(addresses.slice(i, i + BATCH));
  const results = await Promise.allSettled(batches.map((c) => request(API.pairs + c.join(","), 2, fetchImpl)));
  const out = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const v = r.value;
    out.push(...(Array.isArray(v) ? v : (v && v.pairs) || []));
  }
  return out;
}

/** Second source: a word search, picking up what the explorer does not have. */
async function pairsBySearch(fetchImpl) {
  const results = await Promise.allSettled(
    SEARCH_WORDS.map((w) => request(API.search + encodeURIComponent(w), 2, fetchImpl)));
  const out = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const p of (r.value && r.value.pairs) || []) if (p.chainId === CHAIN_KEY) out.push(p);
  }
  return out;
}

/** Collapsing pairs into tokens: liquidity and turnover summed, price from the deepest pool. */
function collapse(pairs) {
  const byToken = new Map();
  for (const p of pairs) {
    const b = p && p.baseToken;
    if (!b || !b.address || !p.priceUsd) continue;
    const key = b.address.toLowerCase();
    const liq = (p.liquidity && p.liquidity.usd) || 0;
    const vol = (p.volume && p.volume.h24) || 0;
    /* Trades over 24h are a measure of the number of participants, not of
       money. A large turnover made by two trades and the same turnover made by
       a thousand are different markets, and volume alone cannot tell them
       apart. */
    const txns = ((p.txns && p.txns.h24 && (Number(p.txns.h24.buys) || 0) + (Number(p.txns.h24.sells) || 0)) || 0);
    const seen = byToken.get(key);
    if (!seen) { byToken.set(key, { pair: p, deepest: liq, liq, vol24: vol, txns24: txns, pools: 1 }); continue; }
    seen.liq += liq;
    seen.vol24 += vol;
    seen.txns24 += txns;
    seen.pools += 1;
    if (liq > seen.deepest) { seen.deepest = liq; seen.pair = p; }
  }
  return [...byToken.values()];
}

function iconUrl(url) {
  return url ? String(url).replace(/\/(thumb|small)\//, "/large/") : null;
}

function normalize(t) {
  const p = t.pair;
  const b = p.baseToken;
  return {
    sym: String(b.symbol || "").toUpperCase(),
    name: b.name || b.symbol || "",
    address: b.address,
    price: Number(p.priceUsd),
    /* Market cap is what everyone ranks a top by. The exchange returns it in
       the same pair, no separate request needed. fdv as a fallback: for tokens
       with the whole supply issued it is the same number, and for the ones
       where marketCap is not computed fdv is all there is. */
    mcap: Number(p.marketCap) || Number(p.fdv) || 0,
    chg24: Number((p.priceChange && p.priceChange.h24) ?? 0),
    liq: t.liq,
    vol24: t.vol24,
    txns24: t.txns24 || 0,
    pools: t.pools,
    icon: iconUrl((p.info && p.info.imageUrl) || null),
    scanUrl: EXPLORER + "/token/" + b.address,
  };
}

const isLive = (t) => Number.isFinite(t.liq) && t.liq > 0
  && Number.isFinite(t.vol24) && (t.vol24 / t.liq) >= LIVENESS;

/* There must be a market behind a market cap, otherwise it is just a number. */
const isTraded = (t) => t.liq >= DEPTH_MINIMUM
  && (t.mcap <= 0 || t.liq / t.mcap >= DEPTH_TO_MCAP);

function isCoin(t) {
  if (NOT_COINS.has(t.sym)) return false;
  if (STOCK.test(t.name)) return false;
  if (LP.test(t.name) || LP.test(t.sym)) return false;
  return Number.isFinite(t.price) && t.price > 0;
}

async function readTop(fetchImpl) {
  const { list } = await tokenAddresses(fetchImpl);
  const [byAddress, bySearch] = await Promise.all([
    pairsByAddresses(list, fetchImpl),
    pairsBySearch(fetchImpl).catch(() => []),
  ]);
  const pairs = byAddress.concat(bySearch);
  if (!pairs.length) throw new Error("no pools came back");

  const all = collapse(pairs).map(normalize).filter(isCoin).filter(isLive).filter(isTraded);

  /* One ticker — one place. Tickers repeat on this chain: five "DOG"s from
     different addresses must not take five places, and the choice between them
     has to be made by turnover, not by depth — otherwise a bloated pool with no
     trades wins. */
  const places = new Map();
  for (const t of all) {
    const seen = places.get(t.sym);
    if (!seen || t.vol24 > seen.vol24) places.set(t.sym, t);
  }

  /* A PLACE IS COMPUTED FROM THE WHOLE PICTURE, not from a single number.
   *
   * Every single-rule ranking produces an absurdity, and I went through both:
   *
   *   — by liquidity, PIPEDOG came out first with 9 million of depth against 31
   *     million of market cap, while CASHCAT with 186 million stood second;
   *   — by market cap, VIRTUAL came out first with 446 million against 200
   *     thousand of depth: a number with no market behind it.
   *
   * Industry indexes are computed the same way: take the coin's share in each
   * factor and add the shares up with weights. A share and not an absolute
   * number, because market cap and trade count are not directly comparable,
   * while shares are always in the same units and sum to one.
   *
   * FOUR FACTORS AND WHY EXACTLY THESE:
   *   market cap    — how much the coin is worth;
   *   liquidity     — whether you can get in and out of it;
   *   turnover      — how much money went through it over 24 hours;
   *   trades        — how many people did it. A large turnover made by two
   *                   trades and the same turnover made by a thousand are
   *                   different markets.
   *
   * Weights: market cap weighs more than the rest, because the question "the
   * biggest coins of the network" is first of all about size; the other three
   * keep that size from being painted on.
   */
  const WEIGHTS = { mcap: 0.4, liq: 0.25, vol24: 0.2, txns24: 0.15 };

  const live = [...places.values()];
  const totals = {};
  for (const key of Object.keys(WEIGHTS)) {
    totals[key] = live.reduce((acc, t) => acc + Math.max(0, Number(t[key]) || 0), 0);
  }
  const scoreOf = (t) => Object.entries(WEIGHTS).reduce((acc, [key, weight]) => {
    // A zero denominator means nobody has that factor at all: then it simply
    // does not take part instead of dropping the whole score into NaN.
    const total = totals[key];
    return acc + (total > 0 ? (Math.max(0, Number(t[key]) || 0) / total) * weight : 0);
  }, 0);

  return live
    .map((t) => ({ ...t, score: scoreOf(t) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, PLACES)
    .map((t, i) => ({ ...t, rank: i + 1 }));
}

/** Top coins. Never throws: the game has to work without it too. */
export async function topCoins(fetchImpl = globalThis.fetch) {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { rows: cache.rows, ageMs: Date.now() - cache.at, stale: false };
  }
  if (!inFlight) {
    inFlight = readTop(fetchImpl)
      .then((rows) => { cache = { rows, at: Date.now() }; return rows; })
      .catch((e) => { console.warn("[coins] could not read the top:", e.message); return null; })
      .finally(() => { inFlight = null; });
  }
  const fresh = await inFlight;
  if (fresh) return { rows: fresh, ageMs: 0, stale: false };
  if (cache) return { rows: cache.rows, ageMs: Date.now() - cache.at, stale: true };
  return { rows: [], ageMs: null, stale: true };
}

/** Ticker → place. Coins outside the top get no place: that is not an error but a fact. */
export function ranksOf(rows) {
  const map = {};
  for (const c of rows || []) map[c.sym] = c.rank;
  return map;
}
