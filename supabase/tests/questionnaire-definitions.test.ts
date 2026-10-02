import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { asPostgres, asUser, resetDatabase, SEED } from './helpers/db';
import { KOERPERBEREICHE } from '../../src/features/assessments/koerperschema';

/**
 * Die Fassungen der Fragebögen auf dem Server (ABN-014, BEF-101, ANN-219).
 *
 * Der Server prüft Antworten gegen dieselben Dateien wie die Anwendung. Die
 * Tabelle entsteht aus ihnen (scripts/definitionen-sql.mjs); dieser Test hält
 * beide deckungsgleich - jede Datei, auch im Archiv, liegt als Fassung vor,
 * mit demselben Inhalt, und keine Fassung ohne Datei.
 */

const SCORES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/features/assessments/definitionen/scores',
);

async function dateien(): Promise<{ id: string; version: string; inhalt: unknown }[]> {
  const ergebnis = [];
  for (const unter of ['', 'archiv']) {
    let namen: string[] = [];
    try {
      namen = await readdir(path.join(SCORES, unter));
    } catch {
      continue;
    }
    for (const name of namen.filter((n) => n.endsWith('.json'))) {
      const inhalt = JSON.parse(await readFile(path.join(SCORES, unter, name), 'utf8')) as {
        meta: { id: string; version: string };
      };
      ergebnis.push({ id: inhalt.meta.id, version: inhalt.meta.version, inhalt });
    }
  }
  return ergebnis;
}

describe('Fassungen der Fragebögen', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('traegt jede Definitionsdatei mit gleichem Inhalt, und nichts darueber hinaus', async () => {
    const { rows } = await asPostgres<{
      instrument_id: string;
      version: string;
      definition: unknown;
    }>('select instrument_id, version, definition from public.questionnaire_definitions');
    const tabelle = new Map(rows.map((r) => [`${r.instrument_id}@${r.version}`, r.definition]));
    const liste = await dateien();
    expect(new Set(tabelle.keys())).toEqual(new Set(liste.map((d) => `${d.id}@${d.version}`)));
    for (const d of liste) expect(tabelle.get(`${d.id}@${d.version}`)).toEqual(d.inhalt);
  });

  it('kennt dieselben Koerperbereiche wie die Oberflaeche', async () => {
    const { rows } = await asPostgres<{ bereiche: string[] }>(
      'select app.questionnaire_body_regions() as bereiche',
    );
    expect(rows[0]!.bereiche).toEqual(KOERPERBEREICHE.map((b) => b.id));
  });

  it('haelt eine Fassung unveraenderlich und fuer Anwendungsrollen unlesbar', async () => {
    await expect(
      asPostgres(
        "update public.questionnaire_definitions set version = version where instrument_id = 'nrs_schmerz'",
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      asUser(SEED.users.ownerTherapist, 'select 1 from public.questionnaire_definitions'),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
