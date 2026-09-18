import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabaseOhneTermine,
} from './helpers/db';

/**
 * Deckung und Uebertragung (CAL-022).
 *
 * Zwei Zusagen stehen hier im Mittelpunkt:
 *
 *   * **Planen ist nicht Verbrauchen.** Ueber das Kontingent hinaus darf
 *     geplant werden, `used_quantity <= prescribed_quantity` bleibt trotzdem
 *     bestehen - und was darueber hinausgeht, heisst ungedeckt und ist an
 *     jeder Stelle sichtbar, an der es vorkommt.
 *   * **Uebertragen ist ein Vorgang, kein Nebeneffekt.** Alles oder nichts,
 *     dieselbe Patient:in, nie ein abgerechneter Termin, ein Auditeintrag.
 */

const { users, organizationId, patients } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';

/** Behandlungsgrundlagen aus supabase/seed.sql. */
const GRUNDLAGE = {
  /** Max, 10 moegliche Termine, 10 genutzt. */
  maxAusgeschoepft: '88888888-8888-4888-8888-000000000001',
  /** Max, 10 moegliche Termine, 7 genutzt. */
  maxOffen: '88888888-8888-4888-8888-000000000002',
  /** Erika, 6 moegliche Termine, 2 genutzt. */
  erikaAlt: '88888888-8888-4888-8888-000000000003',
  /** Erika, 10 moegliche Termine, 0 genutzt - die Folgeverordnung. */
  erikaFrisch: '88888888-8888-4888-8888-000000000004',
  /** Erika, Selbstzahler, 8 vereinbarte Termine. */
  erikaSelbstzahler: '88888888-8888-4888-8888-000000000005',
} as const;

const ZAHLEN = 'select * from public.get_treatment_basis_slots($1::uuid)';
const ZAHLEN_AKTE = 'select * from public.list_patient_treatment_basis_slots($1::uuid)';
const LISTE =
  'select * from public.list_patient_appointments($1::uuid, $2::boolean, 50, null, null, $3::uuid)';
const UEBERTRAGEN =
  'select public.transfer_appointments_to_treatment_basis($1::uuid, $2::uuid[]) as anzahl';

interface Kontingent {
  prescribed: number;
  used: number;
  planned: number;
  remaining: number;
  covered: number;
  uncovered: number;
}

interface Listenzeile {
  id: string;
  status: string;
  treatment_basis_id: string | null;
  treatment_basis_covered: boolean | null;
}

/**
 * Legt einen Termin relativ zu jetzt an - in Stunden, damit "vergangen" und
 * "kuenftig" nicht an einem festen Datum haengen. Gerechnet wird ab der
 * angebrochenen Stunde, sonst ueberlappen zwei angrenzende Termine um die
 * Millisekunden zwischen zwei Transaktionen.
 */
async function termin(opts: {
  inStunden: number;
  patient?: string;
  status?: 'confirmed' | 'completed' | 'cancelled' | 'documented' | 'invoiced';
  grundlage?: string | null;
}): Promise<string> {
  const status = opts.status ?? 'confirmed';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       completed_at, completed_by, cancelled_at, cancelled_by, cancellation_reason
     ) values (
       $1, $2, $3, $4,
       'practice', $5,
       date_trunc('hour', now()) + make_interval(mins => $6::int),
       date_trunc('hour', now()) + make_interval(mins => $6::int + 60),
       $7,
       case when $5 in ('completed', 'documented', 'invoiced') then now() end,
       case when $5 in ('completed', 'documented', 'invoiced') then $8::uuid end,
       case when $5 = 'cancelled' then now() end,
       case when $5 = 'cancelled' then $8::uuid end,
       case when $5 = 'cancelled' then 'patient_request' end
     ) returning id`,
    [
      organizationId,
      opts.patient ?? patients.erika,
      STAFF_ANNA,
      LOCATION,
      status,
      Math.round(opts.inStunden * 60),
      opts.grundlage === undefined ? GRUNDLAGE.erikaAlt : opts.grundlage,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

/** Legt `anzahl` kuenftige Termine an einer Grundlage an, Stunde fuer Stunde. */
async function termine(anzahl: number, grundlage: string, patient?: string): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < anzahl; i += 1) {
    ids.push(await termin({ inStunden: 24 + i, grundlage, patient }));
  }
  return ids;
}

async function kontingent(grundlage: string): Promise<Kontingent> {
  const { rows } = await asUser<Kontingent>(users.ownerTherapist, ZAHLEN, [grundlage]);
  return rows[0]!;
}

async function liste(patient: string, grundlage: string | null = null): Promise<Listenzeile[]> {
  const { rows } = await asUser<Listenzeile>(users.ownerTherapist, LISTE, [
    patient,
    true,
    grundlage,
  ]);
  return rows;
}

describe('Deckung einer Behandlungsgrundlage', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
  });

  it('zaehlt gedeckt und ungedeckt, ohne das Verbrauchte anzutasten', async () => {
    // Abnahmefall 4: sechs moegliche Termine, zehn geplant.
    await termine(10, GRUNDLAGE.erikaAlt);

    const zahlen = await kontingent(GRUNDLAGE.erikaAlt);
    expect(zahlen.prescribed).toBe(6);
    expect(zahlen.planned).toBe(10);
    expect(zahlen.covered).toBe(6);
    expect(zahlen.uncovered).toBe(4);
    expect(zahlen.remaining).toBe(0);

    // Planen ist nicht Verbrauchen: die genutzte Menge steht unveraendert da.
    const { rows } = await asPostgres<{ used_quantity: number }>(
      'select used_quantity from public.treatment_base_items where treatment_basis_id = $1 order by sort_order',
      [GRUNDLAGE.erikaAlt],
    );
    expect(rows.map((z) => Number(z.used_quantity))).toEqual([2, 1]);
    expect(zahlen.used).toBe(2);
  });

  it('haelt die Constraint used_quantity <= prescribed_quantity aufrecht', async () => {
    await termine(10, GRUNDLAGE.erikaAlt);

    await expect(
      asPostgres(
        'update public.treatment_base_items set used_quantity = 7 where treatment_basis_id = $1 and sort_order = 1',
        [GRUNDLAGE.erikaAlt],
      ),
    ).rejects.toThrow(/used_within_prescribed/);
  });

  it('deckt die frueheren Termine und kennzeichnet die spaeteren', async () => {
    const ids = await termine(8, GRUNDLAGE.erikaAlt);

    const zeilen = await liste(patients.erika, GRUNDLAGE.erikaAlt);
    const nachId = new Map(zeilen.map((z) => [z.id, z.treatment_basis_covered]));

    expect(ids.slice(0, 6).map((id) => nachId.get(id))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(ids.slice(6).map((id) => nachId.get(id))).toEqual([false, false]);
  });

  it('laesst einen abgesagten Termin weder decken noch zaehlen', async () => {
    const ids = await termine(6, GRUNDLAGE.erikaAlt);
    await asPostgres(
      `update public.appointments
          set status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
              cancellation_reason = 'patient_request'
        where id = $1`,
      [ids[0], users.ownerTherapist],
    );
    const spaeter = await termin({ inStunden: 40, grundlage: GRUNDLAGE.erikaAlt });

    const zahlen = await kontingent(GRUNDLAGE.erikaAlt);
    expect(zahlen.planned).toBe(6);
    expect(zahlen.uncovered).toBe(0);

    const zeilen = await liste(patients.erika, GRUNDLAGE.erikaAlt);
    const nachId = new Map(zeilen.map((z) => [z.id, z.treatment_basis_covered]));
    // Der abgesagte Termin macht keine Aussage, und der Platz rueckt nach.
    expect(nachId.get(ids[0]!)).toBeNull();
    expect(nachId.get(spaeter)).toBe(true);
  });

  it('sagt an einem Termin ohne Grundlage nichts ueber Deckung', async () => {
    const ohne = await termin({ inStunden: 24, grundlage: null });

    const zeilen = await liste(patients.erika);
    expect(zeilen.find((z) => z.id === ohne)?.treatment_basis_covered).toBeNull();
  });

  it('nennt dieselbe Deckung in der Terminsicht wie in der Liste', async () => {
    const ids = await termine(7, GRUNDLAGE.erikaAlt);

    const { rows } = await asUser<{ id: string; treatment_basis_covered: boolean | null }>(
      users.ownerTherapist,
      'select id, treatment_basis_covered from public.appointment_directory where id = any($1::uuid[])',
      [ids],
    );
    const nachId = new Map(rows.map((z) => [z.id, z.treatment_basis_covered]));
    expect(nachId.get(ids[5]!)).toBe(true);
    expect(nachId.get(ids[6]!)).toBe(false);
  });

  it('traegt gedeckt und ungedeckt auch in der Aktenuebersicht', async () => {
    await termine(9, GRUNDLAGE.erikaAlt);

    const { rows } = await asUser<Kontingent & { treatment_basis_id: string }>(
      users.ownerTherapist,
      ZAHLEN_AKTE,
      [patients.erika],
    );
    const alt = rows.find((z) => z.treatment_basis_id === GRUNDLAGE.erikaAlt)!;
    expect(alt.covered).toBe(6);
    expect(alt.uncovered).toBe(3);

    const frisch = rows.find((z) => z.treatment_basis_id === GRUNDLAGE.erikaFrisch)!;
    expect(frisch.covered).toBe(0);
    expect(frisch.uncovered).toBe(0);
  });
});

describe('transfer_appointments_to_treatment_basis', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
    await asPostgres(
      "delete from public.audit_log where action = 'treatment_basis.appointments_transferred'",
    );
  });

  it('ist fuer anon nicht ausfuehrbar', async () => {
    await expect(asAnon(UEBERTRAGEN, [GRUNDLAGE.erikaFrisch, []])).rejects.toThrow(
      /permission denied/,
    );
  });

  it('weist ein Patientenkonto ab', async () => {
    const ids = await termine(1, GRUNDLAGE.erikaAlt);
    await expect(asUser(users.patientErika, UEBERTRAGEN, [GRUNDLAGE.erikaFrisch, ids])).rejects
      .toThrow(/not allowed to update appointments/);
  });

  it('uebertraegt die ungedeckten Termine vollstaendig und protokolliert einmal', async () => {
    // Abnahmefall 5: zehn Termine an einer Grundlage mit sechs moeglichen,
    // die vier ungedeckten wandern auf die Folgeverordnung.
    const ids = await termine(10, GRUNDLAGE.erikaAlt);
    const ungedeckt = ids.slice(6);

    const { rows } = await asUserCommitted<{ anzahl: number }>(users.ownerTherapist, UEBERTRAGEN, [
      GRUNDLAGE.erikaFrisch,
      ungedeckt,
    ]);
    expect(Number(rows[0]!.anzahl)).toBe(4);

    const alt = await kontingent(GRUNDLAGE.erikaAlt);
    expect(alt.planned).toBe(6);
    expect(alt.uncovered).toBe(0);

    const neu = await kontingent(GRUNDLAGE.erikaFrisch);
    expect(neu.planned).toBe(4);
    expect(neu.covered).toBe(4);
    expect(neu.uncovered).toBe(0);

    const protokoll = await asPostgres<{ subject_id: string; context: Record<string, unknown> }>(
      "select subject_id, context from public.audit_log where action = 'treatment_basis.appointments_transferred'",
    );
    expect(protokoll.rows).toHaveLength(1);
    expect(protokoll.rows[0]!.subject_id).toBe(GRUNDLAGE.erikaFrisch);
    expect(protokoll.rows[0]!.context.patient_id).toBe(patients.erika);
    expect(protokoll.rows[0]!.context.appointment_count).toBe(4);
    // Ohne klinischen Inhalt: keine Diagnose, keine Notiz, kein Name.
    expect(JSON.stringify(protokoll.rows[0]!.context)).not.toMatch(/diagnos|Nacken|Erika/i);
  });

  it('laesst den Mitteilungsvermerk stehen - der Zeitpunkt aendert sich nicht', async () => {
    const [id] = await termine(1, GRUNDLAGE.erikaAlt);
    const vorher = await asPostgres<{ updated_at: Date }>(
      'select updated_at from public.appointments where id = $1',
      [id],
    );

    await asUserCommitted(users.ownerTherapist, UEBERTRAGEN, [GRUNDLAGE.erikaFrisch, [id]]);

    const nachher = await asPostgres<{ updated_at: Date }>(
      'select updated_at from public.appointments where id = $1',
      [id],
    );
    expect(nachher.rows[0]!.updated_at).toEqual(vorher.rows[0]!.updated_at);
  });

  it('weist eine Zielgrundlage einer anderen Patient:in ab und schreibt nichts', async () => {
    const ids = await termine(3, GRUNDLAGE.erikaAlt);

    await expect(
      asUserCommitted(users.ownerTherapist, UEBERTRAGEN, [GRUNDLAGE.maxOffen, ids]),
    ).rejects.toThrow(/appointments are not transferable/);

    const unveraendert = await asPostgres<{ anzahl: string }>(
      'select count(*) as anzahl from public.appointments where treatment_basis_id = $1',
      [GRUNDLAGE.erikaAlt],
    );
    expect(Number(unveraendert.rows[0]!.anzahl)).toBe(3);
  });

  it('uebertraegt keinen abgerechneten Termin - alles oder nichts', async () => {
    const offen = await termin({ inStunden: 24, grundlage: GRUNDLAGE.erikaAlt });
    const abgerechnet = await termin({
      inStunden: 26,
      grundlage: GRUNDLAGE.erikaAlt,
      status: 'invoiced',
    });

    await expect(
      asUserCommitted(users.ownerTherapist, UEBERTRAGEN, [
        GRUNDLAGE.erikaFrisch,
        [offen, abgerechnet],
      ]),
    ).rejects.toThrow(/appointments are not transferable/);

    const geblieben = await asPostgres<{ anzahl: string }>(
      'select count(*) as anzahl from public.appointments where treatment_basis_id = $1',
      [GRUNDLAGE.erikaAlt],
    );
    expect(Number(geblieben.rows[0]!.anzahl)).toBe(2);
  });

  it('uebertraegt keinen abgesagten Termin', async () => {
    const abgesagt = await termin({
      inStunden: 24,
      grundlage: GRUNDLAGE.erikaAlt,
      status: 'cancelled',
    });

    await expect(
      asUserCommitted(users.ownerTherapist, UEBERTRAGEN, [GRUNDLAGE.erikaFrisch, [abgesagt]]),
    ).rejects.toThrow(/appointments are not transferable/);
  });

  it('weist eine unbekannte Zielgrundlage ab', async () => {
    const ids = await termine(1, GRUNDLAGE.erikaAlt);
    await expect(
      asUser(users.ownerTherapist, UEBERTRAGEN, [
        '88888888-8888-4888-8888-0000000000ff',
        ids,
      ]),
    ).rejects.toThrow(/treatment basis not found/);
  });

  it('weist eine leere Auswahl ab', async () => {
    await expect(
      asUser(users.ownerTherapist, UEBERTRAGEN, [GRUNDLAGE.erikaFrisch, []]),
    ).rejects.toThrow(/non-empty array/);
  });

  it('laesst das Office uebertragen - Terminplanung ist seine Aufgabe', async () => {
    const ids = await termine(2, GRUNDLAGE.erikaAlt);

    const { rows } = await asUserCommitted<{ anzahl: number }>(users.office, UEBERTRAGEN, [
      GRUNDLAGE.erikaSelbstzahler,
      ids,
    ]);
    expect(Number(rows[0]!.anzahl)).toBe(2);
  });
});
