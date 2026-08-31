/* PONSLOOT documentation.
   ------------------------------------------------------------------
   Kept apart from the guide on purpose. The guide explains HOW TO PLAY: why
   the bow only fires while standing still and what the boss's armour does.
   The documentation answers a different question — WHY THIS CAN BE TRUSTED:
   how the randomness works, what exactly the server recomputes, where the
   money comes from. That is a different audience at a different moment: the
   first is reached for mid-fight, the second before paying.

   THIS FILE DESCRIBED A GAME THAT NO LONGER EXISTS, AND THAT IS WORSE THAN
   HAVING NO DOCUMENTATION. It had paid seasons with a ticket, a player-to-
   player market, the village and pulls for ether — all of it cut, yet the page
   kept promising it. The "Docs" section sits in the menu, people go into it,
   and until today they were reading the manual for a different game there. A
   document that has drifted away from the code lies more confidently than an
   advertisement: it looks like a verifiable description.

   Blocks are marked up by type rather than as HTML: the text can be edited
   without risking the layout, and the layout changes in one place.

   THE RULE FOR NUMBERS. There is not a single figure here that cannot be
   checked in the code or on chain. Anything that depends on the exchange rate
   on launch day is not named even approximately: named in advance and changed
   later, it is no longer an estimate but a broken promise. */

window.LOOTHOOD_DOCS = Object.freeze({
  version: "docs-v2",

  pages: Object.freeze([
    Object.freeze({
      id: "overview",
      title: "Overview",
      lede: "What PONSLOOT is, and what it refuses to be.",
      blocks: Object.freeze([
        { type: "p", text: "PONSLOOT is a browser roguelite looter. You run a forest of fifteen stages, fire only while standing still, and choose upgrades between waves. That part is free and needs no wallet, no email, no signup." },
        { type: "p", text: "Bosses drop shards. Three shards make one forge roll, and a roll gives you a building. Every building is a seat in Robinhood Chain's Top 10, and a working building pays you ETH every day." },
        { type: "h3", text: "The one rule that shapes everything" },
        { type: "p", text: "Playing does not mint tokens. Not from clearing stages, not from bosses, not from crafting. This is the rule most play-to-earn economies break, and breaking it is why they die: when a game prints its own currency faster than it burns it, the price falls until the reward stops meaning anything, and the players who arrive last pay for the ones who arrived first." },
        { type: "p", text: "The token is never paid out either. It is bought, held, and read — nothing more. What you earn arrives as ETH, so the people who earn have no reason to sell the token, and the only sellers are the ones leaving." },
        { type: "h3", text: "The three layers" },
        { type: "table", head: Object.freeze(["Layer", "Currency", "What it does"]), rows: Object.freeze([
          Object.freeze(["Playing", "Gold and trophies", "Gear from the shop and the forge. Stays inside the game."]),
          Object.freeze(["Rolling", "Boss shards", "Three shards, one roll, one building. Odds are published."]),
          Object.freeze(["Ownership", "The token", "Hold it, and your buildings work. Nothing is locked."]),
        ]) },
        { type: "h3", text: "What you can check yourself" },
        { type: "list", items: Object.freeze([
          "Every roll — the server commits to the outcome before it rolls, and hands you the secret afterwards.",
          "Every roll's odds — the table is on the Forge screen, sums to 100%, and names what each seat pays.",
          "Every run — the server replays your recorded input with the same engine your browser ran, and pays from its own result.",
          "The Top 10 itself — it is computed from public market data, and the factors are listed on this page.",
          "Your own holding — it is read from the chain, not taken from your browser, and nothing is moved to read it.",
        ]) },
        { type: "note", text: "The verification page at /verify.html recomputes all of this in your browser. It does not ask the server whether the result was fair — it checks." },
      ]),
    }),

    Object.freeze({
      id: "getting-started",
      title: "Getting started",
      lede: "From nothing to your first building, and where a wallet actually matters.",
      blocks: Object.freeze([
        { type: "h3", text: "Just play" },
        { type: "p", text: "Open the site and press Start Hunt. A guest account is created locally and your progress is saved server-side against it. No wallet is involved, and nothing is for sale on that path." },
        { type: "h3", text: "Shards, then a building" },
        { type: "p", text: "Bosses stand on stages five, ten and fifteen. Each one you kill drops a shard. Three shards make a roll, and a roll is spent in the Forge for one of the ten buildings. None of that costs money — it costs playing." },
        { type: "h3", text: "Keeping your progress" },
        { type: "p", text: "A guest profile is kept on our side, not in your browser, but it is tied to this browser until you link a wallet. Linking upgrades the same account rather than creating a second one, so nothing is lost." },
        { type: "h3", text: "What a wallet is for" },
        { type: "p", text: "Linking a wallet means signing a message. Signing costs nothing, moves no funds, and grants no permissions — it only proves the address is yours. That proof is what lets the chain be read for your holding, and it is what a payout is sent to." },
        { type: "table", head: Object.freeze(["Feature", "Needs a wallet"]), rows: Object.freeze([
          Object.freeze(["Forest runs, gear, the shop", "No"]),
          Object.freeze(["Boss shards and forge rolls", "No"]),
          Object.freeze(["Owning a building", "No"]),
          Object.freeze(["Opening slots so buildings work", "Yes"]),
          Object.freeze(["Receiving your daily ETH", "Yes"]),
        ]) },
        { type: "note", text: "We never ask for a seed phrase or a private key, and no part of the game has a place to type one. Anything that does is not us." },
      ]),
    }),

    Object.freeze({
      id: "verification",
      title: "Verification",
      lede: "How a claim of fairness is made checkable instead of promised.",
      blocks: Object.freeze([
        { type: "h3", text: "Rolls: commit before, reveal after" },
        { type: "p", text: "When you request a roll, the server generates a secret, stores it, and returns only its SHA-256 fingerprint plus the earliest moment it may be revealed. Only then does it roll your building from that secret." },
        { type: "p", text: "After the reveal you get the secret itself. Run it through the same derivation the game uses and you get the same result. The point is not that the numbers look random — it is that the fingerprint was published before the outcome existed, and no other secret produces that fingerprint." },
        { type: "code", text: "fingerprint = sha256(secret)\nbuilding   = derive(secret, weights)" },
        { type: "h3", text: "Runs: replayed, not trusted" },
        { type: "p", text: "A run is submitted as a recording of your input, tick by tick — not as a score. The server replays that recording with the same run core your browser executed and computes its own stage. Gold and shards are paid from the replay, not from what the client claimed." },
        { type: "p", text: "What the client claimed is stored next to what the server computed, but only the server's number counts. A modified client can send whatever it likes; it cannot make the replay produce it." },
        { type: "h3", text: "Receipts chain" },
        { type: "p", text: "Each receipt carries the hash of the previous one. Removing or editing a past receipt breaks every receipt issued after it, so the history cannot be quietly rewritten — including by us." },
        { type: "h3", text: "Check it yourself" },
        { type: "p", text: "Open the verification page, paste a roll id or a run id, and it fetches the evidence and recomputes everything locally using the same shared module the game and the server both use." },
        { type: "note", text: "The code that runs these checks is the code running in production, published in the public repository — not a description of it." },
      ]),
    }),

    Object.freeze({
      id: "top10",
      title: "The Top 10",
      lede: "What the ten seats are, and how a coin gets one.",
      blocks: Object.freeze([
        { type: "h3", text: "Ten buildings, ten seats" },
        { type: "p", text: "There are exactly ten buildings, and each one is a seat in Robinhood Chain's Top 10 rather than a fixed coin. Seat one is whatever currently ranks first. Own the building, and you own the seat — including whoever moves into it later." },
        { type: "p", text: "Binding buildings to tickers instead would have aged badly in a week: a coin dies, and the person holding it is left with a building named after nothing. A seat cannot die." },
        { type: "h3", text: "How the ranking is computed" },
        { type: "p", text: "Not by one number. A single factor is easy to inflate — liquidity can be parked, market cap can be printed against an empty book. The rank is a weighted composite of four:" },
        { type: "table", head: Object.freeze(["Factor", "Weight"]), rows: Object.freeze([
          Object.freeze(["Market cap", "40%"]),
          Object.freeze(["Liquidity", "25%"]),
          Object.freeze(["24h volume", "20%"]),
          Object.freeze(["24h transactions", "15%"]),
        ]) },
        { type: "p", text: "Each factor is taken as a share of the total across all live candidates, so no single one can carry a coin by itself." },
        { type: "h3", text: "What gets excluded" },
        { type: "list", items: Object.freeze([
          "Coins with no trading in the last day — a dead coin with a big printed cap is not a top coin.",
          "Coins whose book is too thin to matter against their own cap.",
          "Stablecoins, tokenised stocks and LP tokens — they are not what this game is about.",
        ]) },
        { type: "note", text: "The market data comes from public sources on the chain and its main DEX aggregator. Nothing here is our opinion of a coin." },
      ]),
    }),

    Object.freeze({
      id: "economy",
      title: "Economy",
      lede: "Where money comes in, where it goes out, and the one number we will not pretend about.",
      blocks: Object.freeze([
        { type: "h3", text: "The token is held, not spent" },
        { type: "p", text: "Slots are not bought. They are given for what sits in your wallet: pass a threshold and a slot opens, sell below it and the slot closes. Nothing is staked, locked or deposited — the balance is read, and we could not take it if we tried." },
        { type: "p", text: "Selling slots for the token would have raised a question with no good answer: where does the paid token go. A treasury that hoards it becomes an overhang; one that hands it back to other owners is new players paying old ones, whatever it is called; one that sells it kills the price. Holding avoids all three." },
        { type: "h3", text: "Thresholds" },
        { type: "table", head: Object.freeze(["Hold", "Slots", "Rate"]), rows: Object.freeze([
          Object.freeze(["nothing", "0", "40% of maximum"]),
          Object.freeze(["100,000", "1", "×1.0"]),
          Object.freeze(["1,000,000", "2", "×1.4"]),
          Object.freeze(["5,000,000", "3", "×1.8"]),
          Object.freeze(["20,000,000", "4", "×2.2"]),
          Object.freeze(["100,000,000", "5", "×2.5 — the cap"]),
        ]) },
        { type: "p", text: "The cap is deliberate. Without one a single large wallet would take every building in the world and the whole pool with them, and everybody else would be playing for the remainder." },
        { type: "h3", text: "Where the pool comes from" },
        { type: "table", head: Object.freeze(["Source", "Rate", "What it is"]), rows: Object.freeze([
          Object.freeze(["Pons trading fee", "0.7% of trading", "The creator fee on every trade in the token. All of it goes to the pool. Paid in ETH, by traders — not by players."]),
        ]) },
        { type: "p", text: "We take no cut of the trading fee. There is nothing to take a cut of on the game's side either: rolls cost boss shards, not ETH, so no player money enters the pool at all. Both sources are outside money." },
        { type: "h3", text: "The rate floats, and that is not fine print" },
        { type: "p", text: "Whatever arrived in a day is what gets paid out that day, split between every working building by power. There is no promised percentage anywhere, because a promised percentage is a debt, and we do not take on debts we cannot see the income for." },
        { type: "p", text: "This cuts both ways. Early on, with few buildings working, a share is a large slice of a small pool." },
        { type: "h3", text: "Gear stays inside the game" },
        { type: "p", text: "Equipment costs gold, and legendaries also cost boss trophies. No token, no ETH. Gold comes from how deep a run went, trophies from bosses killed, and both are counted by the server from the replay — so a bigger claim does not buy a bigger sword." },
      ]),
    }),

    Object.freeze({
      id: "architecture",
      title: "Architecture",
      lede: "What runs where, and which parts are deliberately boring.",
      blocks: Object.freeze([
        { type: "table", head: Object.freeze(["Part", "Runs on", "Holds"]), rows: Object.freeze([
          Object.freeze(["Client", "Static hosting", "Nothing of value"]),
          Object.freeze(["API", "Node + Express", "Sessions, items, receipts"]),
          Object.freeze(["Database", "Postgres", "Accounts, equipment, buildings"]),
          Object.freeze(["Chain reader", "Same API process", "Read-only cursor"]),
        ]) },
        { type: "h3", text: "The server has no keys" },
        { type: "p", text: "The chain is read, never written: balances and transfers are polled from public endpoints. There is no private key anywhere in the deployment, so there is nothing on the server worth stealing to move funds." },
        { type: "h3", text: "One engine, two places" },
        { type: "p", text: "The run engine and the verification maths are single modules loaded both by the browser and by the server. Two implementations would drift, and the first sign of drift would be an honest run rejected as invalid." },
        { type: "h3", text: "Status" },
        { type: "p", text: "The Status button measures rather than asserts: it queries the database and reads the age of the chain cursor. A status page that repeats constants from the code is decoration." },
      ]),
    }),

    Object.freeze({
      id: "faq",
      title: "FAQ",
      lede: "The questions worth answering plainly.",
      blocks: Object.freeze([
        { type: "h3", text: "Is the game free?" },
        { type: "p", text: "Yes. Runs, gear, the shop, boss shards and forge rolls cost nothing. Holding the token is what opens slots, and that is buying a token, not paying us." },
        { type: "h3", text: "Do I need a building to play?" },
        { type: "p", text: "No. The forest is the game. Buildings are what the forest eventually pays for." },
        { type: "h3", text: "Are items NFTs?" },
        { type: "p", text: "No. Equipment is recorded server-side. Making each sword a token would add gas to every drop and solve nothing that the receipt chain does not already solve." },
        { type: "h3", text: "Can you change my score?" },
        { type: "p", text: "We can refuse to accept a run, and you would see that. We cannot quietly change one: the result comes from replaying your own recorded input, and every receipt is chained to the previous one." },
        { type: "h3", text: "What happens if I lose my wallet?" },
        { type: "p", text: "The account is gone. There are only two ways in — as a guest in this browser, or with the wallet — and we cannot restore access to an account whose only proof of ownership is a key we never had. There is no password to reset, because there is no password." },
        { type: "h3", text: "Why should I believe any of this?" },
        { type: "p", text: "You should not have to. Every claim on this page corresponds to something you can recompute from the published code and the evidence the server hands you. Start with the verification page and a roll id." },
      ]),
    }),
  ]),
});
