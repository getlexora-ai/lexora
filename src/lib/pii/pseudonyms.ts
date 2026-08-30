// Deterministic, format-preserving stand-ins. No dependency on Faker — a small
// German pool is enough to see whether generation quality holds up, and it keeps
// the playground zero-install. Every value maps to the SAME stand-in every time
// (keyed on the real string), so a document stays internally consistent and a
// later edit re-derives the identical map.

import type { PiiKind } from "./types.ts";

const FIRST = [
  "Anna", "Lukas", "Marie", "Jonas", "Sophie", "Felix", "Laura", "Paul",
  "Emma", "Max", "Clara", "Ben", "Mia", "Elias", "Lena", "Noah",
];
const LAST = [
  "Schmidt", "Schneider", "Fischer", "Weber", "Wagner", "Becker", "Hoffmann",
  "Koch", "Bauer", "Richter", "Klein", "Wolf", "Neumann", "Braun", "Krause", "Lang",
];
const STREET = [
  "Lindenweg", "Ahornstraße", "Gartenstraße", "Bahnhofstraße", "Kirchgasse",
  "Rosenweg", "Birkenallee", "Schulstraße", "Feldweg", "Parkstraße",
];
const PLZ_CITY: [string, string][] = [
  ["10115", "Berlin"], ["80333", "München"], ["20099", "Hamburg"],
  ["50668", "Köln"], ["60313", "Frankfurt am Main"], ["70174", "Stuttgart"],
];

/** djb2 — tiny, stable, deterministic. Only used to pick from a pool. */
export function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

const pick = <T>(arr: T[], seed: string): T => arr[hash(seed) % arr.length];

const asciiFold = (s: string) =>
  s.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "");

/** A realistic same-kind replacement for `real`. Stable per `real`. */
export function fakeFor(real: string, kind: PiiKind): string {
  switch (kind) {
    case "name":
      return `${pick(FIRST, real + "·f")} ${pick(LAST, real + "·l")}`;

    case "address": {
      const [plz, city] = pick(PLZ_CITY, real + "·c");
      const no = (hash(real + "·n") % 98) + 1;
      return `${pick(STREET, real + "·s")} ${no}, ${plz} ${city}`;
    }

    case "email": {
      const f = asciiFold(pick(FIRST, real + "·f"));
      const l = asciiFold(pick(LAST, real + "·l"));
      return `${f}.${l}@example.de`;
    }

    case "phone": {
      const n = String((hash(real + "·p") % 9_000_000) + 1_000_000);
      return `+49 30 ${n}`;
    }

    case "iban": {
      // 22-char shape (DE + 2 check + 18 BBAN). Not mod-97 valid — a shape, not a number.
      const digits = String(hash(real + "·i")).padStart(10, "0");
      const bban = (digits + digits).slice(0, 18);
      return `DE${((hash(real) % 90) + 10)} ${bban.slice(0, 4)} ${bban.slice(4, 8)} ${bban.slice(8, 12)} ${bban.slice(12, 16)} ${bban.slice(16, 18)}`;
    }

    case "tax-id":
      return String(hash(real + "·t")).padStart(11, "0").slice(0, 11);

    case "date": {
      // shift by a deterministic 40–400 days, keep dd.mm.yyyy
      const base = Date.UTC(2026, 0, 1);
      const shifted = new Date(base + ((hash(real + "·d") % 360) + 40) * 86_400_000);
      const p = (n: number) => String(n).padStart(2, "0");
      return `${p(shifted.getUTCDate())}.${p(shifted.getUTCMonth() + 1)}.${shifted.getUTCFullYear()}`;
    }

    default:
      return `Angabe ${(hash(real) % 900) + 100}`;
  }
}
