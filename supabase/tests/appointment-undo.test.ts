import { beforeAll, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
  tagInTagen,
} from './helpers/db';

/**
 * O-001 (Befund B8, ANN-534): Einen eben angelegten Termin zurücknehmen.
 *
 * Zurücknehmen darf nur, wer angelegt hat - mit einer Rolle der
 * Terminverwaltung, in derselben Organisation, höchstens 15 Minuten danach,
 * solange der Termin noch geplant ist und nichts an ihm hängt. Die Zeile fällt
 * ganz; es entsteht kein Auditeintrag, aber ein Eintrag im Löschjournal, damit
 * der Termin nach einer Wiederherstellung nicht zurückkehrt (ADR-008 Punkt 8).
 */

const { organizationId, users, patients, platformAccesses } = SEED;
const ANNA = '55555555-5555-4555-8555-000000000002';
const KATALOG_KG = 'cccccccc-cccc-4ccc-8ccc-000000000001';

const ANLEGEN =
  "select public.create_appointment($1::uuid, $2::uuid, 'video', $3::date, $4::time, $5::time, null, true) as id";
const ZURUECKNEHMEN = 'select public.undo_appointment_creation($1::uuid, $2::timestamptz)';

// Jeder Termin bekommt einen eigenen Tag: Die Tests überschneiden sich nie,
// und keiner hängt am Ergebnis eines anderen.
let laufendeNummer = 0;
function naechsterTag(): string {
  laufendeNummer += 1;
  return tagInTagen(20 + laufendeNummer);
}

interface Angelegt {
  id: string;
  stand: string;
}

async function stand(id: string): Promise<string> {
  const { rows } = await asPostgres<{ stand: string }>(
    'select updated_at::text as stand from public.appointments where id = $1',
    [id],
  );
  return rows[0]!.stand;
}

/**
 * Legt bestätigt an, wie die Oberfläche es tut (`create_appointment`). Erika
 * sieht ihre Termine auf der Plattform (eigener Zugang), Max über eine
 * Begleitung; Petra hat keinen Zugang - nur bei ihr geht das Zurücknehmen
 * durch (Zweitreview F2).
 */
async function anlegen(userId: string, patient: string = patients.erika): Promise<Angelegt> {
  const { rows } = await asUserCommitted<{ id: string }>(userId, ANLEGEN, [
    patient,
    ANNA,
    naechsterTag(),
    '09:00',
    '10:00',
  ]);
  const id = rows[0]!.id;
  return { id, stand: await stand(id) };
}

/**
 * Als wäre der Termin vor `minuten` Minuten angelegt: Anlegen und Stand
 * rücken gemeinsam zurück, wie `create_appointment` sie setzt.
 */
async function angelegtVor(termin: Angelegt, minuten: number): Promise<Angelegt> {
  await asPostgres(
    `update public.appointments
        set created_at = now() - make_interval(mins => $2),
            updated_at = now() - make_interval(mins => $2)
      where id = $1`,
    [termin.id, minuten],
  );
  return { id: termin.id, stand: await stand(termin.id) };
}

async function gibtEs(id: string): Promise<boolean> {
  const { rows } = await asPostgres('select 1 from public.appointments where id = $1', [id]);
  return rows.length === 1;
}

function zuruecknehmen(userId: string | null, termin: Angelegt) {
  return asUser(userId, ZURUECKNEHMEN, [termin.id, termin.stand]);
}

async function zuruecknehmenBestaetigt(userId: string, termin: Angelegt) {
  await asUserCommitted(userId, ZURUECKNEHMEN, [termin.id, termin.stand]);
}

/**
 * Ein Zustellauftrag zum Termin (KOM-009) an Erikas Zugang. Je Weg nur eine
 * Erinnerung (`notification_deliveries_one_reminder`) - zwei Aufträge zum
 * selben Termin gehen deshalb über zwei Wege.
 */
async function zustellauftrag(
  termin: string,
  zustand: 'offen' | 'abgeholt' | 'zugestellt' | 'verworfen',
  weg: 'email' | 'push' = 'email',
): Promise<void> {
  await asPostgres(
    `insert into public.notification_deliveries
       (organization_id, access_id, kind, channel, subject_id, subject_at, due_at,
        state, claimed_at, attempts, finished_at, drop_reason)
     select $1, $2, 'appointment_reminder', $5, a.id, a.starts_at, now(),
            case $4 when 'zugestellt' then 'sent' when 'verworfen' then 'dropped' else 'pending' end,
            case $4 when 'abgeholt' then now() else null end,
            case $4 when 'offen' then 0 else 1 end,
            case when $4 in ('zugestellt', 'verworfen') then now() else null end,
            case $4 when 'verworfen' then 'not_wanted' else null end
       from public.appointments a where a.id = $3`,
    [organizationId, platformAccesses.erikaBehandlung, termin, zustand, weg],
  );
}

describe('undo_appointment_creation (O-001, ANN-534)', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    await fremdeOrganisation();
  }, 120_000);

  describe('was gelingt', () => {
    it('nimmt den eben angelegten Termin zurück: die Zeile fällt, das Auditlog bleibt', async () => {
      const termin = await anlegen(users.therapist, patients.petra);
      const protokollVorher = await asPostgres<{ n: string }>(
        'select count(*)::text as n from public.audit_log',
      );

      await zuruecknehmenBestaetigt(users.therapist, termin);

      expect(await gibtEs(termin.id)).toBe(false);
      // Kein Auditeintrag (ADR-010 Punkte 16 und 17).
      const protokollNachher = await asPostgres<{ n: string }>(
        'select count(*)::text as n from public.audit_log',
      );
      expect(protokollNachher.rows[0]!.n).toBe(protokollVorher.rows[0]!.n);
      // Aber im Löschjournal: Tabelle und Kennung, keine Person.
      const { rows } = await asPostgres<{ target_table: string; retention_class: string }>(
        `select target_table, retention_class from public.deletion_journal
          where target_id = $1 and organization_id = $2`,
        [termin.id, organizationId],
      );
      expect(rows).toEqual([
        { target_table: 'appointments', retention_class: 'termin_ohne_nachweis' },
      ]);
    });

    it.each([
      ['owner', users.ownerTherapist],
      ['team_lead', users.teamLead],
      ['office', users.office],
    ])('erlaubt es %s für den selbst angelegten Termin', async (_rolle, userId) => {
      const termin = await anlegen(userId, patients.petra);
      await zuruecknehmenBestaetigt(userId, termin);
      expect(await gibtEs(termin.id)).toBe(false);
    });

    it('geht nach 14 Minuten noch', async () => {
      const termin = await angelegtVor(await anlegen(users.therapist, patients.petra), 14);
      await zuruecknehmenBestaetigt(users.therapist, termin);
      expect(await gibtEs(termin.id)).toBe(false);
    });

    it('nimmt offene und verworfene Zustellaufträge mit', async () => {
      const termin = await anlegen(users.therapist, patients.petra);
      await zustellauftrag(termin.id, 'offen', 'email');
      await zustellauftrag(termin.id, 'verworfen', 'push');

      await zuruecknehmenBestaetigt(users.therapist, termin);

      const { rows } = await asPostgres(
        'select 1 from public.notification_deliveries where subject_id = $1',
        [termin.id],
      );
      expect(rows).toEqual([]);
    });

    it('kehrt nach einer Wiederherstellung nicht zurück (ADR-008 Punkt 8)', async () => {
      const termin = await anlegen(users.therapist, patients.petra);
      // Die Sicherung von vorher: die Zeile, wie sie war.
      const { rows: sicherung } = await asPostgres<{ zeile: string }>(
        'select row_to_json(a)::text as zeile from public.appointments a where a.id = $1',
        [termin.id],
      );

      await zuruecknehmenBestaetigt(users.therapist, termin);
      // Wiederhergestellt: Die Zeile ist wieder da …
      await asPostgres(
        `insert into public.appointments
         select * from json_populate_record(null::public.appointments, $1::json)`,
        [sicherung[0]!.zeile],
      );
      expect(await gibtEs(termin.id)).toBe(true);

      // … und das Nachziehen der Löschungen nimmt sie wieder weg (Runbook,
      // nur mit dem Datenbankkonto).
      await asPostgres('select public.reapply_deletion_journal()');
      expect(await gibtEs(termin.id)).toBe(false);
    });

    // Zweitreview F2: Sieht die Person ihre Termine auf der Plattform, fällt
    // der Termin nicht still weg - die Oberfläche sagt ihn ab (ADR-018 Punkt 2).
    it.each([
      ['eigener Zugang (Erika)', patients.erika],
      ['Begleitung (Max)', patients.max],
    ])('weist ab, wenn die Person ihn auf der Plattform sieht: %s', async (_wie, patient) => {
      const termin = await anlegen(users.therapist, patient);
      await expect(zuruecknehmen(users.therapist, termin)).rejects.toThrow(
        /appointment is visible on the platform/,
      );
      expect(await gibtEs(termin.id)).toBe(true);
    });
  });

  describe('wer nicht darf', () => {
    it('weist eine andere Person derselben Rolle ab, auch owner', async () => {
      const termin = await anlegen(users.therapist);
      // Tim ist therapist (und team_lead), Jannes owner und therapist.
      for (const andere of [users.teamLead, users.ownerTherapist]) {
        await expect(zuruecknehmen(andere, termin)).rejects.toThrow(
          /not allowed to undo appointment creation/,
        );
      }
      expect(await gibtEs(termin.id)).toBe(true);
    });

    it('weist eine Rolle ohne Terminrecht ab (Trainingsbetreuung am Behandlungstermin)', async () => {
      const termin = await anlegen(users.therapist);
      // Selbst als vermeintlich anlegende Person: Es zählt die Rolle.
      await asPostgres('update public.appointments set created_by = $2 where id = $1', [
        termin.id,
        users.trainer,
      ]);
      await expect(zuruecknehmen(users.trainer, termin)).rejects.toThrow(
        /not allowed to undo appointment creation/,
      );
      expect(await gibtEs(termin.id)).toBe(true);
    });

    it('weist eine andere Organisation ab, ohne den Termin zu verraten', async () => {
      const fremd = await fremdeOrganisation();
      const termin = await anlegen(users.therapist);
      await expect(zuruecknehmen(fremd.owner, termin)).rejects.toThrow(/appointment not found/);
      expect(await gibtEs(termin.id)).toBe(true);
    });

    it('weist ein Plattformkonto ab', async () => {
      const termin = await anlegen(users.therapist);
      await expect(zuruecknehmen(users.plattformErika, termin)).rejects.toThrow(
        /not allowed to undo appointment creation/,
      );
      expect(await gibtEs(termin.id)).toBe(true);
    });

    it('weist ohne Sitzung und für anon ab', async () => {
      const termin = await anlegen(users.therapist);
      await expect(zuruecknehmen(null, termin)).rejects.toThrow(/not authenticated/);
      await expect(asAnon(ZURUECKNEHMEN, [termin.id, termin.stand])).rejects.toThrow(
        /permission denied/i,
      );
      expect(await gibtEs(termin.id)).toBe(true);
    });
  });

  describe('wann es nicht mehr geht', () => {
    it('weist nach 15 Minuten ab', async () => {
      const termin = await angelegtVor(await anlegen(users.therapist), 16);
      await expect(zuruecknehmen(users.therapist, termin)).rejects.toThrow(
        /undo window has passed/,
      );
      expect(await gibtEs(termin.id)).toBe(true);
    });

    it('weist ein falsches updated_at ab', async () => {
      const termin = await anlegen(users.therapist);
      await expect(
        zuruecknehmen(users.therapist, { id: termin.id, stand: '2020-01-01T00:00:00Z' }),
      ).rejects.toThrow(/appointment was changed meanwhile/);
      expect(await gibtEs(termin.id)).toBe(true);
    });

    it('weist einen inzwischen verschobenen Termin ab (der alte Stand passt nicht mehr)', async () => {
      const tag = naechsterTag();
      const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [
        patients.erika,
        ANNA,
        tag,
        '09:00',
        '10:00',
      ]);
      const termin = { id: rows[0]!.id, stand: await stand(rows[0]!.id) };
      // Jemand verschiebt ihn über den gewöhnlichen Weg.
      await asUserCommitted(
        users.office,
        `select public.update_appointment($1::uuid, $2::timestamptz, $3::uuid, 'video', $4::date,
                '11:00'::time, '12:00'::time, null, true)`,
        [termin.id, termin.stand, ANNA, tag],
      );
      await expect(zuruecknehmen(users.therapist, termin)).rejects.toThrow(
        /appointment was changed meanwhile/,
      );
      expect(await gibtEs(termin.id)).toBe(true);
    });

    it('weist einen geänderten Termin auch mit seinem neuen Stand ab (Tag und Beginn gleich)', async () => {
      // So fragt die Oberfläche, wenn sie den Stand nach dem Anlegen nicht
      // lesen konnte: Sie liest ihn erst beim Zurücknehmen. Eine Änderung
      // dazwischen - hier das Ende - darf nicht still mit dem Termin fallen.
      const tag = naechsterTag();
      const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [
        patients.erika,
        ANNA,
        tag,
        '09:00',
        '10:00',
      ]);
      const id = rows[0]!.id;
      await asUserCommitted(
        users.office,
        `select public.update_appointment($1::uuid, $2::timestamptz, $3::uuid, 'video', $4::date,
                '09:00'::time, '10:30'::time, null, true)`,
        [id, await stand(id), ANNA, tag],
      );
      const neu = { id, stand: await stand(id) };

      await expect(zuruecknehmen(users.therapist, neu)).rejects.toThrow(
        /appointment was changed meanwhile/,
      );
      expect(await gibtEs(id)).toBe(true);
    });

    it.each([
      [
        'completed',
        "update public.appointments set status = 'completed', completed_at = now(), completed_by = $2 where id = $1",
      ],
      [
        'cancelled',
        "update public.appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancellation_reason = 'practice_request' where id = $1",
      ],
      [
        'no_show',
        "update public.appointments set status = 'no_show', no_show_recorded_at = now(), no_show_recorded_by = $2 where id = $1",
      ],
    ])('weist einen Termin im Zustand %s ab', async (_zustand, sql) => {
      const termin = await anlegen(users.therapist);
      // Der Stand bleibt, nur der Zustand wechselt: Es zählt allein der Zustand.
      await asPostgres(sql, [termin.id, users.therapist]);
      await asPostgres(
        'update public.appointments set updated_at = $2::timestamptz where id = $1',
        [termin.id, termin.stand],
      );
      await expect(zuruecknehmen(users.therapist, termin)).rejects.toThrow(
        /appointment creation cannot be undone/,
      );
      expect(await gibtEs(termin.id)).toBe(true);
    });
  });

  describe('was am Termin hängt', () => {
    it('kennt jeden Fremdschlüssel auf appointments', async () => {
      // Die Liste ist die Prüfung der Funktion: Ein neuer Fremdschlüssel -
      // erst recht ein cascade oder set null - gehört in
      // undo_appointment_creation, bevor er hier ergänzt wird.
      const { rows } = await asPostgres<{ verweis: string }>(`
        select c.conrelid::regclass::text || '.' || a.attname || ' ' ||
               case c.confdeltype when 'r' then 'restrict' when 'c' then 'cascade'
                                  when 'n' then 'set null' when 'a' then 'no action'
                                  else c.confdeltype::text end as verweis
          from pg_constraint c
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
         where c.contype = 'f' and c.confrelid = 'public.appointments'::regclass
         order by 1`);
      expect(rows.map((r) => r.verweis)).toEqual([
        'appointment_call_states.appointment_id cascade',
        'appointment_notifications.appointment_id cascade',
        'appointment_session_fees.appointment_id cascade',
        'billable_services.appointment_id restrict',
        'platform_appointment_requests.appointment_id set null',
        'platform_appointment_requests.resulting_appointment_id set null',
        'training_protocols.appointment_id restrict',
        'treatment_draft_findings.appointment_id cascade',
        'treatment_notes.appointment_id restrict',
        'waitlist_entries.placed_appointment_id set null',
      ]);
    });

    const anhaenge: [string, (termin: string) => Promise<unknown>][] = [
      [
        'Behandlungsnotiz im Entwurf',
        (termin) =>
          asPostgres(
            `insert into public.treatment_notes
               (organization_id, appointment_id, status, content, created_by, updated_by)
             values ($2, $1, 'draft', 'Synthetisch: Entwurf', $3, $3)`,
            [termin, organizationId, users.therapist],
          ),
      ],
      [
        'Befundentwurf',
        (termin) =>
          asPostgres(
            `insert into public.treatment_draft_findings
               (organization_id, appointment_id, findings, updated_by)
             values ($2, $1, '{}'::jsonb, $3)`,
            [termin, organizationId, users.therapist],
          ),
      ],
      [
        'Leistung',
        // Seit PR A entsteht an einem Termin ohne Haken auf keinem Weg eine
        // Leistung (Trigger billable_services_require_check, ANN-513). Die
        // Prüfung hier bleibt als zweite Linie; der Test legt die Zeile
        // deshalb bewusst am Trigger vorbei an - in einer Anweisung, die bei
        // einem Fehler ganz zurückrollt.
        (termin) =>
          asPostgres(`
            alter table public.billable_services disable trigger billable_services_require_check;
            insert into public.billable_services
              (organization_id, patient_id, appointment_id, catalog_item_id, quantity,
               performed_on, created_by)
            values ('${organizationId}', '${patients.erika}', '${termin}', '${KATALOG_KG}', 1,
                    current_date, '${users.therapist}');
            alter table public.billable_services enable trigger billable_services_require_check;
          `),
      ],
      [
        'Honorar',
        (termin) =>
          asPostgres(
            `insert into public.appointment_session_fees
               (organization_id, appointment_id, amount_cents, source, catalog_version_id,
                performed_on, created_by)
             select $2, $1, 14000, 'tariff',
                    app.active_service_catalog_version($2, current_date), current_date, $3`,
            [termin, organizationId, users.therapist],
          ),
      ],
      [
        'Anrufstand',
        (termin) =>
          asPostgres(
            `insert into public.appointment_call_states
               (organization_id, appointment_id, outcome, recorded_by)
             values ($2, $1, 'voicemail', $3)`,
            [termin, organizationId, users.office],
          ),
      ],
      [
        'Wartelisteneintrag',
        (termin) =>
          asPostgres(
            `insert into public.waitlist_entries
               (organization_id, patient_id, appointment_type, priority_reason, status,
                placed_appointment_id, closed_at, closed_by, created_by)
             values ($2, $3, 'video', 'patient_wish', 'placed', $1, now(), $4, $4)`,
            [termin, organizationId, patients.erika, users.office],
          ),
      ],
      [
        'Terminwunsch, der zu diesem Termin geführt hat',
        (termin) =>
          asPostgres(
            `insert into public.platform_appointment_requests
               (organization_id, relationship_kind, relationship_id, patient_id, kind,
                preferred_days, status, created_by_access_id, created_by,
                resolved_at, resolved_by, resulting_appointment_id)
             values ($2, 'treatment', $3, $3, 'new', array[current_date + 7], 'done', $4, $5,
                     now(), $6, $1)`,
            [
              termin,
              organizationId,
              patients.erika,
              platformAccesses.erikaBehandlung,
              users.plattformErika,
              users.office,
            ],
          ),
      ],
      [
        'Terminwunsch der Plattform',
        (termin) =>
          asPostgres(
            `insert into public.platform_appointment_requests
               (organization_id, relationship_kind, relationship_id, patient_id, appointment_id,
                kind, created_by_access_id, created_by)
             values ($2, 'treatment', $3, $3, $1, 'change', $4, $5)`,
            [
              termin,
              organizationId,
              patients.erika,
              platformAccesses.erikaBehandlung,
              users.plattformErika,
            ],
          ),
      ],
    ];

    it.each(anhaenge)('weist ab mit %s', async (_was, anhaengen) => {
      const termin = await anlegen(users.therapist);
      await anhaengen(termin.id);
      await expect(zuruecknehmen(users.therapist, termin)).rejects.toThrow(
        /appointment creation cannot be undone/,
      );
      expect(await gibtEs(termin.id)).toBe(true);
    });

    // Zweitreview F3: nur Behandlungstermine - ein internes Ereignis nicht.
    it('weist ein internes Ereignis ab, auch das eigene', async () => {
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.appointments (
           organization_id, patient_id, staff_member_id, appointment_type, kind, title,
           event_group_id, status, starts_at, ends_at, created_by
         ) values ($1, null, $2, 'video', 'internal', 'Teambesprechung', gen_random_uuid(),
                   'confirmed', now() + interval '3 days', now() + interval '3 days 30 minutes',
                   $3)
         returning id`,
        [organizationId, ANNA, users.therapist],
      );
      const termin = { id: rows[0]!.id, stand: await stand(rows[0]!.id) };
      await expect(zuruecknehmen(users.therapist, termin)).rejects.toThrow(
        /appointment creation cannot be undone/,
      );
      expect(await gibtEs(termin.id)).toBe(true);
    });

    it('weist einen Termin einer Serie ab (in einer Transaktion angelegt)', async () => {
      const { rows } = await asUserCommitted<{ erster: string; zweiter: string }>(
        users.therapist,
        `select public.create_appointment($1::uuid, $2::uuid, 'video', $3::date, '09:00', '10:00', null, true) as erster,
                public.create_appointment($1::uuid, $2::uuid, 'video', $4::date, '09:00', '10:00', null, true) as zweiter`,
        [patients.erika, ANNA, naechsterTag(), naechsterTag()],
      );
      const termin = { id: rows[0]!.erster, stand: await stand(rows[0]!.erster) };
      await expect(zuruecknehmen(users.therapist, termin)).rejects.toThrow(
        /appointment creation cannot be undone/,
      );
      expect(await gibtEs(termin.id)).toBe(true);
    });

    it('weist ab, wenn der Termin der Person von Hand mitgeteilt ist (CAL-012)', async () => {
      const termin = await anlegen(users.therapist);
      await asPostgres(
        `insert into public.appointment_notifications (organization_id, appointment_id, channel, notified_by)
         values ($2, $1, 'phone', $3)`,
        [termin.id, organizationId, users.therapist],
      );
      await expect(zuruecknehmen(users.therapist, termin)).rejects.toThrow(
        /patient already notified/,
      );
      expect(await gibtEs(termin.id)).toBe(true);
    });

    it.each(['zugestellt', 'abgeholt'] as const)(
      'weist ab, wenn eine Benachrichtigung %s ist (KOM-009)',
      async (zustand) => {
        const termin = await anlegen(users.therapist);
        await zustellauftrag(termin.id, zustand);
        await expect(zuruecknehmen(users.therapist, termin)).rejects.toThrow(
          /patient already notified/,
        );
        expect(await gibtEs(termin.id)).toBe(true);
      },
    );
  });
});
