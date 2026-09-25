import { describe, expect, it } from 'vitest';
import { testUser } from '@/test-utils';
import type { SubNavEintrag } from '@/components/ui/SubNav';
import type { RoleKey } from '@/features/session/types';
import { aktiverBereich, arbeitsbereiche, canSeeBilling, tableiste } from './navigation';

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

describe('Arbeitsbereiche je Rolle', () => {
  it('zeigt einem Patientenkonto nur den eigenen Tag', () => {
    expect(ids(['patient'])).toEqual(['heute']);
  });

  it('zeigt owner alle sechs Bereiche', () => {
    expect(ids(['owner'])).toEqual([
      'heute',
      'termine',
      'patienten',
      'team',
      'betrieb',
      'abrechnung',
    ]);
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
      team: 'Kommunikation',
      betrieb: 'Organisatorisches',
      abrechnung: 'Abrechnung',
    });
  });

  it('kuerzt fuer die Tableiste nur, wo die volle Bezeichnung nicht passt', () => {
    // Bei 375 px bleiben je Ziel 67 px fuer die Beschriftung. Gemessen in
    // Hanken Grotesk bei 11 px passen bis zu rund 13 Zeichen; "Kommunikation"
    // (76 px) und "Organisatorisches" (89 px) passen nicht und wuerden die
    // Seite waagerecht scrollen lassen. Das Mass selbst prueft
    // tests/e2e/authenticated/navigation-workflows.spec.ts im Browser -
    // jsdom kennt keine Breiten.
    const kurzformen = Object.fromEntries(
      bereicheFuer(['owner']).map((bereich) => [bereich.id, bereich.kurz]),
    );
    expect(kurzformen).toEqual({
      heute: 'Übersicht',
      termine: 'Kalender',
      patienten: 'Patienten',
      team: 'Nachrichten',
      betrieb: 'Organisation',
      abrechnung: 'Abrechnung',
    });
    for (const kurz of Object.values(kurzformen)) {
      expect(kurz.length).toBeLessThanOrEqual(13);
    }
  });

  it('haelt die Abrechnung von behandelnden Rollen fern', () => {
    expect(ids(['therapist'])).not.toContain('abrechnung');
    expect(ids(['team_lead'])).not.toContain('abrechnung');
    expect(canSeeBilling(['office'])).toBe(true);
    expect(canSeeBilling(['owner'])).toBe(true);
    expect(canSeeBilling(['therapist', 'team_lead'])).toBe(false);
  });

  it('fuehrt die Mitarbeiterverwaltung fuer alle Praxisrollen unter Organisatorisches', () => {
    function mitarbeitende(roles: RoleKey[]): SubNavEintrag | undefined {
      const betrieb = bereicheFuer(roles).find((bereich) => bereich.id === 'betrieb');
      return betrieb?.unterpunkte.find((punkt) => punkt.to === '/praxis/team');
    }
    // Die Liste ist fuer alle Praxisrollen lesbar (STAFF-001); ueber das
    // Schreiben entscheidet die Seite und - verbindlich - der Server.
    for (const rolle of ['owner', 'team_lead', 'therapist', 'office'] as RoleKey[]) {
      expect(mitarbeitende([rolle])).toBeDefined();
    }
    // Sie ist angebunden und traegt deshalb keine Vorschaukennzeichnung.
    expect(mitarbeitende(['owner'])?.vorschau).toBeUndefined();
  });

  it('stellt der Vorschau unter Organisatorisches die angebundenen Punkte voran', () => {
    const betrieb = bereicheFuer(['owner']).find((bereich) => bereich.id === 'betrieb');
    const punkte = betrieb?.unterpunkte ?? [];
    const ersteVorschau = punkte.findIndex((punkt) => punkt.vorschau);
    const letzteEchte = punkte.map((punkt) => Boolean(punkt.vorschau)).lastIndexOf(false);
    expect(ersteVorschau).toBeGreaterThan(letzteEchte);
  });

  it('fuehrt kein zweites, synthetisches Teamverzeichnis', () => {
    const team = bereicheFuer(['owner']).find((bereich) => bereich.id === 'team');
    expect(team?.unterpunkte).toHaveLength(0);
  });

  it('zeigt den Sicherheitsbereich nur der administrativen Praxisrolle', () => {
    function sicherheitSichtbar(roles: RoleKey[]): boolean {
      const betrieb = bereicheFuer(roles).find((bereich) => bereich.id === 'betrieb');
      return Boolean(betrieb?.unterpunkte.some((punkt) => punkt.to === '/praxis/sicherheit/audit'));
    }
    expect(sicherheitSichtbar(['owner'])).toBe(true);
    expect(sicherheitSichtbar(['team_lead'])).toBe(false);
  });

  it('kennzeichnet noch nicht angebundene Unterpunkte als Vorschau', () => {
    const termine = bereicheFuer(['owner']).find((bereich) => bereich.id === 'termine');
    const kalender = termine?.unterpunkte.find((punkt) => punkt.to === '/kalender');
    const touren = termine?.unterpunkte.find((punkt) => punkt.to === '/touren');
    expect(kalender?.vorschau).toBeUndefined();
    // Seit MAP-006 echt angebunden.
    expect(touren?.vorschau).toBeUndefined();
    const betrieb = bereicheFuer(['owner']).find((bereich) => bereich.id === 'betrieb');
    const flotte = betrieb?.unterpunkte.find((punkt) => punkt.to === '/betrieb/flotte');
    expect(flotte?.vorschau).toBe(true);
  });

  it('ordnet die Arbeitszeiten dem Organisatorischen zu und nicht dem Kalender', () => {
    const betrieb = bereicheFuer(['owner']).find((bereich) => bereich.id === 'betrieb');
    expect(betrieb?.unterpunkte.map((punkt) => punkt.to)).toContain('/praxis/planung');
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
    ['/praxis/team', 'betrieb'],
    ['/praxis/team/abc/bearbeiten', 'betrieb'],
    ['/betrieb/flotte', 'betrieb'],
    ['/betrieb/flotte/panne', 'betrieb'],
    ['/praxis/planung', 'betrieb'],
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

describe('tableiste', () => {
  it('zeigt bis zu fuenf Bereiche unveraendert', () => {
    const wenige = bereicheFuer(['therapist']);
    expect(wenige.length).toBeLessThanOrEqual(5);
    expect(tableiste(wenige).weitere).toEqual([]);
  });

  it('schiebt bei mehr als fuenf Bereichen den Rest hinter "Mehr"', () => {
    const alle = bereicheFuer(['owner']);
    const { sichtbar, weitere } = tableiste(alle);
    // Vier Bereiche plus der Eintrag "Mehr" - mehr Ziele sind mit dem Daumen
    // nicht mehr sicher zu treffen.
    expect(sichtbar).toHaveLength(4);
    expect(weitere.length).toBe(alle.length - 4);
    expect([...sichtbar, ...weitere]).toEqual(alle);
  });
});
