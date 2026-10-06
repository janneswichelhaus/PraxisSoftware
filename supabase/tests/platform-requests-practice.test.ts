import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
  tagInTagen,
} from './helpers/db';

/**
 * Terminwünsche in der Praxis (POR-011, DSN-001 Abschnitt 6, D4, ANN-244).
 *
 * Wer Termine eines Kontexts verwaltet, sieht und beantwortet die Wünsche
 * dieses Kontexts; die Absage aus einem Absagewunsch trägt den Zeitpunkt des
 * Wunsches als Eingang und rechnet die Frist wie jede Absage.
 */

const { users, platformAccesses, patients, organizationId } = SEED;
const LISTE = 'select * from public.list_platform_appointment_requests($1)';
const ANTWORT = `select public.resolve_platform_appointment_request($1::uuid, $2, $3, $4::uuid) as ok`;
const ABSAGE = `select public.cancel_appointment_from_request($1::uuid, $2::timestamptz) as id`;
const WUNSCH = `select public.request_platform_appointment($1::uuid, $2::date[], $3::text[], $4) as id`;
const AENDERN = `select public.request_platform_appointment_change(
  $1::uuid, $2::uuid, $3, $4::date[], $5::text[], $6) as id`;

const MORGEN = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000009f1';
const IN_DREI_TAGEN = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000009f2';

interface Zeile {
  id: string;
  kind: string;
  relationship_kind: string;
  given_name: string;
  family_name: string;
  appointment_id: string | null;
  appointment_updated_at: string | null;
  status: string;
  requested_by: string;
  representative_name: string | null;
  answer: string | null;
}

async function kuenftigeTermine() {
  await asPostgres(
    `insert into public.appointments
       (id, organization_id, kind, patient_id, staff_member_id, appointment_type, status,
        starts_at, ends_at, visit_street, visit_house_number, visit_postal_code, visit_city, created_by)
     values
       ($1, $3, 'therapy', $4, '55555555-5555-4555-8555-000000000002', 'home_visit', 'confirmed',
        now() + interval '20 hours', now() + interval '21 hours', 'Testweg', '7', '72072', 'Tuebingen', $5),
       ($2, $3, 'therapy', $4, '55555555-5555-4555-8555-000000000002', 'home_visit', 'confirmed',
        now() + interval '3 days', now() + interval '3 days 1 hour', 'Testweg', '7', '72072', 'Tuebingen', $5)`,
    [MORGEN, IN_DREI_TAGEN, organizationId, patients.erika, users.office],
  );
}

async function neuerWunsch(konto: string, zugang: string): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, WUNSCH, [
    zugang,
    [tagInTagen(5)],
    ['morning'],
    null,
  ]);
  return rows[0]!.id;
}

async function absagewunsch(terminId: string): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(users.plattformErika, AENDERN, [
    platformAccesses.erikaBehandlung,
    terminId,
    'cancel',
    [],
    [],
    'Bin verreist.',
  ]);
  return rows[0]!.id;
}

async function liste(konto: string, status: string | null = 'open') {
  return (await asUser<Zeile>(konto, LISTE, [status])).rows;
}

describe('list_platform_appointment_requests (POR-011)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await kuenftigeTermine();
  }, 120_000);

  it('zeigt dem Buero Wuensche beider Kontexte mit Person, Termin und Urheber', async () => {
    const behandlung = await neuerWunsch(users.plattformErika, platformAccesses.erikaBehandlung);
    const training = await neuerWunsch(users.plattformTina, platformAccesses.tinaTraining);
    const absage = await absagewunsch(IN_DREI_TAGEN);
    const paula = await neuerWunsch(users.plattformPaula, platformAccesses.paulaBegleitungMax);

    const zeilen = await liste(users.office);
    expect(zeilen.map((z) => z.id).sort()).toEqual([behandlung, training, absage, paula].sort());
    const erika = zeilen.find((z) => z.id === behandlung)!;
    expect(erika).toEqual(
      expect.objectContaining({
        kind: 'new',
        relationship_kind: 'treatment',
        given_name: 'Erika',
        family_name: 'Beispiel',
        requested_by: 'self',
        representative_name: null,
      }),
    );
    const vonPaula = zeilen.find((z) => z.id === paula)!;
    expect(vonPaula).toEqual(
      expect.objectContaining({
        given_name: 'Max',
        requested_by: 'companion',
        representative_name: 'Paula Mustermann',
      }),
    );
    const abs = zeilen.find((z) => z.id === absage)!;
    expect(abs.appointment_id).toBe(IN_DREI_TAGEN);
    expect(abs.appointment_updated_at).not.toBeNull();
    expect(zeilen.find((z) => z.id === training)!.relationship_kind).toBe('training');
  });

  it('trennt die Kontexte: Therapeutin ohne Training, Trainingsbetreuung ohne Behandlung (4.8)', async () => {
    const behandlung = await neuerWunsch(users.plattformErika, platformAccesses.erikaBehandlung);
    const training = await neuerWunsch(users.plattformTina, platformAccesses.tinaTraining);
    expect((await liste(users.therapist)).map((z) => z.id)).toEqual([behandlung]);
    expect((await liste(users.trainer)).map((z) => z.id)).toEqual([training]);
    expect((await liste(users.ownerTherapist)).map((z) => z.id).sort()).toEqual(
      [behandlung, training].sort(),
    );
  });

  it('andere Organisation und Plattformkonto: keine Zeile', async () => {
    await neuerWunsch(users.plattformErika, platformAccesses.erikaBehandlung);
    const fremd = await fremdeOrganisation();
    expect(await liste(fremd.owner)).toEqual([]);
    // Ein Plattformkonto hat keine Organisation: abgewiesen, nicht leer.
    const plattform = await abgefangen(asUser(users.plattformErika, LISTE, ['open']));
    expect(plattform?.message).toContain('not allowed');
  });
});

describe('resolve_platform_appointment_request (POR-011)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await kuenftigeTermine();
  }, 120_000);

  it('beantwortet einen Wunsch mit Antwort und Ergebnis, sichtbar fuer die Person', async () => {
    const id = await neuerWunsch(users.plattformErika, platformAccesses.erikaBehandlung);
    const { rows } = await asUserCommitted<{ ok: boolean }>(users.office, ANTWORT, [
      id,
      'done',
      ' Termin am Dienstag eingetragen. ',
      IN_DREI_TAGEN,
    ]);
    expect(rows[0]!.ok).toBe(true);
    const eigene = await asUser<{ status: string; answer: string }>(
      users.plattformErika,
      'select status, answer from public.platform_appointment_requests($1::uuid)',
      [platformAccesses.erikaBehandlung],
    );
    expect(eigene.rows[0]).toEqual({ status: 'done', answer: 'Termin am Dienstag eingetragen.' });
    const nachweis = await asPostgres<{ resolved_by: string; resulting_appointment_id: string }>(
      `select resolved_by, resulting_appointment_id from public.platform_appointment_requests where id = $1`,
      [id],
    );
    expect(nachweis.rows[0]).toEqual({
      resolved_by: users.office,
      resulting_appointment_id: IN_DREI_TAGEN,
    });
    // Zweimal geht nicht.
    const nochmal = await abgefangen(asUser(users.office, ANTWORT, [id, 'declined', null, null]));
    expect(nochmal?.message).toContain('not found');
  });

  it('weist falsche Ausgaenge, lange Antworten, fremde Rollen und Plattformkonten ab', async () => {
    const training = await neuerWunsch(users.plattformTina, platformAccesses.tinaTraining);
    const ausgang = await abgefangen(
      asUser(users.office, ANTWORT, [training, 'maybe', null, null]),
    );
    expect(ausgang?.message).toContain('unknown outcome');
    const lang = await abgefangen(
      asUser(users.office, ANTWORT, [training, 'declined', 'x'.repeat(301), null]),
    );
    expect(lang?.message).toContain('answer too long');
    // Die Therapeutin verwaltet keine Trainingstermine (ANN-176).
    const anna = await abgefangen(
      asUser(users.therapist, ANTWORT, [training, 'declined', null, null]),
    );
    expect(anna?.message).toContain('not allowed');
    const plattform = await abgefangen(
      asUser(users.plattformTina, ANTWORT, [training, 'declined', null, null]),
    );
    expect(plattform?.message).toContain('not allowed');
    const ergebnisOhneDone = await abgefangen(
      asUser(users.trainer, ANTWORT, [training, 'declined', null, IN_DREI_TAGEN]),
    );
    expect(ergebnisOhneDone?.message).toContain('needs outcome done');
  });
});

describe('cancel_appointment_from_request (POR-011, D4)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await kuenftigeTermine();
  }, 120_000);

  async function stand(terminId: string): Promise<string> {
    // Als Text, nicht als Date: Der Treiber rundet auf Millisekunden, der
    // Server vergleicht auf die Mikrosekunde.
    const { rows } = await asPostgres<{ updated_at: string }>(
      `select updated_at::text as updated_at from public.appointments where id = $1`,
      [terminId],
    );
    return rows[0]!.updated_at;
  }

  it('sagt mit dem Zeitpunkt des Wunsches als Eingang ab - rechtzeitig ohne Gebuehr', async () => {
    const wunsch = await absagewunsch(IN_DREI_TAGEN);
    // Der Wunsch kam vor zwei Tagen, eingetragen wird erst heute.
    await asPostgres(
      `update public.platform_appointment_requests set created_at = now() - interval '2 days' where id = $1`,
      [wunsch],
    );
    const { rows } = await asUserCommitted<{ id: string }>(users.office, ABSAGE, [
      wunsch,
      await stand(IN_DREI_TAGEN),
    ]);
    expect(rows[0]!.id).toBe(IN_DREI_TAGEN);
    const termin = await asPostgres<{
      status: string;
      cancellation_reason: string;
      cancellation_received_at: string;
      fee_basis: string | null;
    }>(
      `select status, cancellation_reason, cancellation_received_at, fee_basis
         from public.appointments where id = $1`,
      [IN_DREI_TAGEN],
    );
    expect(termin.rows[0]).toEqual(
      expect.objectContaining({
        status: 'cancelled',
        cancellation_reason: 'patient_request',
        fee_basis: null,
      }),
    );
    // Eingang = Wunschzeit (auf die Sekunde), nicht die Eingabezeit.
    const erwartet = (
      await asPostgres<{ created_at: string }>(
        `select created_at from public.platform_appointment_requests where id = $1`,
        [wunsch],
      )
    ).rows[0]!.created_at;
    expect(
      Math.abs(
        new Date(termin.rows[0]!.cancellation_received_at).getTime() - new Date(erwartet).getTime(),
      ),
    ).toBeLessThan(1000);
    const w = await asPostgres<{ status: string; resolved_by: string }>(
      `select status, resolved_by from public.platform_appointment_requests where id = $1`,
      [wunsch],
    );
    expect(w.rows[0]).toEqual({ status: 'done', resolved_by: users.office });
    // Nachweis am Termin wie bei jeder Absage (ADR-010 Fassung 3).
    const absage = await asPostgres<{ cancelled_by: string }>(
      `select cancelled_by from public.appointments where id = $1`,
      [IN_DREI_TAGEN],
    );
    expect(absage.rows[0]!.cancelled_by).toBe(users.office);
  });

  it('setzt unter 24 Stunden das Ausfallhonorar - gerechnet aus dem Wunsch, nicht aus der Eingabe', async () => {
    const wunsch = await absagewunsch(MORGEN);
    await asUserCommitted(users.office, ABSAGE, [wunsch, await stand(MORGEN)]);
    const termin = await asPostgres<{ fee_basis: string | null }>(
      `select fee_basis from public.appointments where id = $1`,
      [MORGEN],
    );
    expect(termin.rows[0]!.fee_basis).toBe('late_cancellation');
  });

  it('genau 24 Stunden bleiben frei, auch wenn das Buero spaeter eintraegt', async () => {
    const wunsch = await absagewunsch(MORGEN);
    // Wunschzeit exakt 24 Stunden vor dem Beginn (vier Stunden her),
    // eingetragen erst jetzt.
    await asPostgres(
      `update public.platform_appointment_requests w
          set created_at = a.starts_at - interval '24 hours'
         from public.appointments a where a.id = w.appointment_id and w.id = $1`,
      [wunsch],
    );
    await asUserCommitted(users.office, ABSAGE, [wunsch, await stand(MORGEN)]);
    const termin = await asPostgres<{ fee_basis: string | null }>(
      `select fee_basis from public.appointments where id = $1`,
      [MORGEN],
    );
    expect(termin.rows[0]!.fee_basis).toBeNull();
  });

  it('weist einen Aenderungswunsch, einen veralteten Stand und fremde Rollen ab', async () => {
    const aenderung = (
      await asUserCommitted<{ id: string }>(users.plattformErika, AENDERN, [
        platformAccesses.erikaBehandlung,
        IN_DREI_TAGEN,
        'change',
        [tagInTagen(6)],
        [],
        null,
      ])
    ).rows[0]!.id;
    const falscheArt = await abgefangen(
      asUser(users.office, ABSAGE, [aenderung, await stand(IN_DREI_TAGEN)]),
    );
    expect(falscheArt?.message).toContain('not a cancellation');

    const wunsch = await absagewunsch(MORGEN);
    const veraltet = await abgefangen(
      asUser(users.office, ABSAGE, [wunsch, '2020-01-01T00:00:00Z']),
    );
    expect(veraltet?.message).toContain('changed meanwhile');
    // Die Trainingsbetreuung verwaltet keine Behandlungstermine: Fuer sie ist
    // der Termin nicht da (cancel_appointment) oder nicht erlaubt.
    const trainer = await abgefangen(asUser(users.trainer, ABSAGE, [wunsch, await stand(MORGEN)]));
    expect(trainer?.message).toMatch(/not allowed|not found/);
    const plattform = await abgefangen(
      asUser(users.plattformErika, ABSAGE, [wunsch, await stand(MORGEN)]),
    );
    expect(plattform?.message).toContain('not allowed');
    // Der Termin ist unveraendert.
    const termin = await asPostgres<{ status: string }>(
      `select status from public.appointments where id = $1`,
      [MORGEN],
    );
    expect(termin.rows[0]!.status).toBe('confirmed');
  });
});
