/**
 * Reading the holding from the chain.
 *
 * The tiers are NOT copied here: this file imports frontend/js/holdings-v1.js —
 * the very one that runs in the browser — and calls its functions. A second list
 * of the same tiers would drift from the first on the first balance patch, and
 * silently. The wiring goes through globalThis for the same reason as in
 * catalogue.js: the client modules are written with a UMD wrapper, while
 * package.json is marked "type": "module", so module.exports does not exist
 * there and the module falls through into the second branch.
 *
 * WHY THE BALANCE IS READ BY THE SERVER RATHER THAN TAKEN FROM THE CLIENT.
 * Because buildings are granted for holding, and buildings bring in money. A
 * number sent by the browser is not a balance but a wish: anyone can swap it out
 * in the console. The server reads the chain itself, and that is the only
 * arrangement in which the phrase "buildings for holding" means what it says.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRpcClient, DEFAULT_RPC_URL } from "./chain.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS = path.join(HERE, "..", "frontend", "js");

let holdingsApi = null;

export async function loadHoldings() {
  if (holdingsApi) return holdingsApi;
  await import(path.join(JS, "holdings-v1.js"));
  holdingsApi = globalThis.PackhoodHoldings;
  if (!holdingsApi?.summarise) {
    throw new Error("holdings-v1.js did not hand over the summary — the module wrapper has changed");
  }
  return holdingsApi;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * The launch fund: the only honest way to make the start more generous.
 *
 * A multiplier applied to everyone at once gives nobody anything — the pool is
 * split proportionally to shares. Real generosity is REAL extra money: a finite
 * sum spread over days, named as a number and visible on the storefront.
 *
 * All three variables are mandatory together. Setting a sum without a start date
 * would mean declaring a fund that never begins, and we would be untangling that
 * on launch day.
 */
export function launchSettings(env = process.env) {
  return {
    totalUsd: Number(env.LAUNCH_FUND_USD) || 0,
    days: Math.floor(Number(env.LAUNCH_FUND_DAYS) || 0),
    startedAt: String(env.LAUNCH_FUND_START || "").trim() || null,
  };
}

/**
 * Hold settings kept separate from chainSettings.
 *
 * chainSettings.enabled requires BOTH the token AND the treasury: without the
 * treasury, payments cannot be read. The hold does not need a treasury — the
 * token address is enough. Split deliberately, otherwise buildings would go
 * silent because of an unfilled field they have nothing to do with, and the
 * cause would be looked for in the wrong place.
 */
/**
 * Settings that take into account whatever was entered in the launch console.
 *
 * The token address can be set two ways: via an environment variable, and from
 * the console, where it lands in app_settings. The second route is the real one —
 * it does not require a rebuild on launch day, which is what the console was
 * written for.
 *
 * But the hold read ONLY the environment, and the result was this: the address is
 * entered, the console shows it saved, the season tickets can see it — and
 * everyone's slots are still zero, and the panel honestly writes "token not
 * launched". It looks like the hold is broken, when the hold is simply looking in
 * the wrong place. The precedence is the same as already adopted for tickets: the
 * environment wins, the stored value is picked up after it.
 */
export async function resolvedEnv(query, env = process.env) {
  try {
    const { rows } = await query(
      `SELECT key, value FROM app_settings
       WHERE key IN ('TOKEN_ADDRESS','TREASURY_ADDRESS','LAUNCH_FUND_START')`);
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    if (!stored.TOKEN_ADDRESS && !stored.TREASURY_ADDRESS && !stored.LAUNCH_FUND_START) return env;
    /* The environment wins over the stored value — as it does for tickets. The
       fund start date was added here because otherwise it can be set ONLY by an
       environment variable, and on launch day there may be no access to the
       variables: the console was written precisely to switch things on without a
       rebuild. */
    return { ...env,
             TOKEN_ADDRESS: env.TOKEN_ADDRESS || stored.TOKEN_ADDRESS || "",
             TREASURY_ADDRESS: env.TREASURY_ADDRESS || stored.TREASURY_ADDRESS || "",
             LAUNCH_FUND_START: env.LAUNCH_FUND_START || stored.LAUNCH_FUND_START || "" };
  } catch {
    // The database is silent — we work off the environment. A missing setting
    // must not take the screen down: without a token it already knows how to say
    // "not launched yet".
    return env;
  }
}

export function holdingSettings(env = process.env) {
  const token = String(env.TOKEN_ADDRESS || "").trim();
  const rpc = String(env.CHAIN_RPC_URL || DEFAULT_RPC_URL).trim();
  return {
    enabled: ADDRESS_RE.test(token) && Boolean(rpc),
    token,
    rpc,
    decimals: Math.max(0, Math.min(36, Number(env.TOKEN_DECIMALS) || 18)),
  };
}

// balanceOf(address) — the first four bytes of keccak("balanceOf(address)").
const BALANCE_OF = "0x70a08231";

/** A balanceOf call. Returns a wei string; on any trouble — null, not zero. */
export async function readBalance({ call, token, wallet }) {
  if (!ADDRESS_RE.test(token) || !ADDRESS_RE.test(wallet)) return null;
  const data = BALANCE_OF + wallet.slice(2).toLowerCase().padStart(64, "0");
  const result = await call("eth_call", [{ to: token, data: data }, "latest"]);
  if (typeof result !== "string" || !result.startsWith("0x") || result.length < 3) return null;
  // Zero and "we could not read it" are different things. Zero means "holds
  // nothing", and a zero tier is honestly what that deserves. An error must not
  // look like a zero: otherwise a downed node silently strips everyone of their
  // buildings, and nobody understands why.
  return BigInt(result).toString();
}

/**
 * The hold summary for a single wallet.
 *
 * No wallet is not an error: you can play without one, the buildings just do not
 * work. So we say exactly that, in a separate field, rather than with a zero
 * balance.
 */
export async function holdingFor(wallet, env = process.env, fetchImpl = globalThis.fetch, extra = {}) {
  const mod = await loadHoldings();
  const settings = holdingSettings(env);
  const fund = mod.launchFund({ ...launchSettings(env), now: Date.now() });
  // The number of linked wallets, NOT "holders": how many of them actually clear
  // a tier we do not know without reading the chain for each one. Calling them
  // holders would mean inventing a metric, and the first person to check would
  // catch it.
  const common = { launch: fund, holders: Number.isInteger(extra.linkedWallets) ? extra.linkedWallets : null };

  if (!settings.enabled) {
    return { ...mod.summarise({ enabled: false, ...common }), reason: "token_not_launched" };
  }
  if (!wallet || !ADDRESS_RE.test(String(wallet))) {
    return { ...mod.summarise({ enabled: true, weiBalance: "0", ...common }), reason: "no_wallet" };
  }

  try {
    const call = createRpcClient(settings.rpc, fetchImpl);
    const wei = await readBalance({ call, token: settings.token, wallet: String(wallet) });
    if (wei === null) {
      return { ...mod.summarise({ enabled: true, weiBalance: "0", ...common }), reason: "read_failed" };
    }
    return {
      ...mod.summarise({ enabled: true, weiBalance: wei, decimals: settings.decimals, ...common }),
      reason: null,
    };
  } catch (e) {
    // The node went down — we say honestly that we did not read it. A zero tier
    // caused by a downed RPC would look like "you sold everything", and we would
    // be the first ones blamed.
    return {
      ...mod.summarise({ enabled: true, weiBalance: "0", ...common }),
      reason: "read_failed",
      error: String(e?.message || e).slice(0, 120),
    };
  }
}
