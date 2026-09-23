import { expect } from 'vitest';
import { asPostgres, asUserCommitted } from './db';

interface DeniedZeile {
  organization_id: string;
  subject_type: string;
  subject_id: string;
  context: Record<string, unknown>;
}

/**
 * Prüft den Ausgang eines abgewiesenen Lesepfads seit OPS-004 und G6a: keine
 * Zeilen, keine Ausnahme und **genau ein** neuer `denied`-Eintrag des Aufrufers
 * unter der Aktion, die auch der erfolgreiche Zugriff schreibt. Bestätigt wird
 * die Transaktion, damit sich zeigt, dass der Eintrag die Abweisung überlebt.
 */
export async function erwarteAbgewiesenenLeseversuch(
  userId: string,
  sql: string,
  params: unknown[],
  action: string,
): Promise<void> {
  const deniedEintraege = async () =>
    (
      await asPostgres<DeniedZeile>(
        `select organization_id, subject_type, subject_id, context
         from public.audit_log
         where action = $1 and actor_user_id = $2 and outcome = 'denied'`,
        [action, userId],
      )
    ).rows;

  const vorher = (await deniedEintraege()).length;
  const { rows } = await asUserCommitted(userId, sql, params);
  expect(rows).toEqual([]);

  const nachher = await deniedEintraege();
  expect(nachher).toHaveLength(vorher + 1);
  const eintrag = nachher.at(-1)!;
  // Subjekt ist die Organisation, nie die Kennung aus dem Aufruf: Die stammt
  // vom Abgewiesenen und hätte im Log nichts zu suchen.
  expect(eintrag.subject_type).toBe('organization');
  expect(eintrag.subject_id).toBe(eintrag.organization_id);
  expect(eintrag.context).toEqual({ surface: 'api', reason: 'role' });
}
