import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asPostgres,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';
import {
  erwarteAbweisungMitEintrag,
  erwarteErlaubtOhneSpur,
  erwarteNeinOhneSpur,
  erwarteOhneSitzungAbgewiesen,
  erwartePlattformAbgewiesen,
  erwartePrueffunktion,
  gefragt,
  legeTerminAn,
  type Pruefpfad,
} from './helpers/pruefpfad';

// Darf diese Person Notizen zu diesem Termin vom AI Gateway ordnen lassen (ANN-861)? Positivfall
// ist die Therapeut:in am Behandlungstermin ihrer Praxis; dazu die Negativfälle aus ADR-013
// Punkt 9 Nr. 1 und die Zustände, zu denen keine Behandlung dokumentiert wird.

const { users, patients } = SEED;

const PFAD: Pruefpfad = {
  sql: 'select public.check_note_arrangement_access($1::uuid) as erlaubt',
  signatur: 'public.check_note_arrangement_access(uuid)',
  name: 'check_note_arrangement_access',
  operation: 'treatment_note.arranged',
  meldung: /not allowed to arrange treatment documentation/,
};

const UNBEKANNT = '77777777-7777-4777-8777-0000000000ff';

describe('check_note_arrangement_access', () => {
  let behandlung: string;

  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.appointments');
    behandlung = await legeTerminAn({ stunde: 8 });
  });

  describe('erlaubt', () => {
    it('den therapeutischen Rollen am Behandlungstermin ihrer Praxis', async () => {
      for (const konto of [users.therapist, users.teamLead, users.ownerTherapist]) {
        expect(await gefragt(PFAD, konto, [behandlung])).toBe(true);
      }
    });

    it('auch nach dem Abschluss des Termins - dokumentiert wird oft danach', async () => {
      const abgeschlossen = await legeTerminAn({ stunde: 10, status: 'completed' });
      expect(await gefragt(PFAD, users.therapist, [abgeschlossen])).toBe(true);
    });

    it('ohne Zeile im Auditlog', async () => {
      await erwarteErlaubtOhneSpur(PFAD, users.therapist, [behandlung]);
    });
  });

  describe('Rolle ohne Recht', () => {
    it.each([
      ['Office', users.office],
      ['Trainingsbetreuung', users.trainer],
      // Profil in der Praxis, aber keine Praxisrolle (ADR-023 Punkt 20).
      ['ein Konto ohne Praxisrolle', users.patientMax],
    ])('weist %s mit false und einem bestätigten Abweisungseintrag ab', async (_rolle, konto) => {
      await erwarteAbweisungMitEintrag(PFAD, konto, [behandlung]);
    });
  });

  describe('Plattform', () => {
    it('weist ein Plattformkonto am Termin der eigenen Behandlung ab', async () => {
      const eigener = await legeTerminAn({ stunde: 11, patient: patients.erika });
      await erwartePlattformAbgewiesen(PFAD, users.plattformErika, [eigener]);
    });

    it('weist ein Plattformkonto am Termin einer fremden Person ab', async () => {
      const fremderTermin = await legeTerminAn({ stunde: 12, patient: patients.erika });
      for (const konto of [users.plattformTina, users.plattformPaula]) {
        await erwartePlattformAbgewiesen(PFAD, konto, [fremderTermin]);
      }
    });
  });

  describe('andere Organisation', () => {
    it('kennt den Termin einer anderen Praxis nicht und schreibt keinen Eintrag', async () => {
      const fremd = await legeTerminAn({ stunde: 9, organisation: 'fremde' });
      await erwarteNeinOhneSpur(PFAD, users.therapist, [fremd]);
    });

    it('lässt die Therapeut:in der anderen Praxis nicht an den eigenen Termin', async () => {
      await asPostgres(
        `insert into public.user_roles (user_id, organization_id, role_key)
         values ($1, $2, 'therapist') on conflict do nothing`,
        [FREMDE_ORGANISATION.owner, FREMDE_ORGANISATION.organizationId],
      );
      const fremd = await legeTerminAn({ stunde: 9, organisation: 'fremde' });
      // Gegenprobe: In der eigenen Praxis darf sie.
      expect(await gefragt(PFAD, FREMDE_ORGANISATION.owner, [fremd])).toBe(true);
      expect(await gefragt(PFAD, FREMDE_ORGANISATION.owner, [behandlung])).toBe(false);
    });
  });

  describe('Termin ohne Behandlungsdokumentation', () => {
    it('weist einen Trainingstermin ab - anderer Leistungsbereich (ADR-021)', async () => {
      const training = await legeTerminAn({ stunde: 13, kind: 'training' });
      expect(await gefragt(PFAD, users.therapist, [training])).toBe(false);
      expect(await gefragt(PFAD, users.trainer, [training])).toBe(false);
    });

    it.each([
      ['abgesagt', 'cancelled'],
      ['nicht angetroffen', 'no_show'],
    ] as const)('weist einen Termin ab, der %s ist', async (_name, status) => {
      const termin = await legeTerminAn({ stunde: 14, status });
      expect(await gefragt(PFAD, users.therapist, [termin])).toBe(false);
    });

    it('weist ein Ereignis des Praxisbetriebs ab', async () => {
      const ereignis = await legeTerminAn({ stunde: 15, kind: 'internal' });
      expect(await gefragt(PFAD, users.therapist, [ereignis])).toBe(false);
    });

    it('weist eine unbekannte oder fehlende Kennung ab', async () => {
      expect(await gefragt(PFAD, users.therapist, [UNBEKANNT])).toBe(false);
      expect(await gefragt(PFAD, users.therapist, [null])).toBe(false);
    });
  });

  it('weist ohne Anmeldung, ohne Konto im Token und mit gesperrter Sitzung ab', async () => {
    await erwarteOhneSitzungAbgewiesen(PFAD, users.therapist, [behandlung]);
  });

  it('ist nur für authenticated ausführbar und läuft als SECURITY DEFINER', async () => {
    await erwartePrueffunktion(PFAD);
  });
});
