import type { Personenumsatz, Umsatzmonat } from './api';

/**
 * Daten für die Grafiken der Statistikseite (STA-007) — rein rechnend, ohne
 * Oberfläche, damit sich jede Aufbereitung ohne gerenderte Seite prüfen lässt.
 */

export const REIHEN = [
  'var(--color-reihe-1)',
  'var(--color-reihe-2)',
  'var(--color-reihe-3)',
  'var(--color-reihe-4)',
  'var(--color-reihe-5)',
  'var(--color-reihe-6)',
] as const;

/** Für „Weitere" und „ohne Zuordnung": keine Reihenfarbe, sondern die Linie. */
export const REIHE_REST = 'var(--color-line-strong)';

export interface Reihe {
  /** Eindeutig, auch wenn zwei Personen gleich heißen. */
  schluessel?: string;
  name: string;
  farbe: string;
  werte: number[];
  /** Säule (Standard) oder Punkt auf derselben Achse. */
  art?: 'saeule' | 'punkt';
}

export interface Kategorie {
  label: string;
  /** Kurzform an der Achse, wenn es eng wird. */
  kurz?: string;
}

/** Gut lesbare Rasterschritte: 1, 2, 2,5 oder 5 mal einer Zehnerpotenz. */
export function rasterschritte(maximum: number, anzahl = 4): number[] {
  if (!(maximum > 0)) return [0];
  const roh = maximum / anzahl;
  const potenz = 10 ** Math.floor(Math.log10(roh));
  const schritt = [1, 2, 2.5, 5, 10].map((f) => f * potenz).find((s) => s >= roh) ?? 10 * potenz;
  const schritte: number[] = [];
  for (let wert = 0; wert <= maximum + schritt * 0.999; wert += schritt) {
    schritte.push(Math.round(wert * 1000) / 1000);
  }
  return schritte;
}

const MONATE_LANG = new Intl.DateTimeFormat('de-DE', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const MONATE_KURZ = new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: 'UTC' });

function alsDatum(isoTag: string): Date {
  const [jahr, monat] = isoTag.split('-').map(Number);
  return new Date(Date.UTC(jahr!, monat! - 1, 1));
}

/** „2026-09-01" wird „Sept. 2026", an der Achse kurz „Sept.". */
export function monatsKategorie(isoTag: string): Kategorie {
  const datum = alsDatum(isoTag);
  return { label: MONATE_LANG.format(datum), kurz: MONATE_KURZ.format(datum) };
}

/** Umsatz als Säulen, Zahlungseingang als Punkte - zwei Reihen, nie verrechnet (ANN-151). */
export function umsatzReihen(monate: Umsatzmonat[]): { kategorien: Kategorie[]; reihen: Reihe[] } {
  return {
    kategorien: monate.map((m) => monatsKategorie(m.month)),
    reihen: [
      {
        name: 'Umsatz (Rechnungsstellung)',
        farbe: REIHEN[0],
        werte: monate.map((m) => m.revenue_cents),
      },
      {
        name: 'Zahlungseingang',
        farbe: REIHEN[1],
        werte: monate.map((m) => m.payments_cents),
        art: 'punkt',
      },
    ],
  };
}

/** Wie viele Personen eine eigene Farbe bekommen; der Rest wird „Weitere". */
export const PERSONEN_MIT_FARBE = REIHEN.length;

/**
 * Umsatz je Person als gestapelte Reihen (ANN-156).
 *
 * Jede Person behält ihre Farbe, solange die Menge gleich bleibt: sortiert
 * wird nach Name, nie nach Umsatz — die Farbe folgt der Person, nicht dem
 * Rang. Ab der sechsten Person und für „ohne Zuordnung" gibt es eine
 * gemeinsame Reihe „Weitere" ohne Reihenfarbe.
 */
export function personenReihen(
  zeilen: Personenumsatz[],
  monate: string[],
): { kategorien: Kategorie[]; reihen: Reihe[] } {
  const personen = new Map<string, string>();
  for (const z of zeilen) {
    if (z.staff_member_id) personen.set(z.staff_member_id, z.staff_name ?? 'Ohne Namen');
  }
  const sortiert = [...personen.entries()].sort(
    (a, b) => a[1].localeCompare(b[1], 'de') || a[0].localeCompare(b[0]),
  );
  const mitFarbe = sortiert.slice(0, PERSONEN_MIT_FARBE);
  const index = new Map(monate.map((m, i) => [m, i]));

  const reihen: Reihe[] = mitFarbe.map(([id, name], i) => ({
    schluessel: id,
    name,
    farbe: REIHEN[i]!,
    werte: monate.map(() => 0),
  }));
  const rest: Reihe = {
    schluessel: 'rest',
    name: 'Weitere',
    farbe: REIHE_REST,
    werte: monate.map(() => 0),
  };
  let nurOhneZuordnung = true;
  const reiheVon = new Map(mitFarbe.map(([id], i) => [id, reihen[i]!]));

  for (const z of zeilen) {
    const i = index.get(z.month);
    if (i === undefined) continue;
    const reihe = (z.staff_member_id && reiheVon.get(z.staff_member_id)) || rest;
    if (reihe === rest && z.staff_member_id) nurOhneZuordnung = false;
    reihe.werte[i] = (reihe.werte[i] ?? 0) + z.revenue_cents;
  }
  if (rest.werte.some((w) => w !== 0)) {
    // Ohne weitere Personen ist der Rest nur, was keiner Person zugeordnet
    // werden kann (ANN-156) - dann heißt er auch so.
    if (nurOhneZuordnung) rest.name = 'Ohne Zuordnung';
    reihen.push(rest);
  }

  return { kategorien: monate.map(monatsKategorie), reihen };
}

/** Die letzten `anzahl` Monatsanfänge bis zum Monat von `heute`, ältester zuerst. */
export function letzteMonate(heute: string, anzahl: number): string[] {
  const [jahr, monat] = heute.split('-').map(Number);
  return Array.from({ length: anzahl }, (_, i) => {
    const d = new Date(Date.UTC(jahr!, monat! - anzahl + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  });
}

/** Euro ohne Cent für Achsen: „12.000 €", „1,5 Tsd. €" wäre schwerer zu lesen. */
export function euroKurz(cent: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(cent / 100);
}
