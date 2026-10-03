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
    expect(istInternerPfad(pfad)).toBe(false);
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

  /**
   * Zweitreview H5: Ein Browser entfernt Tabulatoren und Zeilenumbrüche aus
   * einer Adresse, bevor er sie liest. Aus `/\t/fremde.example` würde so
   * `//fremde.example` - ein fremdes Ziel, vorbei an der Prüfung auf `//`.
   * Abgefangen wird es von der Regel gegen Steuerzeichen; der Test hält fest,
   * dass es dabei bleibt, auch kodiert aus der Adresszeile.
   */
  it('faellt bei einem Tabulator zwischen den Schraegstrichen auf den Standard zurueck', () => {
    expect(istInternerPfad('/\t/fremde.example')).toBe(false);

    const direkt = new URLSearchParams({ [RUECKWEG_PARAM]: '/\t/fremde.example' });
    expect(leseRueckweg(direkt, '/patienten')).toBe('/patienten');

    const ausDerAdresszeile = new URLSearchParams(`${RUECKWEG_PARAM}=%2F%09%2Ffremde.example`);
    expect(ausDerAdresszeile.get(RUECKWEG_PARAM)).toBe('/\t/fremde.example');
    expect(leseRueckweg(ausDerAdresszeile, '/patienten')).toBe('/patienten');

    expect(mitRueckweg('/termine/t1', '/\t/fremde.example')).toBe('/termine/t1');
  });
});

describe('mitRueckweg', () => {
  it('laesst einen Anker am Ende (AKTE-007)', () => {
    expect(mitRueckweg('/patienten/p1/stammdaten#anmeldebogen', '/offen')).toBe(
      '/patienten/p1/stammdaten?zurueck=%2Foffen#anmeldebogen',
    );
  });

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
    ['/patienten', 'Zurück zu den Patient:innen'],
    ['/patienten?suche=mus&status=alle', 'Zurück zu den Patient:innen'],
    ['/patienten/abc', 'Zurück zur Akte'],
    ['/patienten/abc/termine', 'Zurück zu den Terminen der Akte'],
    ['/patienten/abc/doku', 'Zurück zur Doku'],
    // AKTE-007: Alte Adressen leiten weiter und heißen wie ihr Ziel.
    ['/patienten/abc/verlauf', 'Zurück zur Doku'],
    ['/patienten/abc/befund', 'Zurück zur Doku'],
    ['/patienten/abc/dateien', 'Zurück zu den Stammdaten'],
    ['/termine/t1', 'Zurück zum Termin'],
    ['/termine/neu', 'Zurück zur Terminanlage'],
    ['/praxis/team/s1', 'Zurück zu den Mitarbeitenden'],
  ])('beschriftet %s mit %s', (pfad, erwartet) => {
    expect(rueckwegBeschriftung(pfad)).toBe(erwartet);
  });

  // UXR-002: dieselben Wörter wie Menü und Seitentitel (NAV-16, ANN-111) und
  // die Ziele, die bisher im bloßen „Zurück" endeten.
  it.each([
    ['/patienten/abc/verordnungen', 'Zurück zu den Behandlungsgrundlagen'],
    ['/patienten/abc/verordnungen/neu', 'Zurück zur Grundlage'],
    ['/patienten/abc/verordnungen/g1/bearbeiten', 'Zurück zur Grundlage'],
    ['/patienten/abc/datenschutz', 'Zurück zu den Stammdaten'],
    ['/verordner', 'Zurück zu den Verordner:innen'],
    ['/termine/dauertermin?person=p1', 'Zurück zum Dauertermin'],
    ['/touren', 'Zurück zur Tour'],
    // Die Tour trägt Tag und Person in der Adresse (UEB, TER); die
    // Beschriftung hängt am Pfad, nicht an den Parametern.
    ['/touren?tag=2026-09-28&person=p1', 'Zurück zur Tour'],
    ['/touren?person=p1', 'Zurück zur Tour'],
    ['/abrechnung', 'Zurück zu den Rechnungen'],
    ['/abrechnung/zahlungen', 'Zurück zu den Zahlungen'],
    ['/abrechnung/leistungen', 'Zurück zu den Leistungen'],
    ['/praxis/planung', 'Zurück zu den Arbeitszeiten'],
    ['/team', 'Zurück zur Kommunikation'],
    ['/mein-konto', 'Zurück zu „Mein Konto“'],
  ])('beschriftet %s mit %s (UXR-002)', (pfad, erwartet) => {
    expect(rueckwegBeschriftung(pfad)).toBe(erwartet);
  });

  it('nennt kein abgelöstes Wort mehr', () => {
    for (const pfad of ['/patienten', '/patienten/a/verordnungen', '/verordner']) {
      expect(rueckwegBeschriftung(pfad)).not.toMatch(/Patientenliste|Verordnerkartei|Verordnungen/);
    }
  });

  it('bleibt beim bloßen „Zurück" für ein Ziel ohne eigenen Namen', () => {
    expect(rueckwegBeschriftung('/bereiche')).toBe('Zurück');
  });
});
