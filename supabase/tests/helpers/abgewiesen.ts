import { expect } from 'vitest';
import { asPostgres, asUserCommitted, asUserCommittedMitStatus } from './db';

interface DeniedZeile {
  organization_id: string;
  subject_type: string;
  subject_id: string;
  context: Record<string, unknown>;
}

/**
 * Die `access.denied`-Einträge des Aufrufers für eine Operation (LOG-EPIC-001).
 * Gleichartige Abweisungen innerhalb von zehn Minuten fasst ein Zähler im
 * ersten Eintrag zusammen; gezählt wird deshalb die Summe der Zähler.
 */
async function abweisungen(userId: string, operation: string) {
  const zeilen = (
    await asPostgres<DeniedZeile>(
      `select organization_id, subject_type, subject_id, context
       from public.audit_log
       where action = 'access.denied' and outcome = 'denied'
         and actor_user_id = $2 and context ->> 'operation' = $1
       order by occurred_at, id`,
      [operation, userId],
    )
  ).rows;
  const summe = zeilen.reduce((s, z) => s + Number(z.context['count'] ?? 1), 0);
  return { zeilen, summe };
}

function pruefeEintrag(eintrag: DeniedZeile, operation: string): void {
  // Subjekt ist die Organisation, nie die Kennung aus dem Aufruf: Die stammt
  // vom Abgewiesenen und hätte im Log nichts zu suchen.
  expect(eintrag.subject_type).toBe('organization');
  expect(eintrag.subject_id).toBe(eintrag.organization_id);
  const rest = { ...eintrag.context };
  const anzahl = Number(rest['count']);
  delete rest['count'];
  delete rest['last_at'];
  expect(rest).toEqual({ surface: 'api', reason: 'role', operation });
  expect(anzahl).toBeGreaterThanOrEqual(1);
}

/**
 * Prüft den Ausgang eines abgewiesenen Lesepfads seit OPS-004 und G6a: keine
 * Zeilen, keine Ausnahme und **genau eine** weitere Abweisung des Aufrufers
 * unter dieser Operation (`access.denied`, LOG-EPIC-001). Bestätigt wird die
 * Transaktion, damit sich zeigt, dass der Eintrag die Abweisung überlebt.
 */
export async function erwarteAbgewiesenenLeseversuch(
  userId: string,
  sql: string,
  params: unknown[],
  operation: string,
): Promise<void> {
  const vorher = await abweisungen(userId, operation);
  const { rows } = await asUserCommitted(userId, sql, params);
  expect(rows).toEqual([]);

  const nachher = await abweisungen(userId, operation);
  expect(nachher.summe).toBe(vorher.summe + 1);
  pruefeEintrag(nachher.zeilen.at(-1)!, operation);
}

/**
 * Prüft den Ausgang eines abgewiesenen Schreibpfads seit G6c: keine Ausnahme,
 * kein Ergebnis (leere Zeilenmenge oder ein `null`), HTTP 403 für PostgREST und
 * **genau eine** weitere Abweisung des Aufrufers, die die bestätigte
 * Transaktion überlebt. Dass keine Daten geändert wurden, prüft der Aufrufer
 * am jeweiligen Gegenstand.
 */
export async function erwarteAbgewiesenenSchreibversuch(
  userId: string,
  sql: string,
  params: unknown[],
  operation: string,
): Promise<void> {
  const vorher = await abweisungen(userId, operation);
  const { rows, status } = await asUserCommittedMitStatus(userId, sql, params);
  // Ein `void`-Pfad liefert eine Zeile mit leerem Text, ein skalarer `null`,
  // ein Tabellenpfad keine Zeile.
  const werte = rows.flatMap((zeile) => Object.values(zeile));
  expect(werte.every((wert) => wert === null || wert === '')).toBe(true);
  expect(status).toBe('403');

  const nachher = await abweisungen(userId, operation);
  expect(nachher.summe).toBe(vorher.summe + 1);
  pruefeEintrag(nachher.zeilen.at(-1)!, operation);
}
