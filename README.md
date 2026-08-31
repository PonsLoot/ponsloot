# PONSLOOT

A browser archer roguelite on Robinhood Chain. Fifteen stages, three bosses, no
install, no wallet needed to play.

**Play:** https://packhood-ten.vercel.app

---

## The loop

```
clear a floor  ->  kill the boss  ->  it drops a shard
3 shards       ->  one roll
a roll         ->  a BUILDING
a building     ->  pays you in ETH
```

Rolls can also be bought outright. Shards are how you earn one by playing.

## Buildings

Ten buildings, ten seats in the chain's top ten. A building is tied to a
**seat**, not to a ticker: the first building holds the first coin of the
network, the tenth holds the tenth. When the top changes, the coin inside your
building changes with it — you own the seat, and the seat stays yours. An index
works the same way: the constituents get revised, the share does not.

That is also why the odds differ per building. It is not a rarity assigned by
feel — seat #1 is rarer than seat #10 because it is seat #1.

At the time of writing, seat #2 — the Armoury — holds PONS.

## Holding the token

Holding **$PONSLOOT** opens **slots**, and slots are how many buildings can work
at once: one at 100k, up to five at 100M. The token is never spent and never
paid out. Payouts are in ETH.

## Randomness you can check

Every roll is committed before it is revealed. The secret is born with your
request, only its hash is published, and the reveal cannot happen before the
announced moment. When it opens you get the secret and can recompute the roll
yourself.

## Running it

```bash
npm install
DATABASE_URL=postgres://... npm run dev        # schema creates itself on boot
cd frontend && python3 -m http.server 5173     # the client is static, no build step
```

`frontend/vercel.json` rewrites `/api/*` to the backend, so the client and the
API share one origin and there is no CORS to configure.

## Layout

```
src/        Node + Express API, Postgres schema, commit-reveal rolls
frontend/   the game itself — static files, no build step
```

This repository is the public mirror and carries the application code only.
Build tooling, checks, render templates and working notes live in the private
working tree.

## Status

No token, no announcement, no payouts running yet. What is live is the game and
the building catalogue.
