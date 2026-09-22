/**
 * Ist der nächste Termin nach dem vorigen überhaupt zu erreichen? (MAP-004b)
 *
 * Eine reine Funktion: Sie rechnet mit Sekunden und sonst nichts. Sie kennt
 * keinen Kartendienst, keinen Anbieter, keine Person und keinen Termin — nur
 * zwei Zeitpunkte, eine Fahrzeit und einen Puffer. Genau deshalb steht sie
 * hier im Fachmodul und nicht neben dem Adapter: Ein Anbieterwechsel hinter
 * `src/lib/location/contract.ts` lässt sie unberührt (ADR-019 Punkt 1).
 *
 * **Deterministisch, versionierbar, testbar** — §6.2 und ADR-005 Punkt 6
 * verlangen das für Termin- und Fahrzeitberechnungen ausdrücklich. Kein
 * Sprachmodell steht in diesem Ergebnispfad, und dieselben Zahlen ergeben
 * immer dieselbe Antwort.
 *
 * **Das Ergebnis ist eine Warnung, kein Verbot** (ADR-019, B6). Es entscheidet
 * nichts, es blockiert nichts, es wird nicht gespeichert und nicht je Person
 * ausgewertet (§20). Wer den Weg trotzdem fährt, weiß meistens mehr als die
 * Rechnung: eine Abkürzung, eine kurze Absage, einen Aufzug, der schneller ist
 * als gedacht.
 */

/**
 * Was die Rechnung sagen kann.
 *
 * Drei Werte, weil es drei Lagen gibt — und weil „unbekannt" nicht als
 * „erreichbar" durchgehen darf: Ohne Fahrzeit ist der Weg nicht geprüft,
 * nicht kurz.
 */
export type Erreichbarkeit = 'erreichbar' | 'nicht_erreichbar' | 'unbekannt';

/**
 * Passt die Fahrt zwischen zwei Termine?
 *
 * `endeVorher` und `beginnNachher` sind Zeitpunkte in Sekunden, in derselben
 * Skala — gerechnet wird nur mit ihrem Abstand, deshalb ist gleichgültig, ob
 * sie von Mitternacht oder von 1970 an zählen. `fahrzeitSekunden` ist `null`,
 * wenn keine vorliegt oder der Kartendienst keinen Weg gefunden hat.
 * `pufferSekunden` ist die Zeit, die neben der reinen Fahrt übrig bleiben soll
 * — Abstellen, Klingeln, Treppe.
 *
 * **Im Zweifel `unbekannt`, nie `erreichbar`.** Eine fehlende oder unsinnige
 * Zahl macht die Lage unklar; sie als „geht schon" zu lesen wäre die einzige
 * Antwort, die jemanden zu spät kommen ließe, ohne ihn zu warnen.
 *
 * Genau passend zählt als erreichbar: Wer die Lücke exakt ausfüllt, kommt an.
 * Der Sicherheitsabstand ist der Puffer, und der ist schon eingerechnet — ihn
 * ein zweites Mal aufzuschlagen hieße, eine Zahl zu erfinden.
 */
export function erreichbarkeit(
  endeVorher: number,
  beginnNachher: number,
  fahrzeitSekunden: number | null,
  pufferSekunden: number,
): Erreichbarkeit {
  if (fahrzeitSekunden === null) return 'unbekannt';
  if (!endlich(endeVorher) || !endlich(beginnNachher)) return 'unbekannt';
  if (!endlich(fahrzeitSekunden) || fahrzeitSekunden < 0) return 'unbekannt';
  if (!endlich(pufferSekunden) || pufferSekunden < 0) return 'unbekannt';

  const luecke = beginnNachher - endeVorher;
  const gebraucht = fahrzeitSekunden + pufferSekunden;
  return luecke >= gebraucht ? 'erreichbar' : 'nicht_erreichbar';
}

function endlich(wert: number): boolean {
  return Number.isFinite(wert);
}
