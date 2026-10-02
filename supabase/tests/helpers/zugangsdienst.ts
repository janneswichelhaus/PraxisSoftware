import { asPostgres, asServiceRole } from './db';

/**
 * Stellt den Zugangsdienst beim Abarbeiten der Löschaufträge nach (ABN-011,
 * BEF-115): Aufträge abholen, das Konto beim Anmeldedienst entfernen und
 * bestätigen. Das Entfernen übernimmt hier `postgres` an Stelle der
 * Admin-API — die Deno-Laufzeit läuft in `pnpm test:db` nicht. Den Draht zur
 * Admin-API prüfen die Tests der Function selbst
 * (`supabase/functions/platform-access/`).
 *
 * Liefert die Kennungen der gelöschten Konten.
 */
export async function zugangsdienstLoescht(): Promise<string[]> {
  const { rows } = await asServiceRole<{ account_user_id: string }>(
    'select account_user_id from public.claim_platform_account_deletions(100)',
  );
  for (const { account_user_id: id } of rows) {
    await asPostgres('delete from auth.users where id = $1', [id]);
    await asServiceRole('select public.confirm_platform_account_deletion($1::uuid)', [id]);
  }
  return rows.map((r) => r.account_user_id);
}
