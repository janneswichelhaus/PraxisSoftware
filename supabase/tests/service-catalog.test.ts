import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Der Leistungskatalog (ABR-001).
 *
 * Drei Zusagen stehen hier im Mittelpunkt:
 *
 *   * **Eine veroeffentlichte Preisliste ist unveraenderlich.** Nicht nur ueber
 *     den Schreibpfad - die Sperre sitzt am Trigger und gilt deshalb auch fuer
 *     einen direkten Zugriff (ADR-009 Punkt 5).
 *   * **Preisbildung ist Sache des owner.** Lesen duerfen alle vier
 *     Praxisrollen, aendern niemand sonst (ANN-071, PROJECT_PRINCIPLES.md 4.1).
 *   * **Welcher Preis galt** hat fuer jeden Stichtag genau eine Antwort.
 */

const { users, organizationId } = SEED;

/** Preislisten aus supabase/seed.sql. */
const KATALOG = {
  /** Veroeffentlicht, gueltig ab 2026-01-01, acht Positionen. */
  veroeffentlicht: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  /** Entwurf ab 2027-01-01, zwei Positionen. */
  entwurf: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002',
} as const;

const ANLEGEN = 'select public.create_service_catalog_version($1::text, $2::date, $3::uuid) as id';
const POSITIONEN = 'select public.write_service_catalog_items($1::uuid, $2::jsonb) as anzahl';
const VEROEFFENTLICHEN = 'select public.publish_service_catalog_version($1::uuid) as id';
const VERWERFEN = 'select public.delete_service_catalog_version($1::uuid)';
const GUELTIG = 'select app.active_service_catalog_version($1::uuid, $2::date) as id';

interface Position {
  code: string;
  label: string;
  item_kind?: string;
  remedy?: string | null;
  unit_price_cents: number;
  tax_treatment?: string;
  tax_rate_permille?: number;
}

const EINE_POSITION: Position[] = [
  {
    code: 'KG',
    label: 'Krankengymnastik',
    item_kind: 'treatment',
    remedy: 'Krankengymnastik',
    unit_price_cents: 5000,
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
  },
];

async function entwurfAnlegen(
  label = 'Testpreisliste',
  gueltigAb = '2030-01-01',
  kopieVon: string | null = null,
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, ANLEGEN, [
    label,
    gueltigAb,
    kopieVon,
  ]);
  return rows[0]!.id;
}

describe('Leistungskatalog', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    // Die Sperre am Trigger gilt auch hier: zum Aufraeumen wird sie eng
    // begrenzt ausgesetzt, damit ein Test eine veroeffentlichte Liste
    // hinterlassen darf.
    await asPostgres(
      'alter table public.service_catalog_items    disable trigger service_catalog_items_frozen',
    );
    await asPostgres(
      'alter table public.service_catalog_versions disable trigger service_catalog_versions_frozen',
    );
    await asPostgres(
      'delete from public.service_catalog_items    where catalog_version_id <> all($1::uuid[])',
      [[KATALOG.veroeffentlicht, KATALOG.entwurf]],
    );
    await asPostgres('delete from public.service_catalog_versions where id <> all($1::uuid[])', [
      [KATALOG.veroeffentlicht, KATALOG.entwurf],
    ]);
    await asPostgres(
      'alter table public.service_catalog_items    enable trigger service_catalog_items_frozen',
    );
    await asPostgres(
      'alter table public.service_catalog_versions enable trigger service_catalog_versions_frozen',
    );
    await asPostgres("delete from public.audit_log where action like 'service_catalog.%'");
  });

  describe('Wer liest und wer pflegt', () => {
    it('laesst alle vier Praxisrollen die Preisliste lesen', async () => {
      for (const konto of [users.ownerTherapist, users.therapist, users.teamLead, users.office]) {
        const { rows } = await asUser(
          konto,
          'select id from public.service_catalog_versions order by valid_from',
        );
        expect(rows).toHaveLength(2);
      }
    });

    it('zeigt einem Patientenkonto nichts', async () => {
      const { rows } = await asUser(
        users.patientMax,
        'select id from public.service_catalog_items',
      );
      expect(rows).toHaveLength(0);
    });

    it('zeigt ohne Anmeldung nichts', async () => {
      // Kein Leserecht statt leerer Ergebnismenge: `anon` hat auf keine der
      // beiden Tabellen ein Tabellenrecht (deny by default).
      await expect(asAnon('select id from public.service_catalog_versions')).rejects.toThrow(
        /permission denied/,
      );
    });

    it('laesst ausser dem owner niemanden eine Preisliste anlegen', async () => {
      for (const konto of [users.therapist, users.teamLead, users.office]) {
        await expect(asUser(konto, ANLEGEN, ['Versuch', '2030-01-01', null])).rejects.toThrow(
          /not allowed to manage the service catalog/,
        );
      }
    });

    it('laesst das Office keine Position schreiben', async () => {
      await expect(
        asUser(users.office, POSITIONEN, [KATALOG.entwurf, JSON.stringify(EINE_POSITION)]),
      ).rejects.toThrow(/not allowed to manage the service catalog/);
    });
  });

  describe('Entwurf und Veroeffentlichung', () => {
    it('legt an, befuellt, veroeffentlicht - und friert dabei ein', async () => {
      const id = await entwurfAnlegen();

      const { rows: geschrieben } = await asUserCommitted<{ anzahl: number }>(
        users.ownerTherapist,
        POSITIONEN,
        [id, JSON.stringify(EINE_POSITION)],
      );
      expect(Number(geschrieben[0]!.anzahl)).toBe(1);

      await asUserCommitted(users.ownerTherapist, VEROEFFENTLICHEN, [id]);

      const { rows } = await asUser<{ published_at: string | null }>(
        users.ownerTherapist,
        'select published_at from public.service_catalog_versions where id = $1',
        [id],
      );
      expect(rows[0]!.published_at).not.toBeNull();
    });

    it('weist eine Preisliste ohne Positionen zurueck', async () => {
      const id = await entwurfAnlegen();
      await expect(asUser(users.ownerTherapist, VEROEFFENTLICHEN, [id])).rejects.toThrow(
        /has no items/,
      );
    });

    it('uebernimmt beim Kopieren alle Positionen der Vorlage', async () => {
      const id = await entwurfAnlegen('Kopie 2028', '2028-01-01', KATALOG.veroeffentlicht);

      const { rows } = await asUser<{ anzahl: string }>(
        users.ownerTherapist,
        'select count(*) as anzahl from public.service_catalog_items where catalog_version_id = $1',
        [id],
      );
      // Neun Positionen seit ABR-009: acht im Behandlungsbereich, eine im
      // Training. Die Kopie nimmt den Bereich mit.
      expect(Number(rows[0]!.anzahl)).toBe(9);
    });

    it('legt keine leere Preisliste an, wenn die Vorlage nicht existiert', async () => {
      await expect(
        asUser(users.ownerTherapist, ANLEGEN, [
          'Kopie ins Leere',
          '2031-01-01',
          '00000000-0000-4000-8000-000000000000',
        ]),
      ).rejects.toThrow(/copy source has no items/);
    });

    it('ersetzt die Positionen eines Entwurfs vollstaendig', async () => {
      const id = await entwurfAnlegen();
      await asUserCommitted(users.ownerTherapist, POSITIONEN, [
        id,
        JSON.stringify([...EINE_POSITION, { ...EINE_POSITION[0]!, code: 'MT', remedy: null }]),
      ]);
      const { rows } = await asUserCommitted<{ anzahl: number }>(users.ownerTherapist, POSITIONEN, [
        id,
        JSON.stringify(EINE_POSITION),
      ]);
      expect(Number(rows[0]!.anzahl)).toBe(1);
    });

    it('verwirft einen Entwurf samt Positionen', async () => {
      const id = await entwurfAnlegen();
      await asUserCommitted(users.ownerTherapist, POSITIONEN, [id, JSON.stringify(EINE_POSITION)]);
      await asUserCommitted(users.ownerTherapist, VERWERFEN, [id]);

      const { rows } = await asUser(
        users.ownerTherapist,
        'select id from public.service_catalog_items where catalog_version_id = $1',
        [id],
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('Unveraenderlich ab dem Veroeffentlichen', () => {
    it('weist eine Aenderung an der veroeffentlichten Liste ueber den Schreibpfad ab', async () => {
      await expect(
        asUser(users.ownerTherapist, POSITIONEN, [
          KATALOG.veroeffentlicht,
          JSON.stringify(EINE_POSITION),
        ]),
      ).rejects.toThrow(/immutable/);

      await expect(
        asUser(users.ownerTherapist, VERWERFEN, [KATALOG.veroeffentlicht]),
      ).rejects.toThrow(/immutable/);

      await expect(
        asUser(users.ownerTherapist, 'select public.update_service_catalog_version($1, $2, $3)', [
          KATALOG.veroeffentlicht,
          'Neuer Name',
          '2026-01-01',
        ]),
      ).rejects.toThrow(/immutable/);
    });

    it('weist auch den direkten Zugriff ab - die Sperre sitzt am Trigger', async () => {
      await expect(
        asPostgres(
          'update public.service_catalog_items set unit_price_cents = 1 where catalog_version_id = $1',
          [KATALOG.veroeffentlicht],
        ),
      ).rejects.toThrow(/immutable/);

      await expect(
        asPostgres('delete from public.service_catalog_items where catalog_version_id = $1', [
          KATALOG.veroeffentlicht,
        ]),
      ).rejects.toThrow(/immutable/);

      await expect(
        asPostgres('update public.service_catalog_versions set label = $2 where id = $1', [
          KATALOG.veroeffentlicht,
          'Umbenannt',
        ]),
      ).rejects.toThrow(/immutable/);
    });

    it('laesst den einen Uebergang zu, der das Einfrieren selbst ist', async () => {
      const id = await entwurfAnlegen();
      await asUserCommitted(users.ownerTherapist, POSITIONEN, [id, JSON.stringify(EINE_POSITION)]);
      await expect(
        asUserCommitted(users.ownerTherapist, VEROEFFENTLICHEN, [id]),
      ).resolves.toBeDefined();
      await expect(asUser(users.ownerTherapist, VEROEFFENTLICHEN, [id])).rejects.toThrow(
        /already published/,
      );
    });
  });

  describe('Preis, Waehrung und Steuer', () => {
    it('haelt Steuerkennzeichen und Satz zusammen', async () => {
      const id = await entwurfAnlegen();

      await expect(
        asUser(users.ownerTherapist, POSITIONEN, [
          id,
          JSON.stringify([
            { ...EINE_POSITION[0]!, tax_treatment: 'exempt_healthcare', tax_rate_permille: 190 },
          ]),
        ]),
      ).rejects.toThrow(/tax_rate_matches_treatment/);

      await expect(
        asUser(users.ownerTherapist, POSITIONEN, [
          id,
          JSON.stringify([
            { ...EINE_POSITION[0]!, tax_treatment: 'taxable', tax_rate_permille: 0 },
          ]),
        ]),
      ).rejects.toThrow(/tax_rate_matches_treatment/);
    });

    it('haelt ein Ausfallhonorar von einem Heilmittel frei', async () => {
      const id = await entwurfAnlegen();
      await expect(
        asUser(users.ownerTherapist, POSITIONEN, [
          id,
          JSON.stringify([
            { ...EINE_POSITION[0]!, item_kind: 'absence_fee', remedy: 'Krankengymnastik' },
          ]),
        ]),
      ).rejects.toThrow(/absence_fee_without_remedy/);
    });

    it('vergibt ein Heilmittel je Preisliste nur einmal', async () => {
      const id = await entwurfAnlegen();
      await expect(
        asUser(users.ownerTherapist, POSITIONEN, [
          id,
          JSON.stringify([EINE_POSITION[0]!, { ...EINE_POSITION[0]!, code: 'KG2' }]),
        ]),
      ).rejects.toThrow(/version_remedy_key/);
    });

    it('speichert Preise als ganze Cent in Euro', async () => {
      const { rows } = await asUser<{ unit_price_cents: number; currency: string }>(
        users.office,
        'select unit_price_cents, currency from public.service_catalog_items where code = $1 and catalog_version_id = $2',
        ['KG', KATALOG.veroeffentlicht],
      );
      expect(rows[0]).toEqual({ unit_price_cents: 4500, currency: 'EUR' });
    });
  });

  describe('Welche Preisliste galt', () => {
    it('nimmt die veroeffentlichte mit dem groessten Beginn bis zum Stichtag', async () => {
      const gueltig = async (tag: string) =>
        (await asUser<{ id: string | null }>(users.office, GUELTIG, [organizationId, tag])).rows[0]!
          .id;

      expect(await gueltig('2026-06-01')).toBe(KATALOG.veroeffentlicht);
      // Vor dem Beginn der ersten Liste gibt es keine.
      expect(await gueltig('2025-12-31')).toBeNull();
      // Der Entwurf gilt nicht, auch nicht nach seinem Beginn.
      expect(await gueltig('2027-06-01')).toBe(KATALOG.veroeffentlicht);
    });
  });

  describe('Auditspur', () => {
    it('protokolliert Anlegen, Befuellen, Veroeffentlichen und Verwerfen', async () => {
      const id = await entwurfAnlegen();
      await asUserCommitted(users.ownerTherapist, POSITIONEN, [id, JSON.stringify(EINE_POSITION)]);
      await asUserCommitted(users.ownerTherapist, VEROEFFENTLICHEN, [id]);

      const zweite = await entwurfAnlegen('Zum Verwerfen', '2032-01-01');
      await asUserCommitted(users.ownerTherapist, VERWERFEN, [zweite]);

      // Das Auditlog hat keinen Tabellenlesepfad (ADR-010 Fassung 2); geprueft
      // wird deshalb an der Tabelle selbst.
      const { rows } = await asPostgres<{ action: string; subject_type: string }>(
        "select action, subject_type from public.audit_log where action like 'service_catalog.%' order by occurred_at",
      );
      expect(rows.map((zeile) => zeile.action)).toEqual([
        'service_catalog.version_created',
        'service_catalog.version_updated',
        'service_catalog.version_published',
        'service_catalog.version_created',
        'service_catalog.version_deleted',
      ]);
      expect(new Set(rows.map((zeile) => zeile.subject_type))).toEqual(
        new Set(['service_catalog_version']),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Mandantengrenze (ADR-003, R3-025)
  // ---------------------------------------------------------------------------
  describe('Fremde Organisation', () => {
    it('sieht die Preisliste der Testpraxis nicht und veroeffentlicht sie nicht', async () => {
      const fremd = await fremdeOrganisation();

      expect(
        (await asUser(fremd.owner, 'select * from public.service_catalog_versions')).rows,
      ).toEqual([]);
      expect(
        (await asUser(fremd.owner, 'select * from public.service_catalog_items')).rows,
      ).toEqual([]);
      await expect(asUser(fremd.owner, VEROEFFENTLICHEN, [KATALOG.entwurf])).rejects.toThrow();
      await expect(asUser(fremd.owner, VERWERFEN, [KATALOG.entwurf])).rejects.toThrow();
    });
  });
});
