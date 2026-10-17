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
      'Training',
      'Nachrichten',
      'Organisation',
      'Abrechnung',
      'Statistiken',
    ]);
  });

  it('nennt den Bereich nicht zweimal, wenn sein Untermenü ihn wiederholt', () => {
    const katalog = funktionskatalog(testUser(['owner']));
    expect(bezeichnungen(katalog).filter((name) => name === 'Kalender')).toHaveLength(1);
    expect(bezeichnungen(katalog).filter((name) => name === 'Patient:innen')).toHaveLength(1);
  });

  it('kennzeichnet echt angebundene Bereiche nicht als Vorschau', () => {
    const katalog = funktionskatalog(testUser(['owner']));
    // Seit TEAM-001 ist der Teamchat echt angebunden (Überholung 11).
    const teamchat = katalog.find((eintrag) => eintrag.bezeichnung === 'Teamchat');
    expect(teamchat).toBeDefined();
    expect(teamchat?.vorschau).toBeUndefined();
    // Seit ERS-001 echt angebunden: die Erstattungen tragen keine
    // Kennzeichnung mehr, und „Erstattung beantragen“ ist ein Vorgang - auch
    // im Training.
    const erstattungen = katalog.find((eintrag) => eintrag.bezeichnung === 'Erstattungen');
    expect(erstattungen).toBeDefined();
    expect(erstattungen?.vorschau).toBeUndefined();
    expect(
      funktionskatalog(testUser(['trainer'])).find((e) => e.bezeichnung === 'Erstattung beantragen')
        ?.ziel,
    ).toBe('/betrieb/erstattungen/beantragen');
    // Seit ZK-001 echt angebunden: das Zeitkonto trägt keine Kennzeichnung mehr,
    // und „Ins Zeitkonto eintragen“ ist ein Vorgang - auch im Training.
    const zeitkonto = katalog.find((eintrag) => eintrag.bezeichnung === 'Zeitkonto');
    expect(zeitkonto).toBeDefined();
    expect(zeitkonto?.vorschau).toBeUndefined();
    expect(
      funktionskatalog(testUser(['trainer'])).find(
        (e) => e.bezeichnung === 'Ins Zeitkonto eintragen',
      )?.ziel,
    ).toBe('/betrieb/zeitkonto/eintragen');
    // Seit URL-001 echt angebunden: der Urlaub trägt keine Kennzeichnung mehr,
    // und „Urlaub eintragen“ ist ein Vorgang.
    const urlaub = katalog.find((eintrag) => eintrag.bezeichnung === 'Urlaub');
    expect(urlaub).toBeDefined();
    expect(urlaub?.vorschau).toBeUndefined();
    expect(katalog.find((eintrag) => eintrag.bezeichnung === 'Urlaub eintragen')?.ziel).toBe(
      '/betrieb/urlaub/beantragen',
    );
    expect(
      funktionskatalog(testUser(['trainer'])).find((e) => e.bezeichnung === 'Urlaub beantragen'),
    ).toBeDefined();
    // Seit FLT-EPIC-001 echt angebunden: die Radflotte trägt keine Kennzeichnung mehr.
    const radflotte = katalog.find((eintrag) => eintrag.bezeichnung === 'Radflotte');
    expect(radflotte).toBeDefined();
    expect(radflotte?.vorschau).toBeUndefined();
    // Seit MAP-006 echt angebunden: die Touren tragen keine Kennzeichnung mehr.
    const touren = katalog.find((eintrag) => eintrag.bezeichnung === 'Touren');
    expect(touren?.vorschau).toBeUndefined();
    const arbeitszeiten = katalog.find((eintrag) => eintrag.bezeichnung === 'Arbeitszeiten');
    expect(arbeitszeiten?.vorschau).toBeUndefined();
  });

  it('findet das Vorschau-Protokoll für jede Rolle (BEF-049, RAH-004)', () => {
    // Bis zum Handoff vom 2026-10-05 führte nur der Satz auf `/bereiche`
    // dorthin - und den sah, wer keine Tableiste mit „Mehr" hatte, nie.
    for (const rollen of [['owner'], ['therapist'], ['patient']] as const) {
      const katalog = funktionskatalog(testUser([...rollen], 'Max Mustermann'));
      const treffer = sucheFunktionen(katalog, 'Vorschau');
      const protokoll = treffer.find((eintrag) => eintrag.id === 'seite-vorschau-protokoll');
      expect(protokoll, rollen.join()).toMatchObject({
        art: 'Seite',
        bezeichnung: 'Vorschau-Protokoll',
        ziel: '/vorschau/protokoll',
      });
    }
    expect(
      bezeichnungen(sucheFunktionen(funktionskatalog(testUser(['owner'])), 'simuliert')),
    ).toContain('Vorschau-Protokoll');
  });

  it('bietet einem Patientenkonto keine Vorgänge der Praxis an', () => {
    const katalog = funktionskatalog(testUser(['patient'], 'Max Mustermann'));
    const namen = bezeichnungen(katalog);
    expect(namen).not.toContain('Termin anlegen');
    expect(namen).not.toContain('Patient:in suchen');
    expect(namen).not.toContain('Behandlungsgrundlage erfassen');
    // Das eigene Konto steht jeder angemeldeten Rolle offen (STAFF-004).
    expect(namen).toContain('Mein Konto');
  });

  it('bietet dem Office alles Organisatorische samt Grundlage erfassen (PRX-010)', () => {
    const namen = bezeichnungen(funktionskatalog(testUser(['office'], 'Olivia Office')));
    expect(namen).toContain('Termin anlegen');
    expect(namen).toContain('Patient:in anlegen');
    expect(namen).toContain('Mitarbeiter:in anlegen');
    // Office tippt die Verordnung ab (ANN-011, Stand 2026-09-28).
    expect(namen).toContain('Behandlungsgrundlage erfassen');
  });

  it('bietet der Therapeutin das Verordnen, aber keine Personalakte', () => {
    const namen = bezeichnungen(funktionskatalog(testUser(['therapist'])));
    expect(namen).toContain('Behandlungsgrundlage erfassen');
    expect(namen).not.toContain('Mitarbeiter:in anlegen');
    expect(namen).not.toContain('Abrechnung');
  });

  it('führt jeden Vorgang auf einen anwendungsinternen Pfad', () => {
    for (const eintrag of funktionskatalog(testUser(['owner']))) {
      expect(eintrag.ziel.startsWith('/')).toBe(true);
      expect(eintrag.ziel.startsWith('//')).toBe(false);
    }
  });

  it('führt „Tag umplanen" in den Kalender, statt auf eine Seite ohne Person und Tag (NAV-02)', () => {
    // Die Seite lehnt ohne beides ab (CAL-009); der Treffer sagt, wo beides
    // gewählt wird - wie „Behandlungsgrundlage erfassen".
    const umplanen = funktionskatalog(testUser(['office'], 'Olivia Office')).find(
      (eintrag) => eintrag.id === 'vorgang-tag-umplanen',
    );
    expect(umplanen?.ziel).toBe('/kalender');
    expect(umplanen?.rueckweg).toBeUndefined();
    expect(umplanen?.hinweis).toBe('Im Kalender unter „Ansicht und Filter“ Tag und Person wählen');
  });

  it('führt keinen Vorgang auf eine Adresse, die ohne Parameter ablehnt', () => {
    for (const eintrag of funktionskatalog(testUser(['owner', 'therapist']))) {
      expect(eintrag.ziel, eintrag.id).not.toBe('/kalender/tag-umplanen');
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
    // Sechs Bereiche und fuer owner Training und Statistiken (TRN-EPIC-001,
    // STA-EPIC-001).
    expect(treffer).toHaveLength(8);
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
    expect(bezeichnungen(sucheFunktionen(katalog, 'rezept'))).toContain(
      'Behandlungsgrundlage erfassen',
    );
    expect(bezeichnungen(sucheFunktionen(katalog, 'passwort'))).toContain('Mein Konto');
    expect(bezeichnungen(sucheFunktionen(katalog, 'ausfall'))).toContain('Tag umplanen');
    // Die Kurzform aus der Tableiste ist der zweite Name derselben Sache.
    expect(bezeichnungen(sucheFunktionen(katalog, 'nachrichten'))).toContain('Nachrichten');
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

  it('findet Seiten unter dem, was auf ihnen steht (ORG-07)', () => {
    // Bis UXR-002 fanden „Audit", „Frist" oder „Löschung" nichts, obwohl es
    // die Seiten gibt - der Katalog kannte nur die Menünamen.
    // Seit ORG-001 sind Protokoll, Aufbewahrung, Einstellungen und
    // Arbeitszeit Ansichten unter Praxis und Team - die Suche findet sie
    // unter ihrem Namen und unter dem, was auf ihnen steht.
    for (const [begriff, seite] of [
      ['audit', 'Protokoll'],
      ['protokoll', 'Protokoll'],
      ['sicherheit', 'Protokoll'],
      ['frist', 'Einstellungen'],
      ['raster', 'Einstellungen'],
      ['startort', 'Einstellungen'],
      ['planung', 'Arbeitszeit'],
      ['loschung', 'Aufbewahrung'],
      ['Löschsperre', 'Aufbewahrung'],
    ] as const) {
      expect(bezeichnungen(sucheFunktionen(katalog, begriff)), begriff).toContain(seite);
    }
  });

  it('verspricht einer Rolle keine Einstellung, die sie auf der Seite nicht sieht', () => {
    const therapeutin = funktionskatalog(testUser(['therapist']));
    expect(bezeichnungen(sucheFunktionen(therapeutin, 'frist'))).not.toContain('Einstellungen');
    expect(bezeichnungen(sucheFunktionen(therapeutin, 'planung'))).toContain('Arbeitszeit');
  });

  it('nennt den Menüpunkt des Leistungskatalogs wie seine Seite (ABR-26)', () => {
    expect(bezeichnungen(sucheFunktionen(katalog, 'katalog'))).toContain('Leistungskatalog');
  });
});
