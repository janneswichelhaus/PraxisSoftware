import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asPostgres,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import {
  erwarteAbweisungMitEintrag,
  erwarteErlaubtOhneSpur,
  erwarteNeinOhneSpur,
  erwarteOhneSitzungAbgewiesen,
  erwartePlattformAbgewiesen,
  erwartePrueffunktion,
  gefragt,
  type Pruefpfad,
} from './helpers/pruefpfad';

// Darf diese Person eine Antwort auf diese Rückfrage vom AI Gateway umformen lassen (ANN-861)?
// Es gilt das Antwortrecht am Vorgang; dazu die Negativfälle aus ADR-013 Punkt 9 Nr. 1: Rolle
// ohne Recht, Plattformkonto, fremde Person, anderer Leistungsbereich, andere Organisation.

const { users, platformAccesses, trainingRelationships, organizationId } = SEED;

const PFAD: Pruefpfad = {
  sql: 'select public.check_answer_wording_access($1::uuid) as erlaubt',
  signatur: 'public.check_answer_wording_access(uuid)',
  name: 'check_answer_wording_access',
  operation: 'platform_message.answer_worded',
  meldung: /not allowed to word message answers/,
};

const FRAGEN = 'select public.start_platform_message($1::uuid, $2, $3, null, null) as id';
const erika = { konto: users.plattformErika, zugang: platformAccesses.erikaBehandlung };
const tina = { konto: users.plattformTina, zugang: platformAccesses.tinaTraining };
const UNBEKANNT = 'd1d1d1d1-d1d1-4d1d-8d1d-0000000000ff';

async function fragen(wer: { konto: string; zugang: string }, thema: string): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(wer.konto, FRAGEN, [
    wer.zugang,
    thema,
    'Synthetisch: eine Frage',
  ]);
  return rows[0]!.id;
}

describe('check_answer_wording_access', () => {
  let beschwerde: string;

  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
    // Gesundheitsangaben im Training brauchen ihre Einwilligung, sonst fragt Tina nicht.
    await asPostgres(
      `insert into public.training_consent_records
         (organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by)
       values ($1, $2, 'consent_granted', 'training_health_data', current_date, $3)`,
      [organizationId, trainingRelationships.tina, users.trainer],
    );
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.platform_messages');
    beschwerde = await fragen(erika, 'complaint');
  });

  describe('erlaubt, wem die Antwort zusteht', () => {
    it('den therapeutischen Rollen an einer Frage aus der Behandlung', async () => {
      for (const konto of [users.therapist, users.teamLead, users.ownerTherapist]) {
        expect(await gefragt(PFAD, konto, [beschwerde])).toBe(true);
      }
    });

    it('dem Büro an Termin, Rechnung und Sonstigem', async () => {
      const organisatorisch = await fragen(erika, 'organisational');
      const sonstiges = await fragen(tina, 'other');
      expect(await gefragt(PFAD, users.office, [organisatorisch])).toBe(true);
      expect(await gefragt(PFAD, users.office, [sonstiges])).toBe(true);
    });

    it('Inhaber:in und Trainingsbetreuung an einer Frage aus dem Training', async () => {
      const training = await fragen(tina, 'complaint');
      expect(await gefragt(PFAD, users.trainer, [training])).toBe(true);
      expect(await gefragt(PFAD, users.ownerTherapist, [training])).toBe(true);
    });

    it('auch nach der ersten Antwort, solange der Vorgang offen ist', async () => {
      await asUserCommitted(
        users.therapist,
        'select public.answer_platform_message($1::uuid, $2)',
        [beschwerde, 'Synthetisch: eine Antwort'],
      );
      expect(await gefragt(PFAD, users.therapist, [beschwerde])).toBe(true);
    });

    it('ohne Zeile im Auditlog', async () => {
      await erwarteErlaubtOhneSpur(PFAD, users.therapist, [beschwerde]);
    });
  });

  describe('Rolle ohne Recht', () => {
    it('weist das Büro an einer Beschwerde mit Abweisungseintrag ab (ANN-310)', async () => {
      await erwarteAbweisungMitEintrag(PFAD, users.office, [beschwerde]);
    });

    it('weist ein Konto ohne Praxisrolle mit Abweisungseintrag ab', async () => {
      await erwarteAbweisungMitEintrag(PFAD, users.patientMax, [beschwerde]);
    });
  });

  describe('anderer Leistungsbereich', () => {
    it('kennt für die Trainingsbetreuung keine Frage aus der Behandlung', async () => {
      await erwarteNeinOhneSpur(PFAD, users.trainer, [beschwerde]);
    });

    it('kennt für Therapeut:innen keine Frage aus dem Training', async () => {
      const training = await fragen(tina, 'other');
      await erwarteNeinOhneSpur(PFAD, users.therapist, [training]);
    });
  });

  describe('Plattform', () => {
    it('weist die Person an ihrer eigenen Rückfrage ab', async () => {
      await erwartePlattformAbgewiesen(PFAD, users.plattformErika, [beschwerde]);
    });

    it('weist ein Plattformkonto an der Rückfrage einer fremden Person ab', async () => {
      for (const konto of [users.plattformTina, users.plattformPaula]) {
        await erwartePlattformAbgewiesen(PFAD, konto, [beschwerde]);
      }
    });
  });

  describe('andere Organisation', () => {
    it('lässt die Inhaberin der anderen Praxis nicht an den Vorgang', async () => {
      await erwarteNeinOhneSpur(PFAD, FREMDE_ORGANISATION.owner, [beschwerde]);
    });

    it('kennt den Vorgang einer anderen Praxis nicht', async () => {
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.platform_messages
           (organization_id, relationship_kind, relationship_id, patient_id, topic, status,
            due_on, created_by)
         values ($1, 'treatment', $2, $2, 'complaint', 'open', current_date + 2, $3)
         returning id`,
        [
          FREMDE_ORGANISATION.organizationId,
          FREMDE_ORGANISATION.patient,
          FREMDE_ORGANISATION.owner,
        ],
      );
      // Gegenprobe: In der eigenen Praxis darf die Inhaberin.
      expect(await gefragt(PFAD, FREMDE_ORGANISATION.owner, [rows[0]!.id])).toBe(true);
      await erwarteNeinOhneSpur(PFAD, users.therapist, [rows[0]!.id]);
    });
  });

  describe('Vorgang ohne Antwort', () => {
    it('weist einen erledigten Vorgang ab', async () => {
      await asUserCommitted(
        users.therapist,
        'select public.close_platform_message_by_practice($1::uuid)',
        [beschwerde],
      );
      await erwarteNeinOhneSpur(PFAD, users.therapist, [beschwerde]);
    });

    it('weist eine unbekannte oder fehlende Kennung ab', async () => {
      expect(await gefragt(PFAD, users.therapist, [UNBEKANNT])).toBe(false);
      expect(await gefragt(PFAD, users.therapist, [null])).toBe(false);
    });
  });

  it('weist ohne Anmeldung, ohne Konto im Token und mit gesperrter Sitzung ab', async () => {
    await erwarteOhneSitzungAbgewiesen(PFAD, users.therapist, [beschwerde]);
  });

  it('ist nur für authenticated ausführbar und läuft als SECURITY DEFINER', async () => {
    await erwartePrueffunktion(PFAD);
  });
});
