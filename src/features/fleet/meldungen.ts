import type { FleetReport } from './api';
import { checkItemLabels, type CheckItemKey } from './zones';
import { SEITEN, type SeitenKey } from './checkupablauf';
import { tagePlus } from '@/lib/datum';

/**
 * Die Meldungen der Flotte für den Arbeitgeber (FLT-008, ANN-569) ohne
 * Oberfläche: Zeitraum, Filter und die Sätze einer Zeile.
 *
 * Gefiltert wird nach Art und Rad, nie nach Person (PROJECT_PRINCIPLES.md
 * 20): Wer geprüft oder gemeldet hat, steht am Ereignis, wird aber weder
 * gezählt noch ausgewählt.
 */

export const ZEITRAEUME = [
  { wert: '30', text: 'Letzte 30 Tage', tage: 30 },
  { wert: '90', text: 'Letzte 90 Tage', tage: 90 },
  { wert: '365', text: 'Letztes Jahr', tage: 365 },
] as const;

export type Zeitraum = (typeof ZEITRAEUME)[number]['wert'];

export const STANDARD_ZEITRAUM: Zeitraum = '90';

export function istZeitraum(wert: string | null): wert is Zeitraum {
  return ZEITRAEUME.some((eintrag) => eintrag.wert === wert);
}

/** Der erste Tag eines Zeitraums, von heute (in der Zeit der Praxis) aus. */
export function abTag(heute: string, zeitraum: Zeitraum): string {
  const tage = ZEITRAEUME.find((eintrag) => eintrag.wert === zeitraum)!.tage;
  return tagePlus(heute, -tage);
}

export const ARTEN = [
  { wert: 'alle', text: 'Check-Ups und Pannen' },
  { wert: 'checkup', text: 'Nur Check-Ups' },
  { wert: 'breakdown', text: 'Nur Pannen' },
] as const;

export type Artfilter = (typeof ARTEN)[number]['wert'];

export function istArtfilter(wert: string | null): wert is Artfilter {
  return ARTEN.some((eintrag) => eintrag.wert === wert);
}

export function filtere(
  meldungen: readonly FleetReport[],
  filter: { art: Artfilter; rad: string | null },
): FleetReport[] {
  return meldungen.filter(
    (meldung) =>
      (filter.art === 'alle' || meldung.kind === filter.art) &&
      (filter.rad === null || meldung.bike_id === filter.rad),
  );
}

/** Die Räder, die in den Meldungen vorkommen, nach Namen. */
export function raederDerMeldungen(
  meldungen: readonly FleetReport[],
): { id: string; name: string }[] {
  const raeder = new Map<string, string>();
  for (const meldung of meldungen) raeder.set(meldung.bike_id, meldung.bike_name);
  return [...raeder]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

type CheckupMeldung = Extract<FleetReport, { kind: 'checkup' }>;

function pruefpunkte(meldung: CheckupMeldung, wert: 'problem' | 'beobachten'): string[] {
  return meldung.items
    .filter((item) => item.rating === wert)
    .map((item) => checkItemLabels[item.key as CheckItemKey] ?? item.key);
}

/** „Problem: Bremsen“, „Beobachten: Reifen und Luftdruck“ oder „Alles in Ordnung“. */
export function ergebnis(meldung: CheckupMeldung): string[] {
  const probleme = pruefpunkte(meldung, 'problem');
  const beobachten = pruefpunkte(meldung, 'beobachten');
  if (probleme.length === 0 && beobachten.length === 0) return ['Alles in Ordnung'];
  return [
    probleme.length > 0 ? `Problem: ${probleme.join(', ')}` : '',
    beobachten.length > 0 ? `Beobachten: ${beobachten.join(', ')}` : '',
  ].filter(Boolean);
}

/**
 * Die Seiten ohne Foto - nur für einen Check-Up, der die Seitenfotos schon
 * verlangte (ANN-568: mit Angabe zu den Werbeflächen). Ein Foto, das nicht
 * übertragen wurde, fehlt hier auch.
 */
export function fehlendeSeiten(meldung: CheckupMeldung): { key: SeitenKey; label: string }[] {
  if (meldung.ad_surfaces === null) return [];
  const da = new Set(meldung.photos.map((foto) => foto.side));
  return SEITEN.filter((seite) => !da.has(seite.key)).map((seite) => ({
    key: seite.key,
    label: seite.label,
  }));
}

/** Die Werbeflächen als Satz; `null` vor der Einführung (nicht erfasst). */
export function werbeflaechen(meldung: CheckupMeldung): string | null {
  if (meldung.ad_surfaces === null) return null;
  return meldung.ad_surfaces === 'wiped'
    ? 'Werbeflächen abgewischt'
    : `Werbeflächen nicht abgewischt: ${meldung.ad_surfaces_note ?? ''}`.trim();
}

/** „Check-Up“ oder „Panne“ mit dem Rad, für Titel und Zeile. */
export function meldungstitel(meldung: FleetReport): string {
  return `${meldung.kind === 'checkup' ? 'Check-Up' : 'Panne'} · ${meldung.bike_name}`;
}

/** Der Weg zu einer Meldung: Art und Kennung, nie ein Name (ADR-011). */
export function meldungsPfad(meldung: Pick<FleetReport, 'kind' | 'id'>): string {
  return `/betrieb/flotte/meldungen/${meldung.kind === 'checkup' ? 'checkup' : 'panne'}/${meldung.id}`;
}
