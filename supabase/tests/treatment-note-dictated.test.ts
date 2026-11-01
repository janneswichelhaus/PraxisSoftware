import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
  tagInTagen,
} from './helpers/db';

// Das Merkmal „mit Diktat“ (ANN-825): Jeder Schreibweg am Text kann es setzen, keiner nimmt es
// zurück, gelesen wird es mit dem Eintrag. Wer nicht schreiben darf, setzt es auch nicht.
// Alle Inhalte sind erkennbar synthetisch (§3.1).

const { users, patients } = SEED;
const ANNA = '55555555-5555-4555-8555-000000000002';

const TERMIN_ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';
const ANLEGEN = 'select public.create_treatment_note($1::uuid, $2, $3) as id';
const AENDERN = 'select public.update_treatment_note($1::uuid, $2::timestamptz, $3, $4) as id';
const FESTSCHREIBEN =
  'select public.complete_treatment($1::uuid, $2, $3::timestamptz, $4::timestamptz, false, $5) as id';
const FINALISIEREN = 'select public.finalize_treatment_note($1::uuid, $2::timestamptz) as id';
const KORRIGIEREN =
  'select public.revise_treatment_note($1::uuid, $2::timestamptz, $3, $4, $5) as id';
const NACHTRAG = 'select public.create_treatment_note_addendum($1::uuid, $2, $3) as id';
const SYNC =
  'select public.sync_offline_treatment_note($1::uuid, $2::uuid, $3, $4::timestamptz, $5) as r';
const LESEN = 'select * from public.get_treatment_note($1::uuid)';
const AKTE = 'select * from public.list_patient_treatment_notes($1::uuid, 50)';

const TEXT = 'Synthetisch: Keine Schwellung. Mobilisation Knie rechts.';
const ROH = `to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"')`;

let laufend = 0;
async function termin(): Promise<string> {
  laufend += 1;
  const { rows } = await asUserCommitted<{ id: string }>(users.office, TERMIN_ANLEGEN, [
    patients.max,
    ANNA,
    'video',
    tagInTagen(60 + laufend),
    '09:00',
    '10:00',
    null,
  ]);
  return rows[0]!.id;
}

async function stand(tabelle: 'appointments' | 'treatment_notes', id: string): Promise<string> {
  const { rows } = await asPostgres<{ u: string }>(
    `select ${ROH} as u from public.${tabelle} where id = $1`,
    [id],
  );
  return rows[0]!.u;
}

async function zeile(id: string) {
  const { rows } = await asPostgres<{ dictated: boolean; status: string; updated_at: string }>(
    `select dictated, status, ${ROH} as updated_at from public.treatment_notes where id = $1`,
    [id],
  );
  return rows[0]!;
}

async function entwurf(diktiert: boolean): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(users.therapist, ANLEGEN, [
    await termin(),
    TEXT,
    diktiert,
  ]);
  return rows[0]!.id;
}

async function finalisiert(diktiert: boolean): Promise<string> {
  const id = await entwurf(diktiert);
  await asUserCommitted(users.therapist, FINALISIEREN, [id, await stand('treatment_notes', id)]);
  return id;
}

async function fehlercode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'kein Fehler';
  } catch (e) {
    return String((e as { code?: string }).code);
  }
}

beforeAll(async () => {
  await resetDatabaseOhneTermine();
  await fremdeOrganisation();
});

describe('Merkmal „mit Diktat“: Schreibwege', () => {
  it('steht ohne Angabe auf nein und wird beim Anlegen gesetzt', async () => {
    const ohne = await asUserCommitted<{ id: string }>(
      users.therapist,
      'select public.create_treatment_note($1::uuid, $2) as id',
      [await termin(), TEXT],
    );
    expect((await zeile(ohne.rows[0]!.id)).dictated).toBe(false);
    expect((await zeile(await entwurf(true))).dictated).toBe(true);
  });

  it('setzt es beim Ändern und nimmt es nie zurück', async () => {
    const id = await entwurf(false);
    await asUserCommitted(users.therapist, AENDERN, [
      id,
      await stand('treatment_notes', id),
      `${TEXT} Plan: Treppe.`,
      true,
    ]);
    expect((await zeile(id)).dictated).toBe(true);

    await asUserCommitted(users.therapist, AENDERN, [
      id,
      await stand('treatment_notes', id),
      `${TEXT} Getippt.`,
      false,
    ]);
    expect((await zeile(id)).dictated).toBe(true);
  });

  it('setzt es bei gleichem Text, ohne den Stand zu ändern', async () => {
    const id = await entwurf(false);
    const vorher = await stand('treatment_notes', id);
    await asUserCommitted(users.therapist, AENDERN, [id, vorher, TEXT, true]);
    const nachher = await zeile(id);
    expect(nachher.dictated).toBe(true);
    expect(nachher.updated_at).toBe(vorher);
  });

  it('trägt es beim Festschreiben in einem Schritt ein, neu und auf vorhandenem Entwurf', async () => {
    const neu = await termin();
    const a = await asUserCommitted<{ id: string }>(users.therapist, FESTSCHREIBEN, [
      neu,
      TEXT,
      await stand('appointments', neu),
      null,
      true,
    ]);
    expect(await zeile(a.rows[0]!.id)).toMatchObject({ dictated: true, status: 'final' });

    const id = await entwurf(false);
    const { rows } = await asPostgres<{ appointment_id: string }>(
      'select appointment_id from public.treatment_notes where id = $1',
      [id],
    );
    const t = rows[0]!.appointment_id;
    await asUserCommitted(users.therapist, FESTSCHREIBEN, [
      t,
      `${TEXT} Diktiert ergänzt.`,
      await stand('appointments', t),
      await stand('treatment_notes', id),
      true,
    ]);
    expect(await zeile(id)).toMatchObject({ dictated: true, status: 'final' });
  });

  it('setzt es mit einer Korrektur, nicht ohne', async () => {
    const ohne = await finalisiert(false);
    await asUserCommitted(users.therapist, KORRIGIEREN, [
      ohne,
      await stand('treatment_notes', ohne),
      `${TEXT} Korrigiert.`,
      'Synthetisch: Tippfehler',
      false,
    ]);
    expect((await zeile(ohne)).dictated).toBe(false);

    const mit = await finalisiert(false);
    await asUserCommitted(users.therapist, KORRIGIEREN, [
      mit,
      await stand('treatment_notes', mit),
      `${TEXT} Aus der Aufnahme.`,
      'Synthetisch: Ergänzt',
      true,
    ]);
    expect((await zeile(mit)).dictated).toBe(true);
  });

  it('kennzeichnet nur den Nachtrag, nicht den Eintrag darunter', async () => {
    const eltern = await finalisiert(false);
    const { rows } = await asUserCommitted<{ id: string }>(users.therapist, NACHTRAG, [
      eltern,
      'Synthetisch: Nachtrag aus der Aufnahme.',
      true,
    ]);
    expect((await zeile(rows[0]!.id)).dictated).toBe(true);
    expect((await zeile(eltern)).dictated).toBe(false);
  });

  it('übernimmt es aus einem Entwurf ohne Verbindung', async () => {
    const { rows } = await asUserCommitted<{ r: { note_id: string } }>(users.therapist, SYNC, [
      randomUUID(),
      await termin(),
      TEXT,
      '2026-10-12T08:15:00Z',
      true,
    ]);
    expect((await zeile(rows[0]!.r.note_id)).dictated).toBe(true);
  });
});

describe('Merkmal „mit Diktat“: Lesen und Rechte', () => {
  it('liefert es am Termin und in der Akte', async () => {
    const id = await entwurf(true);
    const { rows: amTermin } = await asPostgres<{ appointment_id: string }>(
      'select appointment_id from public.treatment_notes where id = $1',
      [id],
    );
    const gelesen = await asUser<{ id: string; dictated: boolean }>(users.therapist, LESEN, [
      amTermin[0]!.appointment_id,
    ]);
    expect(gelesen.rows.find((r) => r.id === id)?.dictated).toBe(true);

    const akte = await asUser<{ notes: { id: string; dictated: boolean }[] }>(users.office, AKTE, [
      patients.max,
    ]);
    const eintraege = akte.rows.flatMap((r) => r.notes);
    expect(eintraege.find((n) => n.id === id)?.dictated).toBe(true);
    expect(eintraege.every((n) => typeof n.dictated === 'boolean')).toBe(true);
  });

  it('steht in der Auskunft nach Art. 15', async () => {
    const id = await entwurf(true);
    const { rows } = await asUser<{
      daten: { tabellen: { treatment_notes: Record<string, unknown>[] } };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
      patients.max,
    ]);
    const eintraege = rows[0]!.daten.tabellen.treatment_notes;
    expect(eintraege.find((n) => n['id'] === id)?.['dictated']).toBe(true);
    expect(eintraege.every((n) => typeof n['dictated'] === 'boolean')).toBe(true);
  });

  it('lässt es von keiner Rolle ohne Schreibrecht und keinem Plattformkonto setzen', async () => {
    const t = await termin();
    for (const konto of [users.office, users.trainer, users.patientMax, users.plattformErika]) {
      expect(await fehlercode(asUser(konto, ANLEGEN, [t, TEXT, true])), konto).toBe('42501');
    }
    const id = await entwurf(false);
    const vorher = await stand('treatment_notes', id);
    expect(await fehlercode(asUser(users.office, AENDERN, [id, vorher, TEXT, true]))).toBe('42501');
    expect((await zeile(id)).dictated).toBe(false);
  });

  it('setzt es an keinem Eintrag einer anderen Organisation', async () => {
    const fremd = await fremdeOrganisation();
    const id = await entwurf(false);
    const vorher = await stand('treatment_notes', id);
    expect(await fehlercode(asUser(fremd.owner, AENDERN, [id, vorher, TEXT, true]))).not.toBe(
      'kein Fehler',
    );
    expect((await zeile(id)).dictated).toBe(false);
  });

  it('ist ohne Anmeldung nicht aufrufbar', async () => {
    const { rows } = await asPostgres<{ darf: boolean }>(
      `select has_function_privilege('anon', 'public.create_treatment_note(uuid, text, boolean)', 'execute')
          or has_function_privilege('anon', 'public.update_treatment_note(uuid, timestamptz, text, boolean)', 'execute')
          or has_function_privilege('anon', 'public.complete_treatment(uuid, text, timestamptz, timestamptz, boolean, boolean)', 'execute')
          or has_function_privilege('anon', 'public.revise_treatment_note(uuid, timestamptz, text, text, boolean)', 'execute')
          or has_function_privilege('anon', 'public.create_treatment_note_addendum(uuid, text, boolean)', 'execute')
          or has_function_privilege('anon', 'public.sync_offline_treatment_note(uuid, uuid, text, timestamptz, boolean)', 'execute')
          or has_function_privilege('anon', 'public.get_treatment_note(uuid)', 'execute') as darf`,
    );
    expect(rows[0]!.darf).toBe(false);
  });
});
