import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, fremdeOrganisation, resetDatabase, tagInTagen } from './helpers/db';

/**
 * Der dritte Terminkontext (CAL-024, ADR-022).
 *
 * Ein Kalender traegt drei Kontexte: Behandlung, internes Ereignis und
 * Training. Die Tests hier halten fest, was man einer Spalte mit drei Werten
 * spaeter nicht mehr ansieht - dass jeder Termin an genau einem
 * Rechtsverhaeltnis haengt oder an keinem, dass ein Trainingstermin die
 * klinische Behandlungsgrundlage nicht erreicht, und dass der Kontext mit dem
 * Anlegen feststeht.
 *
 * Geschrieben wird hier ausschliesslich privilegiert: Einen Schreibweg fuer
 * Trainingstermine gibt es bewusst noch nicht (er gehoert in den
 * Trainingsbereich, E18 Schritt 7). Geprueft wird das Schema, und ein Schema
 * haelt auch gegen einen Schreibweg, den es noch nicht gibt.
 */

const { organizationId, patients, trainingRelationships } = SEED;

const ANNA = '55555555-5555-4555-8555-000000000002';
const TOM = '55555555-5555-4555-8555-000000000006';
const STANDORT = '33333333-3333-4333-8333-000000000001';

/** Ein Kalendertag weit voraus - die Seed-Termine liegen heute. */
const TAG = tagInTagen(70);

interface TerminFelder {
  kind?: string;
  patient?: string | null;
  verhaeltnis?: string | null;
  grundlage?: string | null;
  titel?: string | null;
  art?: string;
  ort?: string | null;
  gruppe?: string | null;
  mitarbeiter?: string;
  beginn?: string;
  ende?: string;
  strasse?: string | null;
  hausnummer?: string | null;
  plz?: string | null;
  stadt?: string | null;
}

/**
 * Legt einen Termin unmittelbar an - ohne RPC, ohne Policy, ohne Oberflaeche.
 * Gibt die Kennung zurueck oder wirft die Meldung der Datenbank durch.
 */
async function termin(felder: TerminFelder = {}): Promise<string> {
  const {
    kind = 'training',
    patient = null,
    verhaeltnis = kind === 'training' ? trainingRelationships.tina : null,
    grundlage = null,
    titel = null,
    art = 'practice',
    ort = art === 'practice' ? STANDORT : null,
    // Ein Ereignis traegt seit CAL-017 immer eine Gruppenkennung; ohne sie
    // spraeche `appointments_event_group` zuerst und verdeckte, was der Test
    // eigentlich prueft.
    gruppe = kind === 'event' ? '77777777-7777-4777-8777-0000000000e1' : null,
    mitarbeiter = TOM,
    beginn = '09:00',
    ende = '10:00',
    strasse = art === 'home_visit' ? 'Beispielstrasse' : null,
    hausnummer = art === 'home_visit' ? '12' : null,
    plz = art === 'home_visit' ? '72070' : null,
    stadt = art === 'home_visit' ? 'Tuebingen' : null,
  } = felder;

  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, training_relationship_id, treatment_basis_id,
       staff_member_id, location_id, appointment_type, kind, title, event_group_id,
       starts_at, ends_at,
       visit_street, visit_house_number, visit_postal_code, visit_city
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       ($11::date + $12::time) at time zone 'Europe/Berlin',
       ($11::date + $13::time) at time zone 'Europe/Berlin',
       $14, $15, $16, $17
     ) returning id`,
    [
      organizationId,
      patient,
      verhaeltnis,
      grundlage,
      mitarbeiter,
      ort,
      art,
      kind,
      titel,
      gruppe,
      TAG,
      beginn,
      ende,
      strasse,
      hausnummer,
      plz,
      stadt,
    ],
  );
  return rows[0]!.id;
}

describe('Terminkontext', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  describe('Eine Spalte, drei Kontexte (ADR-022 Punkt 2)', () => {
    it('laesst genau drei Werte zu und keinen vierten', async () => {
      const { rows } = await asPostgres<{ definition: string }>(
        `select pg_get_constraintdef(oid) as definition
           from pg_constraint
          where conrelid = 'public.appointments'::regclass
            and conname  = 'appointments_kind_values'`,
      );
      expect(rows[0]?.definition).toContain("'treatment'");
      expect(rows[0]?.definition).toContain("'event'");
      expect(rows[0]?.definition).toContain("'training'");

      // Einen vierten Wert nimmt die Tabelle nicht an. Welche der beiden
      // Constraints dabei zuerst spricht, ist offen - `kind_fields` zaehlt die
      // drei Zweige ebenfalls auf und faellt schon dort durch.
      await expect(termin({ kind: 'coaching' })).rejects.toThrow(
        /appointments_kind_(values|fields)/,
      );
    });

    it('fuehrt kein zweites Feld neben der Terminart', async () => {
      // Zwei Spalten ueber dieselbe Sache sind zwei Wahrheiten, sobald eine
      // von beiden falsch gesetzt wird (ADR-022, "Verworfen").
      const { rows } = await asPostgres<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'appointments'
            and column_name in ('context', 'appointment_context', 'service_area')`,
      );
      expect(rows).toEqual([]);
    });
  });

  describe('Der Kontext entscheidet ueber das Verhaeltnis (ADR-022 Punkt 3)', () => {
    it('traegt einen Trainingstermin am Trainingsverhaeltnis', async () => {
      const id = await termin();
      const { rows } = await asPostgres<{ kind: string; rel: string; pat: string | null }>(
        `select kind, training_relationship_id as rel, patient_id as pat
           from public.appointments where id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({
        kind: 'training',
        rel: trainingRelationships.tina,
        pat: null,
      });
    });

    it('verweigert einen Trainingstermin ohne Verhaeltnis', async () => {
      await expect(termin({ verhaeltnis: null })).rejects.toThrow(/appointments_kind_fields/);
    });

    it('verweigert einen Trainingstermin mit Patient:in', async () => {
      await expect(termin({ patient: patients.erika })).rejects.toThrow(/appointments_kind_fields/);
    });

    it('verweigert einen Termin, der beide Verhaeltnisse traegt', async () => {
      // Erika hat beide - genau deshalb ist sie der Fall, an dem sich zeigt,
      // dass nach Rechtsverhaeltnis getrennt wird und nicht nach Person
      // (ADR-021 Punkt 1).
      await expect(
        termin({ patient: patients.erika, verhaeltnis: trainingRelationships.erika }),
      ).rejects.toThrow(/appointments_kind_fields/);
    });

    it('verweigert einen Behandlungstermin am Trainingsverhaeltnis', async () => {
      await expect(
        termin({
          kind: 'treatment',
          patient: patients.erika,
          verhaeltnis: trainingRelationships.erika,
          mitarbeiter: ANNA,
        }),
      ).rejects.toThrow(/appointments_kind_fields/);
    });

    it('verweigert einem internen Termin jedes Gegenueber', async () => {
      await expect(
        termin({
          kind: 'event',
          titel: 'Teambesprechung',
          verhaeltnis: trainingRelationships.tina,
        }),
      ).rejects.toThrow(/appointments_kind_fields/);
    });

    it('verweigert einem Trainingstermin einen Titel', async () => {
      // Der Titel gehoert dem internen Ereignis. Ein Trainingstermin haette
      // mit ihm ein Freitextfeld neben einem Verhaeltnis - und damit genau
      // die Stelle, an der spaeter ein Gesundheitsdatum landet.
      await expect(termin({ titel: 'Personal Training' })).rejects.toThrow(
        /appointments_kind_fields/,
      );
    });

    it('haelt die Mandantengrenze ueber den zusammengesetzten Fremdschluessel', async () => {
      // Ein Termin der einen Praxis darf nicht auf ein Verhaeltnis der
      // anderen zeigen (ADR-003). Das haelt der Fremdschluessel selbst und
      // kein Schreibweg - deshalb haelt es auch fuer den Schreibweg, den es
      // noch nicht gibt.
      const fremd = await fremdeOrganisation();
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.training_relationships (organization_id, person_id, status)
         values ($1, $2, 'active') returning id`,
        [fremd.organizationId, fremd.personPatient],
      );
      await expect(termin({ verhaeltnis: rows[0]!.id })).rejects.toThrow(
        /appointments_training_relationship_fkey/,
      );
    });
  });

  describe('Kein Trainingstermin an der Behandlungsgrundlage (ADR-022 Punkt 4)', () => {
    it('verweigert die Verknuepfung ausserhalb von therapy', async () => {
      // Die Behandlungsgrundlage steht in der Datenklasse "klinische
      // Patientenakte" mit zehn Jahren Aufbewahrung (ADR-020 Punkt 4); ein
      // Trainingstermin, der auf sie zeigt, truege Training in die Akte.
      const { rows } = await asPostgres<{ id: string }>(
        `select id from public.treatment_bases where patient_id = $1 limit 1`,
        [patients.max],
      );
      expect(rows[0]?.id).toBeTruthy();

      await expect(termin({ grundlage: rows[0]!.id })).rejects.toThrow(/appointments_kind_fields/);
    });
  });

  describe('Der Kanal bleibt eine eigene Dimension (ADR-022 Punkt 9)', () => {
    it('laesst alle drei Kanaele am Trainingstermin zu', async () => {
      // Online Coaching ist ein Trainingstermin ueber Video, Personal
      // Training zu Hause einer als Hausbesuch - deshalb reicht `video` als
      // Unterscheidung nicht.
      await expect(termin({ art: 'practice' })).resolves.toBeTruthy();
      await expect(termin({ art: 'video', beginn: '11:00', ende: '12:00' })).resolves.toBeTruthy();
      await expect(
        termin({ art: 'home_visit', beginn: '13:00', ende: '14:00' }),
      ).resolves.toBeTruthy();
    });

    it('laesst dem internen Termin weiterhin keinen Hausbesuch', async () => {
      await expect(
        termin({ kind: 'event', titel: 'Teambesprechung', art: 'home_visit' }),
      ).rejects.toThrow(/appointments_event_type/);
    });
  });

  describe('Der Kontext steht mit dem Anlegen fest (ADR-022 Punkt 10)', () => {
    it('laesst den Kontext nicht wechseln', async () => {
      const id = await termin();
      await expect(
        asPostgres(`update public.appointments set kind = 'treatment' where id = $1`, [id]),
      ).rejects.toThrow(/appointment context cannot be changed/);
    });

    it('laesst das Verhaeltnis dahinter nicht wechseln', async () => {
      const id = await termin();
      await expect(
        asPostgres(`update public.appointments set training_relationship_id = $2 where id = $1`, [
          id,
          trainingRelationships.erika,
        ]),
      ).rejects.toThrow(/training relationship cannot be changed/);
    });
  });

  describe('Der Gebuehrenanlass bleibt bei der Behandlung (ADR-022, offene Folgefrage)', () => {
    it('laesst an einem Trainingstermin keinen fee_basis zu', async () => {
      // Ob der Anlass aus ADR-018 Punkt 8 auch im Dienstvertrag ueber
      // Training entsteht, ist eine Vertrags- und AGB-Frage; bis sie
      // beantwortet ist, gilt die Regel unveraendert nur fuer die Behandlung.
      const id = await termin();
      await expect(
        asPostgres(
          `update public.appointments
              set status = 'no_show', no_show_recorded_at = now(),
                  no_show_recorded_by = null, fee_basis = 'no_show'
            where id = $1`,
          [id],
        ),
      ).rejects.toThrow(/appointments_(fee_basis_values|no_show_fields)/);
    });
  });
});
