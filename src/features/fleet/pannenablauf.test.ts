import { describe, expect, it } from 'vitest';
import { standortvorlageKoeln } from '@/features/preview/standortvorlage';
import {
  ablaufStarten,
  abschluss,
  antworten,
  frage,
  gehe,
  kannZurueck,
  zurueck,
  zusammenfassungspunkte,
  type Abschlusskontext,
  type SchrittId,
} from './pannenablauf';

/**
 * Die Verzweigungen des Pannenablaufs sind der eigentliche Wert der Vorlage.
 * Sie werden hier vollständig geprüft, damit ein späterer Umbau der Oberfläche
 * keinen Zweig verliert.
 */

const vorlage = standortvorlageKoeln;

function kontext(zustand = ablaufStarten('r1')): Abschlusskontext {
  return { vorlage, ersatzrad: 'Lastenrad 5 (Ersatz)', zustand };
}

function ziel(schritt: SchrittId, label: string): SchrittId | undefined {
  return antworten(schritt).find((antwort) => antwort.label === label)?.ziel;
}

describe('Pannenablauf – Einstieg', () => {
  it('ueberspringt die Radauswahl, wenn das Rad bereits bekannt ist', () => {
    expect(ablaufStarten('r1').schritt).toBe('weiterfahrt');
    expect(ablaufStarten(null).schritt).toBe('radwahl');
  });

  it('belegt die Auswahl vor, ueberspringt sie aber nicht', () => {
    // Sonst wuerde beim Einstieg ueber die Werkzeugleiste stillschweigend ein
    // beliebiges Rad gemeldet.
    const zustand = ablaufStarten(null, 'r1');
    expect(zustand.schritt).toBe('radwahl');
    expect(zustand.radId).toBe('r1');
  });

  it('beginnt ohne Verlauf und damit ohne Zurueck', () => {
    expect(kannZurueck(ablaufStarten('r1'))).toBe(false);
  });
});

describe('Pannenablauf – Verzweigungen', () => {
  it.each([
    ['weiterfahrt', 'Ja', 'schadensgroesse'],
    ['weiterfahrt', 'Nein', 'weiterfahrtMoeglich'],
    ['schadensgroesse', 'Klein', 'werkstattNah'],
    ['schadensgroesse', 'Groß', 'ruhetag'],
    ['werkstattNah', 'Ja', 'werkstattVorOrt'],
    ['werkstattNah', 'Nein', 'ruhetag'],
    ['werkstattVorOrt', 'Ja', 'werkstattReparieren'],
    ['ruhetag', 'Ja', 'depotErreichbar'],
    ['ruhetag', 'Nein', 'vertragswerkstattNah'],
    ['depotErreichbar', 'Ja', 'depotBringen'],
    ['depotErreichbar', 'Nein', 'radZuruecklassen'],
    ['fuehrerschein', 'Ja', 'fahrzeugErreichbar'],
    ['vertragswerkstattNah', 'Ja', 'vertragswerkstattKontakt'],
    ['vertragswerkstattNah', 'Nein', 'radZuruecklassen'],
    ['vertragswerkstattKontakt', 'Ja', 'vertragswerkstattReparieren'],
    ['vertragswerkstattKontakt', 'Nein', 'vertragswerkstattUebergabe'],
  ] as const)('fuehrt von %s mit "%s" nach %s', (schritt, label, erwartet) => {
    expect(ziel(schritt, label)).toBe(erwartet);
  });

  it('fuehrt einen kleinen Schaden ohne Werkstatt in der Naehe in denselben Zweig wie einen grossen', () => {
    // Das ist keine Doppelung, sondern der Punkt: Ohne erreichbare Werkstatt
    // hilft die Unterscheidung klein/gross nicht weiter.
    expect(ziel('werkstattNah', 'Nein')).toBe(ziel('schadensgroesse', 'Groß'));
  });

  it('stellt zu jeder Frage einen Text bereit', () => {
    const schritte: SchrittId[] = [
      'radwahl',
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
    for (const schritt of schritte) {
      expect(frage(schritt, vorlage).length).toBeGreaterThan(5);
    }
  });

  it('setzt den Ruhetag aus der Standortvorlage ein', () => {
    expect(frage('ruhetag', vorlage)).toContain(vorlage.werkstatt.ruhetag);
    const andere = { ...vorlage, werkstatt: { ...vorlage.werkstatt, ruhetag: 'Montag' } };
    expect(frage('ruhetag', andere)).toContain('Montag');
  });
});

describe('Pannenablauf – Rueckwaertsnavigation', () => {
  it('kehrt Schritt fuer Schritt zum Ausgangspunkt zurueck', () => {
    let zustand = ablaufStarten('r1');
    zustand = gehe(zustand, 'schadensgroesse');
    zustand = gehe(zustand, 'ruhetag');
    zustand = gehe(zustand, 'depotErreichbar');

    expect(kannZurueck(zustand)).toBe(true);
    zustand = zurueck(zustand);
    expect(zustand.schritt).toBe('ruhetag');
    zustand = zurueck(zustand);
    expect(zustand.schritt).toBe('schadensgroesse');
    zustand = zurueck(zustand);
    expect(zustand.schritt).toBe('weiterfahrt');
    expect(kannZurueck(zustand)).toBe(false);
  });

  it('bleibt am Ausgangspunkt stehen, statt ins Leere zu laufen', () => {
    const zustand = ablaufStarten('r1');
    expect(zurueck(zustand)).toEqual(zustand);
  });

  it('behaelt bereits gemachte Angaben beim Zurueckgehen', () => {
    let zustand = { ...ablaufStarten('r1'), standort: 'Vor dem Haus Nr. 7' };
    zustand = gehe(zustand, 'fuehrerschein');
    zustand = zurueck(zustand);
    expect(zustand.standort).toBe('Vor dem Haus Nr. 7');
  });
});

describe('Pannenablauf – Abschluesse', () => {
  it('sperrt das Rad bei einer Meldung ohne Weiterfahrtshindernis nicht', () => {
    const zustand = { ...ablaufStarten('r1'), freitext: 'Klingel klemmt' };
    const ergebnis = abschluss('meldungOhneSperre', kontext(zustand));
    expect(ergebnis.sperrt).toBe(false);
    expect(ergebnis.text).toContain('Klingel klemmt');
  });

  it('sperrt das Rad bei allen uebrigen Abschluessen', () => {
    for (const art of [
      'lokalNichtMoeglich',
      'lokalRepariert',
      'depotAbgestellt',
      'vertragswerkstattRepariert',
      'transportFortsetzung',
    ] as const) {
      expect(abschluss(art, kontext()).sperrt).toBe(true);
    }
  });

  it('unterscheidet die Zusammenfassung nach dem Zweig, aus dem sie kommt', () => {
    const zuruecklassen = {
      ...ablaufStarten('r1'),
      herkunft: 'zuruecklassen' as const,
      standort: 'Hinterhof Beispielweg 3',
      transport: 'carsharing',
    };
    const uebergabe = {
      ...ablaufStarten('r1'),
      herkunft: 'uebergabe' as const,
      transport: 'fahrdienst',
    };

    const punkteZuruecklassen = zusammenfassungspunkte(kontext(zuruecklassen));
    const punkteUebergabe = zusammenfassungspunkte(kontext(uebergabe));

    expect(punkteZuruecklassen.join(' ')).toContain('Hinterhof Beispielweg 3');
    expect(punkteZuruecklassen.join(' ')).toContain('angekettet');
    expect(punkteUebergabe.join(' ')).not.toContain('angekettet');
    expect(punkteUebergabe.join(' ')).toContain(vorlage.werkstatt.name);
  });

  it('benennt einen fehlenden Standort, statt ihn zu verschweigen', () => {
    const zustand = { ...ablaufStarten('r1'), herkunft: 'zuruecklassen' as const };
    expect(zusammenfassungspunkte(kontext(zustand)).join(' ')).toContain('nicht angegeben');
  });

  it('nennt das Ersatzrad im Abschlusstext', () => {
    const zustand = { ...ablaufStarten('r1'), herkunft: 'uebergabe' as const };
    expect(abschluss('transportFortsetzung', kontext(zustand)).text).toContain(
      'Lastenrad 5 (Ersatz)',
    );
  });

  it('uebernimmt Werkstatt, Depot und Zustaendigkeit aus der Standortvorlage', () => {
    const eigene = {
      ...vorlage,
      werkstatt: { ...vorlage.werkstatt, name: 'Testwerkstatt', ruhetag: 'Freitag' },
      depot: { bezeichnung: 'Testdepot', zugangHinweis: 'egal' },
      zustaendigeRolle: 'Praxisleitung',
    };
    const ergebnis = abschluss('depotAbgestellt', {
      vorlage: eigene,
      ersatzrad: 'Ersatz',
      zustand: ablaufStarten('r1'),
    });
    expect(ergebnis.text).toContain('Testdepot');
    expect(ergebnis.text).toContain('Freitag');
    expect(ergebnis.text).toContain('Praxisleitung');
  });

  it('nennt in keinem Abschluss eine Telefonnummer oder einen Zugangscode', () => {
    for (const art of [
      'meldungOhneSperre',
      'lokalNichtMoeglich',
      'lokalRepariert',
      'depotAbgestellt',
      'vertragswerkstattRepariert',
      'transportFortsetzung',
    ] as const) {
      expect(abschluss(art, kontext()).text).not.toMatch(/\d{3,}/);
    }
  });
});
