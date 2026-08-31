/* What the trading fee actually earned in the last 24 hours.
 *
 * WHY THIS EXISTS. The pool was fed a hardcoded zero with a note saying the
 * number would arrive from the chain one day. That was honest — better a zero
 * than an invented figure on a page about money — but it also made the whole
 * payout half of the product unverifiable: paste an address, and everything
 * downstream still reads zero, so there is no way to tell a working pipe from a
 * broken one.
 *
 * The fee is not a secret quantity. It is a share of traded volume, volume is
 * public, and any index will tell you today's for any token. So the pool can
 * show a real number for whatever address is configured — including someone
 * else's coin, which is exactly how you check that the pipe works before your
 * own token exists.
 *
 * WHICH PAIR'S VOLUME. A token trades in several pairs; the creator fee is
 * earned on the launchpad's, and nothing in the data says which one that is.
 * Summing them all would overstate — most of that volume pays a fee to someone
 * else. So: the pair with the deepest liquidity, which is the launchpad's in
 * every case observed so far, and the pair is reported alongside the number so
 * the choice can be checked rather than trusted.
 *
 * WHY THE RATE IS NOT WRITTEN HERE. It lives in the building catalogue as
 * FEE_BPS, next to the label the cards print. A second literal is how a screen
 * and a payout start disagreeing about the same rate.
 */
import * as buildingPulls from "./building-pulls.js";

const CHAIN_KEY = "robinhood";
const PAIRS_URL = "https://api.dexscreener.com/tokens/v1/" + CHAIN_KEY + "/";

/* Five minutes. The number moves slowly — it is a 24-hour window — and this is
 * read on every open of two screens. Asking an index per page view would earn
 * a rate limit and tell us nothing new. */
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 6000;

let cache = null;   // { at, address, value }

function empty(reason) {
  return Object.freeze({
    usdPerDay: 0, volume24hUsd: 0, rateBps: 0,
    pair: null, dex: null, liquidityUsd: 0, reason,
  });
}

async function fetchPairs(address, fetchImpl) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(PAIRS_URL + address, {
      signal: abort.signal, headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error("response " + response.status);
    const body = await response.json();
    return Array.isArray(body) ? body : (body && body.pairs) || [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param env         resolved environment — TOKEN_ADDRESS decides which token
 * @param fetchImpl   injected for the checks
 * @returns {Promise<{usdPerDay:number, volume24hUsd:number, rateBps:number,
 *                    pair:string|null, dex:string|null, liquidityUsd:number,
 *                    reason:string|null}>}
 */
export async function tradingFee24h(env = process.env, fetchImpl = globalThis.fetch) {
  const address = String(env.TOKEN_ADDRESS || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) return empty("token_not_launched");

  const now = Date.now();
  if (cache && cache.address === address && now - cache.at < CACHE_MS) return cache.value;

  let rateBps = 0;
  try {
    const catalogue = await buildingPulls.loadBuildings();
    rateBps = Number(catalogue.FEE_BPS) || 0;
  } catch {
    // Without the rate there is nothing to multiply by, and guessing at it is
    // exactly the kind of invented number this file exists to avoid.
    return empty("rate_unknown");
  }
  if (!(rateBps > 0)) return empty("rate_unknown");

  let pairs;
  try {
    pairs = await fetchPairs(address, fetchImpl);
  } catch (e) {
    /* An index that did not answer is "we do not know", not "no trading". The
     * difference decides what the screen says, and a silent zero here would
     * read as "nobody is trading it" — a statement about the token rather than
     * about our request. */
    return empty("read_failed");
  }
  if (!pairs.length) return empty("no_pairs");

  let best = null;
  for (const p of pairs) {
    const liquidity = Number(p?.liquidity?.usd) || 0;
    if (!best || liquidity > best.liquidity) {
      best = {
        liquidity,
        volume: Number(p?.volume?.h24) || 0,
        pair: p?.pairAddress || null,
        dex: p?.dexId || null,
      };
    }
  }
  if (!best) return empty("no_pairs");

  const value = Object.freeze({
    // Rounded to cents. Fractions of a cent per day are noise, and a number
    // with fourteen decimals on a screen reads as a bug.
    usdPerDay: Math.round(best.volume * (rateBps / 10000) * 100) / 100,
    volume24hUsd: best.volume,
    rateBps,
    pair: best.pair,
    dex: best.dex,
    liquidityUsd: best.liquidity,
    reason: null,
  });
  cache = { at: now, address, value };
  return value;
}

/** For the checks: forget what was read, so the next call goes out again. */
export function resetCache() { cache = null; }
