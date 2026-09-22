/**
 * Ein erfundener Tag über den Teststopps (MAP-004c).
 *
 * Die Fahrzeitmatrix allein sagt nur, wie lange man fährt. Ob das **reicht**,
 * hängt am Tag: Wann endet der eine Termin, wann beginnt der nächste? Dieses
 * Raster liefert die Zeiten dafür — und zwar frei erfunden, wie die Stopps
 * selbst. Es gehört zu keiner Person, zu keinem Termin und zu keinem Kalender;
 * mit **MAP-006** kommen echte Termine an diese Stelle, aber erst nach dem
 * Gate aus ADR-019 Punkt 9.
 *
 * **Auch der Puffer gehört zum Raster und ist keine Regel der Praxis.** Wie
 * viel Zeit neben der reinen Fahrt übrig bleiben soll — Abstellen, Klingeln,
 * Treppe —, entscheidet sich an echten Wegen und nicht an acht ausgewürfelten
 * Punkten. Die Frage gehört zu MAP-006 und steht dort in der Roadmap; bis
 * dahin ist die Zahl hier eine Annahme des Prototyps und nichts sonst.
 *
 * Der Zuschnitt ist absichtlich eng: 45 Minuten von Beginn zu Beginn, davon
 * 30 Minuten Behandlung, bleiben 15 Minuten für den Weg. In Tübingen liegt
 * damit ein Teil der Stopps in Reichweite und ein Teil nicht — genau das soll
 * die Tabelle zeigen. Ein weiter Takt zeigte lauter grüne Zellen und damit
 * nichts.
 */

/** Beginn des ersten Termins, Sekunden seit Mitternacht (8:00 Uhr Ortszeit). */
const ERSTER_BEGINN = 8 * 60 * 60;

/** Abstand von Beginn zu Beginn. */
const TAKT_SEKUNDEN = 45 * 60;

/** Dauer einer Behandlung im Raster. */
export const BEHANDLUNG_SEKUNDEN = 30 * 60;

/** Zeit neben der Fahrt: Rad abstellen, klingeln, Treppe. Prototypzahl, siehe oben. */
export const PUFFER_SEKUNDEN = 5 * 60;

/** Wann der Termin am Stopp mit diesem Index beginnt. */
export function beginnSekunden(index: number): number {
  return ERSTER_BEGINN + index * TAKT_SEKUNDEN;
}

/** Wann er endet. */
export function endeSekunden(index: number): number {
  return beginnSekunden(index) + BEHANDLUNG_SEKUNDEN;
}

/** Uhrzeit als `8:00` — für die Kopfzeile der Tabelle, nicht für eine Akte. */
export function uhrzeit(sekunden: number): string {
  const stunden = Math.floor(sekunden / 3600);
  const minuten = Math.floor((sekunden % 3600) / 60);
  return `${stunden}:${String(minuten).padStart(2, '0')}`;
}
