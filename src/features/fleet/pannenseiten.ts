import {
  antworten,
  gehe,
  weiche,
  kannZurueck,
  zurueck,
  type Ablaufzustand,
  type Abschlussart,
  type SchrittId,
} from './pannenablauf';

/**
 * Die Seiten der Panne ohne Oberfläche: Knöpfe im Fuß, ihre Wirkung, Schritt und „← Zurück“. So
 * steht jede Abschlussart an genau einer Stelle, und ein Test sieht, dass keine verloren geht.
 * „Wo ist der Schaden?“ ist Schritt 1 ohne Zurück; eine Gesamtzahl gibt es nicht.
 */

/** Was ein Knopf im Fuß bewirkt: zum nächsten Schritt oder die Meldung. */
export type Wirkung =
  | {
      art: 'weiter';
      ziel: SchrittId;
      /** Die Weiterfahrt danach, festgehalten mit der Antwort. */
      transport?: 'carsharing' | 'fahrdienst';
      /** Aus welchem Zweig der Transportteil erreicht wird. */
      herkunft?: 'zuruecklassen' | 'uebergabe';
    }
  | { art: 'melden'; abschlussart: Abschlussart };

export interface Fussknopf {
  text: string;
  /**
   * Der eine Hauptknopf der Seite (DESIGN.md Regel 4); sonst eine Antwort
   * unter mehreren, keine vorgezogen.
   */
  haupt: boolean;
  wirkung: Wirkung;
}

/** „Rad als ‚In Reparatur‘ markieren“ - der Satz, der sagt, dass die Meldung sperrt. */
const SPERRT = 'Rad als „In Reparatur“ markieren';

function hauptknopf(text: string, wirkung: Wirkung): Fussknopf[] {
  return [{ text, haupt: true, wirkung }];
}

/** Die Knöpfe im Fuß eines Schritts, in dieser Reihenfolge. */
export function fussknoepfe(schritt: SchrittId): Fussknopf[] {
  const auswahl: Fussknopf[] = antworten(schritt).map((antwort) => ({
    text: antwort.label,
    haupt: false,
    wirkung: { art: 'weiter', ziel: antwort.ziel },
  }));
  switch (schritt) {
    case 'werkstattVorOrt':
      // „Nein“ meldet gleich: Danach folgt kein Schritt mehr (VOR-08).
      return [
        ...auswahl,
        {
          text: 'Nein',
          haupt: false,
          wirkung: { art: 'melden', abschlussart: 'lokalNichtMoeglich' },
        },
      ];
    case 'fuehrerschein':
      return [
        ...auswahl,
        {
          text: 'Nein',
          haupt: false,
          wirkung: { art: 'weiter', ziel: 'zusammenfassung', transport: 'fahrdienst' },
        },
      ];
    case 'fahrzeugErreichbar':
      return [
        {
          text: 'Ja',
          haupt: false,
          wirkung: { art: 'weiter', ziel: 'zusammenfassung', transport: 'carsharing' },
        },
        {
          text: 'Nein',
          haupt: false,
          wirkung: { art: 'weiter', ziel: 'zusammenfassung', transport: 'fahrdienst' },
        },
      ];
    case 'weiterfahrtMoeglich':
      return hauptknopf('Melden', { art: 'melden', abschlussart: 'meldungOhneSperre' });
    case 'werkstattReparieren':
      return hauptknopf(`Erledigt – ${SPERRT}`, { art: 'melden', abschlussart: 'lokalRepariert' });
    case 'depotBringen':
      return hauptknopf(SPERRT, { art: 'melden', abschlussart: 'depotAbgestellt' });
    case 'radZuruecklassen':
      return hauptknopf('Weiter', {
        art: 'weiter',
        ziel: 'fuehrerschein',
        herkunft: 'zuruecklassen',
      });
    case 'zusammenfassung':
      return hauptknopf(`Bestätigen – ${SPERRT}`, {
        art: 'melden',
        abschlussart: 'transportFortsetzung',
      });
    case 'vertragswerkstattReparieren':
      return hauptknopf(`Erledigt – ${SPERRT}`, {
        art: 'melden',
        abschlussart: 'vertragswerkstattRepariert',
      });
    case 'vertragswerkstattUebergabe':
      return hauptknopf('Weiter', { art: 'weiter', ziel: 'fuehrerschein', herkunft: 'uebergabe' });
    default:
      return auswahl;
  }
}

/**
 * Ob der Schritt den Ablauf abschließt: Sein Hauptknopf meldet die Panne. Der
 * Fuß steht dann mit einer Linie unter dem Inhalt (Baustein, `abschluss`).
 */
export function istAbschluss(schritt: SchrittId): boolean {
  return fussknoepfe(schritt).some((knopf) => knopf.haupt && knopf.wirkung.art === 'melden');
}

/**
 * Eine Antwort, die weiterführt. Führt sie zur Ruhetagsweiche, geht es mit
 * `heuteRuhetag` gleich dahinter weiter. Im Zweig „weiter fahrbar“ steht der Text aus
 * den markierten Stellen schon da (`ausStellen`) - außer es wurde schon etwas
 * geschrieben.
 */
export function weiterMit(
  zustand: Ablaufzustand,
  wirkung: Extract<Wirkung, { art: 'weiter' }>,
  ausStellen: string,
  heuteRuhetag = false,
): Ablaufzustand {
  const vorbelegt =
    wirkung.ziel === 'weiterfahrtMoeglich' && zustand.freitext.trim() === ''
      ? { freitext: ausStellen }
      : {};
  return gehe(
    {
      ...zustand,
      ...vorbelegt,
      ...(wirkung.transport ? { transport: wirkung.transport } : {}),
      ...(wirkung.herkunft ? { herkunft: wirkung.herkunft } : {}),
    },
    // Die Ruhetagsweiche beantwortet der Tag (BEF-176).
    weiche(wirkung.ziel, heuteRuhetag),
  );
}

/**
 * „Schritt n“: „Wo ist der Schaden?“ ist Schritt 1, die erste Frage der
 * Vorlage Schritt 2, jede weitere zählt den Weg dorthin.
 */
export function schrittnummer(zustand: Ablaufzustand, amRad: boolean): number {
  return amRad ? 1 : zustand.verlauf.length + 2;
}

/**
 * Wohin „← Zurück“ - auch die Zurückgeste - führt: dorthin, woher man kam;
 * von der ersten Frage der Vorlage zu „Wo ist der Schaden?“ (`'schaden'`).
 * `null` dort selbst: Es ist die erste Seite des Fensters.
 */
export function vorigeSeite(
  zustand: Ablaufzustand,
  amRad: boolean,
): Ablaufzustand | 'schaden' | null {
  if (amRad) return null;
  if (!kannZurueck(zustand)) return 'schaden';
  return zurueck(zustand);
}
