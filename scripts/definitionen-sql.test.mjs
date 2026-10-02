import { describe, expect, it } from 'vitest';
import {
  fehlendeMigration,
  naechsterZeitstempel,
  pruefen,
  vorhandenerStand,
} from './definitionen-sql.mjs';

/**
 * Die Fragebogen-Definitionen als Migration (ABN-014, ANN-219): Keine Fassung
 * fehlt, und eine eingetragene Fassung ändert sich nie still.
 */
describe('definitionen-sql', () => {
  it('findet im Repository keine fehlende und keine geänderte Fassung', async () => {
    const { sql, fehler } = await pruefen();
    expect(fehler).toEqual([]);
    expect(sql).toBeNull();
  });

  const fassung = {
    datei: 'nrs.json',
    instrument: 'nrs_schmerz',
    version: '0.1.0',
    json: '{"a":1}',
    hash: 'a'.repeat(64),
  };

  it('erzeugt eine fehlende Fassung und die Körperbereiche', () => {
    const { sql, fehler } = fehlendeMigration([fassung], ['kopf'], vorhandenerStand([]));
    expect(fehler).toEqual([]);
    expect(sql).toContain(`-- definition nrs_schmerz@0.1.0 sha256:${'a'.repeat(64)}`);
    expect(sql).toContain(`('nrs_schmerz', '0.1.0', '{"a":1}'::jsonb);`);
    expect(sql).toContain("select array['kopf']::text[]");
  });

  it('weist eine geänderte, schon eingetragene Fassung ab', () => {
    const stand = vorhandenerStand([`-- definition nrs_schmerz@0.1.0 sha256:${'b'.repeat(64)}`]);
    const { fehler } = fehlendeMigration([fassung], [], stand);
    expect(fehler[0]).toMatch(/neue Version/);
  });

  it('maskiert Hochkommas im Inhalt', () => {
    const { sql } = fehlendeMigration(
      [{ ...fassung, json: `{"t":"Patient's"}` }],
      [],
      vorhandenerStand([]),
    );
    expect(sql).toContain(`'{"t":"Patient''s"}'::jsonb`);
  });

  it('legt die neue Migration hinter die jüngste', () => {
    expect(naechsterZeitstempel(['20261003101100_x.sql'], new Date('2026-10-02T10:00:00Z'))).toBe(
      '20261003101200',
    );
    expect(naechsterZeitstempel(['20200101000000_x.sql'], new Date('2026-10-02T10:00:00Z'))).toBe(
      '20261002100000',
    );
  });
});
