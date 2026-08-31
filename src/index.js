import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { pool, query, initSchema, describeConnection, sweepExpired } from "./db.js";
import { loadCatalogue, catalogueInfo } from "./catalogue.js";
import { registerGameRoutes, entryPriceWei } from "./game-routes.js";
import * as wallet from "./wallet.js";
import * as chain from "./chain.js";
import * as holdings from "./holdings.js";
import * as coinPulls from "./coin-pulls.js";
import * as buildingPulls from "./building-pulls.js";
import * as payoutPool from "./payout-pool.js";
import * as coins from "./coins.js";
import * as tradingFee from "./trading-fee.js";
import * as MANIFEST from "./season-manifest.js";

const PORT = process.env.PORT || 3000;
const CATALOGUE_VERSION = "beta-v1";                 // must match the client
const SESSION_TTL_DAYS = 30;
// The header name is checked in requireCsrf and must match what the client
// sends (frontend/js/account-client.js). Renaming it on only one side yields a
// 403 on every mutating request and not a single line in the log explaining
// why.
//
// A tab opened with the old JS gets csrf_unavailable — which is exactly right:
// the message tells the player to reload the page, after which the header is
// correct again.
const CSRF_HEADER = "x-loothood-csrf";              // client sends X-Loothood-CSRF
const IDEMPOTENCY_HEADER = "idempotency-key";

// CORS_ORIGIN should be the deployed frontend origin (credentials can't use "*").
// Comma-separate to allow several (e.g. the vercel alias + a custom domain).
const ORIGINS = (process.env.CORS_ORIGIN || "https://loothood.vercel.app")
  .split(",").map((s) => s.trim()).filter(Boolean);

const app = express();
app.set("trust proxy", 1);                           // Railway terminates TLS in front of us
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(cors({
  origin(origin, cb) {
    if (!origin || ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));

// ---- helpers ----------------------------------------------------------------
const rid = (n = 32) => crypto.randomBytes(n).toString("hex");
function fail(res, status, code, message) {
  return res.status(status).json({ code, message });
}
function setSessionCookie(res, sid) {
  res.cookie("sid", sid, {
    httpOnly: true,
    secure: true,          // cross-site cookie → must be Secure + SameSite=None
    sameSite: "none",
    maxAge: SESSION_TTL_DAYS * 864e5,
    path: "/",
  });
}
function accountView(a) {
  // The client enters the game when status === "active" and canPlay === true.
  //
  // canUseProtectedActions is the second key to the protected-value protocol,
  // and without it the first one is useless. The gate in account-gate-v1.js
  // requires BOTH at once: this account flag and the service's
  // capabilities.valueLedger. I once turned on only the second, was pleased
  // that production reported valueLedger:true, and the in-game inventory still
  // never came up — the ledger simply was not being created.
  return {
    profileId: a.profile_id,
    // The marketplace and the season table compare playerId to tell the
    // player's own listings and their own row in the list apart from other
    // people's. A player has no separate identifier — publicly they are their
    // profileId.
    playerId: a.profile_id,
    kind: a.kind,
    /* The name the player sees.
       ------------------------------------------------------------------
       Previously display_name was returned as-is, and on most accounts it
       equals the schema default: the registration form does not ask for a
       name, and a wallet login has nowhere to take one from. As a result both
       the person with a username and the person with a wallet saw the same
       "LOOTHOOD Ranger" string in the header and could not tell who they were
       signed in as.

       The preference order runs from the most meaningful to the most generic.
       Their own name, if set; otherwise the username they sign in with;
       otherwise the wallet, because for a player who came in via a wallet the
       address IS their name. The default stays as the last resort for a guest
       who has nothing to be called by yet.

       Computed on the way out rather than written to the database: accounts
       carrying the default already exist, and a migration would fix the past
       but not the future — the next registration without a name would create
       yet another "Ranger". */
    displayName: displayNameFor(a),
    username: a.username || null,
    status: "active",
    // The settings screen shows what the player can sign in with and whether
    // they have any insurance against losing access.
    methods: {
      username: Boolean(a.username),
      wallet: Boolean(a.wallet_address),
      recovery: Boolean(a.recovery_confirmed_at),
    },
    /* The same facts in the shape the settings screen actually reads.
       ------------------------------------------------------------------
       This is not duplication for its own sake. The account screen is
       inherited from the original client and asks different questions of the
       account object: it reads `wallets` as an ARRAY, `accountType` instead of
       `kind`, and `authMethods` as a LIST of strings. None of those existed
       here, so `wallets` came back undefined, the screen concluded no wallet
       was linked, and offered to link one again — after every reload, however
       many times the player had already done it. The link itself worked; the
       server had simply been answering a question the screen was not asking.

       Nothing was broken on the client, so this is fixed on the server: the
       screen's shape is what the rest of the original interface expects. */
    accountType: a.kind === "guest" ? "guest" : "member",
    authMethods: [
      a.username ? "username" : null,
      a.wallet_address ? "wallet" : null,
    ].filter(Boolean),
    recoveryState: a.recovery_confirmed_at ? "secured" : "none",
    // A list, because an account may hold several wallets later on. The full
    // address is returned as well as the masked one: the screen shows the
    // short form, but a player checking a payment needs the whole thing.
    wallets: a.wallet_address
      ? [{
        address: a.wallet_address,
        maskedAddress: shortAddress(a.wallet_address) || a.wallet_address,
        label: "Wallet",
        primary: true,
        linkedAt: a.wallet_linked_at || null,
      }]
      : [],
    capabilities: { canPlay: true, canUseProtectedActions: true },
  };
}

// The response the client stores via rememberSession: it expects
// authenticated, account, and a csrfToken at least 32 characters long.
function sessionPayload(account, csrf) {
  return { authenticated: true, account: accountView(account), csrfToken: csrf };
}

function validUsername(v) {
  return typeof v === "string" && /^[A-Za-z0-9_.-]{3,24}$/.test(v);
}

// The username, password and confirmation arrive from three different screens
// with identical requirements, so there is a single check for all of them.
function checkCredentials({ username, password, passwordConfirmation }, { needConfirmation = true } = {}) {
  if (!validUsername(username)) {
    return "Username must be 3-24 characters: letters, digits, dot, dash or underscore.";
  }
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (needConfirmation && passwordConfirmation !== undefined && password !== passwordConfirmation) {
    return "The two passwords do not match.";
  }
  return null;
}

// Recovery Key: six blocks of six characters from an alphabet with no
// look-alike glyphs, so that it can be copied out by hand.
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeRecoveryKey() {
  const bytes = crypto.randomBytes(36);
  const blocks = [];
  for (let b = 0; b < 6; b += 1) {
    let block = "";
    for (let i = 0; i < 6; i += 1) {
      block += RECOVERY_ALPHABET[bytes[b * 6 + i] % RECOVERY_ALPHABET.length];
    }
    blocks.push(block);
  }
  return blocks;
}
function normaliseRecovery(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
async function createSession(accountId) {
  const sid = rid(32);
  const csrf = rid(24);    // 48 hex chars, satisfies the client's >=32 check
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 864e5);
  await query(
    "INSERT INTO sessions(id, account_id, csrf_token, expires_at) VALUES ($1,$2,$3,$4)",
    [sid, accountId, csrf, expires],
  );
  return { sid, csrf };
}
async function loadSession(req) {
  const sid = req.cookies?.sid;
  if (!sid) return null;
  const { rows } = await query(
    `SELECT s.id, s.csrf_token, s.expires_at, a.*
       FROM sessions s JOIN accounts a ON a.id = s.account_id
      WHERE s.id = $1`, [sid]);
  if (!rows.length) return null;
  const row = rows[0];
  if (new Date(row.expires_at) < new Date()) {
    await query("DELETE FROM sessions WHERE id=$1", [sid]).catch(() => {});
    return null;
  }
  return { sid, csrf: row.csrf_token, account: row };
}
// Guard for authenticated + CSRF-protected mutations.
async function requireCsrf(req, res) {
  const s = await loadSession(req);
  if (!s) { fail(res, 401, "authentication_required", "Log in to continue."); return null; }
  const provided = req.get(CSRF_HEADER);
  if (!provided) { fail(res, 403, "csrf_unavailable", "Your secure session needs to be refreshed."); return null; }
  if (provided !== s.csrf) { fail(res, 403, "csrf_invalid", "Security token mismatch. Refreshing session."); return null; }
  return s;
}

// ---- health / status --------------------------------------------------------
let dbReady = false;
app.get("/health", (_req, res) => res.json({ ok: true, db: dbReady }));
/* Holding and buildings.
 *
 * Always answers, even when there is no token yet: the village screen has to be
 * able to show the threshold table and say "the token is not launched" — those
 * are different words from "you hold zero", and the two must not be confused. A
 * hidden block disappears precisely when someone is looking for it, so the
 * thresholds are visible before launch too.
 *
 * There is deliberately no cache here: the request happens on a click into the
 * village, not in the background. Background polling for the sake of a pretty
 * number means a call to the node from every open tab every few seconds, and
 * the free RPC will be the first to notice.
 */
app.get("/api/v1/holdings/me", async (req, res) => {
  try {
    const session = await loadSession(req);
    // loadSession returns { sid, csrf, account }, not the account row itself.
    // This used to read session?.wallet_address — always undefined, meaning a
    // player with a linked wallet would never have their holding read and the
    // panel would tell whoever linked a wallet to "link a wallet".
    const wallet = session?.account?.wallet_address || null;
    // We count linked wallets, not "holders": checking which of them actually
    // clears the threshold would mean reading the chain for each one, and that
    // cannot be done on every village open. Hence the name.
    const { rows } = await query("SELECT COUNT(*)::int AS n FROM accounts WHERE wallet_address IS NOT NULL");
    // The same resolvedEnv as the buildings use: otherwise two panels about one
    // and the same holding would answer differently — one sees the address from
    // the control panel, the other does not.
    const summary = await holdings.holdingFor(wallet, await holdings.resolvedEnv(query), undefined,
      { linkedWallets: rows[0]?.n ?? null });
    res.json({ ...summary, wallet: wallet ? shortAddress(wallet) : null });
  } catch (e) {
    // 200 with an honest reason instead of a 500: the village has to open and
    // explain why the buildings are silent, not show an empty screen with no
    // cause given.
    res.json({ enabled: false, reason: "read_failed", error: String(e?.message || e).slice(0, 120) });
  }
});

/* The player's buildings: what they own, how many slots, how much power.
 *
 * The slots come from the holding, the buildings come from the pulls, and both
 * numbers are assembled here rather than in the browser: the pool share is
 * computed from power, and power sent by the client is not power but a wish.
 */
app.get("/api/v1/buildings/me", async (req, res) => {
  try {
    const session = await loadSession(req);
    if (!session) return fail(res, 401, "unauthorized", "Sign in to see your buildings.");

    const catalogue = await buildingPulls.loadBuildings();
    const account = session.account;
    // The environment with the control panel taken into account: an address
    // typed in by hand has to work the same way as one set by a variable,
    // otherwise the control panel is useless.
    const env = await holdings.resolvedEnv(query);
    const holding = await holdings.holdingFor(account.wallet_address || null, env);

    const { rows } = await query(
      "SELECT id, building_id, created_at FROM building_holdings WHERE account_id=$1 ORDER BY created_at",
      [account.id]);

    const ownedIds = rows.map((r) => r.building_id);
    const powerSummary = catalogue.powerFor({
      owned: ownedIds,
      slots: holding.buildings,
      multiplier: holding.multiplier,
    });

    const { rows: credits } = await query(
      "SELECT building_pulls, boss_shards FROM gacha_state WHERE account_id=$1",
      [account.id]);

    /* The pool and the share are computed here, not on the client.
     *
     * Not out of distrust of the browser — the numbers are only displayed, not
     * credited — but because world power is read from the database, and the
     * player cannot compute it on their own machine. Handing half the formula
     * to the client would mean keeping a second copy of it, while the formula
     * lives in exactly one place: frontend/js/payout-pool-v1.js, which both
     * sides take it from.
     */
    const formula = await payoutPool.loadPool();
    /* The same environment as the holding uses, not process.env.
     *
     * Otherwise two panels on one screen say different things about one and the
     * same token: the holding sees the address from the control panel and opens
     * the slots, while the pool next to it writes "the source is waiting for the
     * token". The player reads the contradiction and believes the worse half.
     * Caught in production: the address turned out to have been entered from the
     * control panel long ago, and the discrepancy surfaced the same hour the
     * holding learned to see it. */
    /* THE FEE IS READ, NOT ASSUMED. It used to be a hardcoded zero with a note
     * that the number would come from the chain one day. Honest, and it also
     * made the payout half of the product impossible to verify: paste any
     * address and everything downstream still says zero, so a working pipe and
     * a broken one look identical.
     *
     * A failed read comes back as zero WITH a reason, and the reason is what
     * the screen shows — "the index did not answer" is a statement about our
     * request, a bare zero is a statement about the token. */
    const fee = await tradingFee.tradingFee24h(env);
    const poolConfig = payoutPool.poolSettings(env);
    const worldPower = await payoutPool.worldPower(query, catalogue);
    const dailyPool = formula.poolPerDay({
      /* The fee, measured rather than promised: the configured token's 24h
       * volume from a public index, times the rate the cards print. Zero when
       * there is no address, when the index did not answer, or when the token
       * has no pairs — and `fee.reason` says which of the three, so the screen
       * never has to guess.
       *
       * The third source — a cut of the ether paid for rolls — is gone: a roll
       * costs three boss shards, not ether, and the source was a permanent zero
       * with a caption promising a paid roll. */
      ponsUsd24h: fee.usdPerDay,
      tokenLaunched: poolConfig.tokenLaunched,
    });
    const share = formula.shareFor({
      power: powerSummary.power,
      worldPower,
      usdPerDay: dailyPool.usdPerDay,
    });

    res.json({
      owned: rows.map((r) => ({ instanceId: r.id, buildingId: r.building_id, at: r.created_at })),
      slots: holding.buildings,
      slotsUsed: powerSummary.slotsUsed,
      multiplier: holding.multiplier,
      basePower: powerSummary.basePower,
      power: powerSummary.power,
      active: powerSummary.active.map((b) => b.id),
      idle: powerSummary.idle.map((b) => b.id),
      // Different reasons for having no slots mean different words on screen.
      holdingReason: holding.reason,
      pullsAvailable: credits[0]?.building_pulls ?? 0,
      bossShards: credits[0]?.boss_shards ?? 0,
      shardsPerRoll: 3,
      pool: dailyPool,
      /* The fee reading goes out whole, not just its total. The volume and the
       * pair it came from are what make the number checkable against the same
       * index anyone else can open — which is the entire reason for showing a
       * money figure at all. */
      fee,
      share,
      worldPower,
      // The live coin top: place, price, 24h change, icon. Served together with
      // the buildings so that the screen does not make a second request just for
      // the caption under each card.
      coins: (await coins.topCoins()).rows,
    });
  } catch (e) {
    res.status(500).json({ code: "buildings_failed", message: String(e?.message || e).slice(0, 160) });
  }
});

/* Requesting a building pull: the commitment.
 *
 * THE ORDER MATTERS AND IT IS THE SAME AS FOR TICKETS. The pull is debited
 * HERE, in the request, not at the reveal. Otherwise anyone who saw a bad
 * result would simply not call the second step and would not pay — while we had
 * already shown them the outcome.
 *
 * Only the secret's fingerprint goes out, plus the moment before which
 * revealing is not allowed. Without the second one the commitment is empty:
 * you could reveal immediately, and that would be no different from a plain
 * Math.random.
 */
app.post("/api/v1/buildings/pull", async (req, res) => {
  const s = await requireCsrf(req, res);
  if (!s) return;
  try {
    const account = s.account;
    const count = Math.min(10, Math.max(1, Math.floor(Number(req.body?.count) || 1)));

    // The debit and the check in a single UPDATE: two queries in a row drift
    // apart across two tabs, and a person would get two pulls for one payment.
    const { rows: debited } = await query(
      `UPDATE gacha_state SET building_pulls = building_pulls - $2, updated_at = now()
        WHERE account_id = $1 AND building_pulls >= $2
        RETURNING building_pulls`, [account.id, count]);
    if (!debited.length) {
      return fail(res, 402, "no_pulls", "You have no building pulls available.");
    }

    const secret = buildingPulls.newSecret();
    const requestId = rid(16);
    const availableAt = new Date(Date.now() + buildingPulls.REVEAL_DELAY_MS);
    const { rows } = await query(
      `INSERT INTO building_pulls(account_id, request_id, secret, commitment, available_at, results)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING id, request_id, commitment, available_at`,
      [account.id, requestId, secret, buildingPulls.commitmentFor(secret), availableAt,
       JSON.stringify({ count })]);

    res.json({
      pullId: rows[0].id,
      requestId: rows[0].request_id,
      commitment: rows[0].commitment,
      availableAt: rows[0].available_at,
      count,
      pullsLeft: debited[0].building_pulls,
    });
  } catch (e) {
    res.status(500).json({ code: "pull_failed", message: String(e?.message || e).slice(0, 160) });
  }
});

/* The reveal.
 *
 * The secret is handed to the player together with the result — otherwise they
 * have nothing to verify with. A repeated reveal returns the same thing and
 * does NOT hand out the buildings again: the status is checked inside the
 * UPDATE, not by a query in front of it.
 */
app.post("/api/v1/buildings/pull/:id/reveal", async (req, res) => {
  const s = await requireCsrf(req, res);
  if (!s) return;
  const client = await pool.connect();
  try {
    const account = s.account;
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, secret, commitment, available_at, status, results
         FROM building_pulls WHERE id = $1 AND account_id = $2 FOR UPDATE`,
      [req.params.id, account.id]);
    if (!rows.length) { await client.query("ROLLBACK"); return fail(res, 404, "not_found", "No such pull."); }
    const pullRow = rows[0];

    if (pullRow.status === "settled") {
      await client.query("ROLLBACK");
      return res.json({ status: "settled", secret: pullRow.secret,
                        commitment: pullRow.commitment, results: pullRow.results.items || [] });
    }
    if (new Date(pullRow.available_at) > new Date()) {
      await client.query("ROLLBACK");
      return fail(res, 425, "too_early", "The reveal moment has not arrived yet.");
    }

    const count = Number(pullRow.results?.count) || 1;
    const drawn = await buildingPulls.resolvePull(pullRow.secret, count);

    for (const b of drawn) {
      await client.query(
        "INSERT INTO building_holdings(account_id, building_id, source, pull_id) VALUES ($1,$2,'pull',$3)",
        [account.id, b.id, pullRow.id]);
    }
    await client.query(
      `UPDATE building_pulls SET status='settled', settled_at=now(),
              results = jsonb_set(results, '{items}', $2::jsonb)
        WHERE id=$1`, [pullRow.id, JSON.stringify(drawn)]);
    await client.query("COMMIT");

    res.json({ status: "settled", secret: pullRow.secret, commitment: pullRow.commitment, results: drawn });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ code: "reveal_failed", message: String(e?.message || e).slice(0, 160) });
  } finally {
    client.release();
  }
});

/* The coin drop table.
 *
 * Open to everyone and without a session: the odds of a paid box are a public
 * commitment, not a privilege of whoever signed in. Hiding them behind a login
 * would give people a reason to think they change.
 */
/* A shard for beating a boss. Three shards — one roll.
 *
 * THIS IS THE ONLY WAY TO GET A ROLL FOR FREE, and it is tied to the thing
 * people pay attention for: beating a boss. Not to "played", not to time spent
 * in the game.
 *
 * At first I granted a roll for EVERY boss and three for the final one — that
 * is, five rolls per run. That is a giveaway: the price of a roll in ether is
 * announced, and there must be few enough free ones that they do not devalue
 * the paid ones. Now a boss gives one shard, and a roll is assembled from three
 * — that is, exactly one per completed run.
 *
 * HONESTLY ABOUT THE HOLE. The server does not see the game: it sees the result
 * the client sent, and anyone can forge that request. Only a verifier that
 * replays the run with a bot can close this completely — it is written and
 * waiting to be wired in here. Until then the hole is narrowed by two things,
 * and both live in the database rather than in code: uniqueness on (account,
 * run, stage) prevents getting paid twice for one boss, and the daily limit
 * bounds the invention of new runs.
 *
 * The limit is chosen so that an honest player never notices it: fifteen stages
 * per run give five rolls, six runs a day give thirty. Hitting it by actually
 * playing takes effort.
 */
const SHARDS_PER_ROLL = 3;
const BOSS_STAGES = new Set([5, 10, 15]);
const DAILY_SHARD_CAP = 12;

app.post("/api/v1/buildings/rolls/boss", async (req, res) => {
  try {
    const session = await requireCsrf(req, res);
    if (!session) return;

    const stage = Math.trunc(Number(req.body?.stage));
    const runId = String(req.body?.runId || "").trim().slice(0, 64);
    if (!BOSS_STAGES.has(stage)) return fail(res, 400, "not_a_boss", "That stage has no boss.");
    if (!runId) return fail(res, 400, "no_run", "runId is required.");

    const { rows: last24h } = await query(
      `SELECT COALESCE(SUM(rolls), 0)::int AS n FROM boss_rolls
       WHERE account_id = $1 AND at > now() - interval '24 hours'`, [session.account.id]);
    if ((last24h[0]?.n || 0) + 1 > DAILY_SHARD_CAP) {
      return res.json({ granted: 0, reason: "daily_cap" });
    }

    /* The shard and its conversion into a roll live in one transaction.
     *
     * If the shard is written and the conversion fails, the third shard
     * vanishes: the counter shows zero and there is no roll. That is the most
     * infuriating loss possible — something earned disappeared silently. */
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO boss_rolls(account_id, run_id, stage, rolls) VALUES ($1,$2,$3,1)
         ON CONFLICT (account_id, run_id, stage) DO NOTHING RETURNING rolls`,
        [session.account.id, runId, stage]);
      if (!inserted.rowCount) {
        await client.query("ROLLBACK");
        return res.json({ granted: 0, reason: "already_granted" });
      }
      /* The conversion is computed IN THE QUERY, not in code: two simultaneous
         boss events would read one and the same old number and both decide
         there is not enough for a roll. */
      const result = await client.query(
        `INSERT INTO gacha_state(account_id, boss_shards) VALUES ($1, 1)
         ON CONFLICT (account_id) DO UPDATE
           SET boss_shards   = (gacha_state.boss_shards + 1) % $2,
               building_pulls = gacha_state.building_pulls + ((gacha_state.boss_shards + 1) / $2)
         RETURNING boss_shards, building_pulls`,
        [session.account.id, SHARDS_PER_ROLL]);
      await client.query("COMMIT");
      const row = result.rows[0] || {};
      res.json({
        granted: 1,
        shards: row.boss_shards ?? 0,
        perRoll: SHARDS_PER_ROLL,
        rolls: row.building_pulls ?? 0,
        // The roll came together exactly when the remainder went back to zero.
        rolledUp: (row.boss_shards ?? 0) === 0,
      });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    fail(res, 500, "server_error", "Could not grant the shard.");
  }
});

/* The run result: gold and boss trophies.
 *
 * THIS IS WHAT "FIXING THE HOLE" MEANS. Gold lived in the browser save, so its
 * value was the player's wish. As long as nothing was bought with it, that was
 * tolerable; the shop turns it into a price, and a price the buyer sets for
 * themselves is not a price.
 *
 * The server still does not see the game. So the hole is not closed but
 * NARROWED by three constraints, and all three live in the database rather than
 * in code:
 *
 *   1. Uniqueness on (account, run) — one run is credited once.
 *   2. A per-stage cap: fifteen stages cannot yield more than fifteen stages
 *      give. A made-up "one hundred thousand gold" is trimmed to the cap rather
 *      than rejected: an honest player with a lucky run must not be turned away
 *      because somebody else cheats.
 *   3. A daily run limit — against inventing new ones.
 *
 * Only a verifier that replays the run with a bot can close it completely. It
 * is written and waiting to be wired in; until then this is the best there is.
 */
const GOLD_PER_STAGE = 60;
const TROPHIES_PER_BOSS = 1;
const DAILY_RUN_CAP = 12;

app.post("/api/v1/runs/finish", async (req, res) => {
  try {
    const session = await requireCsrf(req, res);
    if (!session) return;

    const runId = String(req.body?.runId || "").trim().slice(0, 64);
    const stage = Math.max(0, Math.min(99, Math.trunc(Number(req.body?.stage) || 0)));
    const claimed = Math.max(0, Math.trunc(Number(req.body?.gold) || 0));
    if (!runId) return fail(res, 400, "no_run", "runId is required.");
    if (!stage) return fail(res, 400, "no_stage", "stage is required.");

    const { rows: last24h } = await query(
      `SELECT COUNT(*)::int AS n FROM run_payouts
       WHERE account_id = $1 AND at > now() - interval '24 hours'`, [session.account.id]);
    if ((last24h[0]?.n || 0) >= DAILY_RUN_CAP) {
      return res.json({ credited: false, reason: "daily_cap" });
    }

    // The cap and the trophies are computed HERE, from the stage, and not taken
    // from the client.
    const gold = Math.min(claimed, stage * GOLD_PER_STAGE);
    const trophies = [5, 10, 15].filter((boss) => stage >= boss).length * TROPHIES_PER_BOSS;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO run_payouts(account_id, run_id, stage, gold, trophies)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (account_id, run_id) DO NOTHING RETURNING gold`,
        [session.account.id, runId, stage, gold, trophies]);
      if (!inserted.rowCount) {
        await client.query("ROLLBACK");
        return res.json({ credited: false, reason: "already_credited" });
      }
      const result = await client.query(
        `INSERT INTO gacha_state(account_id, gold, boss_trophies) VALUES ($1,$2,$3)
         ON CONFLICT (account_id) DO UPDATE
           SET gold = gacha_state.gold + EXCLUDED.gold,
               boss_trophies = gacha_state.boss_trophies + EXCLUDED.boss_trophies
         RETURNING gold, boss_trophies`,
        [session.account.id, gold, trophies]);
      await client.query("COMMIT");
      res.json({
        credited: true,
        gold,
        trophies,
        capped: claimed > gold,
        balances: result.rows[0],
      });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    fail(res, 500, "server_error", "Could not credit the run.");
  }
});

/* The coin icon proxied through us.
 *
 * It is needed not for the picture — the browser can fetch that from the CDN
 * itself — but for the COLOUR. A coin's tone is sampled from the icon through a
 * canvas, and a canvas holding a foreign image without CORS becomes "tainted":
 * getImageData throws and the colour cannot be taken. The CDN does not set the
 * required headers, so the picture goes through us and it is our response that
 * permits reading.
 *
 * The trick is taken from 6PACK together with its precautions: https only,
 * known hosts only, our own timeout. An open proxy that forwards anything
 * anywhere means someone else's traffic at our expense and our address in
 * someone else's logs.
 */
const ICON_HOSTS = new Set([
  "cdn.dexscreener.com", "dd.dexscreener.com",
  "assets.coingecko.com", "coin-images.coingecko.com",
]);

app.get("/api/v1/coins/icon", async (req, res) => {
  const raw = String(req.query.u || "");
  let u;
  try { u = new URL(raw); } catch { return fail(res, 400, "bad_url", "u must be a URL."); }
  if (u.protocol !== "https:") return fail(res, 400, "bad_url", "https only.");
  if (!ICON_HOSTS.has(u.hostname)) return fail(res, 403, "host_not_allowed", `Host not allowed: ${u.hostname}`);

  try {
    // Our own timeout: without it a hung CDN would hold our connection to the
    // end, and Railway counts such requests as alive.
    const response = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { accept: "image/*" } });
    if (!response.ok) return fail(res, 502, "cdn_error", `CDN answered ${response.status}`);
    const type = response.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return fail(res, 502, "not_an_image", `Not a picture: ${type}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    res.set({
      "content-type": type,
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=86400, immutable",
    });
    res.end(bytes);
  } catch (e) {
    fail(res, 502, "icon_failed", String(e?.message || e).slice(0, 120));
  }
});

app.get("/api/v1/pulls/coins", async (_req, res) => {
  try {
    res.json(await coinPulls.pullTable(process.env));
  } catch (e) {
    res.json({ enabled: false, trustworthy: false, reason: "read_failed",
               error: String(e?.message || e).slice(0, 120), tiers: [] });
  }
});

/* The contract address — OPEN, unmasked and without a login.
 *
 * The control panel serves it shortened (0x1234…cdef) and only to an admin, and
 * that is right for the control panel: the treasury sits next to it there, and
 * there is no reason to show that. But the token address is the most public
 * thing a project has: people buy by it. Hiding it behind a session means
 * making a person create an account in order to copy a string that will be in
 * every chat an hour later.
 *
 * It is served IN FULL. A shortened address cannot be pasted into a wallet, and
 * a "copy" button that puts «0x1234…cdef» on the clipboard is the worst kind of
 * breakage: it fires, reports nothing, and the person finds out about it only
 * at the exchange.
 *
 * `launched` is a separate field rather than "the address is non-empty": the
 * client has to decide whether to show the block or hide it, and it should not
 * have to derive that from the length of a string.
 */
app.get("/api/v1/token", async (_req, res) => {
  try {
    const env = await holdings.resolvedEnv(query);
    const address = String(env.TOKEN_ADDRESS || "").trim();
    const valid = /^0x[0-9a-fA-F]{40}$/.test(address);
    /* WHERE THE ADDRESS CAME FROM, said out loud.
     *
     * TOKEN_ADDRESS exists in two places: a Railway variable set once at deploy
     * time, and a row the launch console writes. The variable used to win, so
     * pasting a new address stored it and changed nothing while the page
     * reported success. The precedence is fixed now — the console wins — but
     * "which of the two am I looking at" is the first question anyone debugging
     * this asks, and answering it used to take two files and a dashboard.
     *
     * Public, like the address itself. It names a source, never a value. */
    const fromEnvironment = String(process.env.TOKEN_ADDRESS || "").trim().toLowerCase();
    const source = !valid ? null
      : (fromEnvironment && address.toLowerCase() === fromEnvironment ? "environment" : "console");
    res.json({
      address: valid ? address : null,
      launched: valid,
      source,
      /* Whether anything is waiting underneath. The console value can be
       * cleared; the deploy-time variable cannot be, not from here. Without
       * this flag "press Clear" is advice with an unknown outcome — the field
       * may empty, or the old address may reappear from the variable, and
       * which of the two happens is not visible from outside.
       *
       * A boolean, never the value: whether a variable is configured is not a
       * secret, what it contains might be. */
      hasEnvironmentFallback: Boolean(fromEnvironment),
      chainId: Number(process.env.CHAIN_ID) || 4663,
    });
  } catch (e) {
    // A read error means "we do not know", not "there is no token". The
    // difference matters: on "no" the client hides the block forever, on "we do
    // not know" it will try again later.
    fail(res, 503, "read_failed", String(e?.message || e).slice(0, 120));
  }
});

app.get("/api/v1/status", (_req, res) => res.json({
  status: "ok",
  service: "loothood-backend",
  catalogueVersion: CATALOGUE_VERSION,
  maintenance: false,
  // valueLedger is on: the protected-value protocol is built end to end —
  // catalogue, draws, crafting, inventory, equipping. While it stood at false
  // the client never even tried to call those endpoints and lived off the
  // cloud save alone, so flipping this one flag matters more than it looks:
  // without it the entire server we wrote would sit unused.
  /* verifier turns the verifiable run on in the client.
   *
   * The flag was not here, and this is exactly the same story as with
   * valueLedger: the server half is written and works, and the client never
   * even calls it because it does not know it can. A run would silently go down
   * the unverifiable branch — forever and for everyone, without a single error
   * in the console.
   *
   * A kill switch by construction: remove the flag and runs stop opening
   * attempts and play the way they used to, breaking nothing. */
  capabilities: { canPlay: true, valueLedger: true, verifier: true },
  serverTimestamp: new Date().toISOString(),
}));

/* Systems state — what the Status button in the interface shows.
   ------------------------------------------------------------------
   It differs from /api/v1/status in that it ASSERTS NOTHING IN ADVANCE. That
   one returns constants and always says "ok", even when the database is down:
   it is about what this build can do, not about its health. A status page that
   parrots constants out of the code is decoration; it only means something if
   it is capable of showing "bad".

   So every line here is a measurement: the database is probed with a query,
   the watcher reports the block it read and how old that reading is, the
   season is counted in the database. An error is not swallowed but becomes a
   "down" state with a reason attached.

   The endpoint is public on purpose: a status page available only to insiders
   does not answer the "is it me or is it them" question people open it for.
   Nothing leaves the server beyond "works / does not work" and a response
   time. */
/* Why the payment watcher refuses a value, in words.
   ------------------------------------------------------------------
   The old message read the same whether a variable was missing, empty, or
   present but malformed — so "it is set and it still says required" left
   nowhere to go but guessing. This one names the variable and the defect.

   The value is reported masked. An address is public data, but for a
   diagnosis only its shape matters, and printing settings in full is a habit
   worth not acquiring.

   Usual causes, by frequency: whitespace or a quote picked up while pasting,
   a transaction hash (66 characters) pasted instead of an address (42), and a
   truncated copy. All three show up in the length alone. */
function describeAddressSetting(name, raw) {
  const value = String(raw ?? "");
  const trimmed = value.trim().replace(/^["']|["']$/g, "").trim();
  if (!value) return `${name}: not set`;
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return `${name}: ok`;
  const notes = [];
  if (trimmed.length === 66) notes.push("66 chars — looks like a transaction hash, not an address");
  else if (trimmed.length !== 42) notes.push(`${trimmed.length} chars, expected 42`);
  if (!/^0x/i.test(trimmed)) notes.push("does not start with 0x");
  else if (!/^0x[0-9a-fA-F]*$/.test(trimmed)) notes.push("contains non-hex characters");
  const masked = trimmed.length > 12 ? `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}` : trimmed;
  return `${name}: ${masked} — ${notes.join("; ") || "does not match 0x + 40 hex"}`;
}

app.get("/api/v1/health/systems", async (_req, res) => {
  const systems = [];
  const measure = async (key, name, probe) => {
    const startedAt = Date.now();
    try {
      const details = await probe();
      systems.push({ key, name, state: "up", ms: Date.now() - startedAt, ...details });
    } catch (e) {
      systems.push({ key, name, state: "down", ms: Date.now() - startedAt,
                     detail: String(e?.message || e).slice(0, 120) });
    }
  };

  await measure("api", "API", async () => ({ detail: `catalogue ${CATALOGUE_VERSION}` }));

  await measure("db", "Database", async () => {
    const { rows } = await query("SELECT count(*)::int AS n FROM accounts");
    return { detail: `${rows[0].n} accounts` };
  });

  await measure("season", "Season", async () => {
    const { rows } = await query(
      "SELECT season_key, state FROM seasons WHERE state IN ('live','draft') ORDER BY state DESC LIMIT 1");
    const season = rows[0];
    return season
      ? { detail: `${season.season_key} · ${season.state}`, state: season.state === "live" ? "up" : "idle" }
      : { detail: "none scheduled", state: "idle" };
  });

  await measure("chain", "Payments watcher", async () => {
    const config = await currentChainConfig();
    if (!config.enabled) {
      // The reason, not just the fact: Railway keeps startup logs for a short
      // time, and people ask about this exactly when the watcher goes silent.
      const stored = await storedChainSettings();
      return {
        detail: [
          describeAddressSetting("TOKEN_ADDRESS", process.env.TOKEN_ADDRESS || stored.TOKEN_ADDRESS),
          describeAddressSetting("TREASURY_ADDRESS", process.env.TREASURY_ADDRESS || stored.TREASURY_ADDRESS),
        ].join(" · "),
        state: "idle",
      };
    }
    const { rows } = await query("SELECT last_block, updated_at FROM chain_cursor WHERE id = 1");
    const cursor = rows[0];
    if (!cursor) return { detail: "no blocks read yet", state: "idle" };
    // The lag matters more than the block number itself: a cursor frozen an
    // hour ago looks just as healthy in the log as a fresh one.
    const lagSeconds = Math.round((Date.now() - new Date(cursor.updated_at).getTime()) / 1000);
    return {
      detail: `block ${cursor.last_block} · ${lagSeconds}s ago`,
      state: lagSeconds > 600 ? "degraded" : "up",
    };
  });

  const worst = systems.some((s) => s.state === "down") ? "down"
    : systems.some((s) => s.state === "degraded") ? "degraded" : "up";
  res.json({ state: worst, checkedAt: new Date().toISOString(), systems });
});

// ---- accounts ---------------------------------------------------------------
/* The default name WITHOUT THE PROJECT NAME, and this is not a matter of taste.
 *
 * It used to be «LOOTHOOD Ranger». The project name has changed twice since
 * then, while the string sits in the DATABASE for everyone who came in as a
 * guest — and a rename does not touch it. The renaming tool walks the captions
 * in the code; it cannot reach foreign strings in Postgres by construction.
 * That is how we ended up with PONSLOOT on screen and LOOTHOOD Ranger in the
 * account: two truths in one interface.
 *
 * «Ranger» will survive any future rename, because it does not contain the
 * thing that gets renamed. */
const DEFAULT_DISPLAY_NAME = "Ranger";

/* Names that used to be the default. They sit in the database on old accounts,
 * and they must not be treated as a chosen name: the player did not choose it.
 * A migration in db.js overwrites them, but the set stays here — for a string
 * that arrives from an old save or from a backup. */
const LEGACY_DEFAULT_NAMES = new Set(["LOOTHOOD Ranger", "PACKHOOD Ranger", "PONSLOOT Ranger"]);

/** Shortened address: 0x1234…cdef. The full address does not fit the header. */
function shortAddress(address) {
  const s = String(address || "");
  return /^0x[0-9a-fA-F]{40}$/.test(s) ? `${s.slice(0, 6)}…${s.slice(-4)}` : null;
}

function displayNameFor(a) {
  const own = String(a.display_name || "").trim();
  if (own && own !== DEFAULT_DISPLAY_NAME && !LEGACY_DEFAULT_NAMES.has(own)) return own;
  if (a.username) return a.username;
  const short = shortAddress(a.wallet_address);
  if (short) return short;
  return DEFAULT_DISPLAY_NAME;
}

async function newAccount({ kind, username = null, passwordHash = null, displayName = DEFAULT_DISPLAY_NAME }) {
  const profileId = "p_" + rid(12);
  const { rows } = await query(
    `INSERT INTO accounts(profile_id, kind, username, password_hash, display_name)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [profileId, kind, username, passwordHash, displayName]);
  return rows[0];
}

// Guest boot — the menu comes up in guest mode via this.
app.post("/api/v1/account/guest", async (_req, res) => {
  try {
    const account = await newAccount({ kind: "guest" });
    const { sid, csrf } = await createSession(account.id);
    setSessionCookie(res, sid);
    res.json({ authenticated: true, account: accountView(account), csrfToken: csrf });
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Could not start a guest session."); }
});

// Upgrading an account to a password login. The key detail: the guest row is
// NOT replaced with a new one — it gets a username and password in place.
// Registration used to always create a new account, and the guest's whole
// progress stayed stranded on the abandoned row, meaning the player lost
// everything at exactly the moment they decided to make their loot their own.
async function upgradeToPassword(account, { username, password, displayName }) {
  const taken = await query(
    "SELECT 1 FROM accounts WHERE lower(username)=lower($1) AND id<>$2", [username, account.id]);
  if (taken.rows.length) return { conflict: true };
  const { rows } = await query(
    `UPDATE accounts
        SET username=$1, password_hash=$2, kind='password',
            display_name=COALESCE(NULLIF($3,''), display_name), updated_at=now()
      WHERE id=$4 RETURNING *`,
    [username, await bcrypt.hash(String(password), 10), displayName || username, account.id]);
  return { account: rows[0] };
}

app.post("/api/v1/account/register", async (req, res) => {
  const { username, password, passwordConfirmation, displayName } = req.body || {};
  const bad = checkCredentials({ username, password, passwordConfirmation });
  if (bad) return fail(res, 400, "invalid_input", bad);
  try {
    const current = await loadSession(req);
    // A guest on this same device: upgrade their row so the progress stays.
    if (current && current.account.kind === "guest" && !current.account.username) {
      const out = await upgradeToPassword(current.account, { username, password, displayName });
      if (out.conflict) return fail(res, 409, "username_taken", "That username is already registered.");
      return res.json(sessionPayload(out.account, current.csrf));
    }
    const exists = await query("SELECT 1 FROM accounts WHERE lower(username)=lower($1)", [username]);
    if (exists.rows.length) return fail(res, 409, "username_taken", "That username is already registered.");
    const account = await newAccount({
      kind: "password", username,
      passwordHash: await bcrypt.hash(String(password), 10),
      displayName: displayName || username,
    });
    const { sid, csrf } = await createSession(account.id);
    setSessionCookie(res, sid);
    res.json(sessionPayload(account, csrf));
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Registration failed."); }
});

// The same path, but called from the settings screen by a guest who is already
// playing.
app.post("/api/v1/account/guest/convert/password", async (req, res) => {
  const s = await requireCsrf(req, res);
  if (!s) return;
  const { username, password, passwordConfirmation } = req.body || {};
  const bad = checkCredentials({ username, password, passwordConfirmation });
  if (bad) return fail(res, 400, "invalid_input", bad);
  if (s.account.username) {
    return fail(res, 409, "already_registered", "This account already has a username login.");
  }
  try {
    const out = await upgradeToPassword(s.account, { username, password });
    if (out.conflict) return fail(res, 409, "username_taken", "That username is already registered.");
    res.json(sessionPayload(out.account, s.csrf));
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Could not add the username login."); }
});

// Adding a username login to an account that does not have one yet (a
// wallet-only account, for instance).
app.post("/api/v1/account/methods/username", async (req, res) => {
  const s = await requireCsrf(req, res);
  if (!s) return;
  const { username, password, passwordConfirmation } = req.body || {};
  const bad = checkCredentials({ username, password, passwordConfirmation });
  if (bad) return fail(res, 400, "invalid_input", bad);
  if (s.account.username) {
    return fail(res, 409, "already_registered", "This account already has a username login.");
  }
  try {
    const out = await upgradeToPassword(s.account, { username, password });
    if (out.conflict) return fail(res, 409, "username_taken", "That username is already registered.");
    res.json(sessionPayload(out.account, s.csrf));
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Could not add the username login."); }
});

app.post("/api/v1/account/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return fail(res, 400, "invalid_input", "Username and password are required.");
  try {
    const { rows } = await query("SELECT * FROM accounts WHERE username=$1", [username]);
    const account = rows[0];
    if (!account || !account.password_hash || !(await bcrypt.compare(String(password), account.password_hash))) {
      return fail(res, 401, "invalid_credentials", "Incorrect username or password.");
    }
    const { sid, csrf } = await createSession(account.id);
    setSessionCookie(res, sid);
    res.json({ authenticated: true, account: accountView(account), csrfToken: csrf });
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Login failed."); }
});

app.get("/api/v1/account/session", async (req, res) => {
  const s = await loadSession(req);
  if (!s) return res.json({ authenticated: false });
  res.json({ authenticated: true, account: accountView(s.account), csrfToken: s.csrf });
});

// ---- bug reports ------------------------------------------------------------
//
// The button in settings existed, but no server stood behind it — the form
// posted into a 404. At launch this is the first thing that will be needed.
//
// The length limits are not there out of spite: the description field in the
// interface is unbounded, and one person leaning on a key can bring the table
// down. We truncate silently rather than reject: a player who spent time
// describing a bug should not get "too long, start over" in reply.
const BUG_CATEGORIES = ["gameplay", "interface", "audio", "account", "crypto", "performance", "other"];
const BUG_REPORTS_PER_HOUR = 20;

function clip(value, limit) {
  return String(value ?? "").slice(0, limit);
}

app.post("/api/v1/feedback/bug-reports", async (req, res) => {
  const s = await requireCsrf(req, res);
  if (!s) return;
  const summary = clip(req.body?.summary, 200).trim();
  if (!summary) return fail(res, 400, "invalid_input", "Describe the problem in a sentence.");
  const category = BUG_CATEGORIES.includes(String(req.body?.category))
    ? String(req.body.category) : "other";
  // Only known fields are taken from the context. Storing whatever the client
  // sent is an invitation to stuff anything of any size in there.
  const ctx = req.body?.context || {};
  const context = {
    gameVersion: clip(ctx.gameVersion, 64),
    browser: clip(ctx.browser, 240),
    platform: clip(ctx.platform, 240),
    viewport: clip(ctx.viewport, 32),
    currentScreen: clip(ctx.currentScreen, 64),
  };
  try {
    const { rows: recent } = await query(
      "SELECT count(*)::int AS n FROM bug_reports WHERE account_id=$1 AND created_at > now() - interval '1 hour'",
      [s.account.id]);
    if (recent[0].n >= BUG_REPORTS_PER_HOUR) {
      return fail(res, 429, "too_many_reports", "Too many reports from this account. Try again later.");
    }
    // The number is shown to the player and is what they later use to refer to
    // their report, so it is short and readable rather than a UUID.
    const reportId = "BR-" + rid(4).toUpperCase();
    await query(
      `INSERT INTO bug_reports(report_id, account_id, category, summary, description, context)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [reportId, s.account.id, category, summary,
       clip(req.body?.description, 4000), JSON.stringify(context)]);
    res.json({ ok: true, reportId });
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Could not send that report."); }
});

// ---- wallet sign-in ---------------------------------------------------------
//
// WHY THIS EXISTS AT ALL. A season entry ticket is paid for with an ordinary
// token transfer to the treasury address. An ERC-20 transfer has no "from
// which player" field — the server only sees the sender's address. So the
// server has to know in advance whose address that is, and there is only one
// honest way to learn it: ask the owner to sign a message. A signature proves
// possession of the key, and therefore of the address.
//
// As a side effect, the same mechanism gives wallet sign-in without a
// password.
//
// WHY THREE STEPS AND NOT ONE. The challenge is issued before it is known
// whose wallet this is: the address may belong to nobody. In that case, after
// a successful signature, the player is offered a new account on this wallet —
// and that already requires their consent as a separate action. Creating an
// account silently is not acceptable: the person may have connected the wrong
// wallet out of the dozen in their extension.

const CHALLENGE_TTL_MINUTES = 10;

app.get("/api/v1/account/wallet/providers/config", (_req, res) => {
  res.json({
    // The client checks both fields and refuses to work if either is missing.
    directBrowserProviders: true,
    chainId: wallet.NETWORK.chainId,
    chainIdHex: wallet.NETWORK.chainIdHex,
    chainName: wallet.NETWORK.chainName,
    nativeCurrency: wallet.NETWORK.nativeCurrency,
    rpcUrls: wallet.NETWORK.rpcUrls,
    blockExplorerUrls: wallet.NETWORK.blockExplorerUrls,
  });
});

const issueWalletChallenge = async (req, res) => {
  const address = wallet.normaliseAddress(req.body?.address);
  if (!address) return fail(res, 400, "invalid_wallet_address", "That wallet address is invalid.");
  const purpose = ["login", "link"].includes(String(req.body?.purpose)) ? String(req.body.purpose) : "login";
  try {
    // A linking challenge is only issued to a signed-in player: linking a
    // wallet to somebody else's account must not be possible in principle.
    const s = await loadSession(req);
    if (purpose === "link" && !s) {
      return fail(res, 401, "authentication_required", "Log in before linking a wallet.");
    }
    const nonce = wallet.newNonce();
    const challengeId = "wc_" + rid(16);
    const message = wallet.challengeText({ address, nonce, purpose });
    await query(
      `INSERT INTO wallet_challenges(challenge_id, address, nonce, purpose, message, account_id, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' minutes')::interval)`,
      [challengeId, address, nonce, purpose, message, s?.account.id || null, String(CHALLENGE_TTL_MINUTES)]);
    // Returning address is mandatory: the client compares it against what the
    // wallet gave it and refuses to sign somebody else's challenge.
    res.json({ challengeId, address, message, expiresInSeconds: CHALLENGE_TTL_MINUTES * 60 });
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Could not start wallet verification."); }
};

/** Shared part: fetch a live challenge and verify the signature against it. */
async function acceptWalletSignature(req, res) {
  const challengeId = String(req.body?.challengeId || "");
  const signature = String(req.body?.signature || "");
  const { rows } = await query(
    "SELECT * FROM wallet_challenges WHERE challenge_id=$1", [challengeId]);
  const challenge = rows[0];
  if (!challenge) { fail(res, 404, "wallet_challenge_not_found", "That wallet challenge does not exist."); return null; }
  if (challenge.used_at) { fail(res, 409, "wallet_challenge_used", "That wallet challenge was already used."); return null; }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    fail(res, 409, "wallet_challenge_expired", "That wallet challenge expired. Try again."); return null;
  }
  // The message is checked against OUR copy, not against the submitted one:
  // otherwise the player could sign anything at all and send it in as proof.
  if (String(req.body?.message || "") !== challenge.message) {
    fail(res, 400, "wallet_message_mismatch", "The signed message does not match the challenge."); return null;
  }
  const recovered = wallet.addressFromSignature(challenge.message, signature);
  // Comparing against the address FROM THE CHALLENGE is what constitutes the
  // check. Recovery on its own proves nothing: almost any bytes recover to
  // some address or other.
  if (!recovered || recovered !== challenge.address) {
    fail(res, 401, "wallet_signature_invalid", "That signature does not match the wallet address."); return null;
  }
  return challenge;
}

const verifyWalletSignature = async (req, res) => {
  try {
    const challenge = await acceptWalletSignature(req, res);
    if (!challenge) return;

    const { rows: owners } = await query(
      "SELECT * FROM accounts WHERE wallet_address=$1", [challenge.address]);
    const owner = owners[0];

    // Linking to an account that is already open.
    if (challenge.purpose === "link") {
      const s = await loadSession(req);
      if (!s) return fail(res, 401, "authentication_required", "Log in before linking a wallet.");
      if (owner && owner.id !== s.account.id) {
        return fail(res, 409, "wallet_already_linked", "That wallet already belongs to another account.");
      }
      await query("UPDATE wallet_challenges SET used_at=now() WHERE challenge_id=$1", [challenge.challenge_id]);
      const { rows } = await query(
        `UPDATE accounts SET wallet_address=$1, wallet_linked_at=now(), updated_at=now()
          WHERE id=$2 RETURNING *`, [challenge.address, s.account.id]);
      return res.json({ ok: true, authenticated: true, account: accountView(rows[0]), csrfToken: s.csrf });
    }

    // Signing in with a known wallet.
    if (owner) {
      await query("UPDATE wallet_challenges SET used_at=now() WHERE challenge_id=$1", [challenge.challenge_id]);
      const { sid, csrf } = await createSession(owner.id);
      setSessionCookie(res, sid);
      return res.json({ authenticated: true, account: accountView(owner), csrfToken: csrf });
    }

    // The wallet belongs to nobody. An account is NOT created silently — we
    // hand out a one-shot pass and wait for confirmation: the person may have
    // connected the wrong wallet out of the dozen they have.
    const creationToken = rid(24);
    await query(
      "UPDATE wallet_challenges SET creation_token=$1 WHERE challenge_id=$2",
      [creationToken, challenge.challenge_id]);
    res.json({
      authenticated: false,
      accountCreationRequired: true,
      challengeId: challenge.challenge_id,
      creationToken,
      address: challenge.address,
    });
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Could not verify that wallet."); }
};

/* Three paths onto two handlers.
   ------------------------------------------------------------------
   The client distinguishes the scenarios BY PATH, the server by the purpose
   field. That mismatch cost us a working wallet link: the client knocked on
   /account/methods/wallet/link/challenge, the server answered 404, and the
   player saw "The account request could not be completed" — a message from
   which it is impossible to guess that the route is the problem.

   The fix does not belong in the client: those paths are inherited there and
   match what the original game expects, whereas the server here is ours and it
   is cheaper for it to adapt.

   Guest conversion is the same as link: a guest already has an account, and the
   wallet is attached to it rather than creating a second one. */
const WALLET_ROUTES = [
  ["/api/v1/account/wallet", null],                     // sign in or create
  ["/api/v1/account/methods/wallet/link", "link"],       // link to an account
  ["/api/v1/account/guest/convert/wallet", "link"],      // guest -> wallet
];
for (const [prefix, purpose] of WALLET_ROUTES) {
  app.post(`${prefix}/challenge`, (req, res) => {
    // The path sets the purpose. The client's body is not ignored, though: if
    // it sent a purpose itself, the path only leaves it alone for the generic
    // prefix, where the scenario really is chosen by the body.
    if (purpose) req.body = { ...(req.body || {}), purpose };
    return issueWalletChallenge(req, res);
  });
  app.post(`${prefix}/verify`, verifyWalletSignature);
}

app.post("/api/v1/account/wallet/create/confirm", async (req, res) => {
  const challengeId = String(req.body?.challengeId || "");
  const creationToken = String(req.body?.creationToken || "");
  try {
    const { rows } = await query(
      "SELECT * FROM wallet_challenges WHERE challenge_id=$1", [challengeId]);
    const challenge = rows[0];
    if (!challenge || !challenge.creation_token || challenge.creation_token !== creationToken) {
      return fail(res, 401, "wallet_creation_invalid", "That wallet confirmation is not valid.");
    }
    if (challenge.used_at) return fail(res, 409, "wallet_challenge_used", "That confirmation was already used.");
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      return fail(res, 409, "wallet_challenge_expired", "That confirmation expired. Try again.");
    }
    // Race: while the player was thinking, somebody else could have signed in
    // with the same wallet.
    const taken = await query("SELECT 1 FROM accounts WHERE wallet_address=$1", [challenge.address]);
    if (taken.rows[0]) return fail(res, 409, "wallet_already_linked", "That wallet already has an account.");

    const account = await newAccount({ kind: "wallet" });
    await query(
      "UPDATE accounts SET wallet_address=$1, wallet_linked_at=now(), updated_at=now() WHERE id=$2",
      [challenge.address, account.id]);
    await query("UPDATE wallet_challenges SET used_at=now() WHERE challenge_id=$1", [challengeId]);
    const { rows: fresh } = await query("SELECT * FROM accounts WHERE id=$1", [account.id]);
    const { sid, csrf } = await createSession(account.id);
    setSessionCookie(res, sid);
    res.json({ authenticated: true, account: accountView(fresh[0]), csrfToken: csrf });
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Could not create that wallet account."); }
});

app.get("/api/v1/account/wallet", async (req, res) => {
  const s = await loadSession(req);
  if (!s) return fail(res, 401, "authentication_required", "Log in to continue.");
  res.json({
    linked: Boolean(s.account.wallet_address),
    address: s.account.wallet_address ? wallet.toChecksumAddress(s.account.wallet_address) : null,
    linkedAt: s.account.wallet_linked_at || null,
    chainId: wallet.NETWORK.chainId,
  });
});

app.post("/api/v1/account/logout", async (req, res) => {
  const sid = req.cookies?.sid;
  if (sid) await query("DELETE FROM sessions WHERE id=$1", [sid]).catch(() => {});
  res.clearCookie("sid", { path: "/" });
  res.json({ ok: true });
});

app.post("/api/v1/account/logout-all", async (req, res) => {
  const s = await loadSession(req);
  if (s) await query("DELETE FROM sessions WHERE account_id=$1", [s.account.id]).catch(() => {});
  res.clearCookie("sid", { path: "/" });
  res.json({ ok: true });
});

// ---- cloud save -------------------------------------------------------------
app.get("/api/v1/account/save", async (req, res) => {
  const s = await loadSession(req);
  if (!s) return fail(res, 401, "authentication_required", "Log in to continue.");
  try {
    const { rows } = await query("SELECT * FROM saves WHERE account_id=$1", [s.account.id]);
    if (!rows.length) {
      return res.json({ catalogueVersion: CATALOGUE_VERSION, exists: false, revision: 0, save: null, serverTimestamp: new Date().toISOString() });
    }
    const row = rows[0];
    res.json({
      catalogueVersion: CATALOGUE_VERSION,
      exists: true,
      revision: row.revision,
      save: row.state,
      serverTimestamp: row.updated_at,
    });
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Could not load your cloud save."); }
});

app.put("/api/v1/account/save", async (req, res) => {
  const s = await requireCsrf(req, res);
  if (!s) return;
  const { baseRevision, catalogueVersion, save } = req.body || {};
  const idem = req.get(IDEMPOTENCY_HEADER) || req.body?.mutationId;
  if (catalogueVersion !== CATALOGUE_VERSION) {
    return fail(res, 409, "catalogue_version_mismatch", "This client uses an unsupported catalogue version.");
  }
  if (!save || typeof save !== "object" || Array.isArray(save)) {
    return fail(res, 400, "invalid_save", "The save snapshot is invalid.");
  }
  try {
    // Idempotent replay
    if (idem) {
      const prev = await query("SELECT result FROM idempotency WHERE key=$1 AND account_id=$2", [idem, s.account.id]);
      if (prev.rows.length) return res.json(prev.rows[0].result);
    }
    const cur = await query("SELECT revision FROM saves WHERE account_id=$1", [s.account.id]);
    const currentRevision = cur.rows.length ? cur.rows[0].revision : 0;
    if (Number(baseRevision) !== currentRevision) {
      return fail(res, 409, "revision_conflict", "Your save is out of date. Reload before saving.");
    }
    const nextRevision = currentRevision + 1;
    // Written in two places: saves holds the current state, save_history is the
    // trail along which progress can be rolled back if the row turns out to be
    // corrupt.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO saves(account_id, revision, catalogue_version, state, updated_at)
         VALUES ($1,$2,$3,$4, now())
         ON CONFLICT (account_id) DO UPDATE SET revision=$2, catalogue_version=$3, state=$4, updated_at=now()`,
        [s.account.id, nextRevision, CATALOGUE_VERSION, save]);
      await client.query(
        `INSERT INTO save_history(account_id, revision, catalogue_version, state)
         VALUES ($1,$2,$3,$4)`,
        [s.account.id, nextRevision, CATALOGUE_VERSION, save]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    const result = { revision: nextRevision, serverTimestamp: new Date().toISOString() };
    if (idem) await query("INSERT INTO idempotency(key, account_id, result) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [idem, s.account.id, result]);
    // Weekly bounties from the save are mirrored into their table. A failure
    // here must not bring the save down: the player's progress is already
    // written, and the mirror is derived data.
    gameHooks.mirrorWeeklyBounties(s.account.id, save)
      .catch((err) => console.error("[bounties] mirror failed:", err.message));
    res.json(result);
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Could not save."); }
});

// ---- account recovery -------------------------------------------------------
// The key is issued once and only its hash stays on the server. The player is
// required to confirm that they wrote the key down: the server asks for two
// random blocks out of six. Until that confirmation passes, the key counts as
// not issued — otherwise the person is certain they are protected while in fact
// they have nothing written down.
app.post("/api/v1/account/recovery/setup", async (req, res) => {
  const s = await requireCsrf(req, res);
  if (!s) return;
  try {
    const blocks = makeRecoveryKey();
    const recoveryKey = blocks.join("-");
    const hash = await bcrypt.hash(normaliseRecovery(recoveryKey), 10);
    // The clear-text blocks live until confirmation, then they are wiped.
    const pending = Object.fromEntries(blocks.map((b, i) => [String(i + 1), b]));
    await query(
      `UPDATE accounts SET recovery_hash=$1, recovery_pending=$2, recovery_issued_at=now(),
                           recovery_confirmed_at=NULL, updated_at=now() WHERE id=$3`,
      [hash, pending, s.account.id]);
    // Two different blocks, positions counted from one — these are what the
    // confirmation form will ask for.
    const first = 1 + Math.floor(Math.random() * 6);
    let second = 1 + Math.floor(Math.random() * 6);
    if (second === first) second = (second % 6) + 1;
    res.json({
      recovery: {
        recoveryKey,
        confirmationPositions: [first, second].sort((a, b) => a - b),
      },
    });
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Could not issue a Recovery Key."); }
});

app.post("/api/v1/account/recovery/confirm", async (req, res) => {
  const s = await requireCsrf(req, res);
  if (!s) return;
  const { blocksByPosition } = req.body || {};
  if (!blocksByPosition || typeof blocksByPosition !== "object") {
    return fail(res, 400, "invalid_input", "Enter the requested Recovery Key blocks.");
  }
  try {
    const { rows } = await query(
      "SELECT recovery_pending FROM accounts WHERE id=$1", [s.account.id]);
    const pending = rows[0]?.recovery_pending;
    if (!pending) return fail(res, 409, "recovery_not_issued", "Issue a Recovery Key first.");

    const positions = Object.keys(blocksByPosition);
    if (!positions.length) return fail(res, 400, "invalid_input", "Both requested blocks are required.");
    const mismatch = positions.some((pos) =>
      normaliseRecovery(blocksByPosition[pos]) !== String(pending[pos] || ""));
    if (mismatch) {
      return fail(res, 400, "recovery_mismatch", "Those blocks do not match the Recovery Key.");
    }

    const updated = await query(
      `UPDATE accounts SET recovery_confirmed_at=now(), recovery_pending=NULL, updated_at=now()
        WHERE id=$1 RETURNING *`, [s.account.id]);
    res.json(sessionPayload(updated.rows[0], s.csrf));
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Could not confirm the Recovery Key."); }
});

// Signing in with the key: the only way back if the password is forgotten. The
// key is retired immediately after use, otherwise the same sheet of paper would
// open the account forever.
app.post("/api/v1/account/recovery/recover", async (req, res) => {
  const { recoveryKey, newPassword, newPasswordConfirmation } = req.body || {};
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return fail(res, 400, "invalid_input", "The new password must be at least 8 characters.");
  }
  if (newPasswordConfirmation !== undefined && newPassword !== newPasswordConfirmation) {
    return fail(res, 400, "invalid_input", "The two passwords do not match.");
  }
  const key = normaliseRecovery(recoveryKey);
  if (key.length !== 36) return fail(res, 400, "invalid_input", "A Recovery Key is six blocks of six characters.");
  try {
    const { rows } = await query(
      "SELECT * FROM accounts WHERE recovery_hash IS NOT NULL AND recovery_confirmed_at IS NOT NULL");
    let match = null;
    for (const row of rows) {
      if (await bcrypt.compare(key, row.recovery_hash)) { match = row; break; }
    }
    if (!match) return fail(res, 401, "recovery_invalid", "That Recovery Key was not recognised.");
    const updated = await query(
      `UPDATE accounts SET password_hash=$1, recovery_hash=NULL, recovery_confirmed_at=NULL,
                           recovery_issued_at=NULL, updated_at=now()
        WHERE id=$2 RETURNING *`,
      [await bcrypt.hash(String(newPassword), 10), match.id]);
    // Every previous session is closed: once the key has been used, the old
    // sign-ins no longer deserve any trust.
    await query("DELETE FROM sessions WHERE account_id=$1", [match.id]).catch(() => {});
    const { sid, csrf } = await createSession(match.id);
    setSessionCookie(res, sid);
    res.json(sessionPayload(updated.rows[0], csrf));
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Recovery failed."); }
});

// The list of stored revisions: how many there are, when they were made, and
// how big they are.
app.get("/api/v1/account/save/history", async (req, res) => {
  const s = await loadSession(req);
  if (!s) return fail(res, 401, "authentication_required", "Log in to continue.");
  try {
    const { rows } = await query(
      `SELECT revision, catalogue_version, created_at,
              pg_column_size(state) AS bytes
         FROM save_history WHERE account_id=$1
        ORDER BY revision DESC LIMIT 20`, [s.account.id]);
    res.json({ revisions: rows.map((r) => ({
      revision: r.revision,
      catalogueVersion: r.catalogue_version,
      createdAt: r.created_at,
      bytes: Number(r.bytes),
    })) });
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Could not read the save history."); }
});

// Rolling back to an earlier revision. It does not rewrite history: the
// restored state is laid on top as a new revision, so the rollback itself is
// reversible too.
app.post("/api/v1/account/save/restore", async (req, res) => {
  const s = await requireCsrf(req, res);
  if (!s) return;
  const revision = Number(req.body?.revision);
  if (!Number.isInteger(revision) || revision < 1) {
    return fail(res, 400, "invalid_input", "Specify which revision to restore.");
  }
  try {
    const { rows } = await query(
      "SELECT state FROM save_history WHERE account_id=$1 AND revision=$2", [s.account.id, revision]);
    if (!rows.length) return fail(res, 404, "revision_not_found", "That revision is no longer stored.");
    const cur = await query("SELECT revision FROM saves WHERE account_id=$1", [s.account.id]);
    const next = (cur.rows.length ? cur.rows[0].revision : 0) + 1;
    const state = rows[0].state;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO saves(account_id, revision, catalogue_version, state, updated_at)
         VALUES ($1,$2,$3,$4, now())
         ON CONFLICT (account_id) DO UPDATE SET revision=$2, catalogue_version=$3, state=$4, updated_at=now()`,
        [s.account.id, next, CATALOGUE_VERSION, state]);
      await client.query(
        "INSERT INTO save_history(account_id, revision, catalogue_version, state) VALUES ($1,$2,$3,$4)",
        [s.account.id, next, CATALOGUE_VERSION, state]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally { client.release(); }
    res.json({ revision: next, restoredFrom: revision, serverTimestamp: new Date().toISOString() });
  } catch (e) { console.error(e); fail(res, 500, "server_error", "Could not restore that revision."); }
});

// ---- game data --------------------------------------------------------------
// Inventory, mail, listings, seasons and bounties. Registered BEFORE the 501
// stub below: Express takes the first matching handler, and in the reverse
// order the new routes would be unreachable.
//
// The catalogue is loaded HERE, before the routes are registered, and that is
// mandatory. At first it was not loaded anywhere: handlers called scrapRecipes()
// and resolveDraw() on an unloaded module, got a TypeError on null and brought
// the whole process down — the server answered 502 to every request until
// Railway restarted it. The test suite did not catch this because it called
// loadCatalogue() itself, by hand. The lesson is that a test must bring the
// service up the same way the production boot does, otherwise it only confirms
// that something works which never happens in production.
await loadCatalogue();
console.log("[catalogue] " + JSON.stringify(catalogueInfo()));

const gameHooks = registerGameRoutes(app, { pool, query, fail, requireCsrf, loadSession });

// The rest is not built yet — we answer 501 explicitly so the refusal reads as
// such in the logs instead of looking like an accidental 404.
app.all(/^\/api\/v1\/(chain|gacha|equipment|verifier|marketplace|seasons)\//, (_req, res) =>
  fail(res, 501, "not_implemented", "This feature's backend is not built yet."));

// Fallback for any other /api path.
app.use("/api", (_req, res) => fail(res, 404, "not_found", "Unknown endpoint."));

// ---- boot -------------------------------------------------------------------
// Start listening immediately so /health responds and Railway doesn't crash-loop
// while Postgres warms up. Then connect + create schema with retries, logging the
// resolved DB target (without the password) so misconfig is obvious in the logs.
app.listen(PORT, () => {
  console.log(`[loothood-backend] listening on :${PORT}`);
  console.log(`[db] target: ${describeConnection()}`);
  if (!process.env.DATABASE_URL) {
    console.error("[db] DATABASE_URL is missing. In Railway, open the SERVICE (not the DB) -> Variables and add:");
    console.error('[db]   DATABASE_URL = ${{Postgres.DATABASE_URL}}   (reference the Postgres plugin)');
  }
  /* Load the run core now, while nobody is waiting.
     ------------------------------------------------------------------
     It is loaded lazily, on first use — and the first use is the button that
     opens the season, measured at three quarters of a second cold against
     four milliseconds warm. Three quarters of a second is not a failure, but
     it is spent at the one moment when a button that does not answer
     instantly gets pressed a second time.

     Done after listen() and without awaiting: the server must answer /health
     straight away, or Railway restarts it. A failure here is logged and left
     alone — the loader will simply be tried again on first use, exactly as
     before. */
  MANIFEST.loadRunCore()
    .then(() => console.log("[season] run core preloaded"))
    .catch((e) => console.error("[season] preload failed, will load on demand:", e.message));
});

async function connectWithRetry(attempt = 1) {
  try {
    await initSchema();
    dbReady = true;
    console.log("[db] connected, schema ready");
    try {
      const repaired = await gameHooks.repairCraftedItemOrigins();
      if (repaired) console.log(`[migration] backfilled origin on crafted items: ${repaired}`);
    } catch (e) { console.error("[migration] crafted item origin:", e.message); }
  } catch (e) {
    console.error(`[db] connect attempt ${attempt} failed: ${e.code || ""} ${e.message}`);
    if (attempt < 10) setTimeout(() => connectWithRetry(attempt + 1), Math.min(2000 * attempt, 15000));
    else console.error("[db] giving up after 10 attempts — check DATABASE_URL and that the Postgres plugin is attached.");
  }
}
connectWithRetry();

// Housekeeping: once an hour we clear expired sessions, stale idempotency keys
// and the tail of the save history. Without it three tables grow without bound.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
async function sweep() {
  if (!dbReady) return;
  try {
    const out = await sweepExpired();
    if (out.sessions || out.idempotency || out.saveHistory) {
      console.log(`[sweep] sessions:${out.sessions} idempotency:${out.idempotency} history:${out.saveHistory}`);
    }
  } catch (e) { console.error("[sweep] failed:", e.message); }
}
setTimeout(sweep, 30_000).unref?.();
setInterval(sweep, SWEEP_INTERVAL_MS).unref?.();

// ---- ticket payment watcher -------------------------------------------------
//
// Reads incoming token transfers to the treasury address and issues a ticket to
// whoever has that wallet linked to their account. It signs nothing and sends
// nothing anywhere — the server does not, and must not, hold the treasury key.
//
// Without configuration it does not start, and it says so ONCE. A silent
// watcher pointed at an invented address would read emptiness forever, and it
// would look like "nobody is paying, that's all".
const WATCHER_INTERVAL_MS = Number(process.env.CHAIN_POLL_MS) || 30_000;
let rpcCall = null;
let rpcCallFor = "";

/* Settings are re-read, not frozen at boot.
   ------------------------------------------------------------------
   They used to be read once at startup, which meant the token address had to
   exist before the process did. It does not: the address appears when the
   token launches, and until then there is nothing to put anywhere. Freezing
   at boot forced a redeploy at exactly the moment when a redeploy is the last
   thing anyone wants.

   Now the addresses may also live in the database, where a browser can paste
   them, and the watcher notices within one pass. Environment variables still
   take priority: a deployment that pins an address on purpose must not be
   silently overridden from a web page.

   Values are cached briefly — polling runs every thirty seconds, and reading
   two rows each time is cheap, but there is no reason to do it twice. */
const CHAIN_SETTINGS_TTL_MS = 15_000;
let chainSettingsCache = { at: 0, value: null };

async function storedChainSettings() {
  if (!dbReady) return {};
  if (Date.now() - chainSettingsCache.at < CHAIN_SETTINGS_TTL_MS && chainSettingsCache.value) {
    return chainSettingsCache.value;
  }
  try {
    const { rows } = await query(
      "SELECT key, value FROM app_settings WHERE key IN ('TOKEN_ADDRESS','TREASURY_ADDRESS')");
    const stored = {};
    for (const row of rows) stored[row.key] = row.value;
    chainSettingsCache = { at: Date.now(), value: stored };
    return stored;
  } catch { return {}; }
}

async function currentChainConfig() {
  const stored = await storedChainSettings();
  // The environment wins where it is set; the database fills the gaps.
  return chain.chainSettings({
    ...process.env,
    TOKEN_ADDRESS: process.env.TOKEN_ADDRESS || stored.TOKEN_ADDRESS || "",
    TREASURY_ADDRESS: process.env.TREASURY_ADDRESS || stored.TREASURY_ADDRESS || "",
  });
}

async function ticketPriceAndSeason() {
  const { rows } = await query(
    `SELECT season_key, entry FROM seasons WHERE state IN ('open','live')
      ORDER BY COALESCE(starts_at, created_at) DESC LIMIT 1`);
  const season = rows[0];
  if (!season) return { seasonKey: null, price: 0n };
  /* The same capped price the player was shown.
     ------------------------------------------------------------------
     The watcher and the purchase screen must agree to the unit: if the screen
     names one amount and the watcher expects another, a correct payment gets
     recorded as underpaid, and the player is told they are short after the
     money has already gone.

     Hence one function for both. The price is in the token's smallest units,
     the same way it arrives from the transfer log — comparing different units
     is not allowed.

     There is also a small tolerance below the price. The rate moves between
     the moment a player reads the amount and the moment the transfer confirms,
     and a payment short by a fraction of a percent for that reason is a
     payment, not an attempt to underpay. Half a percent is far below anything
     worth gaming and well above ordinary drift. */
  const config = await currentChainConfig();
  const { wei } = await entryPriceWei(season, config.token);
  const price = wei > 0n ? (wei * 995n) / 1000n : 0n;
  return { seasonKey: season.season_key, price };
}

let watcherAnnounced = "";

async function watchChain() {
  if (!dbReady) return;
  const config = await currentChainConfig();
  if (!config.enabled) return;
  // Say it once per address, not every thirty seconds: a watcher that starts
  // working is worth a line in the log, a watcher that keeps working is not.
  if (watcherAnnounced !== config.treasury) {
    watcherAnnounced = config.treasury;
    console.log(`[chain] watching ${config.treasury} via ${config.rpc}`);
  }
  try {
    if (!rpcCall || rpcCallFor !== config.rpc) {
      rpcCall = chain.createRpcClient(config.rpc);
      rpcCallFor = config.rpc;
    }
    const { seasonKey, price } = await ticketPriceAndSeason();
    const result = await chain.pollTransfers({
      query, call: rpcCall, settings: config,
      ticketPrice: price, seasonKey,
    });
    if (result.transfersRead || result.ticketsCredited) {
      console.log(`[chain] transfers:${result.transfersRead} tickets:${result.ticketsCredited} through block ${result.throughBlock}`);
    }
  } catch (e) { console.error("[chain]", e.message); }
}

/* The timer always runs; whether it does anything is decided each pass.
   Previously the timer itself was only created when the configuration was
   valid at boot — so an address pasted later changed nothing until a restart,
   and the restart was the thing being avoided. */
setTimeout(watchChain, 20_000).unref?.();
setInterval(watchChain, WATCHER_INTERVAL_MS).unref?.();

{
  const bootConfig = chain.chainSettings();
  if (bootConfig.enabled) {
    console.log(`[chain] watching ${bootConfig.treasury} via ${bootConfig.rpc}`);
  } else {
    console.log("[chain] idle at boot — needs two valid addresses (environment or launch console):");
    console.log(`[chain]   ${describeAddressSetting("TOKEN_ADDRESS", process.env.TOKEN_ADDRESS)}`);
    console.log(`[chain]   ${describeAddressSetting("TREASURY_ADDRESS", process.env.TREASURY_ADDRESS)}`);
    console.log("[chain]   they can also be set from the launch console; the watcher"
      + " picks them up within a minute, without a redeploy");
  }
}
