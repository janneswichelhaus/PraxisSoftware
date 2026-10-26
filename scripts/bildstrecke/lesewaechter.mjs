// -----------------------------------------------------------------------------
// Die Bildstrecke laeuft oft gegen einen geteilten Stack: Lesendes geht durch (GET/HEAD/OPTIONS,
// Anmeldung, RPCs mit lesendem Namen, Dateien signieren oder auflisten, der Kartendienst), alles
// andere haelt der Waechter an und meldet es - eine Seite, die von selbst schreibt, ist ein Befund.
// -----------------------------------------------------------------------------

/** Die Pfade des Supabase-Gateways, die der Waechter ueberhaupt ansieht. */
export const SUPABASE_PFAD = /^\/(rest|auth|storage|functions)\/v1\//;

const LESEND = new Set(['GET', 'HEAD', 'OPTIONS']);
const LESENDE_RPC = /^(list|get|platform|check|find|search|count|preview|own|rate)_/;
const LESENDE_RPC_EINZELN = new Set([
  'session_status',
  'patient_retention_status',
  'notification_kind_switches',
  // Das Oeffnen einer Akte protokolliert den Lesezugriff (ADR-010) - das ist
  // Lesen, nicht Schreiben. Der Druckvermerk eines Berichts dagegen gehoert
  // zum Druckknopf (log_therapy_report_export) und bleibt angehalten.
  'log_patient_record_view',
  // Auszahlen zeigt owner die volle IBAN (ANN-601) - `stable`, nur lesend.
  'reimbursement_payout_details',
  // TEAM-001: Das Öffnen eines Gesprächs zieht nur den eigenen Lesestand vor
  // (ANN-609) - wie das Öffnen einer Akte ein Lesen, kein Schreiben.
  'mark_team_channel_read',
  // TEAM-002: dasselbe für einen Thread (ANN-640).
  'mark_team_thread_read',
]);
// Namen, die wie Lesen aussehen, aber schreiben.
const SCHREIBEND_TROTZ_NAME = /^platform_(accesses_take_back_deletion|invitation_)/;
const ANMELDUNG = new Set(['/auth/v1/token', '/auth/v1/passkeys/authentication/options']);
const DATEIEN_LESEN = /^\/storage\/v1\/object\/(sign|list)\//;
const KARTENDIENST = /^\/functions\/v1\/location-provider(\/|$)/;

/**
 * `null`, wenn die Anfrage lesend ist; sonst eine kurze Beschreibung der
 * angehaltenen Anfrage („rpc create_task", „PATCH /rest/v1/tasks").
 */
export function schreibanfrage(methode, adresse) {
  const pfad = new URL(adresse).pathname;
  if (!SUPABASE_PFAD.test(pfad)) return null;
  if (LESEND.has(methode)) return null;
  if (ANMELDUNG.has(pfad)) return null;
  if (pfad.startsWith('/rest/v1/rpc/')) {
    const name = pfad.slice('/rest/v1/rpc/'.length);
    if (SCHREIBEND_TROTZ_NAME.test(name)) return `rpc ${name}`;
    if (LESENDE_RPC.test(name) || LESENDE_RPC_EINZELN.has(name)) return null;
    return `rpc ${name}`;
  }
  if (DATEIEN_LESEN.test(pfad)) return null;
  if (KARTENDIENST.test(pfad)) return null;
  return `${methode} ${pfad}`;
}

/**
 * Haengt den Waechter an einen Browserkontext. `melden(beschreibung, url)`
 * bekommt jede angehaltene Anfrage.
 */
export async function lesewaechterAnbringen(kontext, melden) {
  await kontext.route(
    (url) => SUPABASE_PFAD.test(url.pathname),
    async (route) => {
      const anfrage = route.request();
      const schreiben = schreibanfrage(anfrage.method(), anfrage.url());
      if (schreiben === null) {
        await route.continue();
        return;
      }
      melden(schreiben, anfrage.url());
      await route.abort('blockedbyclient');
    },
  );
}
