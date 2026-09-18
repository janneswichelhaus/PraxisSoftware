import { describe, expect, it } from 'vitest';
import { testUser } from '@/test-utils';
import {
  FUNKTIONSTREFFER_MAX,
  funktionskatalog,
  sucheFunktionen,
  suchform,
  type Funktion,
} from './funktionen';

/**
 * Der Katalog der Kopfleistensuche (UX-013).
 *
 * Geprüft wird dreierlei: dass er aus der Navigation entsteht statt daneben,
 * dass er je Rolle nur nennt, was diese Rolle im Alltag aufruft — Relevanz,
 * keine Zugriffskontrolle (§4.7, ADR-004) —, und dass gefunden wird, wer nach
 * dem Wort sucht, das er selbst benutzt.
 */

function bezeichnungen(eintraege: readonly Funktion[]): string[] {
  return eintraege.map((eintrag) => eintrag.bezeichnung);
}

describe('funktionskatalog', () => {
  it('führt jeden Arbeitsbereich der Rolle als Treffer', () => {
    const katalog = funktionskatalog(testUser(['owner']));
    const bereiche = katalog.filter((eintrag) => eintrag.art === 'Bereich');
    expect(bezeichnungen(bereiche)).toEqual([
      'Übersicht',
      'Kalender',
      'Patient:innen',
      'Kommunikation',
      'Organisatorisches',
      'Abrechnung',
    ]);
  });

  it('nennt den Bereich nicht zweimal, wenn sein Untermenü ihn wiederholt', () => {
    const katalog = funktionskatalog(testUser(['owner']));
    expect(bezeichnungen(katalog).filter((name) => name === 'Kalender')).toHaveLength(1);
    expect(bezeichnungen(katalog).filter((name) => name === 'Patient:innen')).toHaveLength(1);
  });

  it('kennzeichnet Vorschaubereiche als solche', () => {
    const katalog = funktionskatalog(testUser(['owner']));
    const touren = katalog.find((eintrag) => eintrag.bezeichnung === 'Touren');
    expect(touren?.vorschau).toBe(true);
    const arbeitszeiten = katalog.find((eintrag) => eintrag.bezeichnung === 'Arbeitszeiten');
    expect(arbeitszeiten?.vorschau).toBeUndefined();
  });

  it('bietet einem Patientenkonto keine Vorgänge der Praxis an', () => {
    const katalog = funktionskatalog(testUser(['patient'], 'Max Mustermann'));
    const namen = bezeichnungen(katalog);
    expect(namen).not.toContain('Termin anlegen');
    expect(namen).not.toContain('Patient:in suchen');
    expect(namen).not.toContain('Grundlage erfassen');
    // Das eigene Konto steht jeder angemeldeten Rolle offen (STAFF-004).
    expect(namen).toContain('Mein Konto');
  });

  it('bietet dem Office alles Organisatorische, aber kein Verordnen', () => {
    const namen = bezeichnungen(funktionskatalog(testUser(['office'], 'Olivia Office')));
    expect(namen).toContain('Termin anlegen');
    expect(namen).toContain('Patient:in anlegen');
    expect(namen).toContain('Mitarbeitende:n anlegen');
    // Wer eine Verordnung erfasst, tippt die Diagnose mit ab - ohne office
    // (ANN-011, canWriteTreatmentBases).
    expect(namen).not.toContain('Grundlage erfassen');
  });

  it('bietet der Therapeutin das Verordnen, aber keine Personalakte', () => {
    const namen = bezeichnungen(funktionskatalog(testUser(['therapist'])));
    expect(namen).toContain('Grundlage erfassen');
    expect(namen).not.toContain('Mitarbeitende:n anlegen');
    expect(namen).not.toContain('Abrechnung');
  });

  it('führt jeden Vorgang auf einen anwendungsinternen Pfad', () => {
    for (const eintrag of funktionskatalog(testUser(['owner']))) {
      expect(eintrag.ziel.startsWith('/')).toBe(true);
      expect(eintrag.ziel.startsWith('//')).toBe(false);
    }
  });
});

describe('suchform', () => {
  it('ebnet Umlaute, Akzente und Umschreibungen ein - wie app.suchform', () => {
    expect(suchform('Übersicht')).toBe('ubersicht');
    expect(suchform('Uebersicht')).toBe('ubersicht');
    expect(suchform('MÜLLER')).toBe('muller');
    expect(suchform('Straße')).toBe('strasse');
  });
});

describe('sucheFunktionen', () => {
  const katalog = funktionskatalog(testUser(['owner']));

  it('zeigt ohne Eingabe die Bereiche, damit die Liste nicht leer aufgeht', () => {
    const treffer = sucheFunktionen(katalog, '');
    expect(treffer.every((eintrag) => eintrag.art === 'Bereich')).toBe(true);
    expect(treffer).toHaveLength(6);
  });

  it('stellt den Anfang des Namens vor den Treffer mitten im Wort', () => {
    const treffer = sucheFunktionen(katalog, 'kal');
    expect(treffer[0]?.bezeichnung).toBe('Kalender');
  });

  it('findet auch ohne Umlaut auf der Tastatur', () => {
    expect(bezeichnungen(sucheFunktionen(katalog, 'ubersicht'))).toContain('Übersicht');
    expect(bezeichnungen(sucheFunktionen(katalog, 'woechentlich'))).toContain(
      'Dauerfehlzeit eintragen',
    );
  });

  it('findet einen Vorgang unter dem Wort, das die Praxis dafür benutzt', () => {
    expect(bezeichnungen(sucheFunktionen(katalog, 'rezept'))).toContain('Grundlage erfassen');
    expect(bezeichnungen(sucheFunktionen(katalog, 'passwort'))).toContain('Mein Konto');
    expect(bezeichnungen(sucheFunktionen(katalog, 'ausfall'))).toContain('Tag umplanen');
    // Die Kurzform aus der Tableiste ist der zweite Name derselben Sache.
    expect(bezeichnungen(sucheFunktionen(katalog, 'nachrichten'))).toContain('Kommunikation');
  });

  it('findet das Wort am Anfang eines späteren Wortes', () => {
    expect(bezeichnungen(sucheFunktionen(katalog, 'anlegen'))).toContain('Termin anlegen');
  });

  it('antwortet auf einen Begriff ohne Treffer mit einer leeren Liste', () => {
    expect(sucheFunktionen(katalog, 'xyzq')).toEqual([]);
  });

  it('hält die Liste kurz, damit die Namensgruppe darunter sichtbar bleibt', () => {
    // „e" steckt in fast jedem Eintrag - genau der Fall, für den die Grenze da ist.
    expect(sucheFunktionen(katalog, 'e').length).toBeLessThanOrEqual(FUNKTIONSTREFFER_MAX);
  });
});
