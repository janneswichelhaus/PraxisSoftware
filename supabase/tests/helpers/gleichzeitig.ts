import { Client } from 'pg';
import { abgefangen, asPostgres, jwtClaims, testDatabaseUrl } from './db';

/**
 * Zwei Vorgänge wirklich gleichzeitig (BEF-132, H5): `erledigen` läuft auf
 * einer eigenen Verbindung und hält seine Transaktion offen; `schreiben`
 * startet auf einer zweiten, und erst wenn diese nachweislich auf die Sperre
 * der Zeile wartet, wird das Erledigen bestätigt. Liefert den Fehler des
 * Schreibens oder null.
 */
export async function gleichzeitig(
  erledigen: { konto: string; sql: string; params: unknown[] },
  schreiben: { konto: string; sql: string; params: unknown[] },
): Promise<{ code: string | undefined; message: string } | null> {
  const a = new Client({ connectionString: testDatabaseUrl() });
  const b = new Client({ connectionString: testDatabaseUrl() });
  await a.connect();
  await b.connect();
  try {
    for (const [c, konto] of [
      [a, erledigen.konto],
      [b, schreiben.konto],
    ] as const) {
      await c.query('begin');
      await c.query("select set_config('role', 'authenticated', true)");
      await c.query("select set_config('request.jwt.claims', $1, true)", [jwtClaims(konto)]);
    }
    const { rows } = await b.query<{ pid: number }>('select pg_backend_pid() as pid');
    await a.query(erledigen.sql, erledigen.params);
    const versuch = abgefangen(b.query(schreiben.sql, schreiben.params));
    for (let i = 0; ; i++) {
      const warte = await asPostgres<{ w: string | null }>(
        'select wait_event_type as w from pg_stat_activity where pid = $1',
        [rows[0]!.pid],
      );
      if (warte.rows[0]?.w === 'Lock') break;
      if (i > 200) throw new Error('das Schreiben wartet nicht auf die Sperre');
      await new Promise((r) => setTimeout(r, 25));
    }
    await a.query('commit');
    const fehler = await versuch;
    if (fehler === null) await b.query('commit');
    else await b.query('rollback');
    if (fehler === null) return null;
    const { code } = fehler as { code?: string };
    return { code, message: fehler.message };
  } finally {
    await a.end();
    await b.end();
  }
}
