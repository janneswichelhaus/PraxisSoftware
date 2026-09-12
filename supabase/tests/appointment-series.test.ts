import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SERIE_HOECHSTZAHL } from '@/features/appointments/serie';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Terminserie aus einer Verordnung (CAL-007).
 *
 * Drei Zusagen stehen hier im Mittelpunkt: die Serie legt an oder nichts, sie
 * erfindet keine eigene Fachlogik, und sie rechnet das Kontingent so, dass ein
 * zweiter Aufruf nicht dieselben Behandlungen noch einmal anbietet.
 */

const { users, organizationId, patients } = SEED;

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

/** Verordnungen aus supabase/seed.sql. */
const VERORDNUNG = {
  // Max Mustermann, 2x Krankengymnastik + Waermetherapie, vollstaendig genutzt.
  maxErschoepft: '88888888-8888-4888-8888-000000000001',
  // Max Mustermann, 10x Krankengymnastik, 7 genutzt - noch 3 offen.
  maxOffen: '88888888-8888-4888-8888-000000000002',
  // Erika Beispiel, 6x Manuelle Therapie, 2 genutzt - noch 4 offen.
  erika: '88888888-8888-4888-8888-000000000003',
} as const;

const SERIE =
  'select public.create_appointment_series($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb, $6::uuid, $7::boolean) as anzahl';
const PRUEFEN = 'select * from public.check_appointment_slots($1::uuid, $2::jsonb)';
const KONTINGENT = 'select * from public.get_prescription_slots($1::uuid)';

/** Kalendertag weit in der Zukunft, damit kein Lauf um Mitternacht kippt. */
function tagInTagen(tage: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

interface Slot {
  datum: string;
  beginn: string;
}

/** `anzahl` Termine im Abstand von sieben Tagen, alle zur selben Uhrzeit. */
function woechentlich(anzahl: number, abTagen = 40, beginn = '09:00'): Slot[] {
  return Array.from({ length: anzahl }, (_, i) => ({
    datum: tagInTagen(abTagen + i * 7),
    beginn,
  }));
}

function serieArgs(
  slots: Slot[],
  felder: Partial<{
    patient: string;
    verordnung: string;
    staff: string;
    typ: string;
    ort: string | null;
    bestaetigt: boolean;
  }> = {},
) {
  return [
    felder.patient ?? patients.max,
    felder.verordnung ?? VERORDNUNG.maxOffen,
    felder.staff ?? STAFF.anna,
    felder.typ ?? 'video',
    JSON.stringify(slots),
    felder.ort ?? null,
    felder.bestaetigt ?? true,
  ];
}

function anlegen(userId: string | null, slots: Slot[], felder = {}) {
  return asUser<{ anzahl: number }>(userId, SERIE, serieArgs(slots, felder));
}

async function anlegenCommitted(userId: string, slots: Slot[], felder = {}): Promise<number> {
  const { rows } = await asUserCommitted<{ anzahl: number }>(
    userId,
    SERIE,
    serieArgs(slots, felder),
  );
  return rows[0]!.anzahl;
}

async function termine(verordnung: string) {
  const { rows } = await asPostgres<{ id: string; status: string; starts_at: string }>(
    `select id, status, to_char(starts_at at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI') as starts_at
       from public.appointments
      where prescription_id = $1::uuid
      order by starts_at`,
    [verordnung],
  );
  return rows;
}

async function alleTermine() {
  const { rows } = await asPostgres<{ anzahl: string }>(
    'select count(*)::text as anzahl from public.appointments',
  );
  return Number(rows[0]!.anzahl);
}

describe('CAL-007: Terminserie aus einer Verordnung', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
    await asPostgres('delete from public.audit_log');
  });

  describe('Kontingent', () => {
    it('liefert verordnet, genutzt, verplant und offen', async () => {
      const { rows } = await asUser<{
        patient_id: string;
        prescribed: number;
        used: number;
        planned: number;
        remaining: number;
      }>(users.office, KONTINGENT, [VERORDNUNG.maxOffen]);

      expect(rows[0]).toMatchObject({
        patient_id: patients.max,
        prescribed: 10,
        used: 7,
        planned: 0,
        remaining: 3,
      });
    });

    it('zieht angelegte Termine vom offenen Kontingent ab', async () => {
      await anlegenCommitted(users.office, woechentlich(3));

      const { rows } = await asUser<{ planned: number; remaining: number }>(
        users.office,
        KONTINGENT,
        [VERORDNUNG.maxOffen],
      );
      // 10 verordnet, 7 genutzt, 3 verplant - das Maximum aus beiden ist 7.
      expect(rows[0]).toMatchObject({ planned: 3, remaining: 3 });
    });

    it('zaehlt verplant und genutzt nicht doppelt', async () => {
      // Acht Termine gegen eine Verordnung mit sieben genutzten Behandlungen:
      // offen ist 10 - max(7, 8) = 2, nicht 10 - (7 + 8) (ANN-038).
      await anlegenCommitted(users.office, woechentlich(8));

      const { rows } = await asUser<{ planned: number; remaining: number }>(
        users.office,
        KONTINGENT,
        [VERORDNUNG.maxOffen],
      );
      expect(rows[0]).toMatchObject({ planned: 8, remaining: 2 });
    });

    it('gibt den Platz eines abgesagten Termins wieder frei', async () => {
      await anlegenCommitted(users.office, woechentlich(3));
      const [erster] = await termine(VERORDNUNG.maxOffen);
      await asUserCommitted(
        users.office,
        `select public.cancel_appointment($1::uuid,
           (select updated_at from public.appointments where id = $1::uuid), 'moved')`,
        [erster!.id],
      );

      const { rows } = await asUser<{ planned: number }>(users.office, KONTINGENT, [
        VERORDNUNG.maxOffen,
      ]);
      expect(rows[0]?.planned).toBe(2);
    });

    it('liefert eine fremde Verordnung nicht aus', async () => {
      const fremdeOrg = '22222222-2222-4222-8222-0000000000ff';
      const fremdePerson = '44444444-4444-4444-8444-0000000000ff';
      const fremderPatient = '66666666-6666-4666-8666-0000000000ff';
      const fremderVerordner = '77777777-7777-4777-8777-0000000000ff';
      const fremdeVerordnung = '88888888-8888-4888-8888-0000000000ff';
      await asPostgres(`
        insert into public.organizations (id, name, time_zone) values ('${fremdeOrg}', 'Fremd', 'Europe/Berlin');
        insert into public.persons (id, organization_id, given_name, family_name)
          values ('${fremdePerson}', '${fremdeOrg}', 'Fremd', 'Person');
        insert into public.patients (id, organization_id, person_id, status)
          values ('${fremderPatient}', '${fremdeOrg}', '${fremdePerson}', 'active');
        insert into public.prescribers (id, organization_id, given_name, family_name)
          values ('${fremderVerordner}', '${fremdeOrg}', 'Fremd', 'Arzt');
        insert into public.prescriptions (id, organization_id, patient_id, prescriber_id, prescription_kind, issued_on)
          values ('${fremdeVerordnung}', '${fremdeOrg}', '${fremderPatient}', '${fremderVerordner}', 'first', '2026-01-01');
      `);

      await expect(asUser(users.office, KONTINGENT, [fremdeVerordnung])).rejects.toThrow(
        /prescription not found/,
      );

      await asPostgres(`
        delete from public.prescriptions where organization_id = '${fremdeOrg}';
        delete from public.prescribers   where organization_id = '${fremdeOrg}';
        delete from public.patients      where organization_id = '${fremdeOrg}';
        delete from public.persons       where organization_id = '${fremdeOrg}';
        delete from public.organizations where id = '${fremdeOrg}';
      `);
    });

    it('verweigert die Auskunft einem Patientenkonto', async () => {
      await expect(asUser(users.patientMax, KONTINGENT, [VERORDNUNG.maxOffen])).rejects.toThrow(
        /not allowed to read prescriptions/,
      );
    });
  });

  describe('Konfliktpruefung', () => {
    it('meldet einen sauberen Vorschlag ohne Befund', async () => {
      const { rows } = await asUser<{ slot_index: number; conflict: string | null }>(
        users.office,
        PRUEFEN,
        [STAFF.anna, JSON.stringify(woechentlich(3))],
      );
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.conflict === null)).toBe(true);
    });

    it('meldet eine Ueberschneidung mit einem bestehenden Termin', async () => {
      const slots = woechentlich(3);
      await anlegenCommitted(users.office, [slots[1]!]);

      const { rows } = await asUser<{ slot_index: number; conflict: string | null }>(
        users.office,
        PRUEFEN,
        [STAFF.anna, JSON.stringify(slots)],
      );
      expect(rows.map((r) => r.conflict)).toEqual([null, 'overlap', null]);
    });

    it('meldet eine Doppelung innerhalb derselben Serie', async () => {
      const slots = woechentlich(2);
      slots[1] = { ...slots[0]! };

      const { rows } = await asUser<{ conflict: string | null }>(users.office, PRUEFEN, [
        STAFF.anna,
        JSON.stringify(slots),
      ]);
      expect(rows.map((r) => r.conflict)).toEqual([null, 'duplicate']);
    });

    it('meldet einen vergangenen Tag, einen Beginn neben dem Raster und eine Randzeit', async () => {
      const { rows } = await asUser<{ conflict: string | null }>(users.office, PRUEFEN, [
        STAFF.anna,
        JSON.stringify([
          { datum: tagInTagen(-3), beginn: '09:00' },
          { datum: tagInTagen(40), beginn: '09:02' },
          { datum: tagInTagen(41), beginn: '05:00' },
          { datum: tagInTagen(42), beginn: 'kaputt' },
        ]),
      ]);
      expect(rows.map((r) => r.conflict)).toEqual([
        'past',
        'off_grid',
        'outside_working_hours',
        'invalid',
      ]);
    });

    it('meldet ein Fenster ueber den Tageswechsel als ungueltig', async () => {
      const { rows } = await asUser<{ conflict: string | null }>(users.office, PRUEFEN, [
        STAFF.anna,
        JSON.stringify([{ datum: tagInTagen(40), beginn: '23:30' }]),
      ]);
      expect(rows[0]?.conflict).toBe('invalid');
    });

    it('aendert nichts', async () => {
      await asUser(users.office, PRUEFEN, [STAFF.anna, JSON.stringify(woechentlich(5))]);
      expect(await alleTermine()).toBe(0);
    });

    it('taugt nicht als Existenz-Orakel fuer fremde Mitarbeitende', async () => {
      await expect(
        asUser(users.office, PRUEFEN, [
          '55555555-5555-4555-8555-0000000000ff',
          JSON.stringify(woechentlich(1)),
        ]),
      ).rejects.toThrow(/staff member not assignable/);
    });

    it('verweigert die Pruefung einem Patientenkonto', async () => {
      await expect(
        asUser(users.patientMax, PRUEFEN, [STAFF.anna, JSON.stringify(woechentlich(1))]),
      ).rejects.toThrow(/not allowed to create appointments/);
    });
  });

  describe('Anlegen', () => {
    it.each([
      ['owner', users.ownerTherapist],
      ['therapist', users.therapist],
      ['team_lead', users.teamLead],
      ['office', users.office],
    ])('erlaubt %s die Serie', async (_rolle, userId) => {
      expect(await anlegenCommitted(userId, woechentlich(3))).toBe(3);
    });

    it('legt die Termine im Rhythmus an, alle bestaetigt und mit Verordnungsbezug', async () => {
      const slots = woechentlich(4);
      await anlegenCommitted(users.office, slots);

      const rows = await termine(VERORDNUNG.maxOffen);
      expect(rows).toHaveLength(4);
      expect(rows.every((r) => r.status === 'confirmed')).toBe(true);
      expect(rows.map((r) => r.starts_at)).toEqual(slots.map((s) => `${s.datum} ${s.beginn}`));
    });

    it('gibt jedem Termin ein Zeitfenster von 60 Minuten (CAL-010a)', async () => {
      await anlegenCommitted(users.office, woechentlich(2));
      const { rows } = await asPostgres<{ fenster: string }>(
        `select distinct to_char(
                  (ends_at at time zone 'Europe/Berlin') - (starts_at at time zone 'Europe/Berlin'),
                  'HH24:MI') as fenster
           from public.appointments where prescription_id = $1::uuid`,
        [VERORDNUNG.maxOffen],
      );
      expect(rows.map((r) => r.fenster)).toEqual(['01:00']);
    });

    it('schreibt je Termin einen eigenen appointment.created-Eintrag (ADR-018 Punkt 5)', async () => {
      await anlegenCommitted(users.office, woechentlich(3));

      const { rows } = await asPostgres<{ anzahl: string }>(
        `select count(*)::text as anzahl from public.audit_log
          where action = 'appointment.created'`,
      );
      expect(Number(rows[0]!.anzahl)).toBe(3);
    });

    it('nennt die Verordnung im Auditkontext, aber keinen klinischen Inhalt', async () => {
      await anlegenCommitted(users.office, woechentlich(1));

      const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
        `select context from public.audit_log where action = 'appointment.created'`,
      );
      expect(rows[0]?.context).toMatchObject({ prescription_id: VERORDNUNG.maxOffen });
      expect(JSON.stringify(rows[0]?.context)).not.toMatch(/Schulter|Krankengymnastik/i);
    });

    it('schreibt kein eigenes Serienereignis', async () => {
      await anlegenCommitted(users.office, woechentlich(2));
      const { rows } = await asPostgres<{ action: string }>(
        'select distinct action from public.audit_log',
      );
      expect(rows.map((r) => r.action)).toEqual(['appointment.created']);
    });

    it('legt bei einem Konflikt keinen einzigen Termin an', async () => {
      const slots = woechentlich(4);
      // Ein Fremdtermin genau auf der dritten Zeile.
      await asUserCommitted(
        users.office,
        `select public.create_appointment($1::uuid, $2::uuid, 'video', $3::date, '09:00', '10:00', null, true) as id`,
        [patients.erika, STAFF.anna, slots[2]!.datum],
      );
      const vorher = await alleTermine();

      await expect(anlegen(users.office, slots)).rejects.toThrow(/overlaps/);
      expect(await alleTermine()).toBe(vorher);
    });

    it('weist eine Verordnung einer anderen Patient:in ab', async () => {
      await expect(
        anlegen(users.office, woechentlich(1), { verordnung: VERORDNUNG.erika }),
      ).rejects.toThrow(/prescription not found/);
      expect(await alleTermine()).toBe(0);
    });

    it('verlangt eine Verordnung', async () => {
      await expect(
        asUser(users.office, SERIE, [
          patients.max,
          null,
          STAFF.anna,
          'video',
          JSON.stringify(woechentlich(1)),
          null,
          true,
        ]),
      ).rejects.toThrow(/prescription is required/);
    });

    it('weist eine leere Serie ab', async () => {
      await expect(anlegen(users.office, [])).rejects.toThrow(/non-empty array/);
    });

    it('haelt dieselbe Obergrenze wie die Oberflaeche', async () => {
      // Zwei Stellen, eine Zahl: laufen sie auseinander, bietet das Formular
      // eine Serie an, die der Server abweist.
      const { rows } = await asPostgres<{ grenze: number }>(
        'select app.appointment_series_limit() as grenze',
      );
      expect(rows[0]!.grenze).toBe(SERIE_HOECHSTZAHL);
    });

    it('begrenzt die Serie auf 30 Termine', async () => {
      await expect(anlegen(users.office, woechentlich(31))).rejects.toThrow(/limited to 30/);
      expect(await alleTermine()).toBe(0);
    });

    it('laesst eine Serie ueber das offene Kontingent hinaus zu (ANN-038)', async () => {
      // Drei sind offen, fuenf werden geplant: die Grenze sitzt an der
      // genutzten Menge und damit an der Abrechnung, nicht am Kalender.
      expect(await anlegenCommitted(users.office, woechentlich(5))).toBe(5);
    });

    it('haelt die Arbeitszeitpruefung ein - ohne Bestaetigung kein Termin', async () => {
      await expect(
        anlegen(users.office, woechentlich(2, 40, '05:00'), { bestaetigt: false }),
      ).rejects.toThrow(/outside_working_hours/);
      expect(await alleTermine()).toBe(0);
    });

    it('haelt das Raster ein', async () => {
      await expect(anlegen(users.office, woechentlich(2, 40, '09:02'))).rejects.toThrow(
        /not on the appointment grid/,
      );
    });

    it('weist ein Patientenkonto ab', async () => {
      await expect(anlegen(users.patientMax, woechentlich(1))).rejects.toThrow(
        /not allowed to create appointments/,
      );
    });

    it('weist einen anonymen Zugriff ab', async () => {
      await expect(asAnon(SERIE, serieArgs(woechentlich(1)))).rejects.toThrow(
        /permission denied|not authenticated/i,
      );
    });

    it('nimmt keine organization_id entgegen', async () => {
      const { rows } = await asPostgres<{ argumente: string }>(
        "select pg_get_function_arguments(oid) as argumente from pg_proc where proname = 'create_appointment_series'",
      );
      expect(rows[0]?.argumente).not.toMatch(/organization/i);
    });
  });

  describe('Verordnungsbezug am Termin', () => {
    it('setzt den Verweis bei einem einzelnen Termin auf null', async () => {
      await asUserCommitted(
        users.office,
        `select public.create_appointment($1::uuid, $2::uuid, 'video', $3::date, '09:00', '10:00', null, true) as id`,
        [patients.max, STAFF.anna, tagInTagen(40)],
      );
      const { rows } = await asPostgres<{ prescription_id: string | null }>(
        'select prescription_id from public.appointments',
      );
      expect(rows[0]?.prescription_id).toBeNull();
    });

    it('loest den Verweis, statt die Loeschung der Verordnung zu blockieren', async () => {
      // VER-003 laesst eine falsch erfasste Verordnung loeschen (ADR-008
      // Punkt 10). Die Termine haben trotzdem stattgefunden.
      await anlegenCommitted(users.office, woechentlich(2));
      await asUserCommitted(users.ownerTherapist, 'select public.delete_prescription($1::uuid)', [
        VERORDNUNG.maxOffen,
      ]);

      const { rows } = await asPostgres<{ prescription_id: string | null }>(
        'select prescription_id from public.appointments',
      );
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.prescription_id === null)).toBe(true);

      // Die Loeschung ist committet und wuerde den folgenden Tests die
      // Verordnung wegnehmen.
      await resetDatabase();
    }, 120_000);

    it('steht authenticated nicht zum Schreiben offen', async () => {
      await anlegenCommitted(users.office, woechentlich(1));
      const [termin] = await termine(VERORDNUNG.maxOffen);
      await expect(
        asUser(
          users.office,
          'update public.appointments set prescription_id = null where id = $1',
          [termin!.id],
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  describe('Loeschlauf', () => {
    it('loescht Verordnung und Termine einer Patient:in ohne Fremdschluesselfehler', async () => {
      await anlegenCommitted(users.office, woechentlich(2));
      await asPostgres(
        `update public.patients
            set care_started_on   = (current_date - interval '12 years')::date,
                care_concluded_on = (current_date - interval '11 years')::date,
                care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.max, users.therapist],
      );

      // Die Verordnung wird vor den Terminen geloescht (LOE-002). Ohne
      // ON DELETE SET NULL scheiterte der Lauf an dieser Stelle.
      await asPostgres('select public.apply_retention()');

      const { rows } = await asPostgres<{ anzahl: string }>(
        'select count(*)::text as anzahl from public.appointments where patient_id = $1',
        [patients.max],
      );
      expect(Number(rows[0]!.anzahl)).toBe(0);

      // Der Lauf hat Akte, Verordnung und Termine committet geloescht.
      await resetDatabase();
    }, 120_000);
  });

  describe('Mandantentrennung', () => {
    it('sieht die Termine einer fremden Organisation nicht', async () => {
      await anlegenCommitted(users.office, woechentlich(2));
      const { rows } = await asPostgres<{ organization_id: string }>(
        'select distinct organization_id from public.appointments',
      );
      expect(rows.map((r) => r.organization_id)).toEqual([organizationId]);
    });

    it('weist eine behandelnde Person einer fremden Organisation ab', async () => {
      await expect(
        anlegen(users.office, woechentlich(1), { staff: '55555555-5555-4555-8555-0000000000ff' }),
      ).rejects.toThrow(/staff member not assignable/);
    });
  });
});
