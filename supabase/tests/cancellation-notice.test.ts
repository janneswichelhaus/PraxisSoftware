import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Absage unter 24 Stunden (CAL-014b, ADR-018 Fassung 2 Punkt 8).
 *
 * Hier steht die Geldfrage, und deshalb steht sie serverseitig: Ob eine
 * Ausfallgebuehr entsteht, rechnet die Datenbank aus dem **Eingang** der
 * Absage und dem vereinbarten Beginn - nie aus dem Zeitpunkt der Eingabe und
 * nie im Browser.
 *
 * Die Faelle, auf die es ankommt, und warum sie hier stehen:
 *
 *   * **Genau 24 Stunden** sind die Grenze, und sie liegt ausserhalb der
 *     Regel. Eine Zeile Code, die `<=` statt `<` schreibt, kostet eine
 *     Patientin Geld.
 *   * **Die nachtraegliche Erfassung** ist der Alltag: Der Anruf kommt abends
 *     aufs Band, eingetragen wird am naechsten Morgen. Ohne die Trennung
 *     entschiede die Schreibgeschwindigkeit des Bueros ueber eine Forderung.
 *   * **Die Praxisabsage** loest nie aus - auch nicht fuenf Minuten vorher.
 *   * **Die Zeitumstellung**: Gerechnet wird in absoluten Stunden.
 */

const { users, patients } = SEED;

const ABSAGEN =
  'select public.cancel_appointment($1::uuid, $2::timestamptz, $3, $4::date, $5::time) as id';
const NICHT_ANGETROFFEN = 'select public.record_no_show($1::uuid, $2::timestamptz) as id';

/**
 * Tim Teamleitung - im Seed ohne eigene Termine.
 *
 * Diese Datei legt Termine mit einem Beginn relativ zu `now()` an; bei Anna
 * lägen sie sonst je nach Tageszeit im Zeitraum der drei Seed-Termine und
 * fielen an der EXCLUDE-Constraint aus, ohne dass es mit der Frist zu tun
 * hätte.
 */
const TIM = '55555555-5555-4555-8555-000000000004';

interface Termin {
  id: string;
  updated_at: string;
  starts_at: string;
}

/**
 * Legt einen bestaetigten Termin an, der in `stundenVoraus` Stunden beginnt.
 *
 * Bewusst als direkter INSERT und nicht ueber `create_appointment`: Geprueft
 * wird die Frist der Absage, nicht die Anlage. Ein Beginn auf die Stunde genau
 * relativ zu `now()` waere ueber Datum und Uhrzeit in Ortszeit nur mit Rechnen
 * ueber Zeitzone und Mitternacht zu treffen - und genau das wuerde den Test
 * von Dingen abhaengig machen, die er nicht prueft. Die Schreibpfade der
 * Anlage haben ihre eigenen Dateien.
 */
async function terminIn(stundenVoraus: number): Promise<Termin> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, appointment_type, status,
       starts_at, ends_at
     )
     values ($1::uuid, $2::uuid, $3::uuid, 'video', 'confirmed',
             now() + ($4::numeric * interval '1 hour'),
             now() + ($4::numeric * interval '1 hour') + interval '1 hour')
     returning id::text as id`,
    [SEED.organizationId, patients.max, TIM, stundenVoraus],
  );
  return stand(rows[0]!.id);
}

async function stand(id: string): Promise<Termin> {
  const { rows } = await asPostgres<Termin>(
    `select id,
            to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as updated_at,
            -- Mit "Z" und Millisekunden: Dieser Wert wird im Test von
            -- JavaScript gelesen, und ein Versatz "+00" ohne Minuten ist kein
            -- gueltiges ISO-Datum.
            to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at
       from public.appointments where id = $1`,
    [id],
  );
  return rows[0]!;
}

async function zeile(id: string) {
  const { rows } = await asPostgres<Record<string, unknown>>(
    'select * from public.appointments where id = $1',
    [id],
  );
  return rows[0];
}

/**
 * Datum und Uhrzeit in Praxiszeit, `stunden` Stunden vor dem Beginn dieses
 * Termins.
 *
 * Die Umrechnung macht die Datenbank - dieselbe, die sie auch im Schreibpfad
 * macht. Eine in JavaScript gerechnete Wanduhrzeit in fremder Zeitzone waere
 * hier die Fehlerquelle, die der Test aufdecken soll.
 */
async function eingangVorBeginn(
  termin: Termin,
  stunden: number,
): Promise<[datum: string, uhrzeit: string]> {
  const { rows } = await asPostgres<{ datum: string; uhrzeit: string }>(
    `select to_char(($1::timestamptz - ($2::numeric * interval '1 hour')) at time zone o.time_zone,
                    'YYYY-MM-DD') as datum,
            to_char(($1::timestamptz - ($2::numeric * interval '1 hour')) at time zone o.time_zone,
                    'HH24:MI:SS') as uhrzeit
       from public.organizations o where o.id = $3::uuid`,
    [termin.starts_at, stunden, SEED.organizationId],
  );
  return [rows[0]!.datum, rows[0]!.uhrzeit];
}

describe('Absage unter 24 Stunden: die Frist', () => {
  beforeEach(resetDatabase);

  it('merkt eine Gebuehr vor, wenn die Absage weniger als 24 Stunden vorher eingeht', async () => {
    const termin = await terminIn(20);
    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'patient_request',
      ...(await eingangVorBeginn(termin, 23)),
    ]);

    expect(await zeile(termin.id)).toMatchObject({
      status: 'cancelled',
      cancellation_reason: 'patient_request',
      fee_basis: 'late_cancellation',
    });
  });

  it('merkt keine Gebuehr vor, wenn die Absage frueher eingeht', async () => {
    const termin = await terminIn(20);
    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'patient_request',
      ...(await eingangVorBeginn(termin, 25)),
    ]);

    expect(await zeile(termin.id)).toMatchObject({ status: 'cancelled', fee_basis: null });
  });

  /**
   * Die Grenze selbst. „Weniger als 24 Stunden" heisst: Genau 24 Stunden
   * liegen ausserhalb der Regel (ADR-018 Fassung 2 Punkt 8).
   */
  it('merkt bei GENAU 24 Stunden keine Gebuehr vor', async () => {
    const termin = await terminIn(20);
    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'patient_request',
      ...(await eingangVorBeginn(termin, 24)),
    ]);

    expect(await zeile(termin.id)).toMatchObject({ status: 'cancelled', fee_basis: null });
  });

  it('merkt eine Sekunde unter 24 Stunden eine Gebuehr vor', async () => {
    const termin = await terminIn(20);
    // 24 Stunden minus eine Sekunde - die Uhrzeit traegt Sekunden, die
    // Umrechnung macht wie im Schreibpfad die Datenbank.
    const eingang = await eingangVorBeginn(termin, 24 - 1 / 3600);

    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'patient_request',
      ...eingang,
    ]);

    expect(await zeile(termin.id)).toMatchObject({ fee_basis: 'late_cancellation' });
  });

  /**
   * Wer erst absagt, als der Termin schon laeuft, hat spaeter als "kurz
   * vorher" abgesagt. Geprueft an der Funktion selbst: Ein Termin, der bereits
   * begonnen hat, liesse sich ueber den Schreibpfad gar nicht erst anlegen.
   */
  it('merkt eine Gebuehr vor, wenn die Absage erst nach dem Beginn eingeht', async () => {
    const { rows } = await asPostgres<{ spaet: boolean }>(
      `select app.is_late_cancellation(
                'patient_request', now(), now() - interval '30 minutes'
              ) as spaet`,
    );
    expect(rows[0]?.spaet).toBe(true);
  });
});

describe('Absage unter 24 Stunden: Eingang und Eingabe sind zweierlei', () => {
  beforeEach(resetDatabase);

  /**
   * Der Alltagsfall: Die Absage kommt abends aufs Band, eingetragen wird sie
   * am naechsten Morgen - da ist der Termin laengst vorbei. Massgeblich ist
   * der Eingang.
   */
  it('rechnet mit dem Eingang und nicht mit dem Zeitpunkt der Eingabe', async () => {
    const termin = await terminIn(20);
    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'patient_request',
      // Drei Tage vorher eingegangen, jetzt erst eingetragen.
      ...(await eingangVorBeginn(termin, 72)),
    ]);

    const z = await zeile(termin.id);
    expect(z).toMatchObject({ fee_basis: null });
    // Beide Zeitpunkte stehen nebeneinander an der Zeile.
    expect(z?.cancellation_received_at).not.toBeNull();
    expect(new Date(z?.cancelled_at as string).getTime()).toBeGreaterThan(
      new Date(z?.cancellation_received_at as string).getTime(),
    );
  });

  it('stempelt ohne Angabe den Augenblick der Eingabe als Eingang', async () => {
    const termin = await terminIn(48);
    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'patient_request',
      null,
      null,
    ]);

    const z = await zeile(termin.id);
    expect(z?.cancellation_received_at).not.toBeNull();
    expect(z).toMatchObject({ fee_basis: null });
  });

  it('nimmt keinen Eingang aus der Zukunft an und schreibt dann gar nichts', async () => {
    const termin = await terminIn(48);
    // Der Beginn selbst liegt zwei Tage voraus - als Eingang waere er Zukunft.
    const morgen = await eingangVorBeginn(termin, 0);

    await expect(
      asUser(users.office, ABSAGEN, [termin.id, termin.updated_at, 'patient_request', ...morgen]),
    ).rejects.toThrow(/cancellation cannot be received in the future/);

    const { rows } = await asPostgres<{ status: string }>(
      'select status from public.appointments where id = $1',
      [termin.id],
    );
    expect(rows[0]?.status).toBe('confirmed');
  });

  it('nimmt ein Datum ohne Uhrzeit nicht an', async () => {
    const termin = await terminIn(48);
    const [datum] = await eingangVorBeginn(termin, 72);

    await expect(
      asUser(users.office, ABSAGEN, [termin.id, termin.updated_at, 'patient_request', datum, null]),
    ).rejects.toThrow(/cancellation receipt needs date and time/);
  });

  it('haelt den Eingang nur an einer Absage fest', async () => {
    const termin = await terminIn(48);

    await expect(
      asPostgres(`update public.appointments set cancellation_received_at = now() where id = $1`, [
        termin.id,
      ]),
    ).rejects.toThrow(/appointments_cancellation_received_needs_cancellation/);
  });
});

describe('Absage unter 24 Stunden: welcher Grund ausloest', () => {
  beforeEach(resetDatabase);

  it.each([
    ['practice_request', 'die Praxis sagt ab'],
    ['practice_moved', 'die Praxis verlegt'],
    ['other', 'sonstiger Grund'],
  ] as const)('merkt bei %s keine Gebuehr vor (%s)', async (grund, _warum) => {
    const termin = await terminIn(2);
    await asUserCommitted(users.office, ABSAGEN, [termin.id, termin.updated_at, grund, null, null]);

    expect(await zeile(termin.id)).toMatchObject({
      status: 'cancelled',
      cancellation_reason: grund,
      fee_basis: null,
    });
  });

  it('sagt im Auditlog, ob eine Gebuehr entstanden ist - ohne den Grund zu nennen', async () => {
    const termin = await terminIn(20);
    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'patient_request',
      // Drei Stunden her und 23 Stunden vor dem Beginn: nachgetragen UND
      // unter der Frist.
      ...(await eingangVorBeginn(termin, 23)),
    ]);

    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log
        where action = 'appointment.cancelled' and subject_id = $1`,
      [termin.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.context).toMatchObject({ fee: true, received_later: true, surface: 'web' });
    // ANN-034: Der codierte Absagegrund steht an der Zeile und nicht im
    // Auditlog - dort wuerde er die Zeile ueberleben.
    expect(rows[0]?.context).not.toHaveProperty('reason');
    expect(rows[0]?.context).not.toHaveProperty('fee_basis');
  });
});

describe('Absage unter 24 Stunden: Zeitumstellung und Wiederholung', () => {
  beforeEach(resetDatabase);

  /**
   * Gerechnet wird auf `timestamptz` und damit in absoluten Stunden. Ueber die
   * Umstellung von Sommer- auf Winterzeit hinweg heisst das: 24 Stunden
   * bleiben 24 Stunden, auch wenn die Uhr dazwischen eine Stunde springt.
   *
   * Der Test rechnet ohne Kalender: Er setzt Beginn und Eingang fest auf die
   * deutsche Umstellungsnacht 2026 (25. Oktober, 03:00 MESZ wird 02:00 MEZ)
   * und prueft die Funktion direkt. Ein Termin liesse sich dafuer nicht
   * anlegen - er laege in der Vergangenheit.
   */
  it('rechnet ueber die Zeitumstellung in absoluten Stunden', async () => {
    const { rows } = await asPostgres<{ genau24: boolean; knapp: boolean }>(
      `select
         app.is_late_cancellation(
           'patient_request',
           timestamptz '2026-10-24 23:00:00+02',
           timestamptz '2026-10-25 22:00:00+01'
         ) as genau24,
         app.is_late_cancellation(
           'patient_request',
           timestamptz '2026-10-24 23:30:00+02',
           timestamptz '2026-10-25 22:00:00+01'
         ) as knapp`,
    );

    // 24.10. 23:00 MESZ = 21:00 UTC, 25.10. 22:00 MEZ = 21:00 UTC -> exakt 24 h.
    expect(rows[0]?.genau24).toBe(false);
    // Eine halbe Stunde spaeter eingegangen: 23,5 Stunden vorher.
    expect(rows[0]?.knapp).toBe(true);
  });

  it('sagt einen bereits abgesagten Termin nicht noch einmal ab', async () => {
    const termin = await terminIn(2);
    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'patient_request',
      null,
      null,
    ]);
    const abgesagt = await stand(termin.id);

    await expect(
      asUser(users.office, ABSAGEN, [
        abgesagt.id,
        abgesagt.updated_at,
        'practice_request',
        null,
        null,
      ]),
    ).rejects.toThrow(/already cancelled/);

    // Der einmal gesetzte Anlass bleibt, was er war.
    expect(await zeile(termin.id)).toMatchObject({ fee_basis: 'late_cancellation' });
  });

  it('laesst einen Gebuehrenanlass nicht ohne festgehaltenen Eingang zu', async () => {
    const termin = await terminIn(2);
    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'patient_request',
      null,
      null,
    ]);

    await expect(
      asPostgres('update public.appointments set cancellation_received_at = null where id = $1', [
        termin.id,
      ]),
    ).rejects.toThrow(/appointments_late_cancellation_needs_receipt/);
  });
});

describe('Nichtantreffen: abhaken ohne Gebuehrenentscheidung', () => {
  beforeEach(resetDatabase);

  it('haelt den Vermerk ohne Gebuehrenanlass fest', async () => {
    const termin = await terminIn(2);
    await asUserCommitted(users.therapist, NICHT_ANGETROFFEN, [termin.id, termin.updated_at]);

    expect(await zeile(termin.id)).toMatchObject({ status: 'no_show', fee_basis: null });
  });

  /**
   * Die Trennung, um die es fachlich geht: Ein Nichtantreffen ist keine
   * Behandlung. Es darf nicht als durchgefuehrt, nicht als dokumentiert und
   * nicht als verbrauchte Verordnungsleistung erscheinen
   * (PROJECT_PRINCIPLES.md 8).
   */
  it('erscheint weder als durchgefuehrt noch als dokumentiert', async () => {
    const termin = await terminIn(2);
    await asUserCommitted(users.therapist, NICHT_ANGETROFFEN, [termin.id, termin.updated_at]);

    const z = await zeile(termin.id);
    expect(z).toMatchObject({ status: 'no_show', completed_at: null, completed_by: null });

    const { rows } = await asPostgres<{ anzahl: string }>(
      'select count(*) as anzahl from public.treatment_notes where appointment_id = $1',
      [termin.id],
    );
    expect(rows[0]?.anzahl).toBe('0');
  });

  /**
   * „verplant ist nicht genutzt" (ANN-038): Die genutzte Menge einer
   * Verordnung wird von Hand gefuehrt und entsteht nicht aus Terminen. Ein
   * Vermerk kann sie deshalb gar nicht verbrauchen - geprueft wird es
   * trotzdem, weil die Zusicherung fachlich ist und nicht technisch.
   */
  it('verbraucht keine Verordnungsleistung', async () => {
    const vorher = await asPostgres<{ summe: string }>(
      'select coalesce(sum(used_quantity), 0)::text as summe from public.treatment_base_items',
    );

    const termin = await terminIn(2);
    await asUserCommitted(users.therapist, NICHT_ANGETROFFEN, [termin.id, termin.updated_at]);

    const nachher = await asPostgres<{ summe: string }>(
      'select coalesce(sum(used_quantity), 0)::text as summe from public.treatment_base_items',
    );
    expect(nachher.rows[0]?.summe).toBe(vorher.rows[0]?.summe);
  });

  it('haelt Absage und Vermerk auseinander - ein Anlass gehoert zu einem Zustand', async () => {
    const termin = await terminIn(2);
    await asUserCommitted(users.therapist, NICHT_ANGETROFFEN, [termin.id, termin.updated_at]);

    await expect(
      asPostgres("update public.appointments set fee_basis = 'late_cancellation' where id = $1", [
        termin.id,
      ]),
    ).rejects.toThrow(/appointments_fee_basis_values/);
  });

  /**
   * ADR-018 Punkt 7: Zeitablauf allein erzeugt nichts. Ein Termin, dessen Zeit
   * vorbei ist, bleibt `confirmed`, bis ein Mensch etwas anderes sagt.
   */
  it('macht aus einem vergangenen Termin von selbst weder Absage noch Vermerk', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointments (
         organization_id, patient_id, staff_member_id, appointment_type, status,
         starts_at, ends_at
       )
       select $1::uuid, $2::uuid, $3::uuid, 'video', 'confirmed',
              now() - interval '3 days', now() - interval '3 days' + interval '1 hour'
       returning id::text as id`,
      [SEED.organizationId, patients.max, TIM],
    );
    const id = rows[0]!.id;

    // Der Loeschlauf ist der einzige Vorgang, der ohne Zutun ueber Termine
    // laeuft - auch er deutet keinen um.
    await asPostgres('select public.apply_retention()');

    const { rows: nachher } = await asPostgres<{ status: string }>(
      'select status from public.appointments where id = $1',
      [id],
    );
    expect(nachher[0]?.status).toBe('confirmed');
  });
});

/**
 * ABN-006 (BEF-094, ANN-047 Fassung 2, ADR-018 Fassung 4 Punkt 8): Wer
 * verlegt, entscheidet über die Frist. Verlegt die Patient:in kurzfristig,
 * fällt der vereinbarte Termin aus wie bei einer Absage; verlegt die Praxis,
 * bleibt es gebührenfrei.
 */
describe('Verlegung: wer sie veranlasst hat', () => {
  beforeEach(resetDatabase);

  it('merkt bei einer kurzfristigen Verlegung durch die Patient:in eine Gebühr vor', async () => {
    const termin = await terminIn(20);
    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'patient_moved',
      ...(await eingangVorBeginn(termin, 23)),
    ]);

    expect(await zeile(termin.id)).toMatchObject({
      status: 'cancelled',
      cancellation_reason: 'patient_moved',
      fee_basis: 'late_cancellation',
    });
  });

  it('merkt bei einer rechtzeitigen Verlegung durch die Patient:in nichts vor', async () => {
    const termin = await terminIn(30);
    await asUserCommitted(users.office, ABSAGEN, [
      termin.id,
      termin.updated_at,
      'patient_moved',
      null,
      null,
    ]);

    expect(await zeile(termin.id)).toMatchObject({
      cancellation_reason: 'patient_moved',
      fee_basis: null,
    });
  });

  it('nimmt den alten Grund ohne Veranlasser nicht mehr an', async () => {
    const termin = await terminIn(2);
    await expect(
      asUser(users.office, ABSAGEN, [termin.id, termin.updated_at, 'moved', null, null]),
    ).rejects.toThrow(/cancellation reason is required/);
  });

  it('lässt Bestandszeilen mit dem alten Grund gültig', async () => {
    const termin = await terminIn(2);
    await asPostgres(
      `update public.appointments
          set status = 'cancelled', cancellation_reason = 'moved',
              cancelled_at = now(), cancelled_by = $2::uuid
        where id = $1`,
      [termin.id, users.office],
    );
    expect(await zeile(termin.id)).toMatchObject({ cancellation_reason: 'moved', fee_basis: null });
  });

  it.each([['patient_moved'], ['patient_request'], ['moved']])(
    'nimmt beim Umplanen eines Tages %s nicht an - der Ausfall ist praxisbedingt',
    async (grund) => {
      await expect(
        asUser(users.office, 'select public.cancel_staff_day($1::uuid, current_date, $2)', [
          TIM,
          grund,
        ]),
      ).rejects.toThrow(/day rescheduling needs a practice reason/);
    },
  );
});

const VERZICHTEN = 'select public.waive_appointment_fee($1::uuid, $2::timestamptz) as id';

async function kurzfristigAbgesagt(): Promise<Termin> {
  const termin = await terminIn(2);
  await asUserCommitted(users.office, ABSAGEN, [
    termin.id,
    termin.updated_at,
    'patient_request',
    null,
    null,
  ]);
  return stand(termin.id);
}

describe('Verzicht auf die Gebühr', () => {
  beforeEach(resetDatabase);

  it('vermerkt den Verzicht und lässt den Anlass stehen', async () => {
    const termin = await kurzfristigAbgesagt();
    await asUserCommitted(users.office, VERZICHTEN, [termin.id, termin.updated_at]);

    const nachher = await zeile(termin.id);
    expect(nachher).toMatchObject({
      status: 'cancelled',
      fee_basis: 'late_cancellation',
      fee_waived_by: users.office,
    });
    expect(nachher?.fee_waived_at).not.toBeNull();

    const { rows } = await asPostgres<{ actor_user_id: string; context: Record<string, unknown> }>(
      `select actor_user_id, context from public.audit_log
        where action = 'appointment.fee_waived' and subject_id = $1`,
      [termin.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actor_user_id).toBe(users.office);
    expect(rows[0]!.context).toMatchObject({ surface: 'web', fee_basis: 'late_cancellation' });
  });

  it('nimmt den Termin aus den offenen Leistungen und lässt kein Ausfallhonorar mehr erfassen', async () => {
    const termin = await kurzfristigAbgesagt();
    const offen = async () =>
      (
        await asUserCommitted<{ appointment_id: string }>(
          users.office,
          'select appointment_id from public.list_open_billable_appointments(200)',
          [],
        )
      ).rows.map((r) => r.appointment_id);
    expect(await offen()).toContain(termin.id);

    await asUserCommitted(users.office, VERZICHTEN, [termin.id, termin.updated_at]);

    expect(await offen()).not.toContain(termin.id);
    await expect(
      asUser(users.office, 'select public.record_billable_services($1::uuid, $2::jsonb)', [
        termin.id,
        JSON.stringify([{ catalog_item_id: '00000000-0000-4000-8000-000000000000' }]),
      ]),
    ).rejects.toThrow(/neither documented nor a fee occasion/);
  });

  it('erlaubt den Verzicht nur owner und office', async () => {
    const termin = await kurzfristigAbgesagt();
    await expect(
      asUser(users.therapist, VERZICHTEN, [termin.id, termin.updated_at]),
    ).rejects.toThrow(/not allowed to waive fees/);
    expect((await zeile(termin.id))?.fee_waived_at).toBeNull();
  });

  it('verzichtet nicht ohne Anlass und nicht zweimal', async () => {
    const ohne = await terminIn(30);
    await asUserCommitted(users.office, ABSAGEN, [
      ohne.id,
      ohne.updated_at,
      'patient_request',
      null,
      null,
    ]);
    const ohneStand = await stand(ohne.id);
    await expect(
      asUser(users.office, VERZICHTEN, [ohneStand.id, ohneStand.updated_at]),
    ).rejects.toThrow(/no fee occasion/);

    const termin = await kurzfristigAbgesagt();
    await asUserCommitted(users.office, VERZICHTEN, [termin.id, termin.updated_at]);
    const verzichtet = await stand(termin.id);
    await expect(
      asUser(users.office, VERZICHTEN, [verzichtet.id, verzichtet.updated_at]),
    ).rejects.toThrow(/already waived/);
  });

  it('verzichtet nicht mehr, wenn das Ausfallhonorar schon als Leistung erfasst ist', async () => {
    const termin = await kurzfristigAbgesagt();
    const { rows: entwurf } = await asUserCommitted<{ catalog_item_id: string }>(
      users.office,
      'select catalog_item_id from public.get_billable_service_draft($1::uuid) where suggested',
      [termin.id],
    );
    expect(entwurf.length).toBeGreaterThan(0);
    await asUserCommitted(
      users.office,
      'select public.record_billable_services($1::uuid, $2::jsonb)',
      [termin.id, JSON.stringify([{ catalog_item_id: entwurf[0]!.catalog_item_id }])],
    );
    const nachher = await stand(termin.id);

    await expect(
      asUser(users.office, VERZICHTEN, [nachher.id, nachher.updated_at]),
    ).rejects.toThrow(/already recorded as a service/);
  });

  it('weist einen veralteten Stand ab', async () => {
    const termin = await kurzfristigAbgesagt();
    await expect(
      asUser(users.office, VERZICHTEN, [termin.id, '2000-01-01T00:00:00Z']),
    ).rejects.toThrow(/changed meanwhile/);
  });

  it('lässt keinen Verzicht ohne Anlass in der Tabelle zu und verwirft ihn mit dem Anlass', async () => {
    const termin = await terminIn(30);
    await expect(
      asPostgres('update public.appointments set fee_waived_at = now() where id = $1', [termin.id]),
    ).rejects.toThrow(/appointments_fee_waiver_needs_fee/);

    const abgesagt = await kurzfristigAbgesagt();
    await asUserCommitted(users.office, VERZICHTEN, [abgesagt.id, abgesagt.updated_at]);
    // Fällt der Anlass weg, fällt der Verzicht mit (Trigger).
    await asPostgres(
      `update public.appointments
          set fee_basis = null where id = $1`,
      [abgesagt.id],
    );
    expect(await zeile(abgesagt.id)).toMatchObject({ fee_waived_at: null, fee_waived_by: null });
  });
});
