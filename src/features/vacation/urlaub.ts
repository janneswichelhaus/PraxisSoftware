import { plusTage } from '@/features/preview/demodaten';
import type { Mitarbeitende, Urlaubsantrag } from '@/features/preview/types';

/**
 * Rechnen mit Urlaubszeiträumen.
 *
 * Reine Funktionen ohne Oberfläche, damit Überschneidung, Resturlaub und
 * Wochenbelegung testbar sind. Kalendertage werden als `YYYY-MM-DD`
 * behandelt und über UTC gerechnet - Ortszeit spielt hier keine Rolle.
 */

/** Werktage (Mo–Fr) eines Zeitraums, Grenzen eingeschlossen. */
export function werktageImZeitraum(von: string, bis: string): number {
  if (!von || !bis || bis < von) return 0;
  let tag = von;
  let anzahl = 0;
  // Der Zeitraum ist fachlich begrenzt; die Schleife hat eine harte Obergrenze,
  // damit ein Tippfehler im Datum nicht zur Endlosschleife wird.
  for (let schritt = 0; schritt < 400 && tag <= bis; schritt += 1) {
    const wochentag = new Date(`${tag}T00:00:00Z`).getUTCDay();
    if (wochentag !== 0 && wochentag !== 6) anzahl += 1;
    tag = plusTage(tag, 1);
  }
  return anzahl;
}

export function ueberschneidet(
  a: { von: string; bis: string },
  b: { von: string; bis: string },
): boolean {
  return a.von <= b.bis && b.von <= a.bis;
}

/**
 * Andere Anträge derselben Person, die sich mit dem Zeitraum überschneiden.
 *
 * Abgelehnte Anträge zählen nicht mit: sie blockieren nichts.
 */
export function ueberschneidungen(
  antraege: Urlaubsantrag[],
  mitarbeiterId: string,
  zeitraum: { von: string; bis: string },
  eigeneId?: string,
): Urlaubsantrag[] {
  return antraege.filter(
    (antrag) =>
      antrag.mitarbeiterId === mitarbeiterId &&
      antrag.id !== eigeneId &&
      antrag.status !== 'abgelehnt' &&
      ueberschneidet(antrag, zeitraum),
  );
}

/** Anträge anderer Personen im selben Zeitraum - relevant für die Kapazität. */
export function zeitgleicheAbwesenheiten(
  antraege: Urlaubsantrag[],
  zeitraum: { von: string; bis: string },
  ohneMitarbeiterId: string,
): Urlaubsantrag[] {
  return antraege.filter(
    (antrag) =>
      antrag.mitarbeiterId !== ohneMitarbeiterId &&
      antrag.status === 'genehmigt' &&
      ueberschneidet(antrag, zeitraum),
  );
}

interface Urlaubskonto {
  anspruch: number;
  uebertrag: number;
  genehmigt: number;
  beantragt: number;
  rest: number;
}

/**
 * Urlaubskonto einer Person für ein Kalenderjahr.
 *
 * Beantragte und genehmigte Tage werden getrennt geführt: ein offener Antrag
 * ist noch kein verbrauchter Urlaub, darf aber bei der Entscheidung sichtbar
 * sein.
 */
export function urlaubskonto(
  person: Mitarbeitende,
  antraege: Urlaubsantrag[],
  jahr: number,
): Urlaubskonto {
  const eigene = antraege.filter(
    (antrag) => antrag.mitarbeiterId === person.id && antrag.von.startsWith(String(jahr)),
  );
  const genehmigt = eigene
    .filter((antrag) => antrag.status === 'genehmigt')
    .reduce((summe, antrag) => summe + antrag.tage, 0);
  const beantragt = eigene
    .filter((antrag) => antrag.status === 'beantragt')
    .reduce((summe, antrag) => summe + antrag.tage, 0);
  const anspruch = person.urlaubsanspruch;
  return {
    anspruch,
    uebertrag: person.resturlaubVorjahr,
    genehmigt,
    beantragt,
    rest: anspruch + person.resturlaubVorjahr - genehmigt,
  };
}

/** Genehmigte Urlaubswerktage einer Person in der Woche ab `montag`. */
export function urlaubstageInWoche(
  antraege: Urlaubsantrag[],
  mitarbeiterId: string,
  montag: string,
): number {
  const sonntag = plusTage(montag, 6);
  let tage = 0;
  for (const antrag of antraege) {
    if (antrag.mitarbeiterId !== mitarbeiterId) continue;
    if (antrag.status !== 'genehmigt') continue;
    if (!ueberschneidet(antrag, { von: montag, bis: sonntag })) continue;
    const von = antrag.von > montag ? antrag.von : montag;
    const bis = antrag.bis < sonntag ? antrag.bis : sonntag;
    tage += werktageImZeitraum(von, bis);
  }
  return Math.min(tage, 5);
}
