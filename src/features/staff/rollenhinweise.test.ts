import { describe, expect, it } from 'vitest';
import {
  canManageAppointments,
  canManageInvoicing,
  canManageStaffAccounts,
  canManageStaffMasterData,
  canManageWorkingHours,
  canReadTreatmentNote,
  canWriteTreatmentNote,
  type RoleKey,
} from '@/features/session/types';
import { ROLLENHINWEISE } from './rollenhinweise';

/**
 * Die Hinweise an den Rollen-Kästchen gegen die Rechte der Rollen (ORG-01).
 *
 * Geprüft wird nicht der Wortlaut an sich, sondern dass jeder Satz zu dem
 * passt, was `session/types.ts` einer Rolle erlaubt. Ändert sich dort ein
 * Recht, wird dieser Test rot, bis der Satz nachgezogen ist - so wie E15 den
 * alten Satz „Kein klinischer Freitext" falsch gemacht hat, ohne dass es jemand
 * bemerkte.
 */
function hinweis(rolle: RoleKey): string {
  const text = ROLLENHINWEISE[rolle];
  if (!text) throw new Error(`Kein Hinweis fuer ${rolle}`);
  return text;
}

describe('ROLLENHINWEISE', () => {
  it.each(['therapist', 'team_lead', 'office', 'owner'] as const)(
    'beschreibt %s, wie die Rolle Dokumentation liest und schreibt',
    (rolle) => {
      const text = hinweis(rolle);
      const liest = canReadTreatmentNote([rolle]);
      const dokumentiert = canWriteTreatmentNote([rolle]);

      // „Wie Therapeut:in" verweist auf den Satz der Therapeut:in - das
      // stimmt nur, solange beide Rollen hier dasselbe dürfen.
      if (text.startsWith('Wie Therapeut:in')) {
        expect(liest).toBe(canReadTreatmentNote(['therapist']));
        expect(dokumentiert).toBe(canWriteTreatmentNote(['therapist']));
      } else if (liest) {
        expect(text).toMatch(/alle Akten/);
      }
      if (dokumentiert) {
        expect(text).toMatch(/dokumentiert|Wie Therapeut:in/);
      } else {
        // Wer nicht dokumentiert, liest das auch so.
        expect(text).toMatch(/schreibt aber keine klinischen Inhalte|Dokumentieren nur zusammen/);
      }
    },
  );

  it('sagt beim Praxismanagement nicht mehr, es sehe keinen klinischen Freitext (E15)', () => {
    expect(canReadTreatmentNote(['office'])).toBe(true);
    expect(hinweis('office')).toMatch(/Liest alle Akten einschließlich Dokumentation/);
    expect(hinweis('office')).not.toMatch(/Kein klinischer Freitext/);
  });

  it('nennt beim Praxismanagement genau die organisatorischen Rechte der Rolle', () => {
    const text = hinweis('office');
    expect(canManageAppointments(['office']) && text.includes('Termine')).toBe(true);
    expect(canManageWorkingHours(['office']) && text.includes('Arbeitszeiten')).toBe(true);
    expect(canManageInvoicing(['office']) && text.includes('Abrechnung')).toBe(true);
    expect(canManageStaffMasterData(['office']) && text.includes('Mitarbeiterstammdaten')).toBe(
      true,
    );
  });

  it('verspricht dem Praxisinhaber keinen Vollzugriff - allein dokumentiert die Rolle nicht', () => {
    expect(canWriteTreatmentNote(['owner'])).toBe(false);
    expect(hinweis('owner')).not.toMatch(/Vollzugriff/);
    expect(canManageStaffAccounts(['owner']) && hinweis('owner').includes('Zugänge')).toBe(true);
  });

  it('nennt bei der Teamleitung die Arbeitszeiten und keine Auswertungen, die es nicht gibt', () => {
    expect(canManageWorkingHours(['team_lead'])).toBe(true);
    expect(canManageWorkingHours(['therapist'])).toBe(false);
    expect(hinweis('team_lead')).toMatch(/Arbeitszeiten/);
    expect(hinweis('team_lead')).not.toMatch(/Auswertungen|Dienstplan/);
  });
});
