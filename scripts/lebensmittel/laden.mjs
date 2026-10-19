// -----------------------------------------------------------------------------
// Lädt die Ausgabe von bls.mjs oder off.mjs in den Katalog (ERN-004, ANN-659).
//
// Allein im Betrieb, gegen die Datenbank der jeweiligen Umgebung als
// postgres (DATABASE_URL); die Anwendung hat kein Recht auf den Import. Je
// 2 000 Zeilen ein Aufruf von app.import_food_catalog_batch, am Ende
// app.finish_food_catalog_import: Was im neuen Stand fehlt, wird
// zurückgezogen, nicht gelöscht. Alles in einer Transaktion - bricht ein
// Stapel ab, bleibt der alte Stand.
//
// Aufruf:
//   DATABASE_URL=postgresql://… node scripts/lebensmittel/laden.mjs bls 4.0 bls.ndjson
//   DATABASE_URL=postgresql://… node scripts/lebensmittel/laden.mjs off 2026-10 off.ndjson
// -----------------------------------------------------------------------------
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export const STAPEL = 2000;

/** Teilt einen Strom von NDJSON-Zeilen in Stapel. */
export async function* stapel(zeilen, groesse = STAPEL) {
  let aktuell = [];
  for await (const zeile of zeilen) {
    if (zeile.trim() === '') continue;
    aktuell.push(JSON.parse(zeile));
    if (aktuell.length === groesse) {
      yield aktuell;
      aktuell = [];
    }
  }
  if (aktuell.length > 0) yield aktuell;
}

/** Lädt die Stapel in einer Transaktion; liefert geladen und zurückgezogen. */
export async function laden(client, quelle, stand, stapelquelle) {
  let geladen = 0;
  await client.query('begin');
  try {
    for await (const s of stapelquelle) {
      const { rows } = await client.query(
        'select app.import_food_catalog_batch($1, $2, $3::jsonb) as n',
        [quelle, stand, JSON.stringify(s)],
      );
      geladen += rows[0].n;
    }
    const { rows } = await client.query('select app.finish_food_catalog_import($1, $2) as n', [
      quelle,
      stand,
    ]);
    await client.query('commit');
    return { geladen, zurueckgezogen: rows[0].n };
  } catch (fehler) {
    await client.query('rollback');
    throw fehler;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [quelle, stand, datei] = process.argv.slice(2);
  if (!['bls', 'off'].includes(quelle) || !stand || !datei || !process.env.DATABASE_URL) {
    process.stderr.write(
      'Aufruf: DATABASE_URL=… node scripts/lebensmittel/laden.mjs <bls|off> <stand> <datei.ndjson>\n',
    );
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Datei aus dem eigenen Aufruf
    const zeilen = createInterface({ input: createReadStream(datei), crlfDelay: Infinity });
    const ergebnis = await laden(client, quelle, stand, stapel(zeilen));
    process.stderr.write(`${quelle} ${stand}: ${JSON.stringify(ergebnis)}\n`);
  } finally {
    await client.end();
  }
}
