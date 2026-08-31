/**
 * Building pulls: commitment and reveal.
 *
 * THE SCHEME IS THE SAME AS THE GACHA'S, AND DELIBERATELY SO. The secret is
 * born together with the request and never leaves before the reveal — only its
 * fingerprint goes out, plus the moment before which revealing is not allowed.
 * That means the server cannot pick the outcome after the fact: the fingerprint
 * has already been announced. And after the reveal the player runs the same
 * secret through the same function and checks for themselves.
 *
 * Setting up a second, "our own" randomness mechanism would have been easier,
 * but then we would have two different fairness promises, and one day it would
 * turn out that only one of them is verifiable.
 *
 * THE CATALOGUE IS NOT REWRITTEN HERE: frontend/js/buildings-v1.js is imported —
 * the same file the player reads the odds from on the buildings screen. One
 * source of truth.
 *
 * THE ROLL IS AN INTEGER. Four bytes are taken from the secret and reduced to
 * 0…9999 by remainder. A fraction would have to be multiplied and rounded, and
 * rounding shifts the boundary between buildings by one ten-thousandth — and
 * that is exactly where the legendary lives, the one with only fifty values out
 * of ten thousand.
 */

import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS = path.join(HERE, "..", "frontend", "js");

let catalogue = null;

export async function loadBuildings() {
  if (catalogue) return catalogue;
  await import(path.join(JS, "buildings-v1.js"));
  catalogue = globalThis.PackhoodBuildings;
  if (!catalogue?.buildingForRoll) {
    throw new Error("buildings-v1.js did not expose a catalogue — the module wrapper changed");
  }
  return catalogue;
}

/** How long to wait between the request and the reveal. */
export const REVEAL_DELAY_MS = 1500;

export function newSecret() {
  return randomBytes(32).toString("hex");
}

export function commitmentFor(secret) {
  return createHash("sha256").update(String(secret)).digest("hex");
}

/**
 * Roll number `index` from the secret: an integer in 0…9999.
 *
 * The index goes into the hash, so ten pulls from one secret give ten
 * different but reproducible numbers. Without the index they would all be
 * identical, and a "pull ten" would hand out ten identical buildings.
 */
export function rollFrom(secret, index = 0) {
  const hash = createHash("sha256").update(`${secret}:${index}`).digest();
  return hash.readUInt32BE(0) % 10000;
}

/**
 * What the secret produced. A pure function: no database, no time, no outside
 * randomness — which is exactly why the player can run it on their own machine.
 */
export async function resolvePull(secret, count = 1) {
  const buildings = await loadBuildings();
  const howMany = Number.isInteger(count) && count > 0 ? Math.min(count, 10) : 1;
  const result = [];
  for (let i = 0; i < howMany; i++) {
    const roll = rollFrom(secret, i);
    const building = buildings.buildingForRoll(roll);
    if (!building) {
      // This is only possible if the catalogue weights stopped summing to 10000.
      // Silently substituting the last building would mean handing out
      // legendaries by mistake.
      throw new Error(`roll ${roll} did not land on any building — the catalogue weights are broken`);
    }
    result.push({ roll, id: building.id, name: building.name,
                  coin: building.coin, rarity: building.rarity, power: building.power });
  }
  return result;
}
