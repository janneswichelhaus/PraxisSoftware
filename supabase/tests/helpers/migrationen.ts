import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ORDNER = path.join(import.meta.dirname, '../../migrations');

/** Alle Migrationen als ein Text, in der Reihenfolge, in der sie eingespielt werden. */
export function migrationen(): string {
  return readdirSync(ORDNER)
    .filter((datei) => datei.endsWith('.sql'))
    .sort()
    .map((datei) => readFileSync(path.join(ORDNER, datei), 'utf8'))
    .join('\n');
}

function letzte(text: string, muster: string): number {
  // eslint-disable-next-line security/detect-non-literal-regexp -- Muster aus einem Namen im Test, maskiert.
  const treffer = [...text.matchAll(new RegExp(muster, 'gi'))].at(-1);
  if (treffer?.index === undefined) throw new Error(`${muster} fehlt in den Migrationen.`);
  return treffer.index;
}

const maskiert = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Die Werte der jüngsten Fassung einer CHECK-Constraint, ob von Hand als `spalte in ('a', …)`
 * oder im Abzug der Basis als `spalte = ANY (ARRAY['a'::text, …])` geschrieben.
 */
export function erlaubteWerte(constraint: string, text = migrationen()): string[] {
  const ab = text.slice(letzte(text, `constraint\\s+${maskiert(constraint)}\\s+check\\s*\\(`));
  const liste = /\bin\s*\(([^)]*)\)|\bARRAY\[([^\]]*)\]/i.exec(ab);
  return [...(liste?.[1] ?? liste?.[2] ?? '').matchAll(/'([a-z_]+)'/g)].map((t) => t[1]!);
}

/** Der Text ab der jüngsten Fassung einer Funktion; der Abzug schreibt CREATE FUNCTION groß. */
export function letzteFassung(funktion: string, text = migrationen()): string {
  return text.slice(
    letzte(text, `create\\s+(?:or\\s+replace\\s+)?function\\s+${maskiert(funktion)}\\(`),
  );
}
