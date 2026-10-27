import { describe, expect, it } from 'vitest';
import { testUser } from '@/test-utils';
import type { SubNavEintrag } from '@/components/ui/SubNav';
import type { RoleKey } from '@/features/core/session/types';
import {
  type Ansicht,
  aktiverBereich,
  arbeitsbereiche,
  canSeeBilling,
  leistenvorrang,
  tableiste,
  zeigtUnterleiste,
} from './navigation';

/**
 * Die Zuordnung von Pfaden zu Arbeitsbereichen entscheidet, welcher Eintrag in
 * der Navigation markiert ist und welches Untermenü erscheint. Sie ist
 * ausschließlich Darstellung - die verbindliche Autorisierung liegt in den
 * RLS-Policies (ADR-004).
 */

function bereicheFuer(roles: RoleKey[]) {
  return arbeitsbereiche(testUser(roles));
}

function ids(roles: RoleKey[]): string[] {
  return bereicheFuer(roles).map((bereich) => bereich.id);
}

/** Eine Ansicht unter einem Reiter von Organisation (ORG-001). */
function ansicht(roles: RoleKey[], reiter: string, to: string): Ansicht | undefined {
  return bereicheFuer(roles)
    .find((bereich) => bereich.id === 'betrieb')
    ?.unterpunkte.find((punkt) => punkt.label === reiter)
    ?.ansichten?.find((eintrag) => eintrag.to === to);
}

describe('Arbeitsbereiche je Rolle', () => {
  it('zeigt einem Patientenkonto nur den eigenen Tag', () => {
    expect(ids(['patient'])).toEqual(['heute']);
  });

  it('zeigt owner alle sechs Bereiche und dazu Training und Statistiken', () => {
    expect(ids(['owner'])).toEqual([
      'heute',
      'termine',
      'patienten',
      'training',
      'team',
      'betrieb',
      'abrechnung',
      'statistik',
    ]);
  });

  it('zeigt die Statistiken einer Person mit Umsatzbeteiligung (STA-006)', () => {
    const anna = { ...testUser(['therapist']), revenueShare: true };
    expect(arbeitsbereiche(anna).map((b) => b.id)).toContain('statistik');
    const patient = { ...testUser(['patient']), revenueShare: true };
    expect(arbeitsbereiche(patient).map((b) => b.id)).not.toContain('statistik');
  });

  it('zeigt die Statistiken ohne Umsatzbeteiligung allein owner (STA-EPIC-001)', () => {
    for (const rolle of ['therapist', 'team_lead', 'office', 'trainer', 'patient'] as const) {
      expect(ids([rolle]), rolle).not.toContain('statistik');
    }
  });

  it('traegt die von Jannes vorgegebenen Beschriftungen', () => {
    // Die Beschriftung ist das, was in der Leiste steht - die Kennung
    // daneben bleibt fachlich und aendert sich mit einer Umbenennung nicht.
    const beschriftungen = Object.fromEntries(
      bereicheFuer(['owner']).map((bereich) => [bereich.id, bereich.label]),
    );
    expect(beschriftungen).toEqual({
      heute: 'Übersicht',
      termine: 'Kalender',
      patienten: 'Patient:innen',
      training: 'Training',
      team: 'Nachrichten',
      betrieb: 'Organisation',
      abrechnung: 'Abrechnung',
      statistik: 'Statistiken',
    });
  });

  it('kuerzt fuer die Tableiste nur, wo die volle Bezeichnung nicht passt', () => {
    // Bei 360 px bleiben je Ziel 72 px fuer die Beschriftung (seit Runde 2
    // ohne seitlichen Innenabstand, 12 px). Gemessen in Hanken Grotesk passt
    // "Organisation" (69 px in 12/600); seit ORG-001 heißen beide Bereiche
    // auch in der Seitenleiste so wie in der Tableiste. Das Mass selbst prueft tests/e2e/tableiste.spec.ts im
    // Browser - jsdom kennt keine Breiten.
    const kurzformen = Object.fromEntries(
      bereicheFuer(['owner']).map((bereich) => [bereich.id, bereich.kurz]),
    );
    expect(kurzformen).toEqual({
      heute: 'Übersicht',
      termine: 'Kalender',
      patienten: 'Patienten',
      training: 'Training',
      team: 'Nachrichten',
      betrieb: 'Organisation',
      abrechnung: 'Abrechnung',
      statistik: 'Statistiken',
    });
    for (const kurz of Object.values(kurzformen)) {
      expect(kurz.length).toBeLessThanOrEqual(13);
    }
  });

  it('zeigt Training owner, Trainingsbetreuung und Büro, nicht der Behandlung (TRN-003)', () => {
    // ADR-021 Punkt 6: der offene Zugriff auf alle Akten begründet keinen
    // auf das Training. Die Grenze sitzt im Server; hier nur die Darstellung.
    for (const rolle of ['owner', 'trainer', 'office'] as const) {
      expect(ids([rolle]), rolle).toContain('training');
    }
    for (const rolle of ['therapist', 'team_lead', 'patient'] as const) {
      expect(ids([rolle]), rolle).not.toContain('training');
    }
    // Umgekehrt: Die Trainingsbetreuung bekommt keine Kartei. Den Kalender
    // seit TRN-006 schon - darin stehen für sie nur Trainingstermine
    // (ADR-022 Punkt 11, der Server filtert je Termin).
    expect(ids(['trainer'])).not.toContain('patienten');
    expect(ids(['trainer'])).toContain('termine');
  });

  it('haelt die Abrechnung von behandelnden Rollen fern', () => {
    expect(ids(['therapist'])).not.toContain('abrechnung');
    expect(ids(['team_lead'])).not.toContain('abrechnung');
    expect(canSeeBilling(['office'])).toBe(true);
    expect(canSeeBilling(['owner'])).toBe(true);
    expect(canSeeBilling(['therapist', 'team_lead'])).toBe(false);
  });

  it('fuehrt die Mitarbeiterverwaltung fuer alle Praxisrollen unter Organisation → Team', () => {
    function mitarbeitende(roles: RoleKey[]): SubNavEintrag | undefined {
      return ansicht(roles, 'Team', '/praxis/team');
    }
    // Die Liste ist fuer alle Praxisrollen lesbar (STAFF-001); ueber das
    // Schreiben entscheidet die Seite und - verbindlich - der Server.
    for (const rolle of ['owner', 'team_lead', 'therapist', 'office'] as RoleKey[]) {
      expect(mitarbeitende([rolle])).toBeDefined();
    }
    // Sie ist angebunden und traegt deshalb keine Vorschaukennzeichnung.
    expect(mitarbeitende(['owner'])?.vorschau).toBeUndefined();
  });

  it('fuehrt die Instrumente fuer alle Rollen der Behandlungsseite (BEF-064, ANN-322)', () => {
    // Bis UX-008d nur, wer dokumentiert - die Praxisleitung erhob Bögen,
    // fand aber Wortlaut und Lizenz nicht. Seit ORG-001 unter Bibliothek.
    for (const rolle of ['owner', 'team_lead', 'therapist', 'office'] as RoleKey[]) {
      expect(ansicht([rolle], 'Bibliothek', '/praxis/instrumente'), rolle).toBeDefined();
    }
    // Die Trainingsbetreuung liest die Instrumente nicht (Server).
    expect(ansicht(['trainer'], 'Bibliothek', '/praxis/instrumente')).toBeUndefined();
  });

  it('stellt in jedem Bereich die angebundenen Punkte vor die Vorschau', () => {
    // Seit ERS-001 hat Organisatorisches keine Vorschau mehr, seit TEAM-001
    // auch die Kommunikation nicht; die Regel gilt weiter, wo eine entsteht.
    const bereiche = bereicheFuer(['owner']);
    const betrieb = bereiche.find((bereich) => bereich.id === 'betrieb');
    expect(betrieb?.unterpunkte.filter((punkt) => punkt.vorschau)).toEqual([]);
    const mitVorschau = bereiche.filter((bereich) =>
      bereich.unterpunkte.some((punkt) => punkt.vorschau),
    );
    expect(mitVorschau).toEqual([]);
    for (const bereich of mitVorschau) {
      const punkte = bereich.unterpunkte;
      const ersteVorschau = punkte.findIndex((punkt) => punkt.vorschau);
      const letzteEchte = punkte.map((punkt) => Boolean(punkt.vorschau)).lastIndexOf(false);
      expect(ersteVorschau, bereich.id).toBeGreaterThan(letzteEchte);
    }
  });

  it('fuehrt kein zweites, synthetisches Teamverzeichnis', () => {
    // KOM-002 (ANN-314): Rückfragen und, seit TEAM-001 echt, der Teamchat -
    // kein Verzeichnis neben der Mitarbeiterverwaltung.
    // ANN-614: wie bei Slack öffnet der Bereich auf dem Teamchat.
    const team = bereicheFuer(['owner']).find((bereich) => bereich.id === 'team');
    expect(team?.to).toBe('/team');
    expect(team?.unterpunkte.map((punkt) => [punkt.to, Boolean(punkt.vorschau)])).toEqual([
      ['/team', false],
      ['/fuer-dich', false],
      ['/rueckfragen', false],
    ]);
    // Die Trainingsbetreuung hat keine Rückfragen der Behandlung.
    expect(
      bereicheFuer(['trainer'])
        .find((bereich) => bereich.id === 'team')
        ?.unterpunkte.map((punkt) => punkt.to),
    ).toEqual(['/team', '/fuer-dich']);
  });

  it('zeigt Einstellungen, Protokoll und Aufbewahrung nur der Praxisleitung', () => {
    for (const to of ['/praxis/einstellungen', '/praxis/sicherheit/audit']) {
      expect(ansicht(['owner'], 'Praxis', to), to).toBeDefined();
      expect(ansicht(['team_lead'], 'Praxis', to), to).toBeUndefined();
    }
    // Die Gebietstage lesen alle, die Termine verwalten (PRX-002).
    expect(ansicht(['therapist'], 'Praxis', '/praxis/gebiete')).toBeDefined();
  });

  it('führt Organisation mit höchstens fünf Reitern (ORG-001, ANN-604)', () => {
    const reiter = (roles: RoleKey[]) =>
      bereicheFuer(roles)
        .find((bereich) => bereich.id === 'betrieb')
        ?.unterpunkte.map((punkt) => punkt.label);
    expect(reiter(['owner'])).toEqual(['Eingang', 'Team', 'Radflotte', 'Bibliothek', 'Praxis']);
    expect(reiter(['office'])).toEqual(['Eingang', 'Team', 'Radflotte', 'Bibliothek', 'Praxis']);
    expect(reiter(['therapist'])).toEqual(['Eingang', 'Team', 'Radflotte', 'Bibliothek', 'Praxis']);
    expect(reiter(['trainer'])).toEqual(['Eingang', 'Team', 'Bibliothek']);
    // Keine Vorschau mehr in Organisation; alles ist angebunden.
    for (const rolle of ['owner', 'office', 'therapist', 'trainer'] as RoleKey[]) {
      const betrieb = bereicheFuer([rolle]).find((bereich) => bereich.id === 'betrieb');
      expect(
        betrieb?.unterpunkte.some((punkt) => punkt.vorschau),
        rolle,
      ).toBe(false);
    }
  });

  it('führt unter Team die Zeiten jeder Person, eigene wie fremde (ORG-003)', () => {
    const ansichten = (roles: RoleKey[]) =>
      bereicheFuer(roles)
        .find((bereich) => bereich.id === 'betrieb')
        ?.unterpunkte.find((punkt) => punkt.label === 'Team')
        ?.ansichten?.map((eintrag) => eintrag.to);
    expect(ansichten(['owner'])).toEqual([
      '/praxis/team',
      '/betrieb/arbeitszeit',
      '/betrieb/urlaub',
      '/betrieb/zeitkonto',
      '/betrieb/erstattungen',
    ]);
    // Die Trainingsbetreuung liest die Mitarbeiterliste nicht.
    expect(ansichten(['trainer'])).toEqual([
      '/betrieb/arbeitszeit',
      '/betrieb/urlaub',
      '/betrieb/zeitkonto',
      '/betrieb/erstattungen',
    ]);
    // Eine Arbeitszeit: die alte Adresse der Planung gehört zur selben Ansicht.
    const bereiche = bereicheFuer(['owner']);
    expect(aktiverBereich(bereiche, '/praxis/planung')?.id).toBe('betrieb');
  });

  it('zeigt im Kalender keine Unterzeile; die Tour gehoert trotzdem dazu', () => {
    // BEF-044, ANN-113: Die Tour ist eine Ansicht des Kalenders.
    const bereiche = bereicheFuer(['owner']);
    expect(bereiche.find((bereich) => bereich.id === 'termine')?.unterpunkte).toEqual([]);
    expect(aktiverBereich(bereiche, '/touren')?.id).toBe('termine');
  });

  it('oeffnet Organisation auf dem Eingang (ORG-004)', () => {
    for (const rolle of ['owner', 'therapist', 'office', 'trainer'] as RoleKey[]) {
      const betrieb = bereicheFuer([rolle]).find((bereich) => bereich.id === 'betrieb');
      expect(betrieb?.to, rolle).toBe('/betrieb');
      expect(betrieb?.unterpunkte[0]?.label, rolle).toBe('Eingang');
    }
  });

  it('zeigt einem reinen Trainingskonto Übersicht, Kalender, Training, Teamchat und Organisation', () => {
    // Seit TRN-003: Mitarbeitende und Kommunikation zeigen Daten, die der
    // Server nur der Behandlungsseite gibt (`app.is_staff()`). Organisation
    // seit ORG-001 mit dem, was die Trainingsbetreuung selbst betrifft.
    // Seit TEAM-001 dazu die Nachrichten - nur mit dem Teamchat (ANN-611).
    expect(ids(['trainer'])).toEqual(['heute', 'termine', 'training', 'team', 'betrieb']);
    expect(bereicheFuer(['trainer']).find((b) => b.id === 'team')?.to).toBe('/team');
    // Wer beide Rollen hat, sieht beides - Häufung, kein Schluss (§4.8).
    expect(ids(['therapist', 'trainer'])).toEqual(
      expect.arrayContaining(['patienten', 'training', 'betrieb']),
    );
    // Urlaub und Arbeitszeit stehen nicht mehr im Training.
    expect(aktiverBereich(bereicheFuer(['trainer']), '/betrieb/urlaub/beantragen')?.id).toBe(
      'betrieb',
    );
  });

  it('führt die Übungen genau einem Bereich zu, auch dem Büro (UEB-001, ANN-293, BEF-137)', () => {
    function bereichDerUebungen(roles: RoleKey[]) {
      const bereiche = bereicheFuer(roles);
      const mitPunkt = bereiche.filter((bereich) =>
        bereich.unterpunkte.some((eintrag) => eintrag.to === '/uebungen'),
      );
      expect(mitPunkt.length).toBeLessThanOrEqual(1);
      expect(aktiverBereich(bereiche, '/uebungen/u1')?.id).toBe(mitPunkt[0]?.id);
      return mitPunkt[0]?.id;
    }
    expect(bereichDerUebungen(['owner'])).toBe('betrieb');
    expect(bereichDerUebungen(['therapist'])).toBe('betrieb');
    expect(bereichDerUebungen(['team_lead'])).toBe('betrieb');
    expect(bereichDerUebungen(['therapist', 'trainer'])).toBe('betrieb');
    // Seit ORG-001 auch die Trainingsbetreuung unter Organisation → Bibliothek.
    expect(bereichDerUebungen(['trainer'])).toBe('betrieb');
    // Das Büro liest mit (ABN-030, BEF-137) - unter Organisation.
    expect(bereichDerUebungen(['office'])).toBe('betrieb');
  });
});

describe('Untermenü auf Detailseiten (UXR-002)', () => {
  function punkt(roles: RoleKey[], bereichId: string, to: string) {
    return bereicheFuer(roles)
      .find((bereich) => bereich.id === bereichId)
      ?.unterpunkte.find((eintrag) => eintrag.to === to);
  }

  it('markiert „Rechnungen" auch auf Rechnung, Blatt, Storno und Erinnerung (NAV-15, ABR-29)', () => {
    const rechnungen = punkt(['office'], 'abrechnung', '/abrechnung');
    expect(rechnungen?.label).toBe('Rechnungen');
    expect(rechnungen?.pfade).toEqual(['/abrechnung/rechnungen', '/abrechnung/erinnerungen']);
    // Nicht `end: false`: sonst leuchtete „Rechnungen" auch auf Zahlungen
    // und Auswertung.
    expect(rechnungen?.end).toBeUndefined();
  });

  it('markiert „Verordner:innen" auch auf den Formularen (VER-B01)', () => {
    expect(punkt(['therapist'], 'patienten', '/verordner')?.end).toBe(false);
  });

  it('nennt Menüpunkte wie die Seiten, die sie öffnen (ABR-26, ORG-07)', () => {
    expect(punkt(['owner'], 'abrechnung', '/abrechnung/katalog')?.label).toBe('Leistungskatalog');
    expect(ansicht(['owner'], 'Praxis', '/praxis/sicherheit/audit')?.label).toBe('Protokoll');
    expect(ansicht(['owner'], 'Team', '/betrieb/arbeitszeit')?.label).toBe('Arbeitszeit');
  });

  it('gibt der Suche die Wörter mit, die auf den Seiten stehen (ORG-07)', () => {
    expect(ansicht(['owner'], 'Praxis', '/praxis/einstellungen')?.stichworte).toEqual(
      expect.arrayContaining(['Praxisraster', 'Dokumentationsfrist', 'Startort']),
    );
    expect(ansicht(['owner'], 'Praxis', '/praxis/sicherheit/audit')?.stichworte).toEqual(
      expect.arrayContaining(['Audit', 'Zugriffe', 'Sicherheit']),
    );
  });

  it('verspricht Raster, Frist und Startort nur der Rolle, die sie sieht', () => {
    for (const rolle of ['therapist', 'team_lead', 'office'] as RoleKey[]) {
      expect(ansicht([rolle], 'Praxis', '/praxis/einstellungen'), rolle).toBeUndefined();
    }
  });
});

describe('aktiverBereich', () => {
  const bereiche = bereicheFuer(['owner']);

  it.each([
    ['/', 'heute'],
    ['/kalender', 'termine'],
    ['/termine/abc', 'termine'],
    ['/touren', 'termine'],
    ['/patienten', 'patienten'],
    ['/patienten/abc/bearbeiten', 'patienten'],
    ['/team', 'team'],
    ['/rueckfragen', 'team'],
    ['/rueckfragen/abc', 'team'],
    ['/praxis/team', 'betrieb'],
    ['/praxis/team/abc/bearbeiten', 'betrieb'],
    ['/betrieb/flotte', 'betrieb'],
    ['/betrieb/flotte/panne', 'betrieb'],
    ['/praxis/planung', 'betrieb'],
    ['/praxis/einstellungen', 'betrieb'],
    ['/betrieb', 'betrieb'],
    ['/betrieb/neu', 'betrieb'],
    ['/praxis/sicherheit/audit', 'betrieb'],
    ['/abrechnung/zahlungen', 'abrechnung'],
  ])('ordnet %s dem Bereich %s zu', (pfad, erwartet) => {
    expect(aktiverBereich(bereiche, pfad)?.id).toBe(erwartet);
  });

  it('ordnet die Terminanlage aus der Patientenakte dem Patientenbereich zu', () => {
    // Der Weg beginnt bei der Person - der Rueckweg fuehrt dorthin zurueck.
    expect(aktiverBereich(bereiche, '/patienten/abc/termine/neu')?.id).toBe('patienten');
  });

  it('markiert die Startseite nicht fuer jeden Pfad', () => {
    expect(aktiverBereich(bereiche, '/kalender')?.id).not.toBe('heute');
  });

  it('gibt fuer einen unbekannten Pfad keinen Bereich zurueck', () => {
    expect(aktiverBereich(bereiche, '/gibt-es-nicht')).toBeUndefined();
  });
});

describe('zeigtUnterleiste', () => {
  it.each([
    ['/patienten', true],
    ['/patienten/neu', true],
    ['/verordner', true],
    ['/verordner/neu', true],
    ['/patienten/abc', false],
    ['/patienten/abc/termine', false],
    ['/patienten/abc/termine/neu', false],
    ['/patienten/neuer-name', false],
  ])('%s -> %s', (pfad, erwartet) => {
    expect(zeigtUnterleiste(pfad)).toBe(erwartet);
  });
});

describe('tableiste (BEF-049, Option 2: Reife vor Reihenfolge)', () => {
  it('zeigt bis zu fuenf reife Bereiche unveraendert', () => {
    // Ein Patientenkonto hat nur die Uebersicht; ein Trainingskonto Uebersicht,
    // Kalender, Training. Nichts davon ist Vorschau: keine Leiste mit „Mehr".
    const patient = bereicheFuer(['patient']);
    expect(patient.every((bereich) => !bereich.vorschau)).toBe(true);
    expect(tableiste(patient)).toEqual({ sichtbar: patient, weitere: [] });
  });

  it('stellt fuenf reife Bereiche ohne „Mehr" in die Leiste - die Kommunikation ist seit KOM-002 reif', () => {
    // therapist: Uebersicht, Kalender, Patient:innen, Kommunikation,
    // Organisatorisches. Bis KOM-002 war die Kommunikation ganz Vorschau und
    // stand hinter „Mehr" (BEF-049); mit den Rückfragen steht sie wieder an
    // ihrem Platz (ANN-314).
    const alle = bereicheFuer(['therapist']);
    const { sichtbar, weitere } = tableiste(alle);
    expect(sichtbar.map((bereich) => bereich.id)).toEqual([
      'heute',
      'termine',
      'patienten',
      'team',
      'betrieb',
    ]);
    expect(weitere).toEqual([]);
    expect(alle.find((bereich) => bereich.id === 'team')?.vorschau).toBeUndefined();
  });

  it('stellt einen Bereich, der ganz Vorschau ist, hinter „Mehr" - auch wenn alles passte', () => {
    const alle = bereicheFuer(['therapist']).map((bereich) =>
      bereich.id === 'team' ? { ...bereich, vorschau: true } : bereich,
    );
    const { sichtbar, weitere } = tableiste(alle);
    expect(sichtbar.map((bereich) => bereich.id)).toEqual([
      'heute',
      'termine',
      'patienten',
      'betrieb',
    ]);
    expect(weitere.map((bereich) => bereich.id)).toEqual(['team']);
  });

  it('schiebt bei mehr als fuenf Bereichen den Rest hinter "Mehr", in Seitenleisten-Reihenfolge', () => {
    const alle = bereicheFuer(['owner']);
    const { sichtbar, weitere } = tableiste(alle);
    // Vier Bereiche plus der Eintrag "Mehr" - mehr Ziele sind mit dem Daumen
    // nicht mehr sicher zu treffen. Die ersten vier reifen Bereiche; dahinter
    // alle uebrigen, die Vorschau eingeschlossen, in der Reihenfolge der
    // Seitenleiste.
    expect(sichtbar).toHaveLength(4);
    expect(sichtbar.every((bereich) => !bereich.vorschau)).toBe(true);
    expect(sichtbar.map((bereich) => bereich.id)).toEqual([
      'heute',
      'termine',
      'patienten',
      'training',
    ]);
    expect(weitere.map((bereich) => bereich.id)).toEqual([
      'team',
      'betrieb',
      'abrechnung',
      'statistik',
    ]);
    expect(weitere.length).toBe(alle.length - 4);
  });

  it('gibt der Praxisleitung Organisation und dem Büro die Abrechnung in die Leiste (ORG-001)', () => {
    const owner = tableiste(bereicheFuer(['owner']), leistenvorrang(['owner']));
    expect(owner.sichtbar.map((bereich) => bereich.id)).toEqual([
      'heute',
      'termine',
      'patienten',
      'betrieb',
    ]);
    expect(owner.weitere.map((bereich) => bereich.id)).toEqual([
      'training',
      'team',
      'abrechnung',
      'statistik',
    ]);
    const buero = tableiste(bereicheFuer(['office']), leistenvorrang(['office']));
    expect(buero.sichtbar.map((bereich) => bereich.id)).toEqual([
      'heute',
      'termine',
      'patienten',
      'abrechnung',
    ]);
    // Die Trainingsbetreuung hat vier Bereiche - alle in der Leiste.
    const trainer = tableiste(bereicheFuer(['trainer']), leistenvorrang(['trainer']));
    expect(trainer.weitere).toEqual([]);
  });

  it('laesst die Seitenleiste und die Bereichsuebersicht unberuehrt', () => {
    // Nur die Tableiste sortiert nach Reife; `arbeitsbereiche` behaelt die
    // Reihenfolge mit der Kommunikation an ihrem Platz.
    const alle = bereicheFuer(['therapist']);
    expect(alle.map((bereich) => bereich.id)).toEqual([
      'heute',
      'termine',
      'patienten',
      'team',
      'betrieb',
    ]);
  });
});
