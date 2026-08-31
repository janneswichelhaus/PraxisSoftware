import { describe, expect, it } from 'vitest';
import { testUser } from '@/test-utils';
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

  it('haelt die Abrechnung von behandelnden Rollen fern', () => {
    expect(ids(['therapist'])).not.toContain('abrechnung');
    expect(ids(['team_lead'])).not.toContain('abrechnung');
    expect(canSeeBilling(['office'])).toBe(true);
    expect(canSeeBilling(['owner'])).toBe(true);
    expect(canSeeBilling(['therapist', 'team_lead'])).toBe(false);
  });

  it('zeigt die Personalakte nur Leitungsrollen', () => {
    function personalSichtbar(roles: RoleKey[]): boolean {
      const betrieb = bereicheFuer(roles).find((bereich) => bereich.id === 'betrieb');
      return Boolean(betrieb?.unterpunkte.some((punkt) => punkt.to === '/betrieb/personal'));
    }
    expect(personalSichtbar(['owner'])).toBe(true);
    expect(personalSichtbar(['team_lead'])).toBe(true);
    expect(personalSichtbar(['therapist'])).toBe(false);
    expect(personalSichtbar(['office'])).toBe(false);
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
    expect(touren?.vorschau).toBe(true);
  });

  it('ordnet die Arbeitszeiten dem Betrieb zu und nicht dem Kalender', () => {
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
    ['/team/verzeichnis', 'team'],
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
