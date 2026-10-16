import { describe, expect, it } from 'vitest';
import { ABSCHLUSSARTEN, ablaufStarten, gehe, type SchrittId } from './pannenablauf';
import {
  fussknoepfe,
  istAbschluss,
  schrittnummer,
  vorigeSeite,
  weiterMit,
  type Wirkung,
} from './pannenseiten';

/**
 * Die Panne im Fenster (Überholung 6, G3): die Knöpfe im Fuß je Schritt, der
 * Schritt ohne Gesamtzahl und „← Zurück“. Die Verzweigungen der Vorlage prüft
 * `pannenablauf.test.ts`; hier, dass das Fenster keine verliert.
 */

const SCHRITTE: SchrittId[] = [
  'weiterfahrt',
  'weiterfahrtMoeglich',
  'schadensgroesse',
  'werkstattNah',
  'werkstattVorOrt',
  'werkstattReparieren',
  'ruhetag',
  'depotErreichbar',
  'depotBringen',
  'radZuruecklassen',
  'fuehrerschein',
  'fahrzeugErreichbar',
  'zusammenfassung',
  'vertragswerkstattNah',
  'vertragswerkstattKontakt',
  'vertragswerkstattReparieren',
  'vertragswerkstattUebergabe',
];

function texte(schritt: SchrittId) {
  return fussknoepfe(schritt).map((knopf) => knopf.text);
}

function wirkung(schritt: SchrittId, text: string): Wirkung | undefined {
  return fussknoepfe(schritt).find((knopf) => knopf.text === text)?.wirkung;
}

describe('Panne im Fenster – Knöpfe im Fuß', () => {
  it('gibt jedem Schritt der Vorlage einen Weg weiter und höchstens einen Hauptknopf', () => {
    for (const schritt of SCHRITTE) {
      const knoepfe = fussknoepfe(schritt);
      expect(knoepfe.length, schritt).toBeGreaterThan(0);
      expect(knoepfe.filter((knopf) => knopf.haupt).length, schritt).toBeLessThanOrEqual(1);
      // Antworten und Hauptknopf mischen sich nicht: Eine Frage hat keine
      // vorgezogene Antwort (nichts vorbelegt).
      if (knoepfe.some((knopf) => knopf.haupt)) expect(knoepfe, schritt).toHaveLength(1);
    }
  });

  it('erreicht jede der sechs Abschlussarten an genau einer Stelle', () => {
    const gemeldet = SCHRITTE.flatMap((schritt) =>
      fussknoepfe(schritt).flatMap((knopf) =>
        knopf.wirkung.art === 'melden' ? [knopf.wirkung.abschlussart] : [],
      ),
    );
    expect([...gemeldet].sort()).toEqual([...ABSCHLUSSARTEN].sort());
  });

  it('führt die Antworten der Vorlage unverändert weiter', () => {
    expect(texte('weiterfahrt')).toEqual(['Ja', 'Nein']);
    expect(wirkung('weiterfahrt', 'Nein')).toEqual({ art: 'weiter', ziel: 'weiterfahrtMoeglich' });
    expect(texte('schadensgroesse')).toEqual(['Klein', 'Groß']);
    expect(wirkung('ruhetag', 'Nein')).toEqual({ art: 'weiter', ziel: 'vertragswerkstattNah' });
  });

  it('meldet bei „Reparatur vor Ort nicht möglich“ gleich, ohne weiteren Schritt', () => {
    expect(texte('werkstattVorOrt')).toEqual(['Ja', 'Nein']);
    expect(wirkung('werkstattVorOrt', 'Nein')).toEqual({
      art: 'melden',
      abschlussart: 'lokalNichtMoeglich',
    });
  });

  it('hält den Transport mit der Antwort fest', () => {
    expect(wirkung('fuehrerschein', 'Ja')).toEqual({ art: 'weiter', ziel: 'fahrzeugErreichbar' });
    expect(wirkung('fuehrerschein', 'Nein')).toEqual({
      art: 'weiter',
      ziel: 'zusammenfassung',
      transport: 'fahrdienst',
    });
    expect(wirkung('fahrzeugErreichbar', 'Ja')).toMatchObject({ transport: 'carsharing' });
    expect(wirkung('fahrzeugErreichbar', 'Nein')).toMatchObject({ transport: 'fahrdienst' });
  });

  it('nennt im Hauptknopf, wenn die Meldung das Rad sperrt', () => {
    expect(texte('weiterfahrtMoeglich')).toEqual(['Melden']);
    expect(texte('depotBringen')).toEqual(['Rad als „In Reparatur“ markieren']);
    expect(texte('zusammenfassung')).toEqual(['Bestätigen – Rad als „In Reparatur“ markieren']);
    expect(texte('werkstattReparieren')).toEqual(['Erledigt – Rad als „In Reparatur“ markieren']);
  });

  it('kennt die Seiten, die abschließen', () => {
    expect(SCHRITTE.filter(istAbschluss)).toEqual([
      'weiterfahrtMoeglich',
      'werkstattReparieren',
      'depotBringen',
      'zusammenfassung',
      'vertragswerkstattReparieren',
    ]);
  });
});

describe('Panne im Fenster – weiter, Schritt, zurück', () => {
  it('füllt „Was ist auffällig?“ aus den Stellen vor, ohne Geschriebenes zu ersetzen', () => {
    const start = ablaufStarten('r1');
    const nein = { art: 'weiter', ziel: 'weiterfahrtMoeglich' } as const;
    expect(weiterMit(start, nein, 'Bremse vorne: schleift').freitext).toBe(
      'Bremse vorne: schleift',
    );
    expect(weiterMit({ ...start, freitext: 'Klingel' }, nein, 'Bremse').freitext).toBe('Klingel');
    // Andere Ziele lassen den Text, wie er ist.
    const ja = { art: 'weiter', ziel: 'schadensgroesse' } as const;
    expect(weiterMit(start, ja, 'Bremse').freitext).toBe('');
  });

  it('legt Herkunft und Transport mit dem Schritt ab', () => {
    const start = gehe(ablaufStarten('r1'), 'radZuruecklassen');
    const weiter = weiterMit(
      start,
      { art: 'weiter', ziel: 'fuehrerschein', herkunft: 'zuruecklassen' },
      '',
    );
    expect(weiter).toMatchObject({ schritt: 'fuehrerschein', herkunft: 'zuruecklassen' });
    expect(weiter.verlauf).toEqual(['weiterfahrt', 'radZuruecklassen']);
    const ohne = weiterMit(
      weiter,
      { art: 'weiter', ziel: 'zusammenfassung', transport: 'fahrdienst' },
      '',
    );
    expect(ohne).toMatchObject({ schritt: 'zusammenfassung', transport: 'fahrdienst' });
  });

  it('zählt „Wo ist der Schaden?“ als Schritt 1, ohne Gesamtzahl', () => {
    const start = ablaufStarten('r1');
    expect(schrittnummer(start, true)).toBe(1);
    expect(schrittnummer(start, false)).toBe(2);
    expect(schrittnummer(gehe(gehe(start, 'schadensgroesse'), 'ruhetag'), false)).toBe(4);
  });

  it('geht dorthin zurück, woher man kam - von der ersten Frage zum Rad', () => {
    const start = ablaufStarten('r1');
    expect(vorigeSeite(start, true)).toBeNull();
    expect(vorigeSeite(start, false)).toBe('schaden');
    const tiefer = gehe(gehe(start, 'schadensgroesse'), 'ruhetag');
    expect(vorigeSeite(tiefer, false)).toMatchObject({
      schritt: 'schadensgroesse',
      verlauf: ['weiterfahrt'],
    });
  });
});
