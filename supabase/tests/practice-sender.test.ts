import { beforeAll, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asAnon,
  asUser,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Absender auf Blättern an Patient:innen (UX-009a, BEF-052, ANN-323).
 *
 * Geprüft wird vor allem, was die Projektion NICHT liefert: Steuernummer,
 * USt-IdNr. und Bankverbindung bleiben beim Leserecht der Stammdaten (owner,
 * office), auch wenn therapist das Blatt druckt (ADR-013 Punkt 9 Nr. 3).
 */

const { users } = SEED;
const ABSENDER = 'select public.get_practice_sender() as absender';

type Absender = Record<string, string | null> | null;

async function lesen(userId: string): Promise<Absender> {
  const { rows } = await asUser<{ absender: Absender }>(userId, ABSENDER);
  return rows[0]?.absender ?? null;
}

describe('UX-009a: Absender der Praxis', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('liefert %s Name, Anschrift, Telefon und E-Mail', async (_rolle, userId) => {
    expect(await lesen(userId)).toEqual({
      name: 'Test Praxis Tuebingen',
      street: 'Musterallee',
      house_number: '1',
      postal_code: '72070',
      city: 'Tuebingen',
      phone: '+49 7071 0000000',
      email: 'rechnung@praxis.invalid',
    });
  });

  it('liefert weder Steuer- noch Bankangaben noch Rechnungseinstellungen', async () => {
    const absender = await lesen(users.therapist);
    const text = JSON.stringify(absender);
    for (const verboten of [
      'tax_number',
      'vat_id',
      'small_business',
      'iban',
      'bic',
      'bank_name',
      'account_holder',
      'invoice_number_prefix',
      'payment_term_days',
    ]) {
      expect(Object.keys(absender ?? {})).not.toContain(verboten);
    }
    expect(text).not.toMatch(/DE02120300000000202051|86123\/45678|Testbank/);
  });

  it('liefert der fremden Praxis nur ihren eigenen Namen, ohne Stammdaten', async () => {
    // Die zweite Praxis hat keine Stammdaten: Sie sieht den Namen ihrer
    // Organisation (Rückfall wie ANN-123), nie den Absender der ersten (ADR-003).
    expect(await lesen(FREMDE_ORGANISATION.owner)).toEqual({ name: 'Test Praxis Woanders' });
  });

  it('weist ein Konto ohne Praxisrolle ab und protokolliert die Abweisung', async () => {
    await erwarteAbgewiesenenLeseversuch(
      users.patientMax,
      'select absender from (select public.get_practice_sender() as absender) s where absender is not null',
      [],
      'practice_sender.read',
    );
  });

  it('weist die Trainingsbetreuung ab', async () => {
    await erwarteAbgewiesenenLeseversuch(
      users.trainer,
      'select absender from (select public.get_practice_sender() as absender) s where absender is not null',
      [],
      'practice_sender.read',
    );
  });

  it('weist ein Plattformkonto ohne Profil mit Ausnahme ab', async () => {
    await expect(lesen(users.plattformErika)).rejects.toThrow(/not allowed|permission/i);
  });

  it('weist einen anonymen Zugriff ab', async () => {
    await expect(asAnon(ABSENDER)).rejects.toThrow(/permission denied|not authenticated/i);
  });
});
