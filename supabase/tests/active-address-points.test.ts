import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, fremdeOrganisation, resetDatabase } from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

// Planungskarte auf „Gebietstage“ (ANN-835): Zahl je Postleitzahl und gerundetem Punkt, ohne Namen.
const { users, patients } = SEED;

const PUNKTE = 'select * from public.list_active_address_points()';

interface Punkt {
  postal_code: string;
  lat: string | null;
  lon: string | null;
  addresses: number;
}

async function punkte(konto: string = users.ownerTherapist): Promise<Punkt[]> {
  const { rows } = await asUser<Punkt>(
    konto,
    `select postal_code, lat::text as lat, lon::text as lon, addresses
       from public.list_active_address_points()`,
  );
  return rows;
}

async function anschrift(
  patientId: string,
  plz: string | null,
  lat: number | null,
  lon: number | null,
  genauigkeit: string | null,
): Promise<void> {
  // Zwei Schritte: Eine neue Anschrift nimmt die alte Koordinate mit (drop_coordinate_on_address_change).
  await asPostgres(
    `update public.patient_contact_details
        set postal_code = $2, lat = null, lon = null, geocode_precision = null
      where patient_id = $1`,
    [patientId, plz],
  );
  await asPostgres(
    `update public.patient_contact_details set lat = $2, lon = $3, geocode_precision = $4
      where patient_id = $1`,
    [patientId, lat, lon, genauigkeit],
  );
}

async function abschliessen(patientId: string): Promise<void> {
  await asPostgres(
    `update public.patients
        set care_concluded_on = current_date, care_concluded_at = now(), care_concluded_by = $2
      where id = $1`,
    [patientId, users.ownerTherapist],
  );
}

describe('Planungskarte der aktiven Anschriften (PRX-045)', () => {
  beforeEach(async () => {
    await resetDatabase();
    // Max und Erika liegen keine 100 m auseinander und fallen auf denselben Punkt.
    await anschrift(patients.max, '72070', 48.53012, 9.04904, 'address');
    await anschrift(patients.erika, '72070', 48.53049, 9.04851, 'address');
    await anschrift(patients.petra, '72074', 48.5387, 9.0668, 'street');
  });

  describe('Was gezählt wird', () => {
    it('zählt laufende Behandlungen je Postleitzahl und auf drei Stellen gerundetem Punkt', async () => {
      expect(await punkte()).toEqual([
        { postal_code: '72070', lat: '48.530', lon: '9.049', addresses: 2 },
        { postal_code: '72074', lat: '48.539', lon: '9.067', addresses: 1 },
      ]);
    });

    it('lässt eine abgeschlossene Behandlung weg', async () => {
      await abschliessen(patients.petra);
      expect(await punkte()).toEqual([
        { postal_code: '72070', lat: '48.530', lon: '9.049', addresses: 2 },
      ]);
    });

    it('führt eine Anschrift ohne genaue Verortung ohne Punkt, aber mit Postleitzahl', async () => {
      // Ein Treffer nur auf den Ort stünde als Punkt in der Ortsmitte.
      await anschrift(patients.petra, '72074', 48.5216, 9.0576, 'locality');
      await anschrift(patients.erika, '72074', null, null, null);
      expect(await punkte()).toEqual([
        { postal_code: '72070', lat: '48.530', lon: '9.049', addresses: 1 },
        { postal_code: '72074', lat: null, lon: null, addresses: 2 },
      ]);
    });

    it('lässt eine Anschrift ohne Postleitzahl weg', async () => {
      await anschrift(patients.erika, null, null, null, null);
      expect((await punkte()).reduce((summe, p) => summe + p.addresses, 0)).toBe(2);
    });

    it('liefert nur Postleitzahl, Breite, Länge und Zahl - keinen Namen, keine Kennung', async () => {
      const { rows } = await asUser<Record<string, unknown>>(users.office, PUNKTE);
      expect(Object.keys(rows[0]!).sort()).toEqual(['addresses', 'lat', 'lon', 'postal_code']);
    });
  });

  describe('Wer die Punkte sieht', () => {
    it('zeigt sie owner, Teamleitung und Büro und weist alle anderen protokolliert ab', async () => {
      for (const konto of [users.ownerTherapist, users.teamLead, users.office]) {
        expect(await punkte(konto)).toHaveLength(2);
      }
      for (const konto of [users.therapist, users.trainer, users.patientMax, users.patientErika]) {
        await erwarteAbgewiesenenLeseversuch(konto, PUNKTE, [], 'address_points.read');
      }
      await expect(asUser(null, PUNKTE)).rejects.toThrow(/not authenticated/);
      await expect(asAnon(PUNKTE)).rejects.toThrow(/permission denied/i);
    });

    it('weist Plattformkonten ab - auch eine Begleitung sieht keine Anschriften (fremde Person)', async () => {
      // Ohne Praxisprofil gibt es kein Protokoll der Praxis, in das der Versuch gehörte.
      for (const konto of [users.plattformTina, users.plattformErika, users.plattformPaula]) {
        await expect(asUser(konto, PUNKTE)).rejects.toThrow(/not allowed to read address points/);
      }
    });

    it('endet an der Organisationsgrenze', async () => {
      const fremd = await fremdeOrganisation();
      await asPostgres(
        `insert into public.patient_contact_details
           (patient_id, organization_id, street, house_number, postal_code, city, lat, lon, geocode_precision)
         values ($1, $2, 'Fremdweg', '1', '10115', 'Berlin', 52.5321, 13.3849, 'address')
         on conflict (patient_id) do update set postal_code = excluded.postal_code,
           lat = excluded.lat, lon = excluded.lon, geocode_precision = excluded.geocode_precision`,
        [fremd.patient, fremd.organizationId],
      );
      expect((await punkte()).map((p) => p.postal_code)).not.toContain('10115');
      expect(await punkte(fremd.owner)).toEqual([
        { postal_code: '10115', lat: '52.532', lon: '13.385', addresses: 1 },
      ]);
    });
  });
});
