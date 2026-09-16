import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

/**
 * Die drei Hausbesuch-Szenarien (CAL-018, ADR-018 Fassung 3 Punkt 9).
 *
 * Hier steht wieder eine Geldfrage, und deshalb steht sie serverseitig: Ob am
 * Nichtantreffen eine Ausfallgebuehr entsteht, entscheidet die Datenbank aus
 * der Bestaetigung des Protokolls - nicht die Oberflaeche, die danach fragt.
 *
 * Die Faelle, auf die es ankommt, und warum sie hier stehen:
 *
 *   * **Ohne Bestaetigung passiert nichts.** Der Termin bleibt `confirmed`.
 *     Eine Zeile, die den Vermerk trotzdem durchliesse, erzeugte ein
 *     Nichtantreffen ohne die Grundlage, aus der die Forderung stammt.
 *   * **Mit Bestaetigung entsteht die Gebuehr immer** - keine zweite
 *     Entscheidung, keine Vorbelegung, kein Weg daran vorbei (E14).
 *   * **Das Protokoll ist ein Hausbesuchsprotokoll** (ANN-055). An der
 *     Praxistuer gibt es nichts zu klingeln; dort bleibt der Vermerk, was er
 *     seit CAL-014c ist.
 *   * **Der Pflichtvermerk aus Szenario 1** ist ein Merkmal am Eintrag und
 *     nicht ein Satz im Freitext - sonst waere „Tuer geoeffnet, keine
 *     Behandlung" aus 20.000 Zeichen herauszulesen.
 */

const { organizationId, users, patients } = SEED;

const NICHT_ANGETROFFEN =
  'select public.record_no_show($1::uuid, $2::timestamptz, $3::boolean) as id';
const OHNE_PROTOKOLL = 'select public.record_no_show($1::uuid, $2::timestamptz) as id';
const OEFFNEN = 'select public.reopen_appointment($1::uuid, $2::timestamptz) as id';
const ABSCHLIESSEN =
  'select public.complete_treatment($1::uuid, $2, $3::timestamptz, $4::timestamptz, $5::boolean) as id';

/**
 * Tim Teamleitung - im Seed ohne eigene Termine.
 *
 * Die Termine hier liegen relativ zu `now()`; bei Anna fielen sie je nach
 * Tageszeit mit den drei Seed-Terminen zusammen und scheiterten an der
 * Ueberschneidungssperre, ohne dass es mit dem Protokoll zu tun haette.
 */
const TIM = '55555555-5555-4555-8555-000000000004';

interface Termin {
  id: string;
  updated_at: string;
}

async function stand(id: string): Promise<Termin> {
  const { rows } = await asPostgres<Termin>(
    `select id,
            to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as updated_at
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
  return rows[0]!;
}

/**
 * Legt einen bestaetigten Termin der angegebenen Art an, zwei Stunden in der
 * Vergangenheit.
 *
 * Bewusst als direkter INSERT und nicht ueber `create_appointment`: Geprueft
 * wird das Protokoll, nicht die Anlage. Anschrift und Standort stehen dabei,
 * weil die Constraint je Art genau eines von beiden verlangt.
 */
const STANDORT = '33333333-3333-4333-8333-000000000001';

async function terminAm(art: 'home_visit' | 'practice' | 'video'): Promise<Termin> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, appointment_type, status,
       starts_at, ends_at, location_id,
       visit_street, visit_house_number, visit_postal_code, visit_city
     )
     values ($1::uuid, $2::uuid, $3::uuid, $4, 'confirmed',
             now() - interval '2 hours', now() - interval '1 hour',
             case when $4 = 'practice' then $5::uuid end,
             case when $4 = 'home_visit' then 'Teststrasse' end,
             case when $4 = 'home_visit' then '2'           end,
             case when $4 = 'home_visit' then '72070'       end,
             case when $4 = 'home_visit' then 'Tuebingen'   end)
     returning id::text as id`,
    [organizationId, patients.max, TIM, art, STANDORT],
  );
  return stand(rows[0]!.id);
}

describe('Nichtantreffen am Hausbesuch: das Protokoll ist Pflicht', () => {
  beforeEach(resetDatabase);

  it('setzt den Gebuehrenanlass, sobald das Protokoll bestaetigt ist', async () => {
    const termin = await terminAm('home_visit');

    await asUserCommitted(users.ownerTherapist, NICHT_ANGETROFFEN, [
      termin.id,
      termin.updated_at,
      true,
    ]);

    const nachher = await zeile(termin.id);
    expect(nachher.status).toBe('no_show');
    expect(nachher.fee_basis).toBe('no_show');
    expect(nachher.no_show_protocol_confirmed).toBe(true);
    expect(nachher.no_show_recorded_at).not.toBeNull();
  });

  it('weist den Vermerk ohne bestaetigtes Protokoll ab und laesst den Termin bestaetigt', async () => {
    const termin = await terminAm('home_visit');

    await expect(
      asUserCommitted(users.ownerTherapist, NICHT_ANGETROFFEN, [
        termin.id,
        termin.updated_at,
        false,
      ]),
    ).rejects.toThrow(/protocol must be confirmed/i);

    const nachher = await zeile(termin.id);
    expect(nachher.status).toBe('confirmed');
    expect(nachher.fee_basis).toBeNull();
    expect(nachher.no_show_protocol_confirmed).toBeNull();
  });

  it('weist auch den Aufruf ohne Protokollangabe ab - die Vorbelegung ist "nicht bestaetigt"', async () => {
    const termin = await terminAm('home_visit');

    await expect(
      asUserCommitted(users.ownerTherapist, OHNE_PROTOKOLL, [termin.id, termin.updated_at]),
    ).rejects.toThrow(/protocol must be confirmed/i);

    expect((await zeile(termin.id)).status).toBe('confirmed');
  });

  it('schreibt die Bestaetigung und den Anlass in den Auditeintrag, ohne klinischen Inhalt', async () => {
    const termin = await terminAm('home_visit');

    await asUserCommitted(users.ownerTherapist, NICHT_ANGETROFFEN, [
      termin.id,
      termin.updated_at,
      true,
    ]);

    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log
        where action = 'appointment.no_show' and subject_id = $1`,
      [termin.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.context.protocol_confirmed).toBe(true);
    expect(rows[0]!.context.fee_basis).toBe('no_show');
    expect(Object.keys(rows[0]!.context).sort()).toEqual([
      'fee_basis',
      'patient_id',
      'protocol_confirmed',
      'staff_member_id',
      'surface',
    ]);
  });

  it('raeumt Anlass und Bestaetigung beim Wiederoeffnen ab', async () => {
    const termin = await terminAm('home_visit');
    await asUserCommitted(users.ownerTherapist, NICHT_ANGETROFFEN, [
      termin.id,
      termin.updated_at,
      true,
    ]);

    const vermerkt = await stand(termin.id);
    await asUserCommitted(users.ownerTherapist, OEFFNEN, [vermerkt.id, vermerkt.updated_at]);

    const nachher = await zeile(termin.id);
    expect(nachher.status).toBe('confirmed');
    expect(nachher.fee_basis).toBeNull();
    expect(nachher.no_show_protocol_confirmed).toBeNull();
  });

  it('haelt ein bestaetigtes Protokoll ohne Gebuehrenanlass auch an der Tabelle auf', async () => {
    // Defense-in-Depth (ADR-004): Der Riegel gilt auch fuer einen spaeteren
    // Schreibweg, der die Regel aus E14 vergisst.
    const termin = await terminAm('home_visit');
    await asUserCommitted(users.ownerTherapist, NICHT_ANGETROFFEN, [
      termin.id,
      termin.updated_at,
      true,
    ]);

    await expect(
      asPostgres('update public.appointments set fee_basis = null where id = $1', [termin.id]),
    ).rejects.toThrow(/appointments_confirmed_protocol_means_fee/);
  });
});

describe('Nichtantreffen ausserhalb des Hausbesuchs: Vermerk ohne Gebuehr (ANN-055)', () => {
  beforeEach(resetDatabase);

  it('vermerkt einen Praxistermin ohne Protokoll und ohne Gebuehrenanlass', async () => {
    const termin = await terminAm('practice');

    await asUserCommitted(users.ownerTherapist, NICHT_ANGETROFFEN, [
      termin.id,
      termin.updated_at,
      false,
    ]);

    const nachher = await zeile(termin.id);
    expect(nachher.status).toBe('no_show');
    expect(nachher.fee_basis).toBeNull();
    expect(nachher.no_show_protocol_confirmed).toBe(false);
  });

  it('weist ein bestaetigtes Protokoll am Praxistermin ab', async () => {
    const termin = await terminAm('practice');

    await expect(
      asUserCommitted(users.ownerTherapist, NICHT_ANGETROFFEN, [
        termin.id,
        termin.updated_at,
        true,
      ]),
    ).rejects.toThrow(/home visits only/i);

    expect((await zeile(termin.id)).status).toBe('confirmed');
  });

  it('weist ein bestaetigtes Protokoll am Videotermin ab', async () => {
    const termin = await terminAm('video');

    await expect(
      asUserCommitted(users.ownerTherapist, NICHT_ANGETROFFEN, [
        termin.id,
        termin.updated_at,
        true,
      ]),
    ).rejects.toThrow(/home visits only/i);
  });
});

describe('Tuer geoeffnet, keine Behandlung: der Pflichtvermerk (Szenario 1)', () => {
  beforeEach(resetDatabase);

  it('schliesst den Termin ab, dokumentiert ihn und setzt den Vermerk - ohne Gebuehr', async () => {
    const termin = await terminAm('home_visit');

    await asUserCommitted(users.ownerTherapist, ABSCHLIESSEN, [
      termin.id,
      'Tuer geoeffnet, Behandlung auf Wunsch nicht durchgefuehrt.',
      termin.updated_at,
      null,
      true,
    ]);

    const nachher = await zeile(termin.id);
    // Der Termin gilt als durchgefuehrt und ist dokumentiert - genau wie eine
    // stattgefundene Behandlung (ADR-018 Fassung 3 Punkt 9 Nr. 2).
    expect(nachher.status).toBe('documented');
    // Keine Ausfallgebuehr: abgerechnet wird der regulaere Weg.
    expect(nachher.fee_basis).toBeNull();

    const { rows } = await asPostgres<{ visit_without_treatment: boolean; status: string }>(
      'select visit_without_treatment, status from public.treatment_notes where appointment_id = $1',
      [termin.id],
    );
    expect(rows[0]!.visit_without_treatment).toBe(true);
    expect(rows[0]!.status).toBe('final');
  });

  it('laesst den Vermerk weg, wenn niemand ihn setzt', async () => {
    const termin = await terminAm('home_visit');

    await asUserCommitted(users.ownerTherapist, ABSCHLIESSEN, [
      termin.id,
      'Behandlung nach Plan durchgefuehrt.',
      termin.updated_at,
      null,
      false,
    ]);

    const { rows } = await asPostgres<{ visit_without_treatment: boolean }>(
      'select visit_without_treatment from public.treatment_notes where appointment_id = $1',
      [termin.id],
    );
    expect(rows[0]!.visit_without_treatment).toBe(false);
  });

  it('weist den Vermerk an einem Praxistermin ab (ANN-055)', async () => {
    const termin = await terminAm('practice');

    await expect(
      asUserCommitted(users.ownerTherapist, ABSCHLIESSEN, [
        termin.id,
        'Tuer geoeffnet, Behandlung nicht durchgefuehrt.',
        termin.updated_at,
        null,
        true,
      ]),
    ).rejects.toThrow(/home visits only/i);

    const nachher = await zeile(termin.id);
    expect(nachher.status).toBe('confirmed');
    expect(
      (
        await asPostgres('select 1 from public.treatment_notes where appointment_id = $1', [
          termin.id,
        ])
      ).rows,
    ).toHaveLength(0);
  });

  it('liefert den Vermerk im Lesepfad mit', async () => {
    const termin = await terminAm('home_visit');
    await asUserCommitted(users.ownerTherapist, ABSCHLIESSEN, [
      termin.id,
      'Tuer geoeffnet, Behandlung auf Wunsch nicht durchgefuehrt.',
      termin.updated_at,
      null,
      true,
    ]);

    const { rows } = await asUser<{ visit_without_treatment: boolean }>(
      users.ownerTherapist,
      'select visit_without_treatment from public.get_treatment_note($1::uuid)',
      [termin.id],
    );
    expect(rows[0]!.visit_without_treatment).toBe(true);
  });

  it('haelt die Terminsicht bei der Protokollbestaetigung lesbar', async () => {
    const termin = await terminAm('home_visit');
    await asUserCommitted(users.ownerTherapist, NICHT_ANGETROFFEN, [
      termin.id,
      termin.updated_at,
      true,
    ]);

    const { rows } = await asUser<{ no_show_protocol_confirmed: boolean; fee_basis: string }>(
      users.office,
      'select no_show_protocol_confirmed, fee_basis from public.appointment_directory where id = $1',
      [termin.id],
    );
    expect(rows[0]!.no_show_protocol_confirmed).toBe(true);
    expect(rows[0]!.fee_basis).toBe('no_show');
  });
});
