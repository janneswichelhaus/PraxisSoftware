import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asPostgres,
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

// Darf diese Person aus diesem Foto vom AI Gateway Felder vorschlagen lassen (ANN-861)? Nur ein
// offener Verordnungsscan mit genau seiner Prüfsumme; nie ein Foto der Person (ADR-017 Punkt 39).
// Dazu die Negativfälle aus ADR-013 Punkt 9 Nr. 1.

const { users, patients, organizationId } = SEED;

const PFAD: Pruefpfad = {
  sql: 'select public.check_prescription_scan_access($1::uuid, $2) as erlaubt',
  signatur: 'public.check_prescription_scan_access(uuid, text)',
  name: 'check_prescription_scan_access',
  operation: 'patient_file.fields_proposed',
  meldung: /not allowed to propose prescription fields/,
};

const SUMME = 'a1'.repeat(32);
const ANDERE_SUMME = 'b2'.repeat(32);
const SCAN = '99999999-9999-4999-8999-000000000001';
const UNBEKANNT = '99999999-9999-4999-8999-0000000000ff';

interface Dateifelder {
  id: string;
  art?: string;
  mime?: string;
  status?: 'ready' | 'pending';
  grundlage?: string | null;
  organisation?: string;
  patient?: string;
}

/** Legt eine Dateizeile unmittelbar an - ohne Upload, ohne Policy. */
async function legeDateiAn({
  id,
  art = 'verordnungsscan',
  mime = 'image/jpeg',
  status = 'ready',
  grundlage = null,
  organisation = organizationId,
  patient = patients.erika,
}: Dateifelder): Promise<string> {
  await asPostgres(
    `insert into public.patient_files (id, organization_id, patient_id, treatment_basis_id,
       document_type, display_name, mime_type, byte_size, checksum_sha256, status, confirmed_at)
     values ($1, $2, $3, $4, $5, 'Synthetisch', $6, 1234, $7, $8,
             case when $8 = 'ready' then now() end)`,
    [id, organisation, patient, grundlage, art, mime, SUMME, status],
  );
  return id;
}

describe('check_prescription_scan_access', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.patient_files');
    await legeDateiAn({ id: SCAN });
  });

  describe('erlaubt', () => {
    it('den Rollen, die Grundlagen schreiben, am offenen Scan mit seiner Prüfsumme', async () => {
      for (const konto of [users.ownerTherapist, users.therapist, users.teamLead, users.office]) {
        expect(await gefragt(PFAD, konto, [SCAN, SUMME])).toBe(true);
      }
    });

    it('auch als PNG oder PDF', async () => {
      for (const [nummer, mime] of [
        [2, 'image/png'],
        [3, 'application/pdf'],
      ] as const) {
        const id = await legeDateiAn({ id: `99999999-9999-4999-8999-00000000000${nummer}`, mime });
        expect(await gefragt(PFAD, users.office, [id, SUMME])).toBe(true);
      }
    });

    it('ohne Zeile im Auditlog', async () => {
      await erwarteErlaubtOhneSpur(PFAD, users.office, [SCAN, SUMME]);
    });
  });

  describe('nur genau diese Bytes', () => {
    it('weist eine andere Prüfsumme ab - etwa ein anderes Bild unter der Kennung des Scans', async () => {
      await erwarteNeinOhneSpur(PFAD, users.office, [SCAN, ANDERE_SUMME]);
    });

    it('weist eine fehlende oder großgeschriebene Prüfsumme ab', async () => {
      expect(await gefragt(PFAD, users.office, [SCAN, null])).toBe(false);
      expect(await gefragt(PFAD, users.office, [SCAN, SUMME.toUpperCase()])).toBe(false);
    });
  });

  describe('nie ein Foto der Person, nie eine andere Datei', () => {
    it.each([
      ['Dokumentationsfoto', 'dokumentationsfoto'],
      ['Arbeitshilfe', 'patientenfoto'],
      ['Befund', 'befund'],
      ['Arztbrief', 'arztbrief'],
      ['klinisches Bild', 'klinisches_bild'],
    ])('weist ein %s ab, auch mit stimmender Prüfsumme', async (_name, art) => {
      const id = await legeDateiAn({ id: '99999999-9999-4999-8999-000000000010', art });
      await erwarteNeinOhneSpur(PFAD, users.therapist, [id, SUMME]);
    });

    it('weist einen Scan ab, der noch nicht bestätigt ist', async () => {
      const id = await legeDateiAn({
        id: '99999999-9999-4999-8999-000000000011',
        status: 'pending',
      });
      await erwarteNeinOhneSpur(PFAD, users.office, [id, SUMME]);
    });

    it('weist einen Scan ab, der schon an einer Grundlage hängt', async () => {
      const { rows } = await asPostgres<{ id: string }>(
        'select id from public.treatment_bases where patient_id = $1 limit 1',
        [patients.erika],
      );
      const id = await legeDateiAn({
        id: '99999999-9999-4999-8999-000000000012',
        grundlage: rows[0]!.id,
      });
      await erwarteNeinOhneSpur(PFAD, users.office, [id, SUMME]);
    });

    it('weist eine unbekannte oder fehlende Kennung ab', async () => {
      expect(await gefragt(PFAD, users.office, [UNBEKANNT, SUMME])).toBe(false);
      expect(await gefragt(PFAD, users.office, [null, SUMME])).toBe(false);
    });
  });

  describe('Rolle ohne Recht', () => {
    it.each([
      ['Trainingsbetreuung', users.trainer],
      // Profil in der Praxis, aber keine Praxisrolle (ADR-023 Punkt 20).
      ['ein Konto ohne Praxisrolle', users.patientErika],
    ])('weist %s mit false und einem bestätigten Abweisungseintrag ab', async (_rolle, konto) => {
      await erwarteAbweisungMitEintrag(PFAD, konto, [SCAN, SUMME]);
    });
  });

  describe('Plattform', () => {
    it('weist die Person am Scan ihrer eigenen Verordnung ab', async () => {
      await erwartePlattformAbgewiesen(PFAD, users.plattformErika, [SCAN, SUMME]);
    });

    it('weist ein Plattformkonto am Scan einer fremden Person ab', async () => {
      for (const konto of [users.plattformTina, users.plattformPaula]) {
        await erwartePlattformAbgewiesen(PFAD, konto, [SCAN, SUMME]);
      }
    });
  });

  describe('andere Organisation', () => {
    it('kennt den Scan einer anderen Praxis nicht und schreibt keinen Eintrag', async () => {
      const fremd = await legeDateiAn({
        id: '99999999-9999-4999-8999-000000000020',
        organisation: FREMDE_ORGANISATION.organizationId,
        patient: FREMDE_ORGANISATION.patient,
      });
      await erwarteNeinOhneSpur(PFAD, users.office, [fremd, SUMME]);
      // Gegenprobe: In der eigenen Praxis darf die Inhaberin der anderen.
      expect(await gefragt(PFAD, FREMDE_ORGANISATION.owner, [fremd, SUMME])).toBe(true);
      await erwarteNeinOhneSpur(PFAD, FREMDE_ORGANISATION.owner, [SCAN, SUMME]);
    });
  });

  it('weist ohne Anmeldung, ohne Konto im Token und mit gesperrter Sitzung ab', async () => {
    await erwarteOhneSitzungAbgewiesen(PFAD, users.office, [SCAN, SUMME]);
  });

  it('ist nur für authenticated ausführbar und läuft als SECURITY DEFINER', async () => {
    await erwartePrueffunktion(PFAD);
  });
});
