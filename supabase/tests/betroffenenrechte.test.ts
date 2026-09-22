import { beforeEach, describe, expect, it } from 'vitest';
import { AUSKUNFT_KATEGORIEN } from '@/features/datenschutz/kategorien';
import {
  FREMDE_ORGANISATION,
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

const { users, patients } = SEED;

const AUSKUNFT = 'select public.export_patient_record($1::uuid) as daten';
const AUFBEWAHRUNG = 'select public.patient_retention_status($1::uuid) as stand';

/**
 * Betroffenenrechte (OPS-006 minimal, ADR-007 Punkt 5).
 *
 * Zwei Zusicherungen tragen alles Weitere: Die Auskunft ist **vollstaendig**,
 * und sie ist **eng**. Vollstaendig heisst, dass sie gegen den
 * Aufbewahrungsplan geprueft wird und nicht gegen eine Liste im Test - eine
 * neue Tabelle der Klasse `patientenakte` macht diese Datei rot, bis jemand
 * entscheidet, ob sie in die Kopie gehoert. Eng heisst: nur `owner`, nur die
 * eigene Organisation, und jeder Aufruf hinterlaesst eine Spur.
 */

/**
 * Tabellen der Akte, die bewusst NICHT in der Kopie stehen.
 *
 * Jede Zeile ist eine Entscheidung mit Grund, kein Vergessen. Was hier fehlt
 * und im Aufbewahrungsplan steht, muss in der Auskunft auftauchen.
 */
const BEWUSST_AUSSEN = new Map<string, string>([
  [
    'patient_file_access_grants',
    'Technische Freigabe eines signierten Verweises, hoechstens 60 Sekunden gueltig; sie sagt etwas ueber das lesende Konto, nicht ueber die Patientin (ADR-017).',
  ],
]);

describe('export_patient_record', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('gibt owner eine Kopie mit Name, Terminen und Dokumentation', async () => {
    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.max],
    );

    const daten = rows[0]!.daten;
    expect(daten['rechtsgrundlage']).toBe('Art. 15 Abs. 3 DSGVO');
    expect(daten['patient_id']).toBe(patients.max);

    const tabellen = daten['tabellen'] as Record<string, unknown[]>;
    expect(tabellen['persons']).toHaveLength(1);
    expect(tabellen['persons']![0]).toMatchObject({
      given_name: 'Max',
      family_name: 'Mustermann',
    });
    expect(tabellen['patient_contact_details']![0]).toMatchObject({
      city: 'Tuebingen',
      date_of_birth: '1957-04-30',
    });
    // Zwei Termine im Seed, einer davon in der Praxis (CAL-001).
    expect(tabellen['appointments']).toHaveLength(2);
    expect(tabellen['appointment_notifications']).toHaveLength(1);
  });

  it('nennt die behandelnde Person mit Namen statt mit einer Kennung', async () => {
    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.max],
    );

    const tabellen = rows[0]!.daten['tabellen'] as Record<string, Record<string, unknown>[]>;
    expect(tabellen['patient_care_details']![0]!['primary_therapist']).toBe('Anna Beispiel');
    expect(tabellen['appointments']![0]!['staff_member']).toBe('Anna Beispiel');
  });

  it('enthaelt jede Tabelle der Akte aus dem Aufbewahrungsplan', async () => {
    const { rows: zugeordnet } = await asPostgres<{ table_name: string }>(
      `select distinct table_name from public.retention_assignments
       where class_key in ('patientenakte', 'personenstammdaten')
       order by table_name`,
    );

    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.max],
    );
    const tabellen = Object.keys(rows[0]!.daten['tabellen'] as Record<string, unknown>);

    const fehlend = zugeordnet
      .map((z) => z.table_name)
      .filter((name) => !tabellen.includes(name) && !BEWUSST_AUSSEN.has(name));

    expect(fehlend).toEqual([]);
  });

  it('enthaelt die patientenbezogenen Abrechnungsdaten', async () => {
    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.max],
    );
    const tabellen = Object.keys(rows[0]!.daten['tabellen'] as Record<string, unknown>);

    for (const name of [
      'billable_services',
      'invoice_cancellations',
      'invoice_items',
      'invoice_payment_reminders',
      'invoice_recipients',
      'invoices',
      'payments',
    ]) {
      expect(tabellen).toContain(name);
    }
  });

  it('gibt das Auditlog nicht heraus und sagt das in der Auskunft selbst (ANN-092)', async () => {
    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.max],
    );

    const tabellen = Object.keys(rows[0]!.daten['tabellen'] as Record<string, unknown>);
    expect(tabellen).not.toContain('audit_log');

    const hinweise = rows[0]!.daten['nicht_enthalten'] as { was: string; grund: string }[];
    expect(hinweise.map((h) => h.was)).toContain('Protokoll der Zugriffe auf die Akte');
    expect(hinweise.some((h) => h.grund.includes('ANN-092'))).toBe(true);
  });

  it('nennt das Trainingsverhaeltnis als eigene Auskunft, statt es mitzuliefern', async () => {
    // Erika hat beides zugleich (ADR-021 Punkt 1): Akte und Trainingsvertrag.
    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.erika],
    );

    const tabellen = Object.keys(rows[0]!.daten['tabellen'] as Record<string, unknown>);
    expect(tabellen).not.toContain('training_relationships');
    expect(tabellen).not.toContain('training_bases');

    const hinweise = rows[0]!.daten['nicht_enthalten'] as { was: string }[];
    expect(hinweise.map((h) => h.was)).toContain('Daten eines Trainingsverhaeltnisses');
  });

  it('hat fuer jeden Abschnitt eine deutsche Beschriftung und umgekehrt', async () => {
    const { rows } = await asUser<{ daten: Record<string, unknown> }>(
      users.ownerTherapist,
      AUSKUNFT,
      [patients.max],
    );
    const tabellen = Object.keys(rows[0]!.daten['tabellen'] as Record<string, unknown>).sort();

    expect(Object.keys(AUSKUNFT_KATEGORIEN).sort()).toEqual(tabellen);
  });

  it('protokolliert jede Auskunft als patient_record.exported, ohne Inhalte', async () => {
    await asUserCommitted(users.ownerTherapist, AUSKUNFT, [patients.max]);

    const { rows } = await asPostgres<{
      subject_id: string;
      actor_user_id: string;
      outcome: string;
      context: Record<string, unknown>;
    }>(
      `select subject_id::text as subject_id, actor_user_id::text as actor_user_id, outcome, context
       from public.audit_log where action = 'patient_record.exported'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      subject_id: patients.max,
      actor_user_id: users.ownerTherapist,
      outcome: 'success',
    });
    expect(JSON.stringify(rows[0]?.context)).not.toContain('Mustermann');
  });

  it('weist alle Rollen ausser owner ab', async () => {
    for (const userId of [users.therapist, users.office, users.teamLead, users.patientMax]) {
      await expect(asUser(userId, AUSKUNFT, [patients.max])).rejects.toThrow(
        /data subject access denied/,
      );
    }
  });

  it('weist nicht angemeldete Aufrufe ab, bevor die Funktion ueberhaupt laeuft', async () => {
    // `anon` hat kein Ausfuehrungsrecht - die Abweisung kommt vom Recht, nicht
    // vom Rumpf der Funktion. Die Pruefung im Rumpf bleibt trotzdem stehen:
    // ein spaeter erteiltes Recht darf die Tuer nicht oeffnen.
    await expect(asAnon(AUSKUNFT, [patients.max])).rejects.toThrow(/permission denied/);
  });

  it('weist eine Akte einer fremden Organisation mit derselben Meldung ab', async () => {
    const fremd = await fremdeOrganisation();

    await expect(asUser(users.ownerTherapist, AUSKUNFT, [fremd.patient])).rejects.toThrow(
      /data subject access denied/,
    );
    await expect(asUser(FREMDE_ORGANISATION.owner, AUSKUNFT, [patients.max])).rejects.toThrow(
      /data subject access denied/,
    );
  });

  it('weist eine unbekannte Kennung ab, ohne ihre Abwesenheit zu bestaetigen', async () => {
    await expect(
      asUser(users.ownerTherapist, AUSKUNFT, ['66666666-6666-4666-8666-0000000000ff']),
    ).rejects.toThrow(/data subject access denied/);
  });

  it('schreibt keinen Auditeintrag, wenn der Aufruf abgewiesen wird', async () => {
    await expect(asUser(users.therapist, AUSKUNFT, [patients.max])).rejects.toThrow();

    const { rows } = await asPostgres(
      `select id from public.audit_log where action = 'patient_record.exported'`,
    );
    expect(rows).toHaveLength(0);
  });
});

describe('patient_retention_status', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('meldet ohne Abschluss der Versorgung eine Frist, die noch nicht laeuft', async () => {
    const { rows } = await asUser<{ stand: Record<string, unknown> }>(
      users.ownerTherapist,
      AUFBEWAHRUNG,
      [patients.max],
    );

    const stand = rows[0]!.stand;
    expect(stand['versorgung_abgeschlossen_am']).toBeNull();

    const klassen = stand['klassen'] as Record<string, unknown>[];
    const akte = klassen.find((k) => k['key'] === 'patientenakte')!;
    expect(akte['legal_reference']).toBe('Par. 630f Abs. 3 BGB');
    expect(akte['anker_datum']).toBeNull();
    expect(akte['frist_ende']).toBeNull();
  });

  it('rechnet nach dem Abschluss zehn Jahre ab dem Ankerdatum', async () => {
    await asUserCommitted(
      users.ownerTherapist,
      'select public.conclude_patient_care($1::uuid, $2)',
      [patients.max, '2026-03-15'],
    );

    const { rows } = await asUser<{ stand: Record<string, unknown> }>(
      users.ownerTherapist,
      AUFBEWAHRUNG,
      [patients.max],
    );

    const klassen = rows[0]!.stand['klassen'] as Record<string, unknown>[];
    const akte = klassen.find((k) => k['key'] === 'patientenakte')!;
    expect(akte['anker_datum']).toBe('2026-03-15');
    expect(akte['frist_ende']).toBe('2036-03-15');
    // Geloescht werden darf erst am Tag danach, um Mitternacht der
    // Praxiszeitzone (app.retention_due_at, ADR-008 Punkt 2). Mitte Maerz gilt
    // in Europe/Berlin noch die Normalzeit, deshalb 23:00 UTC des Vortags.
    expect(new Date(String(akte['loeschbar_ab'])).toISOString()).toBe('2036-03-15T23:00:00.000Z');
  });

  it('nennt eine laufende Loeschsperre als eigenen Grund', async () => {
    await asUserCommitted(users.ownerTherapist, 'select public.place_legal_hold($1::uuid, $2)', [
      patients.max,
      'Honorarstreit, Az. 4 C 12/26',
    ]);

    const { rows } = await asUser<{ stand: Record<string, unknown> }>(
      users.ownerTherapist,
      AUFBEWAHRUNG,
      [patients.max],
    );

    expect(rows[0]!.stand['loeschsperre']).toMatchObject({
      grund: 'Honorarstreit, Az. 4 C 12/26',
    });
  });

  it('meldet ohne ausgestellte Rechnung keine steuerliche Frist', async () => {
    const { rows } = await asUser<{ stand: Record<string, unknown> }>(
      users.ownerTherapist,
      AUFBEWAHRUNG,
      [patients.max],
    );

    const klassen = rows[0]!.stand['klassen'] as Record<string, unknown>[];
    const abrechnung = klassen.find((k) => k['key'] === 'abrechnungsdaten')!;
    expect(abrechnung['legal_reference']).toBe('Par. 147 Abs. 3 AO');
    expect(abrechnung['anker_datum']).toBeNull();
    expect(abrechnung['datensaetze']).toBe(0);
  });

  it('weist alle Rollen ausser owner ab', async () => {
    for (const userId of [users.therapist, users.office, users.teamLead, users.patientMax]) {
      await expect(asUser(userId, AUFBEWAHRUNG, [patients.max])).rejects.toThrow(
        /data subject access denied/,
      );
    }
  });

  it('protokolliert nichts - der Aufruf gibt keine Inhalte heraus', async () => {
    await asUserCommitted(users.ownerTherapist, AUFBEWAHRUNG, [patients.max]);

    const { rows } = await asPostgres(
      `select id from public.audit_log where action = 'patient_record.exported'`,
    );
    expect(rows).toHaveLength(0);
  });
});
