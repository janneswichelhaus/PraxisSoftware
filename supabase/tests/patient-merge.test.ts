import { beforeAll, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import {
  erwarteAbgewiesenenLeseversuch,
  erwarteAbgewiesenenSchreibversuch,
} from './helpers/abgewiesen';

/**
 * Zwei Akten derselben Person werden eine (PRX-017, PRX-EPIC-003b).
 *
 * Geprüft wird, was die Roadmap verlangt: nur `owner`, nie automatisch; alles
 * wandert, der Bezug wechselt und der Inhalt nicht (finalisierte
 * Dokumentation, ausgestellte Rechnungen); die leere Akte fällt mit Nachweis.
 * Dazu die Regeln aus ANN-147 bis ANN-150.
 */
const { organizationId: ORG, users, patients } = SEED;
const ANNA_STAFF = '55555555-5555-4555-8555-000000000002';
const LEISTUNG = 'cccccccc-cccc-4ccc-8ccc-000000000001';

const VORSCHAU = 'select public.preview_patient_merge($1::uuid, $2::uuid) as plan';
const ZUSAMMENFUEHREN = 'select public.merge_patients($1::uuid, $2::uuid) as ergebnis';

interface Akte {
  vorname: string;
  nachname: string;
  /** B1 (ANN-510): Es gibt nur noch 'active'. */
  status?: 'active';
  geburt?: string | null;
  telefon?: string | null;
  email?: string | null;
  strasse?: string | null;
  besonderheit?: string | null;
  mitnehmen?: string[];
  liege?: boolean | null;
}

/** Legt eine synthetische Akte mit Kontakt- und Versorgungsangaben an. */
async function legeAkteAn(akte: Akte): Promise<{ patient: string; person: string }> {
  const { rows } = await asPostgres<{ patient: string; person: string }>(
    `with person as (
       insert into public.persons (organization_id, given_name, family_name)
       values ($1, $2, $3) returning id
     ),
     patient as (
       insert into public.patients (organization_id, person_id, status, care_started_on)
       select $1, id, $4, current_date - 30 from person returning id, person_id
     ),
     kontakt as (
       insert into public.patient_contact_details
         (patient_id, organization_id, date_of_birth, phone, email, street, house_number,
          postal_code, city)
       select id, $1, $5::date, $6, $7, $8,
              case when $8::text is null then null else '1' end,
              case when $8::text is null then null else '50667' end,
              case when $8::text is null then null else 'Köln' end
       from patient returning patient_id
     ),
     versorgung as (
       insert into public.patient_care_details
         (patient_id, organization_id, special_note, take_along_items, treatment_table_required)
       select id, $1, $9, $10::text[], $11 from patient returning patient_id
     )
     select p.id as patient, p.person_id as person
     from patient p, kontakt, versorgung`,
    [
      ORG,
      akte.vorname,
      akte.nachname,
      akte.status ?? 'active',
      akte.geburt ?? null,
      akte.telefon ?? null,
      akte.email ?? null,
      akte.strasse ?? null,
      akte.besonderheit ?? null,
      akte.mitnehmen ?? [],
      akte.liege ?? null,
    ],
  );
  return rows[0]!;
}

interface Bestand {
  termin: string;
  eintrag: string;
  grundlage: string;
  leistung: string;
  rechnung: string;
  entwurf: string;
  empfaenger: string;
  datei: string;
  vermerk: string;
  fragebogen: string;
  ereignis: string;
  bericht: string;
  aufgabe: string;
  warteliste: string;
  sperre: string;
}

/**
 * Füllt eine Akte mit je einer Zeile jeder Tabelle, die an der Akte hängt —
 * unveränderliche Stände eingeschlossen: finalisierter Eintrag mit Version,
 * ausgestellte Rechnung, abgeschlossener Bericht und Fragebogen.
 */
let naechsterTermin = 0;

/**
 * Beginn des Termins einer Füllung: `tage` Tage zurück, immer um 20:00 UTC
 * (BEF-122). Bis dahin lag er auf der Uhrzeit des Laufs - und die Seed-Termine
 * von Anna (samstags 07:00-08:00 UTC) kollidierten mit ihm, wenn der Test
 * zwischen etwa 06:15 und 08:00 UTC lief. Um 20 Uhr liegt kein Seed-Termin.
 */
function terminBeginn(tage: number): string {
  const tag = new Date();
  tag.setUTCHours(20, 0, 0, 0);
  tag.setUTCDate(tag.getUTCDate() - tage);
  return tag.toISOString();
}

async function fuelle(patient: string): Promise<Bestand> {
  // Jede Füllung bekommt ihren eigenen Tag: Anna darf keine zwei Termine
  // gleichzeitig haben.
  naechsterTermin += 1;
  const tage = 100 + naechsterTermin;
  const q = async (sql: string, params: unknown[] = []) =>
    (await asPostgres<{ id: string }>(sql, params)).rows[0]!.id;

  const grundlage = await q(
    `insert into public.treatment_bases
       (organization_id, patient_id, treatment_basis_kind, issued_on, appointment_count)
     values ($1, $2, 'self_pay', current_date - 20, 6) returning id`,
    [ORG, patient],
  );
  const termin = await q(
    `insert into public.appointments
       (organization_id, patient_id, staff_member_id, appointment_type, starts_at, ends_at,
        visit_street, visit_house_number, visit_postal_code, visit_city,
        visit_lat, visit_lon, visit_geocode_precision,
        treatment_basis_id, status, completed_at, completed_by)
     values ($1, $2, $3, 'home_visit', $6::timestamptz,
             $6::timestamptz + interval '45 minutes',
             'Altstraße', '7', '50667', 'Köln', 50.94, 6.95, 'address',
             $4, 'completed', $6::timestamptz, $5)
     returning id`,
    [ORG, patient, ANNA_STAFF, grundlage, users.therapist, terminBeginn(tage)],
  );
  const eintrag = await q(
    `insert into public.treatment_notes
       (organization_id, appointment_id, status, content, created_by, updated_by,
        finalized_at, finalized_by, finalisation_kind)
     values ($1, $2, 'final', 'Synthetischer Eintrag', $3, $3, now(), $3, 'manual')
     returning id`,
    [ORG, termin, users.therapist],
  );
  await asPostgres(
    `insert into public.treatment_note_versions
       (organization_id, note_id, version_no, content, author_id)
     values ($1, $2, 1, 'Synthetischer Eintrag', $3)`,
    [ORG, eintrag, users.therapist],
  );
  const leistung = await q(
    `insert into public.billable_services
       (organization_id, patient_id, appointment_id, catalog_item_id, performed_on, created_by)
     values ($1, $2, $3, $4, current_date - 10, $5) returning id`,
    [ORG, patient, termin, LEISTUNG, users.office],
  );
  const empfaenger = await q(
    `insert into public.invoice_recipients
       (organization_id, patient_id, recipient_kind, name, is_default)
     values ($1, $2, 'other', 'Empfänger der Dublette', true) returning id`,
    [ORG, patient],
  );
  const rechnung = await q(
    `insert into public.invoices (
       organization_id, patient_id, service_area, status, period_month,
       invoice_number, issued_on, issued_at, due_on, total_cents, tax_total_cents, currency,
       snapshot
     ) values (
       $1, $2, 'therapy', 'issued', date_trunc('month', current_date - 400)::date,
       'RG-MERGE-' || left(gen_random_uuid()::text, 6), current_date - 400, now(),
       current_date - 386, 4500, 0, 'EUR',
       jsonb_build_object('schema_version', 3, 'patient', jsonb_build_object('name', 'Stand damals'))
     ) returning id`,
    [ORG, patient],
  );
  const entwurf = await q(
    `insert into public.invoices (organization_id, patient_id, period_month, service_area)
     values ($1, $2, date_trunc('month', current_date - 60)::date, 'therapy') returning id`,
    [ORG, patient],
  );
  const datei = await q(
    `insert into public.patient_files
       (organization_id, patient_id, document_type, display_name, mime_type, byte_size,
        checksum_sha256, object_key, status, confirmed_at)
     values ($1, $2, 'befund', 'Befund', 'application/pdf', 1024, repeat('a', 64), 'x',
             'ready', now())
     returning id`,
    [ORG, patient],
  );
  const vermerk = await q(
    `insert into public.patient_privacy_records
       (organization_id, patient_id, record_kind, purpose, occurred_on)
     values ($1, $2, 'consent_granted', 'email_contact', current_date - 20) returning id`,
    [ORG, patient],
  );
  const fragebogen = await q(
    `insert into public.patient_questionnaire_responses
       (organization_id, patient_id, instrument_id, definition_version, recorded_on, status,
        completed_at)
     values ($1, $2, 'anamnese_v8', '1.0.0', current_date - 20, 'abgeschlossen', now())
     returning id`,
    [ORG, patient],
  );
  const ereignis = await q(
    `insert into public.patient_course_events (organization_id, patient_id, occurred_on, kind)
     values ($1, $2, current_date - 15, 'operation') returning id`,
    [ORG, patient],
  );
  const bericht = await q(
    `insert into public.therapy_reports
       (organization_id, patient_id, treatment_basis_id, status, report_text, snapshot,
        completed_at, completed_by)
     values ($1, $2, $3, 'abgeschlossen', 'Synthetischer Bericht',
             jsonb_build_object('stand', 'eingefroren'), now(), $4)
     returning id`,
    [ORG, patient, grundlage, users.therapist],
  );
  const aufgabe = await q(
    `insert into public.tasks (organization_id, patient_id, title)
     values ($1, $2, 'Rückruf') returning id`,
    [ORG, patient],
  );
  const warteliste = await q(
    `insert into public.waitlist_entries
       (organization_id, patient_id, appointment_type, priority_reason, treatment_basis_id)
     values ($1, $2, 'home_visit', 'patient_wish', $3) returning id`,
    [ORG, patient, grundlage],
  );
  const sperre = await q(
    `insert into public.legal_holds (organization_id, subject_type, subject_id, reason, placed_by)
     values ($1, 'patient', $2, 'Synthetische Anfrage', $3) returning id`,
    [ORG, patient, users.ownerTherapist],
  );

  return {
    termin,
    eintrag,
    grundlage,
    leistung,
    rechnung,
    entwurf,
    empfaenger,
    datei,
    vermerk,
    fragebogen,
    ereignis,
    bericht,
    aufgabe,
    warteliste,
    sperre,
  };
}

/** Ganze Zeile als JSON, ohne die Kennung der Akte. */
async function zeile(tabelle: string, id: string): Promise<Record<string, unknown>> {
  const { rows } = await asPostgres<{ z: Record<string, unknown> }>(
    `select to_jsonb(t) - 'patient_id' as z from public.${tabelle} t where t.id = $1`,
    [id],
  );
  return rows[0]!.z;
}

async function patientVon(tabelle: string, id: string): Promise<string> {
  const { rows } = await asPostgres<{ patient_id: string }>(
    `select patient_id from public.${tabelle} where id = $1`,
    [id],
  );
  return rows[0]!.patient_id;
}

async function zusammenfuehren(quelle: string, ziel: string) {
  const { rows } = await asUserCommitted<{ ergebnis: Record<string, unknown> }>(
    users.ownerTherapist,
    ZUSAMMENFUEHREN,
    [quelle, ziel],
  );
  return rows[0]!.ergebnis;
}

describe('Dubletten zusammenführen (PRX-017)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  describe('Vorschau', () => {
    it('zeigt Kopfdaten, Zähler, Konflikte und angehängte Freitexte', async () => {
      const ziel = await legeAkteAn({
        vorname: 'Vera',
        nachname: 'Vorschau',
        geburt: '1970-01-01',
        telefon: '0221 111',
        besonderheit: 'Hund im Flur',
      });
      const quelle = await legeAkteAn({
        vorname: 'Vera',
        nachname: 'Vorschau',
        geburt: '1970-01-02',
        telefon: '0221 111',
        email: 'vera@example.invalid',
        besonderheit: 'Zweiter Stock',
      });
      await fuelle(quelle.patient);

      const { rows } = await asUser<{ plan: Record<string, unknown> }>(
        users.ownerTherapist,
        VORSCHAU,
        [quelle.patient, ziel.patient],
      );
      const plan = rows[0]!.plan as {
        source: { id: string; given_name: string };
        target: { id: string };
        counts: Record<string, number>;
        conflicts: string[];
        appended: string[];
        blockers: string[];
      };
      expect(plan.source.id).toBe(quelle.patient);
      expect(plan.target.id).toBe(ziel.patient);
      expect(plan.counts).toMatchObject({
        appointments: 1,
        treatment_notes: 1,
        treatment_bases: 1,
        billable_services: 1,
        invoices: 2,
        invoices_issued: 1,
        invoice_recipients: 1,
        patient_files: 1,
        privacy_records: 1,
        questionnaire_responses: 1,
        course_events: 1,
        therapy_reports: 1,
        tasks: 1,
        waitlist_entries: 1,
        legal_holds: 1,
      });
      // Gleiches Telefon ist kein Konflikt, eine leere E-Mail wird gefüllt.
      expect(plan.conflicts).toEqual(['date_of_birth']);
      expect(plan.appended).toEqual(['special_note']);
      expect(plan.blockers).toEqual([]);
    });

    it('ändert nichts', async () => {
      const ziel = await legeAkteAn({ vorname: 'Nina', nachname: 'Nurschau' });
      const quelle = await legeAkteAn({ vorname: 'Nina', nachname: 'Nurschau' });
      const b = await fuelle(quelle.patient);
      await asUserCommitted(users.ownerTherapist, VORSCHAU, [quelle.patient, ziel.patient]);
      expect(await patientVon('appointments', b.termin)).toBe(quelle.patient);
    });

    it('lehnt dieselbe Akte zweimal ab', async () => {
      await expect(
        asUser(users.ownerTherapist, VORSCHAU, [patients.petra, patients.petra]),
      ).rejects.toThrow(/itself/);
    });
  });

  describe('Rollen und Praxis', () => {
    it.each([
      ['therapist', users.therapist],
      ['office', users.office],
      ['team_lead', users.teamLead],
      ['Patientenkonto', users.patientMax],
    ])('%s wird bestätigt abgewiesen, und nichts wandert', async (_rolle, konto) => {
      const ziel = await legeAkteAn({ vorname: 'Rita', nachname: 'Rolle' });
      const quelle = await legeAkteAn({ vorname: 'Rita', nachname: 'Rolle' });
      const b = await fuelle(quelle.patient);

      await erwarteAbgewiesenenSchreibversuch(
        konto,
        ZUSAMMENFUEHREN,
        [quelle.patient, ziel.patient],
        'patient.merged',
      );
      await erwarteAbgewiesenenSchreibversuch(
        konto,
        VORSCHAU,
        [quelle.patient, ziel.patient],
        'patient.merged',
      );
      expect(await patientVon('appointments', b.termin)).toBe(quelle.patient);
      const { rows } = await asPostgres('select 1 from public.patients where id = $1', [
        quelle.patient,
      ]);
      expect(rows).toHaveLength(1);
    });

    it('ist für anon nicht ausführbar', async () => {
      await expect(asAnon(ZUSAMMENFUEHREN, [patients.petra, patients.erika])).rejects.toThrow(
        /permission denied/i,
      );
      await expect(asAnon(VORSCHAU, [patients.petra, patients.erika])).rejects.toThrow(
        /permission denied/i,
      );
    });

    it('findet keine Akte einer fremden Praxis', async () => {
      const fremd = await fremdeOrganisation();
      await expect(
        asUser(users.ownerTherapist, ZUSAMMENFUEHREN, [fremd.patient, patients.petra]),
      ).rejects.toThrow(/patient not found/);
      await expect(asUser(fremd.owner, VORSCHAU, [patients.petra, patients.erika])).rejects.toThrow(
        /patient not found/,
      );
    });
  });

  describe('Zusammenführen', () => {
    let ziel: { patient: string; person: string };
    let quelle: { patient: string; person: string };
    let b: Bestand;
    let vorher: Record<string, Record<string, unknown>>;
    let ergebnis: Record<string, unknown>;

    const TABELLEN: [string, keyof Bestand][] = [
      ['appointments', 'termin'],
      ['treatment_bases', 'grundlage'],
      ['billable_services', 'leistung'],
      ['invoices', 'rechnung'],
      ['invoices', 'entwurf'],
      ['invoice_recipients', 'empfaenger'],
      ['patient_files', 'datei'],
      ['patient_privacy_records', 'vermerk'],
      ['patient_questionnaire_responses', 'fragebogen'],
      ['patient_course_events', 'ereignis'],
      ['therapy_reports', 'bericht'],
      ['tasks', 'aufgabe'],
      ['waitlist_entries', 'warteliste'],
    ];

    beforeAll(async () => {
      ziel = await legeAkteAn({
        vorname: 'Petra',
        nachname: 'Zusammen',
        geburt: '1971-12-05',
        telefon: '0221 222',
        besonderheit: 'Klingel defekt',
        mitnehmen: ['Theraband'],
        liege: null,
      });
      quelle = await legeAkteAn({
        vorname: 'Petra',
        nachname: 'Zusammen',
        geburt: '1971-12-06',
        telefon: '0221 999',
        email: 'petra@example.invalid',
        strasse: 'Neue Straße',
        besonderheit: 'Aufzug im Hinterhaus',
        mitnehmen: ['theraband', 'Faszienrolle'],
        liege: true,
      });
      // Die bleibende Akte hat schon einen Standardempfänger.
      await asPostgres(
        `insert into public.invoice_recipients
           (organization_id, patient_id, recipient_kind, name, is_default)
         values ($1, $2, 'other', 'Empfänger der bleibenden Akte', true)`,
        [ORG, ziel.patient],
      );
      b = await fuelle(quelle.patient);

      vorher = {};
      for (const [tabelle, schluessel] of TABELLEN) {
        vorher[schluessel] = await zeile(tabelle, b[schluessel]);
      }
      vorher.eintrag = (
        await asPostgres<{ z: Record<string, unknown> }>(
          `select jsonb_build_object(
             'note', (select to_jsonb(n) from public.treatment_notes n where n.id = $1),
             'versions', (select jsonb_agg(to_jsonb(v) order by v.version_no)
                          from public.treatment_note_versions v where v.note_id = $1)
           ) as z`,
          [b.eintrag],
        )
      ).rows[0]!.z;

      ergebnis = await zusammenfuehren(quelle.patient, ziel.patient);
    }, 60_000);

    it('hängt jede Zeile an die bleibende Akte', async () => {
      for (const [tabelle, schluessel] of TABELLEN) {
        expect(await patientVon(tabelle, b[schluessel]), `${tabelle}`).toBe(ziel.patient);
      }
      const { rows } = await asPostgres<{ subject_id: string }>(
        'select subject_id from public.legal_holds where id = $1',
        [b.sperre],
      );
      expect(rows[0]!.subject_id).toBe(ziel.patient);
    });

    it('ändert an keiner Zeile etwas außer dem Bezug', async () => {
      for (const [tabelle, schluessel] of TABELLEN) {
        const nachher = await zeile(tabelle, b[schluessel]);
        if (schluessel === 'empfaenger') {
          // Einzige Ausnahme: Zwei Standardempfänger gibt es nicht (ANN-147).
          expect({ ...nachher, is_default: true }, tabelle).toEqual(vorher[schluessel]);
          expect(nachher.is_default).toBe(false);
        } else {
          expect(nachher, `${tabelle}`).toEqual(vorher[schluessel]);
        }
      }
    });

    it('lässt Eintrag und Versionen unberührt', async () => {
      const { rows } = await asPostgres<{ z: Record<string, unknown> }>(
        `select jsonb_build_object(
           'note', (select to_jsonb(n) from public.treatment_notes n where n.id = $1),
           'versions', (select jsonb_agg(to_jsonb(v) order by v.version_no)
                        from public.treatment_note_versions v where v.note_id = $1)
         ) as z`,
        [b.eintrag],
      );
      expect(rows[0]!.z).toEqual(vorher.eintrag);
    });

    it('lässt die leere Akte fallen, samt ihrer Person', async () => {
      const akte = await asPostgres('select 1 from public.patients where id = $1', [
        quelle.patient,
      ]);
      expect(akte.rows).toEqual([]);
      const person = await asPostgres('select 1 from public.persons where id = $1', [
        quelle.person,
      ]);
      expect(person.rows).toEqual([]);
      const reste = await asPostgres(
        `select 1 from public.patient_contact_details where patient_id = $1
         union all select 1 from public.patient_care_details where patient_id = $1`,
        [quelle.patient],
      );
      expect(reste.rows).toEqual([]);
    });

    it('füllt nur Leeres und hängt Freitexte an (ANN-147)', async () => {
      const { rows } = await asPostgres<Record<string, unknown>>(
        `select pe.given_name, to_char(c.date_of_birth, 'YYYY-MM-DD') as geburt, c.phone,
                c.email, c.street, d.special_note, d.take_along_items,
                d.treatment_table_required
         from public.patients p
         join public.persons pe on pe.id = p.person_id
         join public.patient_contact_details c on c.patient_id = p.id
         join public.patient_care_details d on d.patient_id = p.id
         where p.id = $1`,
        [ziel.patient],
      );
      expect(rows[0]).toEqual({
        given_name: 'Petra',
        geburt: '1971-12-05',
        phone: '0221 222',
        email: 'petra@example.invalid',
        street: 'Neue Straße',
        special_note: 'Klingel defekt\n\nAufzug im Hinterhaus',
        take_along_items: ['Theraband', 'Faszienrolle'],
        treatment_table_required: true,
      });
    });

    // B1 (ANN-510): Ohne Versorgungsstatus bleibt die Akte, wie sie ist - planbar.
    it('führt die Person als aktiv, ohne Abschluss (ANN-148)', async () => {
      const { rows } = await asPostgres<{ status: string; care_concluded_on: string | null }>(
        'select status, care_concluded_on from public.patients where id = $1',
        [ziel.patient],
      );
      expect(rows[0]).toEqual({ status: 'active', care_concluded_on: null });
    });

    it('weist den Vorgang am Vermerk der Akte nach, ohne Namen und Inhalt (ANN-150, LOG-EPIC-001)', async () => {
      // Wer und wann stehen am Vermerk (ANN-230), nicht im Auditlog.
      const { rows } = await asPostgres<{
        merged_by: string;
        merged_at: string | null;
        source_patient_id: string;
        counts: Record<string, unknown>;
      }>(
        `select merged_by, merged_at::text as merged_at, source_patient_id, counts
           from public.patient_merge_records where target_patient_id = $1`,
        [ziel.patient],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        merged_by: users.ownerTherapist,
        source_patient_id: quelle.patient,
      });
      expect(rows[0]!.merged_at).not.toBeNull();
      expect(rows[0]!.counts).toMatchObject({ appointments: 1, invoices_issued: 1 });
      expect(JSON.stringify(rows[0])).not.toMatch(/Petra|Zusammen|Synthetisch/);
      expect(ergebnis.target_patient_id).toBe(ziel.patient);

      const audit = await asPostgres<{ action: string }>(
        `select action from public.audit_log
         where subject_id in ($1, $2) and outcome = 'success'`,
        [ziel.patient, quelle.patient],
      );
      expect(audit.rows).toEqual([]);
    });

    it('hält die ausgestellte Rechnung außerhalb des Vorgangs weiter fest', async () => {
      await expect(
        asPostgres('update public.invoices set total_cents = 1 where id = $1', [b.rechnung]),
      ).rejects.toThrow(/issued invoice cannot be changed/);
      await expect(
        asPostgres('update public.invoices set patient_id = $2 where id = $1', [
          b.rechnung,
          patients.petra,
        ]),
      ).rejects.toThrow(/issued invoice cannot be changed/);
    });

    it('lässt auch während des Vorgangs nur den Bezug wechseln', async () => {
      await expect(
        asPostgres(
          `select set_config('app.patient_merge', 'on', false);
           update public.invoices set total_cents = 1 where id = '${b.rechnung}'`,
        ),
      ).rejects.toThrow(/issued invoice cannot be changed/);
      await expect(
        asPostgres(
          `select set_config('app.patient_merge', 'on', false);
           update public.therapy_reports set report_text = 'anders' where id = '${b.bericht}'`,
        ),
      ).rejects.toThrow(/completed/);
    });

    it('gibt angemeldeten Konten kein Schreibrecht, das die Kennung nutzen könnte', async () => {
      await expect(
        asUser(
          users.ownerTherapist,
          `select set_config('app.patient_merge', 'on', true);
           update public.invoices set patient_id = '${patients.petra}' where id = '${b.rechnung}'`,
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  // Zweitreview H3: Die Sperre einer Verordnung in der Abrechnung (ANN-515)
  // gilt Aenderungen an Doku, Zeit und Terminzahl, nicht dem Bezug zur Akte.
  describe('Verordnung in der Abrechnung (B7, ANN-515)', () => {
    it('führt zusammen, auch wenn eine Verordnung der Dublette freigegeben ist', async () => {
      const ziel = await legeAkteAn({
        vorname: 'Frieda',
        nachname: 'Freigabe',
        geburt: '1960-01-01',
        telefon: '0221 111',
        besonderheit: null,
        mitnehmen: [],
        liege: null,
      });
      const quelle = await legeAkteAn({
        vorname: 'Frieda',
        nachname: 'Freigabe',
        geburt: '1960-01-02',
        telefon: '0221 112',
        besonderheit: null,
        mitnehmen: [],
        liege: null,
      });
      const b = await fuelle(quelle.patient);
      await asPostgres(
        `update public.treatment_bases
            set billing_released_at = now(), billing_released_by = $2
          where id = $1`,
        [b.grundlage, users.office],
      );

      await zusammenfuehren(quelle.patient, ziel.patient);

      expect(await patientVon('treatment_bases', b.grundlage)).toBe(ziel.patient);
      expect(await patientVon('appointments', b.termin)).toBe(ziel.patient);
      const { rows } = await asPostgres<{ billing_released_at: string | null }>(
        'select billing_released_at from public.treatment_bases where id = $1',
        [b.grundlage],
      );
      expect(rows[0]!.billing_released_at).not.toBeNull();
    });
  });

  describe('Versorgungsstand (ANN-148)', () => {
    it('behält bei zwei Abschlüssen den späteren', async () => {
      const ziel = await legeAkteAn({ vorname: 'Anja', nachname: 'Abschluss' });
      const quelle = await legeAkteAn({ vorname: 'Anja', nachname: 'Abschluss' });
      await asPostgres(
        `update public.patients set care_concluded_on = current_date - $2::int,
                care_concluded_at = now(), care_concluded_by = $3
          where id = $1`,
        [ziel.patient, 20, users.therapist],
      );
      await asPostgres(
        `update public.patients set care_concluded_on = current_date - $2::int,
                care_concluded_at = now(), care_concluded_by = $3
          where id = $1`,
        [quelle.patient, 5, users.ownerTherapist],
      );
      await zusammenfuehren(quelle.patient, ziel.patient);
      const { rows } = await asPostgres<{ status: string; tage: number; by: string }>(
        `select status, current_date - care_concluded_on as tage, care_concluded_by as by
         from public.patients where id = $1`,
        [ziel.patient],
      );
      expect(rows[0]).toEqual({ status: 'active', tage: 5, by: users.ownerTherapist });
    });
  });

  describe('Sperren (ANN-149)', () => {
    it('sperrt, wenn an der Dublette ein Konto hängt', async () => {
      const { rows } = await asUser<{ plan: { blockers: string[] } }>(
        users.ownerTherapist,
        VORSCHAU,
        [patients.max, patients.petra],
      );
      // Max trägt im Seed zudem die Begleitung durch Paula (BEF-132).
      expect(rows[0]!.plan.blockers).toEqual(['source_has_account', 'source_has_platform_access']);
      await expect(
        asUser(users.ownerTherapist, ZUSAMMENFUEHREN, [patients.max, patients.petra]),
      ).rejects.toThrow(/blocked: source_has_account/);
    });

    it('sperrt bei zwei Entwürfen für denselben Monat und Bereich', async () => {
      const ziel = await legeAkteAn({ vorname: 'Ella', nachname: 'Entwurf' });
      const quelle = await legeAkteAn({ vorname: 'Ella', nachname: 'Entwurf' });
      for (const p of [ziel.patient, quelle.patient]) {
        await asPostgres(
          `insert into public.invoices (organization_id, patient_id, period_month, service_area)
           values ($1, $2, date_trunc('month', current_date)::date, 'therapy')`,
          [ORG, p],
        );
      }
      await expect(
        asUser(users.ownerTherapist, ZUSAMMENFUEHREN, [quelle.patient, ziel.patient]),
      ).rejects.toThrow(/draft_invoice_overlap/);
    });

    it('sperrt bei zwei offenen Wartelisteneinträgen ohne Grundlage', async () => {
      const ziel = await legeAkteAn({ vorname: 'Wanda', nachname: 'Warte' });
      const quelle = await legeAkteAn({ vorname: 'Wanda', nachname: 'Warte' });
      for (const p of [ziel.patient, quelle.patient]) {
        await asPostgres(
          `insert into public.waitlist_entries
             (organization_id, patient_id, appointment_type, priority_reason)
           values ($1, $2, 'practice', 'patient_wish')`,
          [ORG, p],
        );
      }
      await expect(
        asUser(users.ownerTherapist, ZUSAMMENFUEHREN, [quelle.patient, ziel.patient]),
      ).rejects.toThrow(/open_waitlist_overlap/);
    });

    it('sperrt, statt einen Freitext zu kürzen', async () => {
      const ziel = await legeAkteAn({
        vorname: 'Lena',
        nachname: 'Lang',
        besonderheit: 'a'.repeat(600),
      });
      const quelle = await legeAkteAn({
        vorname: 'Lena',
        nachname: 'Lang',
        besonderheit: 'b'.repeat(600),
      });
      await expect(
        asUser(users.ownerTherapist, ZUSAMMENFUEHREN, [quelle.patient, ziel.patient]),
      ).rejects.toThrow(/note_too_long/);
    });
  });

  describe('Legal Hold (ANN-150)', () => {
    it('führt auch zwei gesperrte Akten zusammen, ohne den Schutz zu verlieren', async () => {
      const ziel = await legeAkteAn({ vorname: 'Hanna', nachname: 'Halt' });
      const quelle = await legeAkteAn({ vorname: 'Hanna', nachname: 'Halt' });
      const sperre = async (p: string) =>
        (
          await asPostgres<{ id: string }>(
            `insert into public.legal_holds
               (organization_id, subject_type, subject_id, reason, placed_by)
             values ($1, 'patient', $2, 'Synthetische Anfrage', $3) returning id`,
            [ORG, p, users.ownerTherapist],
          )
        ).rows[0]!.id;
      const zielSperre = await sperre(ziel.patient);
      const quellSperre = await sperre(quelle.patient);

      const { rows: plan } = await asUser<{ plan: { blockers: string[] } }>(
        users.ownerTherapist,
        VORSCHAU,
        [quelle.patient, ziel.patient],
      );
      expect(plan[0]!.plan.blockers).toEqual([]);
      await zusammenfuehren(quelle.patient, ziel.patient);

      // Seit ABN-018 (BEF-108) bleiben beide Gruende wirksam.
      const { rows } = await asPostgres<{ id: string; aktiv: boolean }>(
        `select id, released_at is null as aktiv from public.legal_holds
         where subject_type = 'patient' and subject_id = $1 order by placed_at, id`,
        [ziel.patient],
      );
      expect(rows).toEqual(
        expect.arrayContaining([
          { id: zielSperre, aktiv: true },
          { id: quellSperre, aktiv: true },
        ]),
      );
      // Keine Sperre wurde aufgehoben, und der Vorgang steht am Vermerk.
      const aufgehoben = await asPostgres<{ released_by: string | null }>(
        'select released_by from public.legal_holds where id in ($1, $2)',
        [zielSperre, quellSperre],
      );
      expect(aufgehoben.rows).toEqual([{ released_by: null }, { released_by: null }]);
      const vermerk = await asPostgres<{ merged_by: string }>(
        'select merged_by from public.patient_merge_records where target_patient_id = $1',
        [ziel.patient],
      );
      expect(vermerk.rows).toEqual([{ merged_by: users.ownerTherapist }]);
    });
  });

  describe('Person mit weiteren Bezügen', () => {
    it('lässt eine Person mit Trainingsverhältnis stehen (ADR-021)', async () => {
      const ziel = await legeAkteAn({ vorname: 'Tara', nachname: 'Training' });
      const quelle = await legeAkteAn({ vorname: 'Tara', nachname: 'Training' });
      await asPostgres(
        `insert into public.training_relationships (organization_id, person_id)
         values ($1, $2)`,
        [ORG, quelle.person],
      );
      await zusammenfuehren(quelle.patient, ziel.patient);
      const { rows } = await asPostgres('select 1 from public.persons where id = $1', [
        quelle.person,
      ]);
      expect(rows).toHaveLength(1);
    });
  });

  describe('Fotos (ADR-017 Punkt 36)', () => {
    it('zählt ein vorab gelöschtes Foto nicht als mitgewandert', async () => {
      const ziel = await legeAkteAn({ vorname: 'Frida', nachname: 'Foto' });
      const quelle = await legeAkteAn({ vorname: 'Frida', nachname: 'Foto' });
      // Unter Legal Hold gesperrt gehalten und fällig: Das Foto fällt erst,
      // wenn die Sperre endet - hier simuliert durch ein festgehaltenes
      // Sperrdatum in der Vergangenheit ohne Hold.
      await asPostgres(
        `insert into public.patient_files
           (organization_id, patient_id, document_type, display_name, mime_type, byte_size,
            checksum_sha256, object_key, status, confirmed_at, created_at, photo_locked_at)
         values ($1, $2, 'patientenfoto', 'Foto', 'image/jpeg', 1024, repeat('c', 64), 'x',
                 'ready', now() - interval '3 days', now() - interval '3 days',
                 now() - interval '1 day')`,
        [ORG, quelle.patient],
      );
      const ergebnis = await zusammenfuehren(quelle.patient, ziel.patient);
      expect(ergebnis.photos_deleted).toBe(1);
      expect((ergebnis.moved as Record<string, number>).patient_files).toBe(0);
    });

    it('löscht Fotos der Dublette, die ein Widerruf der bleibenden Akte trifft', async () => {
      const ziel = await legeAkteAn({ vorname: 'Fiona', nachname: 'Foto' });
      const quelle = await legeAkteAn({ vorname: 'Fiona', nachname: 'Foto' });
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.patient_files
           (organization_id, patient_id, document_type, display_name, mime_type, byte_size,
            checksum_sha256, object_key, status, confirmed_at, created_at)
         values ($1, $2, 'patientenfoto', 'Foto', 'image/jpeg', 1024, repeat('b', 64), 'x',
                 'ready', now() - interval '3 days', now() - interval '3 days')
         returning id`,
        [ORG, quelle.patient],
      );
      const foto = rows[0]!.id;
      await asPostgres(
        `insert into public.patient_privacy_records
           (organization_id, patient_id, record_kind, purpose, occurred_on, recorded_at)
         values ($1, $2, 'consent_granted', 'patient_photos', current_date - 4,
                 now() - interval '4 days'),
                ($1, $3, 'consent_withdrawn', 'patient_photos', current_date - 1,
                 now() - interval '1 day')`,
        [ORG, quelle.patient, ziel.patient],
      );

      const ergebnis = await zusammenfuehren(quelle.patient, ziel.patient);
      expect(ergebnis.photos_deleted).toBe(1);

      const datei = await asPostgres('select 1 from public.patient_files where id = $1', [foto]);
      expect(datei.rows).toEqual([]);
      const journal = await asPostgres<{ retention_class: string }>(
        'select retention_class from public.deletion_journal where target_id = $1',
        [foto],
      );
      expect(journal.rows).toEqual([{ retention_class: 'patientenfoto' }]);
    });
  });

  describe('Terminwünsche der Plattform (BEF-131)', () => {
    const LESEN = `select id, to_jsonb(w) as z from public.platform_appointment_requests w
                    where id = any($1::uuid[]) order by id`;
    const WUNSCH = `insert into public.platform_appointment_requests
        (organization_id, relationship_kind, relationship_id, patient_id,
         training_relationship_id, kind, preferred_days, preferred_times, note, status,
         created_by_access_id, created_by, resolved_at, resolved_by, answer)
      values ($1, $2, $3, $4, $5, 'new', array[current_date + 3], array['morning'], $6, $7,
              $8, $9, case when $7 = 'open' then null else now() end,
              case when $7 = 'open' then null::uuid else $10::uuid end,
              case when $7 = 'declined' then 'Leider voll' end)
      returning id`;
    // Die bleibende Akte ist Erika mit ihrem Plattformzugang (Seed); ein Konto
    // gehört genau einer Person.
    const ziel = { patient: patients.erika };
    const zielZugang = SEED.platformAccesses.erikaBehandlung;
    let quelle: { patient: string; person: string };
    let quelleZugang: string;
    let mitgezogen: string[];
    let unberuehrt: string[];
    let vorherMitgezogen: { id: string; z: Record<string, unknown> }[];
    let vorherUnberuehrt: { id: string; z: Record<string, unknown> }[];

    /** Ein beendeter Zugang der Dublette; der Nachweis bleibt stehen. */
    async function beendeterZugang(patient: string): Promise<string> {
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.platform_accesses
           (organization_id, relationship_kind, relationship_id, patient_id, status,
            created_by, revoked_at, revoked_by, revoked_reason)
         values ($1, 'treatment', $2, $2, 'revoked', $3, now(), $3, 'practice')
         returning id`,
        [ORG, patient, users.office],
      );
      return rows[0]!.id;
    }

    async function wunsch(
      art: 'treatment' | 'training',
      verhaeltnis: string,
      zugangId: string,
      status: 'open' | 'declined',
      notiz: string | null = null,
    ): Promise<string> {
      const { rows } = await asPostgres<{ id: string }>(WUNSCH, [
        ORG,
        art,
        verhaeltnis,
        art === 'treatment' ? verhaeltnis : null,
        art === 'training' ? verhaeltnis : null,
        notiz,
        status,
        zugangId,
        users.plattformErika,
        users.office,
      ]);
      return rows[0]!.id;
    }

    beforeAll(async () => {
      quelle = await legeAkteAn({ vorname: 'Erika', nachname: 'Beispiel-Dublette' });
      quelleZugang = await beendeterZugang(quelle.patient);
      mitgezogen = [
        await wunsch('treatment', quelle.patient, quelleZugang, 'open', 'Gern vormittags'),
        await wunsch('treatment', quelle.patient, quelleZugang, 'declined'),
      ];
      // Gegenproben: der eigene Wunsch der bleibenden Akte, der einer dritten
      // Akte und ein Trainingswunsch (patient_id null) bleiben, wie sie sind.
      unberuehrt = [
        await wunsch('treatment', ziel.patient, zielZugang, 'open', 'Eigener Wunsch'),
        await wunsch(
          'treatment',
          patients.max,
          SEED.platformAccesses.paulaBegleitungMax,
          'open',
          'Dritte Akte',
        ),
        await wunsch(
          'training',
          SEED.trainingRelationships.erika,
          SEED.platformAccesses.erikaTraining,
          'open',
          'Training',
        ),
      ];
      vorherMitgezogen = (
        await asPostgres<{ id: string; z: Record<string, unknown> }>(LESEN, [mitgezogen])
      ).rows;
      vorherUnberuehrt = (
        await asPostgres<{ id: string; z: Record<string, unknown> }>(LESEN, [unberuehrt])
      ).rows;

      await zusammenfuehren(quelle.patient, ziel.patient);
    }, 60_000);

    it('ziehen offene wie beantwortete Wünsche zur bleibenden Akte, sonst unverändert', async () => {
      const nachher = (
        await asPostgres<{ id: string; z: Record<string, unknown> }>(LESEN, [mitgezogen])
      ).rows;
      expect(nachher).toEqual(
        vorherMitgezogen.map((w) => ({
          ...w,
          z: { ...w.z, patient_id: ziel.patient, relationship_id: ziel.patient },
        })),
      );
    });

    it('lässt Wünsche der bleibenden Akte, anderer Akten und des Trainings unberührt', async () => {
      expect((await asPostgres(LESEN, [unberuehrt])).rows).toEqual(vorherUnberuehrt);
    });

    it('zeigt die Wünsche dem Büro und dem Zugang der bleibenden Akte, nicht dem der Dublette', async () => {
      const { rows: offen } = await asUser<{ id: string; patient_id: string; family_name: string }>(
        users.office,
        `select id, patient_id, family_name from public.list_platform_appointment_requests('open')
          where id = any($1::uuid[])`,
        [mitgezogen],
      );
      expect(offen).toEqual([
        { id: mitgezogen[0], patient_id: ziel.patient, family_name: 'Beispiel' },
      ]);

      const LISTE = `select id from public.platform_appointment_requests($1::uuid)
                      where id = any($2::uuid[]) order by id`;
      const alle = [...mitgezogen, ...unberuehrt];
      const { rows: plattform } = await asUser<{ id: string }>(users.plattformErika, LISTE, [
        zielZugang,
        alle,
      ]);
      expect(plattform.map((w) => w.id)).toEqual([...mitgezogen, unberuehrt[0]].sort());
      const { rows: dublette } = await asUser(users.plattformErika, LISTE, [quelleZugang, alle]);
      expect(dublette).toEqual([]);
    });
  });

  describe('Plattformzugang an der Dublette (BEF-132)', () => {
    /** Ein Zugang der Dublette im genannten Zustand; die Kennung zurück. */
    async function zugang(patient: string, zustand: 'invited' | 'locked'): Promise<string> {
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.platform_accesses
           (organization_id, relationship_kind, relationship_id, patient_id, status,
            account_user_id, activated_at, locked_at, locked_by, created_by)
         values ($1, 'treatment', $2, $2, $3,
                 case when $3 = 'locked' then extensions.gen_random_uuid() end,
                 case when $3 = 'locked' then now() end,
                 case when $3 = 'locked' then now() end,
                 case when $3 = 'locked' then $4::uuid end, $4)
         returning id`,
        [ORG, patient, zustand, users.office],
      );
      return rows[0]!.id;
    }

    async function sperren(quelle: string): Promise<string[]> {
      const { rows } = await asUser<{ plan: { blockers: string[] } }>(
        users.ownerTherapist,
        VORSCHAU,
        [quelle, patients.erika],
      );
      return rows[0]!.plan.blockers;
    }

    it('sperrt, solange ein Zugang der Dublette nicht entzogen ist; entzogen gibt den Weg frei', async () => {
      // Die bleibende Akte (Erika) hat selbst einen aktiven Zugang - der sperrt nicht.
      const quelle = await legeAkteAn({ vorname: 'Erika', nachname: 'Beispiel-Zugang' });
      const eingeladen = await zugang(quelle.patient, 'invited');
      expect(await sperren(quelle.patient)).toEqual(['source_has_platform_access']);
      await expect(
        asUser(users.ownerTherapist, ZUSAMMENFUEHREN, [quelle.patient, patients.erika]),
      ).rejects.toThrow(/blocked: source_has_platform_access/);

      await asUserCommitted(
        users.ownerTherapist,
        'select public.revoke_platform_access($1::uuid)',
        [eingeladen],
      );
      const gesperrt = await zugang(quelle.patient, 'locked');
      expect(await sperren(quelle.patient)).toEqual(['source_has_platform_access']);

      await asUserCommitted(
        users.ownerTherapist,
        'select public.revoke_platform_access($1::uuid)',
        [gesperrt],
      );
      expect(await sperren(quelle.patient)).toEqual([]);
    });

    it('zählt Rückfragen und Terminwünsche der Dublette, auch im Vermerk', async () => {
      const quelle = await legeAkteAn({ vorname: 'Erika', nachname: 'Beispiel-Zähler' });
      await asPostgres(
        `insert into public.platform_messages
           (organization_id, relationship_kind, relationship_id, patient_id, topic, status,
            due_on, created_by)
         values ($1, 'treatment', $2, $2, 'organisational', 'open', current_date + 2, $3)`,
        [ORG, quelle.patient, users.office],
      );
      // Der Wunsch trägt seinen Zugang; der ist entzogen und sperrt nicht.
      await asPostgres(
        `with zugang as (
           insert into public.platform_accesses
             (organization_id, relationship_kind, relationship_id, patient_id, status,
              created_by, revoked_at, revoked_by, revoked_reason)
           values ($1, 'treatment', $2, $2, 'revoked', $3, now(), $3, 'practice')
           returning id
         )
         insert into public.platform_appointment_requests
           (organization_id, relationship_kind, relationship_id, patient_id, kind,
            preferred_days, preferred_times, status, created_by_access_id, created_by)
         select $1, 'treatment', $2, $2, 'new', array[current_date + 3], array['morning'],
                'open', zugang.id, $4
         from zugang`,
        [ORG, quelle.patient, users.office, users.plattformErika],
      );
      const { rows } = await asUser<{ plan: { counts: Record<string, number> } }>(
        users.ownerTherapist,
        VORSCHAU,
        [quelle.patient, patients.erika],
      );
      expect(rows[0]!.plan.counts).toMatchObject({
        platform_messages: 1,
        platform_appointment_requests: 1,
      });

      await zusammenfuehren(quelle.patient, patients.erika);
      const vermerk = await asPostgres<{ counts: Record<string, number> }>(
        'select counts from public.patient_merge_records where source_patient_id = $1',
        [quelle.patient],
      );
      expect(vermerk.rows[0]!.counts).toMatchObject({
        platform_messages: 1,
        platform_appointment_requests: 1,
      });
    });
  });

  describe('Nachweis an der bleibenden Akte (ABN-018, BEF-108)', () => {
    it('hinterlaesst einen Vermerk, der mit der Akte lebt und weiterzieht', async () => {
      const ziel = await legeAkteAn({ vorname: 'Nora', nachname: 'Nachweis' });
      const quelle = await legeAkteAn({ vorname: 'Nora', nachname: 'Nachweis' });
      await zusammenfuehren(quelle.patient, ziel.patient);

      const { rows } = await asUser<{
        merged_by_name: string | null;
        counts: Record<string, number>;
      }>(
        users.ownerTherapist,
        'select merged_by_name, counts from public.list_patient_merge_records($1::uuid)',
        [ziel.patient],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.counts).toHaveProperty('appointments');

      // Wird die bleibende Akte selbst zusammengefuehrt, zieht der Vermerk mit.
      const dritte = await legeAkteAn({ vorname: 'Nora', nachname: 'Nachweis' });
      await zusammenfuehren(ziel.patient, dritte.patient);
      const { rows: weiter } = await asPostgres<{ n: number }>(
        'select count(*)::int as n from public.patient_merge_records where target_patient_id = $1',
        [dritte.patient],
      );
      expect(weiter[0]!.n).toBe(2);

      // Und er faellt erst mit der Akte.
      await asPostgres(
        'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
        [dritte.patient],
      );
      expect(
        (
          await asPostgres(
            'select 1 from public.patient_merge_records where target_patient_id = $1',
            [dritte.patient],
          )
        ).rows,
      ).toEqual([]);
    });

    it('zeigt die Vermerke weder einer fremden Praxis noch einem Patientenkonto', async () => {
      const ziel = await legeAkteAn({ vorname: 'Vera', nachname: 'Vermerk' });
      const quelle = await legeAkteAn({ vorname: 'Vera', nachname: 'Vermerk' });
      await zusammenfuehren(quelle.patient, ziel.patient);
      const LISTE = 'select * from public.list_patient_merge_records($1::uuid)';

      const { owner } = await fremdeOrganisation();
      const { rows: fremd } = await asUser(owner, LISTE, [ziel.patient]);
      expect(fremd).toEqual([]);

      // Die Trainingsbetreuung liest das Verzeichnis nicht (ADR-021).
      await erwarteAbgewiesenenLeseversuch(
        users.trainer,
        LISTE,
        [ziel.patient],
        'patient_directory.read',
      );
      await erwarteAbgewiesenenLeseversuch(
        users.patientMax,
        LISTE,
        [ziel.patient],
        'patient_directory.read',
      );
    });
  });
});

describe('Check-ins beim Zusammenführen (TRK-002)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  async function takt(patient: string, tage: number, fragen: string[]) {
    await asPostgres(
      `insert into public.checkin_schedules
         (organization_id, relationship_kind, relationship_id, patient_id, interval_days,
          parameter_keys, starts_on, created_by, updated_by)
       values ($1, 'treatment', $2, $2, $3, $4::text[], current_date, $5, $5)`,
      [ORG, patient, tage, fragen, users.therapist],
    );
  }

  async function checkin(patient: string): Promise<string> {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.checkins
         (organization_id, relationship_kind, relationship_id, patient_id, answered_on,
          platform_access_id, platform_access_kind, recorded_by)
       values ($1, 'treatment', $2, $2, current_date, extensions.gen_random_uuid(), 'self', $3)
       returning id`,
      [ORG, patient, users.plattformErika],
    );
    await asPostgres(
      `insert into public.checkin_values (organization_id, checkin_id, parameter_key, value)
       values ($1, $2, 'pain_rest', 4)`,
      [ORG, rows[0]!.id],
    );
    return rows[0]!.id;
  }

  it('Check-ins ziehen mit; den Takt behält die bleibende Akte, sonst zieht er mit (ANN-350)', async () => {
    const ziel = await legeAkteAn({ vorname: 'Clara', nachname: 'Checkin' });
    const quelle = await legeAkteAn({ vorname: 'Clara', nachname: 'Checkin' });
    await takt(quelle.patient, 3, ['stress']);
    // Am selben Tag beantwortet: beide bleiben, keiner fällt.
    const alt = await checkin(quelle.patient);
    const neu = await checkin(ziel.patient);
    const ergebnis = await zusammenfuehren(quelle.patient, ziel.patient);
    // Im Nachweis steht, was mitzog (Zweitreview S1).
    expect(ergebnis['moved']).toMatchObject({ checkins: 1, checkin_schedules: 1 });

    const { rows } = await asPostgres<{ id: string; patient_id: string; relationship_id: string }>(
      `select id, patient_id, relationship_id from public.checkins where id = any($1::uuid[])
       order by id`,
      [[alt, neu]],
    );
    expect(rows).toHaveLength(2);
    for (const zeile of rows) {
      expect(zeile.patient_id).toBe(ziel.patient);
      expect(zeile.relationship_id).toBe(ziel.patient);
    }
    const werte = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.checkin_values where checkin_id = $1',
      [alt],
    );
    expect(werte.rows[0]!.n).toBe(1);
    const zielTakt = await asPostgres<{ interval_days: number }>(
      'select interval_days from public.checkin_schedules where patient_id = $1',
      [ziel.patient],
    );
    expect(zielTakt.rows).toEqual([{ interval_days: 3 }]);

    // Hat die bleibende Akte einen Takt, bleibt ihrer; der der Dublette fällt.
    const dritte = await legeAkteAn({ vorname: 'Clara', nachname: 'Checkin' });
    await takt(dritte.patient, 14, ['pain_load']);
    await zusammenfuehren(dritte.patient, ziel.patient);
    const danach = await asPostgres<{ interval_days: number }>(
      `select interval_days from public.checkin_schedules
       where patient_id = $1 or patient_id = $2`,
      [ziel.patient, dritte.patient],
    );
    expect(danach.rows).toEqual([{ interval_days: 3 }]);
  });
});

describe('Gewohnheiten beim Zusammenführen (ALT-003)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('Gewohnheiten ziehen mit ihren Tagen mit und stehen im Nachweis (ANN-370)', async () => {
    const ziel = await legeAkteAn({ vorname: 'Greta', nachname: 'Gewohnheit' });
    const quelle = await legeAkteAn({ vorname: 'Greta', nachname: 'Gewohnheit' });
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.habits
         (organization_id, relationship_kind, relationship_id, patient_id, action, cue,
          starts_on, created_by)
       values ($1, 'treatment', $2, $2, 'Zwei Minuten Mobilität', 'Nach dem Zähneputzen',
               current_date - 3, $3)
       returning id`,
      [ORG, quelle.patient, users.therapist],
    );
    const gewohnheit = rows[0]!.id;
    await asPostgres(
      `insert into public.habit_marks
         (organization_id, habit_id, done_on, platform_access_id, platform_access_kind, recorded_by)
       values ($1, $2, current_date - 1, extensions.gen_random_uuid(), 'self', $3)`,
      [ORG, gewohnheit, users.plattformErika],
    );
    const ergebnis = await zusammenfuehren(quelle.patient, ziel.patient);
    expect(ergebnis['moved']).toMatchObject({ habits: 1 });
    const danach = await asPostgres<{ patient_id: string; relationship_id: string; tage: number }>(
      `select h.patient_id, h.relationship_id,
              (select count(*)::int from public.habit_marks m where m.habit_id = h.id) as tage
       from public.habits h where h.id = $1`,
      [gewohnheit],
    );
    expect(danach.rows).toEqual([
      { patient_id: ziel.patient, relationship_id: ziel.patient, tage: 1 },
    ]);
  });
});
