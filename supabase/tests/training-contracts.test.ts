import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Den Trainingsvertrag im eigenen Konto schließen (KND-003,
 * PROJECT_PRINCIPLES.md 4.10, ADR-021 Punkte 3 und 7, ADR-023 Punkte 19,
 * 22, 23).
 *
 *   * Ein Aufruf legt Verhältnis, freigegebene Kontaktdaten, eigenen Zugang,
 *     Einwilligung, Paket mit Leistung, Kopien und Nachweis an (ANN-288).
 *   * Angaben zur Gesundheit nur mit Einwilligung; früher Beginn nur auf
 *     Verlangen; Fassung der Belehrung muss stimmen.
 *   * Annehmen nur der eigene Zugang (ANN-289); die rechtliche Vertretung
 *     sieht, die Begleitung nicht.
 *   * Negativfälle: fremde Person, anderer Bereich, gesperrt, Praxiskonto,
 *     andere Organisation, Begleitung, abgelaufenes Angebot.
 */

const { users, platformAccesses, patients, persons, trainingRelationships, organizationId } = SEED;
const ERIKA = platformAccesses.erikaBehandlung;
const TINA = platformAccesses.tinaTraining;
const PAULA = platformAccesses.paulaBegleitungMax;
const TP3 = 'cccccccc-cccc-4ccc-8ccc-000000000014';
const FASSUNG = '2026-10';

const BERND = 'cafecafe-cafe-4afe-8afe-0000000000e2';
const KONTO_BERND = '99999999-9999-4999-8999-0000000000e2';

const SICHT = 'select public.platform_training_offer($1::uuid) as angebot';
const ANNEHMEN = `select public.accept_platform_training_offer(
  $1::uuid, $2::uuid, $3::integer[], $4::boolean, $5::boolean, $6::boolean, $7::text) as bestaetigung`;
const VERTRAG = 'select public.platform_training_contract($1::uuid) as vertrag';

const UEBERGABE = [
  { title: 'Belastungsgrenzen', body: 'Keine Sprünge bis Dezember.' },
  { title: 'Vorgeschichte', body: 'Kreuzbandplastik links im März.' },
];

interface Angebot {
  id: string;
  label: string;
  price_cents: number;
  starts_on: string;
  ends_on: string;
  handover_items: Array<{ title: string; body: string }>;
  contact: Record<string, string | null> | null;
  early_start: boolean;
  blocker: string | null;
  can_accept: boolean;
  wording_version: string;
  practice: { name: string; city: string | null };
}

async function tag(ausdruck: string): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    `select to_char((${ausdruck})::date, 'YYYY-MM-DD') as tag
       from (select (now() at time zone 'Europe/Berlin')::date as heute) h`,
  );
  return rows[0]!.tag;
}

/** Erika ohne Training, Behandlung gestern abgeschlossen. */
async function vorbereiten(mitTraining = false) {
  if (!mitTraining) {
    await asPostgres('delete from public.training_relationships where id = $1', [
      trainingRelationships.erika,
    ]);
  }
  await asPostgres(
    `update public.patients set care_concluded_on = $2::date, care_concluded_at = now(),
            care_concluded_by = $3 where id = $1`,
    [patients.erika, await tag('heute - 1'), users.ownerTherapist],
  );
}

async function anbieten(beginn: string, patient: string = patients.erika): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(
    users.therapist,
    'select public.create_training_offer($1::uuid, $2::uuid, $3::date, $4::jsonb, true) as id',
    [patient, TP3, beginn, JSON.stringify(UEBERGABE)],
  );
  return rows[0]!.id;
}

async function sicht(konto: string, zugang: string): Promise<Angebot | null> {
  const { rows } = await asUser<{ angebot: Angebot | null }>(konto, SICHT, [zugang]);
  return rows[0]!.angebot;
}

function annehmen(
  angebot: string,
  werte: {
    freigabe?: number[];
    kontakt?: boolean;
    einwilligung?: boolean;
    frueh?: boolean;
    fassung?: string;
    konto?: string;
    zugang?: string;
  } = {},
) {
  return asUserCommitted<{ bestaetigung: Record<string, unknown> }>(
    werte.konto ?? users.plattformErika,
    ANNEHMEN,
    [
      werte.zugang ?? ERIKA,
      angebot,
      werte.freigabe ?? [1],
      werte.kontakt ?? true,
      werte.einwilligung ?? true,
      werte.frueh ?? false,
      werte.fassung ?? FASSUNG,
    ],
  );
}

async function neuesVerhaeltnis(): Promise<string | null> {
  const { rows } = await asPostgres<{ id: string }>(
    'select id from public.training_relationships where person_id = $1',
    [persons.erika],
  );
  return rows[0]?.id ?? null;
}

describe('Trainingsvertrag im eigenen Konto (KND-003)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  describe('Das Angebot im Konto', () => {
    it('zeigt Paket, Zeitraum, Angaben, Kontaktdaten und Praxis', async () => {
      await vorbereiten();
      const beginn = await tag('heute + 20');
      const id = await anbieten(beginn);
      const angebot = await sicht(users.plattformErika, ERIKA);
      expect(angebot).toMatchObject({
        id,
        price_cents: 39000,
        starts_on: beginn,
        ends_on: await tag(`(date '${beginn}' + interval '3 months')::date - 1`),
        handover_items: UEBERGABE,
        early_start: false,
        blocker: null,
        can_accept: true,
        wording_version: FASSUNG,
      });
      expect(angebot!.contact).toMatchObject({
        street: 'Testweg',
        house_number: '7',
        city: 'Tuebingen',
        phone: '+49 160 0000006',
      });
      expect(angebot!.practice.name).toBe('Test Praxis Tuebingen');
    });

    it('nennt den frühen Beginn innerhalb der Widerrufsfrist', async () => {
      await vorbereiten();
      await anbieten(await tag('heute + 5'));
      expect((await sicht(users.plattformErika, ERIKA))!.early_start).toBe(true);
    });

    it.each([
      ['eine laufende Behandlung', 'care_open'],
      ['ein Trainingsverhältnis', 'has_training'],
    ])('sperrt das Annehmen bei %s', async (_name, grund) => {
      if (grund === 'care_open') {
        await asPostgres('delete from public.training_relationships where id = $1', [
          trainingRelationships.erika,
        ]);
      } else {
        await vorbereiten(true);
      }
      const id = await anbieten(await tag('heute + 20'));
      const angebot = await sicht(users.plattformErika, ERIKA);
      expect(angebot).toMatchObject({ blocker: grund, can_accept: false });
      await expect(annehmen(id)).rejects.toThrow(grund);
    });
  });

  describe('Annehmen', () => {
    it('legt alles in einem Aufruf an (ANN-288)', async () => {
      await vorbereiten();
      const beginn = await tag('heute + 20');
      const id = await anbieten(beginn);
      const { rows } = await annehmen(id);
      const bestaetigung = rows[0]!.bestaetigung;
      expect(bestaetigung).toMatchObject({
        label: expect.stringMatching(/3 Monate/) as unknown,
        price_cents: 39000,
        starts_on: beginn,
        withdrawal_ends_on: await tag('heute + 14'),
        early_start_requested: false,
        contact_released: true,
        health_consent_granted: true,
        released_titles: ['Belastungsgrenzen'],
      });

      const rel = await neuesVerhaeltnis();
      expect(rel).not.toBeNull();
      const pruefe = async (sql: string) =>
        (await asPostgres<{ n: number }>(sql, [rel])).rows[0]!.n;
      expect(
        await pruefe(
          `select count(*)::int as n from public.training_contact_details
            where training_relationship_id = $1 and street = 'Testweg' and phone = '+49 160 0000006'`,
        ),
      ).toBe(1);
      expect(
        await pruefe(
          `select count(*)::int as n from public.platform_accesses
            where training_relationship_id = $1 and status = 'active' and access_kind = 'self'
              and account_user_id = '${users.plattformErika}'`,
        ),
      ).toBe(1);
      expect(
        await pruefe(
          `select count(*)::int as n from public.training_consent_records
            where training_relationship_id = $1 and record_kind = 'consent_granted' and source = 'platform'`,
        ),
      ).toBe(1);
      expect(
        await pruefe(
          `select count(*)::int as n from public.billable_services b
             join public.training_packages k on k.id = b.training_package_id
            where k.training_relationship_id = $1`,
        ),
      ).toBe(1);
      expect(
        await pruefe(
          `select count(*)::int as n from public.training_takeovers
            where training_relationship_id = $1 and title = 'Belastungsgrenzen'
              and body = 'Keine Sprünge bis Dezember.'`,
        ),
      ).toBe(1);
      expect(
        await pruefe(
          `select count(*)::int as n from public.training_contracts
            where training_relationship_id = $1 and wording_version = '${FASSUNG}'`,
        ),
      ).toBe(1);

      // ANN-285: Die Akte sieht nur, dass und wann.
      const { rows: offer } = await asPostgres<{ accepted: boolean }>(
        'select accepted_at is not null as accepted from public.training_offers where id = $1',
        [id],
      );
      expect(offer[0]!.accepted).toBe(true);
      // Der neue Zugang steht im Auditlog.
      const { rows: audit } = await asPostgres<{ n: number }>(
        `select count(*)::int as n from public.audit_log
          where action = 'platform_access.activated' and actor_kind = 'platform'
            and context ->> 'via' = 'training_contract'`,
      );
      expect(audit[0]!.n).toBe(1);
      // Danach ist das Angebot nicht mehr offen.
      expect(await sicht(users.plattformErika, ERIKA)).toBeNull();
      await expect(annehmen(id)).rejects.toThrow(/not open/);
    });

    it('übernimmt ohne Freigabe weder Kontaktdaten noch Angaben', async () => {
      await vorbereiten();
      const id = await anbieten(await tag('heute + 20'));
      await annehmen(id, { freigabe: [], kontakt: false, einwilligung: false });
      const rel = await neuesVerhaeltnis();
      const { rows } = await asPostgres<{ kontakt: number; kopien: number; einw: number }>(
        `select (select count(*)::int from public.training_contact_details where training_relationship_id = $1) as kontakt,
                (select count(*)::int from public.training_takeovers where training_relationship_id = $1) as kopien,
                (select count(*)::int from public.training_consent_records where training_relationship_id = $1) as einw`,
        [rel],
      );
      expect(rows[0]).toEqual({ kontakt: 0, kopien: 0, einw: 0 });
    });

    it('kopiert Angaben zur Gesundheit nur mit Einwilligung (ADR-021 Punkt 7)', async () => {
      await vorbereiten();
      const id = await anbieten(await tag('heute + 20'));
      await expect(annehmen(id, { freigabe: [1], einwilligung: false })).rejects.toThrow(
        /health consent required/,
      );
      expect(await neuesVerhaeltnis()).toBeNull();
    });

    it('verlangt den frühen Beginn ausdrücklich (ANN-288)', async () => {
      await vorbereiten();
      const id = await anbieten(await tag('heute + 5'));
      await expect(annehmen(id)).rejects.toThrow(/early start must be requested/);
      const { rows } = await annehmen(id, { frueh: true });
      expect(rows[0]!.bestaetigung['early_start_requested']).toBe(true);
    });

    it.each([
      ['eine alte Fassung', { fassung: '2025-01' }, /wording outdated/],
      ['eine Angabe, die es nicht gibt', { freigabe: [3] }, /release items invalid/],
      ['eine doppelte Angabe', { freigabe: [1, 1] }, /release items invalid/],
    ])('weist %s ab', async (_name, werte, fehler) => {
      await vorbereiten();
      const id = await anbieten(await tag('heute + 20'));
      await expect(annehmen(id, werte)).rejects.toThrow(fehler);
      expect(await neuesVerhaeltnis()).toBeNull();
    });

    it('weist Kontaktdaten ab, die nicht angeboten sind', async () => {
      await vorbereiten();
      const { rows } = await asUserCommitted<{ id: string }>(
        users.therapist,
        `select public.create_training_offer($1::uuid, $2::uuid, $3::date, '[]'::jsonb, false) as id`,
        [patients.erika, TP3, await tag('heute + 20')],
      );
      await expect(annehmen(rows[0]!.id, { freigabe: [] })).rejects.toThrow(/not offered/);
    });

    it('lässt ein abgelaufenes oder zurückgezogenes Angebot nicht annehmen', async () => {
      await vorbereiten();
      const id = await anbieten(await tag('heute + 20'));
      await asPostgres(
        `update public.training_offers set valid_until = (now() at time zone 'Europe/Berlin')::date - 1`,
      );
      expect(await sicht(users.plattformErika, ERIKA)).toBeNull();
      await expect(annehmen(id)).rejects.toThrow(/not open/);
    });
  });

  describe('Negativfälle (ADR-023 Punkt 23)', () => {
    it('zeigt der Begleitung nichts und lässt sie nicht annehmen', async () => {
      await vorbereiten();
      const id = await anbieten(await tag('heute + 20'), patients.max);
      expect(await sicht(users.plattformPaula, PAULA)).toBeNull();
      await expect(annehmen(id, { konto: users.plattformPaula, zugang: PAULA })).rejects.toThrow(
        /not allowed/,
      );
    });

    it('zeigt der rechtlichen Vertretung, lässt sie aber nicht annehmen (ANN-289)', async () => {
      await vorbereiten();
      await asPostgres(
        `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', 'bernd.knd@patient.invalid')`,
        [KONTO_BERND],
      );
      await asPostgres(
        `insert into public.platform_accesses
           (id, organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
            status, activated_at, access_kind, legal_basis, representative_name, proof_documents,
            health_scope, finance_scope, proof_recorded_by, proof_recorded_at, created_by)
         values ($1, $2, 'treatment', $3, $3, $4, 'active', now(), 'legal_representative',
                 'guardianship', 'Bernd Betreuer', array['identity_document', 'guardianship_certificate'],
                 true, true, $5, now(), $5)`,
        [BERND, organizationId, patients.erika, KONTO_BERND, users.office],
      );
      const id = await anbieten(await tag('heute + 20'));
      expect(await sicht(KONTO_BERND, BERND)).toMatchObject({ id, can_accept: false });
      await expect(annehmen(id, { konto: KONTO_BERND, zugang: BERND })).rejects.toThrow(
        /not allowed/,
      );
    });

    it('lässt kein fremdes Angebot über den eigenen Zugang annehmen', async () => {
      await vorbereiten();
      const fremd = await anbieten(await tag('heute + 20'), patients.max);
      await expect(annehmen(fremd)).rejects.toThrow(/not found/);
    });

    it('zeigt über einen fremden oder den Trainingszugang nichts', async () => {
      await vorbereiten();
      await anbieten(await tag('heute + 20'));
      expect(await sicht(users.plattformTina, TINA)).toBeNull();
      expect(await sicht(users.plattformTina, ERIKA)).toBeNull();
    });

    it('zeigt über einen gesperrten Zugang nichts', async () => {
      await vorbereiten();
      const id = await anbieten(await tag('heute + 20'));
      await asPostgres(
        `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
        [ERIKA],
      );
      expect(await sicht(users.plattformErika, ERIKA)).toBeNull();
      await expect(annehmen(id)).rejects.toThrow(/not allowed/);
    });

    it('zeigt Praxiskonten und einer fremden Praxis nichts', async () => {
      await vorbereiten();
      const id = await anbieten(await tag('heute + 20'));
      expect(await sicht(users.office, ERIKA)).toBeNull();
      await expect(annehmen(id, { konto: users.office })).rejects.toThrow(/not allowed/);
      const fremd = await fremdeOrganisation();
      expect(await sicht(fremd.owner, ERIKA)).toBeNull();
    });
  });

  describe('Der eigene Vertrag', () => {
    it('steht im neuen Zugang zum Training und im Export', async () => {
      await vorbereiten();
      const id = await anbieten(await tag('heute + 20'));
      const { rows } = await annehmen(id);
      const zugang = rows[0]!.bestaetigung['training_access_id'] as string;
      const { rows: v } = await asUser<{ vertrag: Record<string, unknown> | null }>(
        users.plattformErika,
        VERTRAG,
        [zugang],
      );
      expect(v[0]!.vertrag).toMatchObject({
        price_cents: 39000,
        released_titles: ['Belastungsgrenzen'],
        withdrawal_ends_on: await tag('heute + 14'),
      });
      // In der Behandlung gibt es keinen Trainingsvertrag.
      const { rows: b } = await asUser<{ vertrag: unknown }>(users.plattformErika, VERTRAG, [
        ERIKA,
      ]);
      expect(b[0]!.vertrag).toBeNull();
      const { rows: e } = await asUserCommitted<{ daten: { training_contract: unknown } }>(
        users.plattformErika,
        'select public.platform_export($1::uuid) as daten',
        [zugang],
      );
      expect(e[0]!.daten.training_contract).toMatchObject({ price_cents: 39000 });
    });

    it('zeigt der Akte das Angebot als angenommen (ANN-285)', async () => {
      await vorbereiten();
      const id = await anbieten(await tag('heute + 20'));
      await annehmen(id);
      const { rows } = await asUser<{ sicht: { offers: Array<{ state: string }> } }>(
        users.therapist,
        'select public.get_patient_training_offers($1::uuid) as sicht',
        [patients.erika],
      );
      expect(rows[0]!.sicht.offers[0]!.state).toBe('accepted');
    });
  });
});

/**
 * Den Trainingsvertrag widerrufen (KND-004, Par. 356a BGB, ANN-290): Knopf
 * im Konto, Eingangsbestätigung, nur in der Frist und einmal; die Praxis
 * sieht den Widerruf in Offene Punkte und am Verhältnis.
 */
describe('Widerruf über die Plattform (KND-004)', () => {
  const WIDERRUFEN =
    'select public.withdraw_platform_training_contract($1::uuid, $2::uuid) as eingang';
  const OFFEN = 'select * from public.list_platform_training_withdrawals()';
  const NACHWEIS = 'select public.get_training_contracts($1::uuid) as vertraege';

  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function gebucht(): Promise<{ zugang: string; vertrag: string; rel: string }> {
    await vorbereiten();
    const id = await anbieten(await tag('heute + 20'));
    const { rows } = await annehmen(id);
    const b = rows[0]!.bestaetigung;
    return {
      zugang: b['training_access_id'] as string,
      vertrag: b['contract_id'] as string,
      rel: (await neuesVerhaeltnis())!,
    };
  }

  it('nimmt den Widerruf an, bestätigt den Eingang und zeigt ihn der Praxis', async () => {
    const { zugang, vertrag, rel } = await gebucht();
    const { rows: vorher } = await asUser<{ vertrag: { can_withdraw: boolean } }>(
      users.plattformErika,
      VERTRAG,
      [zugang],
    );
    expect(vorher[0]!.vertrag.can_withdraw).toBe(true);

    const { rows } = await asUserCommitted<{ eingang: Record<string, unknown> }>(
      users.plattformErika,
      WIDERRUFEN,
      [zugang, vertrag],
    );
    expect(rows[0]!.eingang).toMatchObject({ withdrawn_on: await tag('heute') });
    expect(rows[0]!.eingang['withdrawn_at']).toBeTruthy();

    const { rows: nachher } = await asUser<{
      vertrag: { can_withdraw: boolean; withdrawn_at: string };
    }>(users.plattformErika, VERTRAG, [zugang]);
    expect(nachher[0]!.vertrag).toMatchObject({ can_withdraw: false });
    expect(nachher[0]!.vertrag.withdrawn_at).toBeTruthy();
    await expect(asUser(users.plattformErika, WIDERRUFEN, [zugang, vertrag])).rejects.toThrow(
      /already withdrawn/,
    );

    const { rows: offen } = await asUser<{ contract_id: string; withdrawn_access_kind: string }>(
      users.office,
      OFFEN,
    );
    expect(offen).toEqual([
      expect.objectContaining({ contract_id: vertrag, withdrawn_access_kind: 'self' }),
    ]);
    const { rows: n } = await asUser<{ vertraege: Array<{ withdrawn_on: string }> }>(
      users.ownerTherapist,
      NACHWEIS,
      [rel],
    );
    expect(n[0]!.vertraege[0]!.withdrawn_on).toBe(await tag('heute'));

    // Der Widerruf löscht und storniert nichts selbst (ANN-290).
    const { rows: paket } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.training_packages where training_relationship_id = $1',
      [rel],
    );
    expect(paket[0]!.n).toBe(1);
  });

  it('lässt nach dem Ende der Frist nicht mehr widerrufen', async () => {
    const { zugang, vertrag } = await gebucht();
    await asPostgres(
      `update public.training_contracts
          set concluded_on = concluded_on - 20, withdrawal_ends_on = concluded_on - 6
        where id = $1`,
      [vertrag],
    );
    const { rows } = await asUser<{ vertrag: { can_withdraw: boolean } }>(
      users.plattformErika,
      VERTRAG,
      [zugang],
    );
    expect(rows[0]!.vertrag.can_withdraw).toBe(false);
    await expect(asUser(users.plattformErika, WIDERRUFEN, [zugang, vertrag])).rejects.toThrow(
      /period has ended/,
    );
  });

  it('weist Behandlungszugang, fremde Konten und die Praxis ab', async () => {
    const { zugang, vertrag, rel } = await gebucht();
    await expect(asUser(users.plattformErika, WIDERRUFEN, [ERIKA, vertrag])).rejects.toThrow(
      /not allowed/,
    );
    await expect(asUser(users.plattformTina, WIDERRUFEN, [zugang, vertrag])).rejects.toThrow(
      /not allowed/,
    );
    await expect(asUser(users.plattformTina, WIDERRUFEN, [TINA, vertrag])).rejects.toThrow(
      /not found/,
    );
    await expect(asUser(users.office, WIDERRUFEN, [zugang, vertrag])).rejects.toThrow(
      /not allowed/,
    );
    // Die Trainingsbetreuung sieht weder Offene Punkte noch Nachweis.
    expect((await asUser(users.trainer, OFFEN)).rows).toEqual([]);
    const { rows } = await asUser<{ vertraege: unknown }>(users.trainer, NACHWEIS, [rel]);
    expect(rows[0]!.vertraege).toBeNull();
    const fremd = await fremdeOrganisation();
    const { rows: f } = await asUser<{ vertraege: unknown }>(fremd.owner, NACHWEIS, [rel]);
    expect(f[0]!.vertraege).toBeNull();
  });
});
