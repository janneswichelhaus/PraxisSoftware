import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase, tagInTagen } from './helpers/db';

/**
 * Kein Durchgriff ueber den gemeinsamen Kalender (CAL-026, ADR-022 Punkt 11).
 *
 * Drei Grenzen an einem Kalender:
 *
 *   Lesen     Der Kontext entscheidet, wer den Termin sieht. Was BEIDE Seiten
 *             erfahren, ist die Belegung - und nur sie. Das ist der Preis des
 *             einen Kalenders und wird bewusst bezahlt.
 *   Schreiben Ein Trainingstermin erzeugt keine Behandlungsdokumentation und
 *             kann keine erzeugen (Punkt 6), und er traegt keinen
 *             Gebuehrenanlass (offene Folgefrage zu ADR-018 Punkt 8).
 *   Loeschen  Je ZEILE am Kontext. Eine Tabelle, drei Fristen.
 */

const { organizationId, users, patients, trainingRelationships } = SEED;

const ANNA = '55555555-5555-4555-8555-000000000002';
const TOM = '55555555-5555-4555-8555-000000000006';
const STANDORT = '33333333-3333-4333-8333-000000000001';
const TAG = tagInTagen(80);

const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';
const DOKUMENTIEREN = 'select public.create_treatment_note($1::uuid, $2) as id';
const NICHT_ANGETROFFEN = 'select public.record_no_show($1::uuid, $2::timestamptz, $3) as id';
const KALENDER =
  "select * from public.list_appointments($1::date, $2::date, null, null, 'all') order by starts_at";
const TAGESLISTE = 'select * from public.list_day_plan($1::date, $2::uuid)';

/**
 * Der Stand eines Termins in voller Aufloesung.
 *
 * `timestamptz` traegt Mikrosekunden, ein JS-Date nur Millisekunden: Der Wert
 * ueber den Umweg eines Date zurueckgegeben passte nie auf sich selbst, und
 * jeder Schreibweg antwortete mit "appointment was changed meanwhile".
 */
async function stand(id: string): Promise<string> {
  const { rows } = await asPostgres<{ updated_at: string }>(
    `select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as updated_at
       from public.appointments where id = $1`,
    [id],
  );
  return rows[0]!.updated_at;
}

/** Ein Trainingstermin, unmittelbar angelegt - einen Schreibweg gibt es noch nicht. */
async function trainingstermin(
  felder: {
    verhaeltnis?: string;
    mitarbeiter?: string;
    beginn?: string;
    art?: string;
    status?: string;
  } = {},
): Promise<string> {
  const {
    verhaeltnis = trainingRelationships.tina,
    mitarbeiter = TOM,
    beginn = '09:00',
    art = 'practice',
    status = 'confirmed',
  } = felder;

  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, training_relationship_id, staff_member_id, location_id,
       appointment_type, kind, status, starts_at, ends_at,
       visit_street, visit_house_number, visit_postal_code, visit_city
     ) values (
       $1, $2, $3, $4, $5, 'training', $6,
       ($7::date + $8::time) at time zone 'Europe/Berlin',
       ($7::date + $8::time) at time zone 'Europe/Berlin' + interval '1 hour',
       $9, $10, $11, $12
     ) returning id`,
    [
      organizationId,
      verhaeltnis,
      mitarbeiter,
      art === 'practice' ? STANDORT : null,
      art,
      status,
      TAG,
      beginn,
      art === 'home_visit' ? 'Beispielstrasse' : null,
      art === 'home_visit' ? '12' : null,
      art === 'home_visit' ? '72070' : null,
      art === 'home_visit' ? 'Tuebingen' : null,
    ],
  );
  return rows[0]!.id;
}

describe('Kalender ohne Durchgriff', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  describe('Lesen filtert nach Kontext (ADR-022 Punkt 11)', () => {
    it('zeigt der Trainingsrolle keinen Behandlungstermin und keinen Titel', async () => {
      await trainingstermin();

      const { rows } = await asUser(
        users.trainer,
        `select kind, patient_id, title from public.appointments order by kind`,
      );
      // Genau ein Termin: der eigene. Der Seed traegt Behandlungstermine und
      // ein Ereignis - beide bleiben unsichtbar, weder Person noch Titel noch
      // Grundlage (ADR-021 Punkt 6).
      expect(rows.map((r) => r.kind)).toEqual(['training']);
    });

    it('zeigt den Praxisrollen keinen Trainingstermin', async () => {
      const id = await trainingstermin();

      for (const konto of [users.therapist, users.teamLead]) {
        const { rows } = await asUser(konto, `select id from public.appointments where id = $1`, [
          id,
        ]);
        expect(rows).toEqual([]);
      }
    });

    it('zeigt owner und office beide Kontexte - zwei Zugehoerigkeiten, kein Durchgriff', async () => {
      // PROJECT_PRINCIPLES.md §4.8 verbietet den SCHLUSS von einer Rolle auf
      // den anderen Bereich, nicht die Haeufung zweier Zugehoerigkeiten an
      // einer Person.
      await trainingstermin();

      for (const konto of [users.ownerTherapist, users.office]) {
        const { rows } = await asUser(
          konto,
          `select distinct kind from public.appointments order by kind`,
        );
        expect(rows.map((r) => r.kind)).toContain('training');
        expect(rows.map((r) => r.kind)).toContain('treatment');
      }
    });

    it('haelt den Trainingstermin aus Kalender und Tagesliste der Praxis heraus', async () => {
      // SECURITY DEFINER umgeht RLS: Ohne eigenen Filter stuende der
      // Trainingstermin trotz Policy in jeder Tagesliste.
      const id = await trainingstermin();

      const { rows: kalender } = await asUser(users.therapist, KALENDER, [TAG, tagInTagen(81)]);
      expect(kalender.map((r) => r.id)).not.toContain(id);

      const { rows: tag } = await asUser(users.therapist, TAGESLISTE, [TAG, TOM]);
      expect(tag.map((r) => r.id)).not.toContain(id);
    });
  });

  describe('Die Belegung ist der bezahlte Preis - und nichts darueber hinaus', () => {
    it('meldet "belegt" und nennt weder Person noch Kontext des fremden Termins', async () => {
      await trainingstermin({ mitarbeiter: ANNA, beginn: '11:00' });

      // Anna soll um 11 behandeln - die Stunde ist belegt, und zwar durch
      // einen Termin, den sie nicht sehen darf.
      const fehler = await asUser(users.therapist, ANLEGEN, [
        patients.max,
        ANNA,
        'practice',
        TAG,
        '11:00',
        '12:00',
        STANDORT,
      ]).catch((e: Error) => e);

      expect(fehler).toBeInstanceOf(Error);
      const meldung = (fehler as Error).message;
      expect(meldung).toMatch(/appointment overlaps an existing one/);
      // Der Negativfall: Die Meldung verraet nichts ueber den fremden Termin.
      expect(meldung).not.toMatch(/training/i);
      expect(meldung).not.toMatch(/Tina|Musterfrau/i);
      expect(meldung).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    });

    it('bleibt die EXCLUDE-Constraint kontextuebergreifend - sonst waere der eine Kalender keiner', async () => {
      const { rows } = await asPostgres<{ definition: string }>(
        `select pg_get_constraintdef(oid) as definition
           from pg_constraint
          where conrelid = 'public.appointments'::regclass
            and conname  = 'appointments_no_overlap'`,
      );
      expect(rows[0]?.definition).not.toContain('kind');
    });
  });

  describe('Kein Trainingstermin erzeugt Behandlungsdokumentation (ADR-022 Punkt 6)', () => {
    it('weist den Schreibweg ab', async () => {
      const id = await trainingstermin();
      await expect(asUser(users.therapist, DOKUMENTIEREN, [id, 'Kniebeuge, 3x12'])).rejects.toThrow(
        /only a treatment appointment can be documented|not allowed/,
      );
    });

    it('weist auch den unmittelbaren Eintrag ab - der Riegel sitzt an der Tabelle', async () => {
      // "Durchgesetzt wird das in der Datenbank, nicht in der Oberflaeche"
      // (Punkt 6). Der Riegel gilt damit auch fuer den Schreibweg, den es
      // noch nicht gibt.
      const id = await trainingstermin();
      await expect(
        asPostgres(
          `insert into public.treatment_notes (organization_id, appointment_id, status, content)
           values ($1, $2, 'draft', 'Nicht zulaessig')`,
          [organizationId, id],
        ),
      ).rejects.toThrow(/only a treatment appointment can be documented/);
    });

    it('erreicht die automatische Finalisierung nicht', async () => {
      // Sie kann ihn nicht erreichen, weil es keinen Entwurf an ihm gibt -
      // der Lauf sagt es zusaetzlich selbst.
      const id = await trainingstermin();
      const { rows } = await asPostgres<{ definition: string }>(
        `select pg_get_functiondef(p.oid) as definition
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'finalize_overdue_treatment_notes'`,
      );
      expect(rows[0]?.definition).toContain("a.kind = 'treatment'");

      await asPostgres('select public.finalize_overdue_treatment_notes()');
      const { rows: danach } = await asPostgres<{ status: string }>(
        'select status from public.appointments where id = $1',
        [id],
      );
      expect(danach[0]?.status).toBe('confirmed');
    });
  });

  describe('Der Zustandsautomat gilt weiter, der Gebuehrenanlass nicht (ADR-022 Punkt 8)', () => {
    it('vermerkt "nicht angetroffen" am Trainingstermin als Hausbesuch - ohne Forderung', async () => {
      // Personal Training zu Hause ist ein Hausbesuch (Punkt 9). Ohne diesen
      // Zweig setzte record_no_show dort den Anlass 'no_show' und liefe in
      // eine Constraint, die von der Behandlung spricht.
      const id = await trainingstermin({ art: 'home_visit', beginn: '14:00' });

      await asUserCommitted(users.therapist, NICHT_ANGETROFFEN, [id, await stand(id), false]);

      const { rows } = await asPostgres<{
        status: string;
        fee_basis: string | null;
        no_show_protocol_confirmed: boolean | null;
      }>(
        `select status, fee_basis, no_show_protocol_confirmed
           from public.appointments where id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({
        status: 'no_show',
        fee_basis: null,
        no_show_protocol_confirmed: false,
      });
    });

    it('nimmt am Trainingstermin keine Protokollbestaetigung entgegen', async () => {
      const id = await trainingstermin({ art: 'home_visit', beginn: '15:00' });
      await expect(
        asUser(users.therapist, NICHT_ANGETROFFEN, [id, await stand(id), true]),
      ).rejects.toThrow(/no-show protocol applies to treatment appointments only/);
    });
  });

  describe('Loeschung je Zeile am Kontext (ADR-022, Konsequenzen)', () => {
    /** Setzt das Vertragsende auf „vor N Jahren" (LEI-001). */
    async function beendetVor(relationshipId: string, jahre: number) {
      await asPostgres(
        `update public.training_relationships
            set contract_started_on = (current_date - ($2::int + 1) * interval '1 year')::date,
                contract_ended_on   = (current_date - $2::int * interval '1 year')::date,
                status              = 'inactive'
          where id = $1`,
        [relationshipId, jahre],
      );
    }

    it('nimmt Termine und Klammern mit dem Verhaeltnis - in dieser Reihenfolge', async () => {
      const termin = await trainingstermin();
      const { rows: klammer } = await asPostgres<{ id: string }>(
        `insert into public.training_bases
           (organization_id, training_relationship_id, started_on)
         values ($1, $2, current_date) returning id`,
        [organizationId, trainingRelationships.tina],
      );
      await beendetVor(trainingRelationships.tina, 4);

      // Ohne das Raeumen der Termine scheiterte der Lauf hier still am
      // Fremdschluessel (restrict).
      await asPostgres('select public.apply_retention()');

      const { rows: uebrig } = await asPostgres<{ anzahl: string }>(
        `select count(*)::text as anzahl from public.appointments where id = $1`,
        [termin],
      );
      expect(uebrig[0]?.anzahl).toBe('0');

      const { rows: journal } = await asPostgres<{ target_table: string }>(
        `select target_table from public.deletion_journal
          where retention_class = 'trainingsverhaeltnis' order by target_table`,
      );
      expect(journal.map((r) => r.target_table)).toEqual([
        'appointments',
        'training_bases',
        'training_relationships',
      ]);
      expect(klammer[0]?.id).toBeTruthy();
    });

    it('laesst den abgesagten Trainingstermin nicht nach der Frist der Praxistermine fallen', async () => {
      // `termin_ohne_nachweis` rechnet ab Kalenderjahresende und prueft den
      // Legal Hold ueber `patient_id` - der ist am Trainingstermin leer. Ohne
      // den Kontext in der Bedingung faellt die Zeile zu frueh und an einer
      // Sperre am Verhaeltnis vorbei.
      const id = await trainingstermin();
      await asPostgres(
        `update public.appointments
            set status = 'cancelled',
                cancelled_at = now() - interval '5 years',
                cancelled_by = $2,
                cancellation_reason = 'other'
          where id = $1`,
        [id, users.trainer],
      );

      await asPostgres('select public.apply_retention()');

      const { rows } = await asPostgres<{ anzahl: string }>(
        `select count(*)::text as anzahl from public.appointments where id = $1`,
        [id],
      );
      expect(rows[0]?.anzahl).toBe('1');
    });

    it('fuehrt die Tabelle unter drei Datenklassen', async () => {
      const { rows } = await asPostgres<{ class_key: string }>(
        `select class_key from public.retention_assignments
          where table_name = 'appointments' order by class_key`,
      );
      expect(rows.map((r) => r.class_key)).toEqual([
        'patientenakte',
        'termin_ohne_nachweis',
        'trainingsverhaeltnis',
      ]);
    });
  });
});
