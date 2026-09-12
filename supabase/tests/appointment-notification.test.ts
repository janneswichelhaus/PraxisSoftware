import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Mitteilungsvermerk am Termin (CAL-012).
 *
 * Die wichtigste Zusage steht hier zuerst: Der Vermerk verfaellt, sobald sich
 * der Termin aendert. Alles andere - Wertebereich, Rollen, Auditeintrag - ist
 * das uebliche Beiwerk eines Schreibpfads.
 *
 * Was NICHT geprueft wird, weil es die Anwendung nicht tut: ein Versand. B15
 * ist vorlaeufig entschieden, die Anwendung verschickt in Stufe 1 und 2 nichts.
 */

const { users, patients } = SEED;

const SETZEN = 'select public.set_appointment_notification($1::uuid, $2::text[]) as kanaele';
const ERGAENZEN = 'select public.add_appointment_notification($1::uuid[], $2) as anzahl';
const AKTE = 'select * from public.list_patient_upcoming_appointments($1::uuid)';
const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';
const AENDERN =
  'select public.update_appointment($1::uuid, $2::timestamptz, $3::uuid, $4, $5::date, $6::time, $7::time, $8::uuid, true) as id';

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const STAFF_TIM = '55555555-5555-4555-8555-000000000004';

function tagInTagen(tage: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

const TAG = tagInTagen(70);

async function terminAnlegen(von = '09:00', bis = '10:00', tag = TAG): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(users.office, ANLEGEN, [
    patients.max,
    STAFF_ANNA,
    'video',
    tag,
    von,
    bis,
    null,
  ]);
  return rows[0]!.id;
}

/** Stand als Rohwert - ohne `to_char` verliert der Treiber die Mikrosekunden. */
async function standVon(id: string): Promise<string> {
  const { rows } = await asPostgres<{ updated_at: string }>(
    `select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as updated_at
       from public.appointments where id = $1::uuid`,
    [id],
  );
  return rows[0]!.updated_at;
}

async function setzen(userId: string | null, id: string, kanaele: string[]) {
  return asUser<{ kanaele: string[] }>(userId, SETZEN, [id, kanaele]);
}

async function setzenCommitted(id: string, kanaele: string[]): Promise<string[]> {
  const { rows } = await asUserCommitted<{ kanaele: string[] }>(users.office, SETZEN, [
    id,
    kanaele,
  ]);
  return rows[0]!.kanaele;
}

/** Die Wege, wie die Terminliste der Akte sie zeigt. */
async function kanaeleInDerAkte(id: string): Promise<string[]> {
  const { rows } = await asUser<{ id: string; notification_channels: string[] }>(
    users.office,
    AKTE,
    [patients.max],
  );
  return rows.find((r) => r.id === id)?.notification_channels ?? [];
}

/** Die Wege, wie die Detailansicht sie ueber die Sicht liest. */
async function kanaeleInDerSicht(id: string): Promise<string[]> {
  const { rows } = await asUser<{ notification_channels: string[] }>(
    users.office,
    'select notification_channels from public.appointment_directory where id = $1::uuid',
    [id],
  );
  return rows[0]!.notification_channels;
}

describe('CAL-012: Mitteilungsvermerk am Termin', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointment_notifications');
    await asPostgres('delete from public.appointments');
    await asPostgres('delete from public.audit_log');
  });

  describe('Setzen und Lesen', () => {
    it('vermerkt einen Weg und zeigt ihn in der Terminliste der Akte', async () => {
      const id = await terminAnlegen();
      expect(await setzenCommitted(id, ['phone'])).toEqual(['phone']);
      expect(await kanaeleInDerAkte(id)).toEqual(['phone']);
      expect(await kanaeleInDerSicht(id)).toEqual(['phone']);
    });

    it('vermerkt mehrere Wege nebeneinander, immer in derselben Reihenfolge', async () => {
      const id = await terminAnlegen();
      expect(await setzenCommitted(id, ['slip', 'email'])).toEqual(['email', 'slip']);
      expect(await kanaeleInDerAkte(id)).toEqual(['email', 'slip']);
    });

    it('liefert ohne Vermerk eine leere Liste, nicht null', async () => {
      const id = await terminAnlegen();
      expect(await kanaeleInDerAkte(id)).toEqual([]);
      expect(await kanaeleInDerSicht(id)).toEqual([]);
    });

    it('setzt statt zu ergaenzen - was nicht angehakt ist, gilt nicht', async () => {
      const id = await terminAnlegen();
      await setzenCommitted(id, ['slip', 'phone']);
      expect(await setzenCommitted(id, ['email'])).toEqual(['email']);
      expect(await kanaeleInDerAkte(id)).toEqual(['email']);
    });

    it('nimmt den Vermerk mit einer leeren Liste zurueck', async () => {
      // Der Fall "Drucker ging nicht".
      const id = await terminAnlegen();
      await setzenCommitted(id, ['slip']);
      expect(await setzenCommitted(id, [])).toEqual([]);
      expect(await kanaeleInDerAkte(id)).toEqual([]);
    });

    it('zaehlt einen doppelt angegebenen Weg nur einmal', async () => {
      const id = await terminAnlegen();
      expect(await setzenCommitted(id, ['phone', 'phone'])).toEqual(['phone']);
      const { rows } = await asPostgres<{ anzahl: string }>(
        'select count(*)::text as anzahl from public.appointment_notifications where appointment_id = $1::uuid',
        [id],
      );
      expect(Number(rows[0]!.anzahl)).toBe(1);
    });

    it('haelt Zeitpunkt und vermerkende Person fest', async () => {
      const id = await terminAnlegen();
      await setzenCommitted(id, ['in_person']);
      const { rows } = await asPostgres<{ notified_by: string; notified_at: string }>(
        'select notified_by, notified_at from public.appointment_notifications where appointment_id = $1::uuid',
        [id],
      );
      expect(rows[0]?.notified_by).toBe(users.office);
      expect(rows[0]?.notified_at).toBeTruthy();
    });

    it('weist einen unbekannten Weg ab', async () => {
      const id = await terminAnlegen();
      await expect(setzen(users.office, id, ['sms'])).rejects.toThrow(
        /unknown notification channel/,
      );
    });

    it('kennt weder sms noch messenger im Wertebereich (B15, ADR-014)', async () => {
      const { rows } = await asPostgres<{ definition: string }>(
        `select pg_get_constraintdef(oid) as definition from pg_constraint
          where conrelid = 'public.appointment_notifications'::regclass
            and contype = 'c' and conname like '%channel%'`,
      );
      expect(rows[0]?.definition).not.toMatch(/sms|messenger/i);
    });
  });

  describe('Der Vermerk verfaellt mit einer Terminaenderung', () => {
    it('verschwindet, sobald der Termin verschoben wird', async () => {
      const id = await terminAnlegen();
      await setzenCommitted(id, ['phone']);
      expect(await kanaeleInDerAkte(id)).toEqual(['phone']);

      await asUserCommitted(users.office, AENDERN, [
        id,
        await standVon(id),
        STAFF_ANNA,
        'video',
        TAG,
        '13:00',
        '14:00',
        null,
      ]);

      expect(await kanaeleInDerAkte(id)).toEqual([]);
      expect(await kanaeleInDerSicht(id)).toEqual([]);
    });

    it('verschwindet auch bei einem Wechsel der behandelnden Person', async () => {
      // Auch das ist eine Nachricht fuer die Patient:in.
      const id = await terminAnlegen();
      await setzenCommitted(id, ['slip']);

      await asUserCommitted(users.office, AENDERN, [
        id,
        await standVon(id),
        STAFF_TIM,
        'video',
        TAG,
        '09:00',
        '10:00',
        null,
      ]);

      expect(await kanaeleInDerAkte(id)).toEqual([]);
    });

    it('bleibt stehen, wenn sich am Termin nichts aendert', async () => {
      const id = await terminAnlegen();
      await setzenCommitted(id, ['phone']);

      // update_appointment kehrt ohne Aenderung zurueck, ohne updated_at zu
      // bumpen - der Vermerk darf davon nicht betroffen sein.
      await asUserCommitted(users.office, AENDERN, [
        id,
        await standVon(id),
        STAFF_ANNA,
        'video',
        TAG,
        '09:00',
        '10:00',
        null,
      ]);

      expect(await kanaeleInDerAkte(id)).toEqual(['phone']);
    });

    it('loescht den alten Vermerk nicht, sondern macht ihn ungueltig', async () => {
      // "Wir haben ueber die alte Zeit informiert" bleibt nachvollziehbar.
      const id = await terminAnlegen();
      await setzenCommitted(id, ['phone']);
      await asUserCommitted(users.office, AENDERN, [
        id,
        await standVon(id),
        STAFF_ANNA,
        'video',
        TAG,
        '15:00',
        '16:00',
        null,
      ]);

      const { rows } = await asPostgres<{ channel: string }>(
        'select channel from public.appointment_notifications where appointment_id = $1::uuid',
        [id],
      );
      expect(rows.map((r) => r.channel)).toEqual(['phone']);
      expect(await kanaeleInDerAkte(id)).toEqual([]);
    });

    it('laesst einen ungueltigen Vermerk stehen, wenn danach neu vermerkt wird', async () => {
      const id = await terminAnlegen();
      await setzenCommitted(id, ['phone']);
      await asUserCommitted(users.office, AENDERN, [
        id,
        await standVon(id),
        STAFF_ANNA,
        'video',
        TAG,
        '15:00',
        '16:00',
        null,
      ]);
      await setzenCommitted(id, ['slip']);

      const { rows } = await asPostgres<{ channel: string }>(
        'select channel from public.appointment_notifications where appointment_id = $1::uuid order by channel',
        [id],
      );
      expect(rows.map((r) => r.channel)).toEqual(['phone', 'slip']);
      // Gueltig ist nur der neue.
      expect(await kanaeleInDerAkte(id)).toEqual(['slip']);
    });
  });

  describe('Mehrere Termine auf einmal (Terminzettel)', () => {
    it('ergaenzt einen Weg bei allen genannten Terminen', async () => {
      const a = await terminAnlegen('09:00', '10:00');
      const b = await terminAnlegen('11:00', '12:00');

      const { rows } = await asUserCommitted<{ anzahl: number }>(users.office, ERGAENZEN, [
        [a, b],
        'slip',
      ]);
      expect(rows[0]?.anzahl).toBe(2);
      expect(await kanaeleInDerAkte(a)).toEqual(['slip']);
      expect(await kanaeleInDerAkte(b)).toEqual(['slip']);
    });

    it('verliert dabei einen vorhandenen Weg nicht', async () => {
      const id = await terminAnlegen();
      await setzenCommitted(id, ['phone']);

      await asUserCommitted(users.office, ERGAENZEN, [[id], 'slip']);
      expect(await kanaeleInDerAkte(id)).toEqual(['phone', 'slip']);
    });

    it('vermerkt einen bereits vorhandenen Weg nicht doppelt', async () => {
      const id = await terminAnlegen();
      await setzenCommitted(id, ['slip']);
      await asUserCommitted(users.office, ERGAENZEN, [[id], 'slip']);
      expect(await kanaeleInDerAkte(id)).toEqual(['slip']);
    });

    it('schreibt je Termin einen eigenen Auditeintrag', async () => {
      const a = await terminAnlegen('09:00', '10:00');
      const b = await terminAnlegen('11:00', '12:00');
      await asPostgres("delete from public.audit_log where action <> 'appointment.notified'");
      await asUserCommitted(users.office, ERGAENZEN, [[a, b], 'slip']);

      const { rows } = await asPostgres<{ subject_id: string }>(
        `select subject_id from public.audit_log where action = 'appointment.notified'`,
      );
      expect(rows.map((r) => r.subject_id).sort()).toEqual([a, b].sort());
    });

    it('legt bei einem unbekannten Termin keinen einzigen Vermerk an', async () => {
      const id = await terminAnlegen();
      await expect(
        asUser(users.office, ERGAENZEN, [[id, '11111111-1111-4111-8111-0000000000ff'], 'slip']),
      ).rejects.toThrow(/appointment not found/);

      const { rows } = await asPostgres('select id from public.appointment_notifications');
      expect(rows).toEqual([]);
    });

    it('weist eine leere Liste mit 0 ab, ohne zu scheitern', async () => {
      const { rows } = await asUser<{ anzahl: number }>(users.office, ERGAENZEN, [[], 'slip']);
      expect(rows[0]?.anzahl).toBe(0);
    });
  });

  describe('Audit (ADR-010)', () => {
    it('protokolliert die Wege, aber keinen Inhalt', async () => {
      const id = await terminAnlegen();
      await asPostgres('delete from public.audit_log');
      await setzenCommitted(id, ['email', 'phone']);

      const { rows } = await asPostgres<{
        actor_user_id: string;
        subject_type: string;
        context: Record<string, unknown>;
      }>(
        `select actor_user_id, subject_type, context from public.audit_log
          where action = 'appointment.notified'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.subject_type).toBe('appointment');
      expect(rows[0]?.actor_user_id).toBe(users.office);
      expect(rows[0]?.context).toMatchObject({
        surface: 'web',
        patient_id: patients.max,
        channels: ['email', 'phone'],
      });
      expect(JSON.stringify(rows[0]?.context)).not.toMatch(/Mustermann|Beispiel/i);
    });

    it('protokolliert auch die Ruecknahme, mit leerer Wegeliste', async () => {
      const id = await terminAnlegen();
      await setzenCommitted(id, ['slip']);
      await asPostgres('delete from public.audit_log');
      await setzenCommitted(id, []);

      const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
        `select context from public.audit_log where action = 'appointment.notified'`,
      );
      expect(rows[0]?.context).toMatchObject({ channels: [] });
    });
  });

  describe('Berechtigungen und Mandantentrennung', () => {
    it.each([
      ['owner', users.ownerTherapist],
      ['therapist', users.therapist],
      ['team_lead', users.teamLead],
      ['office', users.office],
    ])('erlaubt %s den Vermerk', async (_rolle, userId) => {
      const id = await terminAnlegen();
      const { rows } = await asUser<{ kanaele: string[] }>(userId, SETZEN, [id, ['phone']]);
      expect(rows[0]?.kanaele).toEqual(['phone']);
    });

    it('weist ein Patientenkonto ab', async () => {
      const id = await terminAnlegen();
      await expect(setzen(users.patientMax, id, ['phone'])).rejects.toThrow(
        /not allowed to update appointments/,
      );
    });

    it('weist einen anonymen Zugriff ab', async () => {
      const id = await terminAnlegen();
      await expect(asAnon(SETZEN, [id, ['phone']])).rejects.toThrow(
        /permission denied|not authenticated/i,
      );
    });

    it('laesst authenticated nicht direkt in die Tabelle schreiben', async () => {
      const id = await terminAnlegen();
      await expect(
        asUser(
          users.office,
          `insert into public.appointment_notifications (organization_id, appointment_id, channel)
           values ($1::uuid, $2::uuid, 'phone')`,
          [SEED.organizationId, id],
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('zeigt einem Patientenkonto keine Vermerke', async () => {
      const id = await terminAnlegen();
      await setzenCommitted(id, ['phone']);
      const { rows } = await asUser(
        users.patientMax,
        'select id from public.appointment_notifications where appointment_id = $1::uuid',
        [id],
      );
      expect(rows).toEqual([]);
    });

    it('weist einen Termin einer fremden Organisation ab', async () => {
      await expect(
        setzen(users.office, '11111111-1111-4111-8111-0000000000ff', ['phone']),
      ).rejects.toThrow(/appointment not found/);
    });

    it('nimmt keine organization_id entgegen', async () => {
      const { rows } = await asPostgres<{ argumente: string }>(
        "select pg_get_function_arguments(oid) as argumente from pg_proc where proname = 'set_appointment_notification'",
      );
      expect(rows[0]?.argumente).not.toMatch(/organization/i);
    });
  });

  describe('Loeschung (ADR-008)', () => {
    it('faellt mit dem Termin, ohne eigene Regel im Retention Schedule', async () => {
      const id = await terminAnlegen();
      await setzenCommitted(id, ['phone']);
      await asPostgres('delete from public.appointments where id = $1::uuid', [id]);

      const { rows } = await asPostgres('select id from public.appointment_notifications');
      expect(rows).toEqual([]);
    });
  });
});
