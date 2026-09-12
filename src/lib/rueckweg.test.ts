import { describe, expect, it } from 'vitest';
import {
  istInternerPfad,
  leseRueckweg,
  mitRueckweg,
  rueckwegBeschriftung,
  RUECKWEG_PARAM,
} from './rueckweg';

/**
 * Der Rückweg kommt aus der Adresszeile und ist damit veränderbar (UX-012).
 *
 * Geprüft wird deshalb vor allem, was er **nicht** akzeptiert: Ein Wert, der
 * den Browser auf ein fremdes Ziel schicken würde, ist eine offene
 * Weiterleitung — und die stünde hier auf einer Seite hinter der Anmeldung.
 */
describe('istInternerPfad', () => {
  it.each([
    ['/kalender?ansicht=tag&datum=2027-05-12'],
    ['/patienten/66666666-6666-4666-8666-000000000001/termine'],
    ['/'],
  ])('laesst den anwendungsinternen Pfad %s zu', (pfad) => {
    expect(istInternerPfad(pfad)).toBe(true);
  });

  it.each([
    ['https://fremde.example/angriff'],
    ['//fremde.example/angriff'],
    ['/\\fremde.example/angriff'],
    ['javascript:alert(1)'],
    ['kalender'],
    [''],
    [null],
    [undefined],
  ])('weist %s ab', (pfad) => {
    expect(istInternerPfad(pfad as string | null | undefined)).toBe(false);
  });

  it('weist Steuerzeichen ab - eine Adresse hat keine Zeilenumbrueche', () => {
    expect(istInternerPfad('/kalender\nSet-Cookie: x')).toBe(false);
  });

  it('weist einen ueberlangen Wert ab', () => {
    expect(istInternerPfad(`/${'a'.repeat(600)}`)).toBe(false);
  });
});

describe('leseRueckweg', () => {
  it('liefert den mitgegebenen Pfad', () => {
    const suche = new URLSearchParams({ [RUECKWEG_PARAM]: '/kalender?ansicht=tag' });
    expect(leseRueckweg(suche, '/patienten')).toBe('/kalender?ansicht=tag');
  });

  it('faellt ohne Angabe still auf den Standard zurueck', () => {
    expect(leseRueckweg(new URLSearchParams(), '/patienten')).toBe('/patienten');
  });

  it('faellt bei einem fremden Ziel still auf den Standard zurueck', () => {
    const suche = new URLSearchParams({ [RUECKWEG_PARAM]: 'https://fremde.example' });
    expect(leseRueckweg(suche, '/patienten')).toBe('/patienten');
  });
});

describe('mitRueckweg', () => {
  it('haengt den kodierten Rueckweg an', () => {
    expect(mitRueckweg('/termine/t1', '/kalender?ansicht=tag&datum=2027-05-12')).toBe(
      `/termine/t1?${RUECKWEG_PARAM}=${encodeURIComponent('/kalender?ansicht=tag&datum=2027-05-12')}`,
    );
  });

  it('haengt an ein Ziel mit Parametern mit & an', () => {
    expect(mitRueckweg('/termine/neu?datum=2027-05-12', '/kalender')).toBe(
      `/termine/neu?datum=2027-05-12&${RUECKWEG_PARAM}=${encodeURIComponent('/kalender')}`,
    );
  });

  it('laesst das Ziel unveraendert, wenn es keinen gueltigen Rueckweg gibt', () => {
    expect(mitRueckweg('/termine/t1', null)).toBe('/termine/t1');
    expect(mitRueckweg('/termine/t1', '')).toBe('/termine/t1');
    expect(mitRueckweg('/termine/t1', 'https://fremde.example')).toBe('/termine/t1');
  });

  it('ueberlebt den Weg durch die Adresszeile unveraendert', () => {
    const kalender = '/kalender?ansicht=woche&datum=2027-05-12&person=55555555-5555-4555-8555-1';
    const ziel = mitRueckweg('/termine/t1', kalender);
    const suche = new URLSearchParams(ziel.split('?')[1]);
    expect(leseRueckweg(suche, '/patienten')).toBe(kalender);
  });
});

describe('rueckwegBeschriftung', () => {
  it.each([
    ['/', 'Zurück zur Übersicht'],
    ['/kalender?ansicht=tag&datum=2027-05-12', 'Zurück zum Kalender'],
    ['/patienten', 'Zurück zur Patientenliste'],
    ['/patienten/abc', 'Zurück zur Akte'],
    ['/patienten/abc/termine', 'Zurück zu den Terminen der Akte'],
    ['/patienten/abc/verlauf', 'Zurück zum Behandlungsverlauf'],
    ['/termine/t1', 'Zurück zum Termin'],
    ['/termine/neu', 'Zurück zur Terminanlage'],
    ['/praxis/team/s1', 'Zurück zu den Mitarbeitenden'],
  ])('beschriftet %s mit %s', (pfad, erwartet) => {
    expect(rueckwegBeschriftung(pfad)).toBe(erwartet);
  });
});
