import { beforeAll, describe, expect, it } from 'vitest';
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
  type Pruefpfad,
} from './helpers/pruefpfad';

// Darf diese Person aus den Einträgen dieser Akte vom AI Gateway Sätze auswählen lassen
// (ANN-861)? Erlaubt ist, wer behandelt; dazu die Negativfälle aus ADR-013 Punkt 9 Nr. 1.
// Das Leserecht an der Dokumentation allein reicht nicht.

const { users, patients } = SEED;

const PFAD: Pruefpfad = {
  sql: 'select public.check_history_excerpt_access($1::uuid) as erlaubt',
  signatur: 'public.check_history_excerpt_access(uuid)',
  name: 'check_history_excerpt_access',
  operation: 'treatment_note.excerpted',
  meldung: /not allowed to excerpt treatment documentation/,
};

const UNBEKANNT = '66666666-6666-4666-8666-0000000000ff';

describe('check_history_excerpt_access', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    await fremdeOrganisation();
  }, 120_000);

  describe('erlaubt', () => {
    it('den therapeutischen Rollen an einer Akte ihrer Praxis', async () => {
      for (const konto of [users.therapist, users.teamLead, users.ownerTherapist]) {
        expect(await gefragt(PFAD, konto, [patients.max])).toBe(true);
      }
    });

    it('ohne Zeile im Auditlog', async () => {
      await erwarteErlaubtOhneSpur(PFAD, users.therapist, [patients.max]);
    });
  });

  describe('Rolle ohne Recht', () => {
    it.each([
      // Das Büro liest die Dokumentation, bereitet aber keine Sitzung vor.
      ['Office', users.office],
      ['Trainingsbetreuung', users.trainer],
      // Profil in der Praxis, aber keine Praxisrolle (ADR-023 Punkt 20).
      ['ein Konto ohne Praxisrolle', users.patientMax],
    ])('weist %s mit false und einem bestätigten Abweisungseintrag ab', async (_rolle, konto) => {
      await erwarteAbweisungMitEintrag(PFAD, konto, [patients.max]);
    });

    it('schreibt den Eintrag auch an einer Akte, die es nicht gibt', async () => {
      await erwarteAbweisungMitEintrag(PFAD, users.office, [UNBEKANNT]);
    });
  });

  describe('Plattform', () => {
    it('weist ein Plattformkonto an der eigenen Akte ab', async () => {
      await erwartePlattformAbgewiesen(PFAD, users.plattformErika, [patients.erika]);
    });

    it('weist ein Plattformkonto an der Akte einer fremden Person ab', async () => {
      for (const konto of [users.plattformTina, users.plattformPaula]) {
        await erwartePlattformAbgewiesen(PFAD, konto, [patients.erika]);
      }
    });
  });

  describe('andere Organisation', () => {
    it('kennt die Akte einer anderen Praxis nicht und schreibt keinen Eintrag', async () => {
      await erwarteNeinOhneSpur(PFAD, users.therapist, [FREMDE_ORGANISATION.patient]);
    });

    it('lässt die Therapeut:in der anderen Praxis nicht an die eigene Akte', async () => {
      await asPostgres(
        `insert into public.user_roles (user_id, organization_id, role_key)
         values ($1, $2, 'therapist') on conflict do nothing`,
        [FREMDE_ORGANISATION.owner, FREMDE_ORGANISATION.organizationId],
      );
      // Gegenprobe: In der eigenen Praxis darf sie.
      expect(await gefragt(PFAD, FREMDE_ORGANISATION.owner, [FREMDE_ORGANISATION.patient])).toBe(
        true,
      );
      await erwarteNeinOhneSpur(PFAD, FREMDE_ORGANISATION.owner, [patients.max]);
    });
  });

  it('weist eine unbekannte oder fehlende Kennung ab', async () => {
    expect(await gefragt(PFAD, users.therapist, [UNBEKANNT])).toBe(false);
    expect(await gefragt(PFAD, users.therapist, [null])).toBe(false);
  });

  it('weist ohne Anmeldung, ohne Konto im Token und mit gesperrter Sitzung ab', async () => {
    await erwarteOhneSitzungAbgewiesen(PFAD, users.therapist, [patients.max]);
  });

  it('ist nur für authenticated ausführbar und läuft als SECURITY DEFINER', async () => {
    await erwartePrueffunktion(PFAD);
  });
});
