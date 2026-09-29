import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Anrufliste für morgen mit gespeichertem Stand (PRX-014, ANN-144).
 *
 * „Erreicht" ist ein Mitteilungsvermerk (CAL-012), „nicht erreicht" und
 * „Nachricht hinterlassen" ein kurzlebiger Stand am Termin. Geprüft werden
 * Rollen, Mandantengrenze, Auswahl der Termine, Zählen der Versuche, Audit,
 * Auskunft und die Frist im Löschlauf.
 */
const { users, organizationId, patients } = SEED;

const ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const TAG = '2031-03-11';

const LISTE = 'select * from public.list_call_list($1::date)';
const VERMERKEN = 'select public.record_call_outcome($1::uuid, $2)';

interface Zeile {
  appointment_id: string;
  patient_family_name: string;
  phone: string | null;
  notified_channels: string[];
  call_outcome: string | null;
  call_attempts: number | null;
  call_recorded_by_name: string | null;
  staff_name: string | null;
}

async function termin(
  opts: {
    tag?: string;
    zeit?: string;
    status?: string;
    patient?: string;
    kind?: 'therapy' | 'internal';
  } = {},
): Promise<string> {
  const intern = opts.kind === 'internal';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id, appointment_type, kind, title,
       event_group_id, status, starts_at, ends_at, cancelled_at, cancelled_by
     ) values (
       $1, $2, $3, $4, 'practice', $5, case when $5 = 'internal' then 'Teambesprechung' end,
       case when $5 = 'internal' then gen_random_uuid() end, $6,
       (($7::date + $8::time) at time zone 'Europe/Berlin'),
       (($7::date + $8::time + interval '45 minutes') at time zone 'Europe/Berlin'),
       case when $6 = 'cancelled' then now() end,
       case when $6 = 'cancelled' then $9::uuid end
     ) returning id`,
    [
      organizationId,
      intern ? null : (opts.patient ?? patients.max),
      ANNA,
      LOCATION,
      opts.kind ?? 'therapy',
      opts.status ?? 'confirmed',
      opts.tag ?? TAG,
      opts.zeit ?? '09:00',
      users.office,
    ],
  );
  return rows[0]!.id;
}

async function liste(konto: string = users.office, tag = TAG): Promise<Zeile[]> {
  return (await asUser<Zeile>(konto, LISTE, [tag])).rows;
}

describe('Anrufliste (PRX-014)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('fuehrt die bestaetigten Behandlungstermine des Tages mit Rufnummer, nach Beginn', async () => {
    const spaeter = await termin({ zeit: '14:00', patient: patients.erika });
    const frueher = await termin({ zeit: '08:00' });
    await termin({ status: 'cancelled', zeit: '10:00' });
    await termin({ kind: 'internal', zeit: '11:00' });
    await termin({ tag: '2031-03-12' });

    const zeilen = await liste();
    expect(zeilen.map((z) => z.appointment_id)).toEqual([frueher, spaeter]);
    expect(zeilen[0]).toMatchObject({
      patient_family_name: 'Mustermann',
      notified_channels: [],
      call_outcome: null,
      staff_name: 'Anna Beispiel',
    });
  });

  it('zaehlt Versuche und merkt, wer zuletzt angerufen hat - ueber ein Neuladen hinaus', async () => {
    const id = await termin();
    await asUserCommitted(users.office, VERMERKEN, [id, 'not_reached']);
    await asUserCommitted(users.therapist, VERMERKEN, [id, 'voicemail']);

    const [zeile] = await liste();
    expect(zeile).toMatchObject({ call_outcome: 'voicemail', call_attempts: 2 });
    expect(zeile!.call_recorded_by_name).toBeTruthy();
  });

  it('macht aus "erreicht" den Mitteilungsvermerk "telefonisch" und raeumt den Stand', async () => {
    const id = await termin();
    await asUserCommitted(users.office, VERMERKEN, [id, 'not_reached']);
    await asUserCommitted(users.office, VERMERKEN, [id, 'reached']);

    const [zeile] = await liste();
    expect(zeile).toMatchObject({ notified_channels: ['phone'], call_outcome: null });

    const { rows } = await asPostgres<{ action: string }>(
      `select action from public.audit_log where subject_id = $1 order by occurred_at, action`,
      [id],
    );
    expect(rows.map((r) => r.action)).toEqual([
      'appointment.call_recorded',
      'appointment.call_recorded',
      'appointment.notified',
    ]);
  });

  it('nimmt einen Tipp daneben zurueck', async () => {
    const id = await termin();
    await asUserCommitted(users.office, VERMERKEN, [id, 'not_reached']);
    await asUserCommitted(users.office, VERMERKEN, [id, 'cleared']);
    const [zeile] = await liste();
    expect(zeile!.call_outcome).toBeNull();
  });

  it('protokolliert das Ergebnis ohne Inhalt', async () => {
    const id = await termin();
    await asUserCommitted(users.office, VERMERKEN, [id, 'voicemail']);
    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log where subject_id = $1 and action = 'appointment.call_recorded'`,
      [id],
    );
    expect(rows[0]!.context).toEqual({
      surface: 'web',
      patient_id: patients.max,
      call_outcome: 'voicemail',
    });
  });

  it('weist unbekannte Ergebnisse, Ereignisse und fremde Termine ab', async () => {
    const id = await termin();
    const unbekannt = await abgefangen(asUser(users.office, VERMERKEN, [id, 'vielleicht']));
    expect(unbekannt?.message).toMatch(/unknown call outcome/);

    const intern = await termin({ kind: 'internal', zeit: '15:00' });
    const ereignis = await abgefangen(asUser(users.office, VERMERKEN, [intern, 'not_reached']));
    expect(ereignis?.message).toMatch(/appointment not found/);

    const fremd = await fremdeOrganisation();
    const fremdFehler = await abgefangen(asUser(fremd.owner, VERMERKEN, [id, 'not_reached']));
    expect(fremdFehler?.message).toMatch(/appointment not found/);
    expect(await liste(fremd.owner)).toEqual([]);
  });

  it('laesst die vier Praxisrollen lesen und vermerken', async () => {
    const id = await termin();
    for (const konto of [users.ownerTherapist, users.therapist, users.teamLead, users.office]) {
      expect(
        (await liste(konto)).map((z) => z.appointment_id),
        konto,
      ).toEqual([id]);
      await asUser(konto, VERMERKEN, [id, 'not_reached']);
    }
  });

  it('weist Trainingsbetreuung und Patientenkonto ab - lesend protokolliert (G6b)', async () => {
    const id = await termin();
    for (const konto of [users.trainer, users.patientMax]) {
      await erwarteAbgewiesenenLeseversuch(konto, LISTE, [TAG], 'appointments.read');
      const fehler = await abgefangen(asUser(konto, VERMERKEN, [id, 'not_reached']));
      expect(fehler?.message, konto).toMatch(/not allowed to update appointments/);
    }
  });

  it('ist ohne Session und fuer anon nicht aufrufbar; die Tabelle ist verschlossen', async () => {
    await expect(asUser(null, LISTE, [TAG])).rejects.toThrow(/not authenticated/);
    await expect(asAnon(LISTE, [TAG])).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(users.ownerTherapist, 'select * from public.appointment_call_states'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('gehoert zur Auskunft nach Art. 15', async () => {
    const id = await termin();
    await asUserCommitted(users.office, VERMERKEN, [id, 'not_reached']);
    const { rows } = await asUser<{ daten: { tabellen: Record<string, unknown[]> } }>(
      users.ownerTherapist,
      'select public.export_patient_record($1::uuid) as daten',
      [patients.max],
    );
    expect(rows[0]!.daten.tabellen['appointment_call_states']).toEqual([
      expect.objectContaining({ appointment_id: id, outcome: 'not_reached', attempts: 1 }),
    ]);
  });
});

describe('Anrufstand im Loeschlauf (ANN-144)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function stand(id: string): Promise<boolean> {
    const { rows } = await asPostgres(
      'select 1 from public.appointment_call_states where appointment_id = $1',
      [id],
    );
    return rows.length === 1;
  }

  it('loescht den Stand vierzehn Tage nach dem Termin und journalisiert ihn', async () => {
    const alt = await termin({ tag: '2026-01-05' });
    const jung = await termin({ tag: TAG });
    for (const id of [alt, jung]) {
      await asPostgres(
        `insert into public.appointment_call_states (organization_id, appointment_id, outcome)
         values ($1::uuid, $2::uuid, 'not_reached')`,
        [organizationId, id],
      );
    }
    await asPostgres('select public.apply_retention()');
    expect(await stand(alt)).toBe(false);
    expect(await stand(jung)).toBe(true);
    const { rows } = await asPostgres<{ retention_class: string }>(
      `select j.retention_class from public.deletion_journal j
        where j.target_table = 'appointment_call_states'`,
    );
    expect(rows).toEqual([{ retention_class: 'anrufstand' }]);
  });

  it('loescht nach einer Wiederherstellung erneut', async () => {
    const alt = await termin({ tag: '2026-01-05' });
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointment_call_states (organization_id, appointment_id, outcome)
       values ($1::uuid, $2::uuid, 'voicemail') returning id`,
      [organizationId, alt],
    );
    await asPostgres('select public.apply_retention()');
    await asPostgres(
      `insert into public.appointment_call_states (id, organization_id, appointment_id, outcome)
       values ($1::uuid, $2::uuid, $3::uuid, 'voicemail')`,
      [rows[0]!.id, organizationId, alt],
    );
    await asPostgres('select public.reapply_deletion_journal()');
    expect(await stand(alt)).toBe(false);
  });

  it('faellt mit dem Termin', async () => {
    const id = await termin();
    await asPostgres(
      `insert into public.appointment_call_states (organization_id, appointment_id, outcome)
       values ($1::uuid, $2::uuid, 'not_reached')`,
      [organizationId, id],
    );
    await asPostgres('delete from public.appointments where id = $1', [id]);
    expect(await stand(id)).toBe(false);
  });
});
