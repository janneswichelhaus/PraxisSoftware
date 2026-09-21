import type { MapOverlayStop } from '@/lib/location/contract';

/**
 * Die Stopps des Kartenprototyps (MAP-002b, ADR-019 Punkt 24).
 *
 * **Acht erfundene Punkte im Stadtgebiet von Tübingen.** Sie stammen nicht aus
 * dem Seed, gehören zu keiner Adresse, zu keinem Termin und zu keiner Person;
 * sie wurden hier ausgewürfelt, damit sich der Kartenausschnitt, die
 * Nummerierung und später Route und Fahrzeit an etwas zeigen lassen. Wer die
 * Punkte besucht, steht vor einer beliebigen Stelle der Stadt.
 *
 * Sie stehen bewusst **im Code** und nicht im Seed: Ein Testdatensatz in der
 * Datenbank sähe aus wie ein Bestand und würde irgendwann wie einer behandelt
 * (`MAP-LOOPS.md`). Mit MAP-006 verschwindet diese Konstante und die Stopps
 * kommen aus der Tagesplanung - dann aber erst nach dem Gate aus ADR-019
 * Punkt 9.
 *
 * Der Typ trägt nur Koordinate und Nummer. Ein Name oder eine Kennung ist
 * hier nicht „noch nicht ergänzt", sondern ausgeschlossen: Was der
 * Kartendienst nicht sehen darf, kann ihm über `MapOverlayStop` nicht
 * übergeben werden (ADR-019 Punkt 12).
 */
export const TESTSTOPPS: readonly MapOverlayStop[] = [
  { position: { lat: 48.5216, lon: 9.0576 }, label: '1' },
  { position: { lat: 48.5305, lon: 9.049 }, label: '2' },
  { position: { lat: 48.5164, lon: 9.0349 }, label: '3' },
  { position: { lat: 48.5092, lon: 9.0655 }, label: '4' },
  { position: { lat: 48.5241, lon: 9.0762 }, label: '5' },
  { position: { lat: 48.5387, lon: 9.0668 }, label: '6' },
  { position: { lat: 48.5024, lon: 9.0411 }, label: '7' },
  { position: { lat: 48.5145, lon: 9.0908 }, label: '8' },
];

/**
 * Das Stadtgebiet, in dem die Stopps liegen müssen.
 *
 * Steht hier und nicht nur im Test: Wer einen Stopp ergänzt oder verschiebt,
 * soll den zulässigen Rahmen neben den Werten sehen.
 */
export const TUEBINGEN_RAHMEN = {
  sued: 48.47,
  nord: 48.56,
  west: 8.98,
  ost: 9.12,
} as const;
