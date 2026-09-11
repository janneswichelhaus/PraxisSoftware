import { getSupabase } from '@/lib/supabase';

/**
 * Das eigene Konto (STAFF-004).
 *
 * Kennwort, Sitzungen und zweiter Faktor liegen vollständig beim Anmeldedienst
 * des Providers (§3.4: nichts davon wird selbst gebaut). Diese Datei ruft
 * dessen Funktionen auf und meldet anschließend ins Auditlog, **dass** der
 * Vorgang stattgefunden hat — nie mit Kennwort, Token oder Geheimnis.
 *
 * Die Reihenfolge ist überall dieselbe: erst der Vorgang beim Provider, dann
 * die Meldung. Scheitert der Vorgang, wird nichts gemeldet; scheitert die
 * Meldung, ist der Vorgang trotzdem passiert — deshalb bricht sie den Ablauf
 * nicht ab, sondern bleibt still. Eine Fehlermeldung, die ein erfolgreich
 * geändertes Kennwort als Misserfolg darstellt, wäre die schlechtere Auskunft
 * (Oberflächen-Checkliste Punkt 6).
 */
type Sicherheitsereignis = 'password_changed' | 'sessions_ended' | 'mfa_enrolled' | 'mfa_removed';

async function melde(ereignis: Sicherheitsereignis): Promise<void> {
  try {
    await getSupabase().rpc('log_account_security_event', { p_event: ereignis });
  } catch {
    // Siehe oben: der Vorgang beim Provider ist bereits geschehen.
  }
}

/**
 * Mindestlänge des Kennworts in Zeichen (ANN-025).
 *
 * Länge statt Zeichenklassen: Das BSI und das NIST empfehlen seit Jahren
 * Passphrasen und raten von erzwungener Komplexität und regelmäßigem Wechsel
 * ab. Verbindlich durchgesetzt wird die Regel vom Anmeldedienst; hier steht
 * sie, damit das Formular nicht erst der Server abweist.
 */
export const KENNWORT_MINDESTLAENGE = 12;

export function kennwortProblem(kennwort: string, wiederholung: string): string | null {
  if (kennwort.length < KENNWORT_MINDESTLAENGE) {
    return `Das Kennwort braucht mindestens ${KENNWORT_MINDESTLAENGE} Zeichen.`;
  }
  if (kennwort !== wiederholung) return 'Die beiden Eingaben stimmen nicht überein.';
  return null;
}

export async function aendereKennwort(neuesKennwort: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password: neuesKennwort });
  if (error) throw new Error('Das Kennwort konnte nicht geändert werden.');
  await melde('password_changed');
}

/**
 * Beendet alle Sitzungen dieses Kontos — auch die auf anderen Geräten.
 *
 * Der Punkt aus R10 der Roadmap: Wer sein Diensttelefon verliert, muss das
 * angemeldete Gerät ohne fremde Hilfe abmelden können. `scope: 'global'`
 * entwertet alle ausgegebenen Token, die eigene Sitzung eingeschlossen — die
 * Abmeldung im laufenden Fenster ist die sichtbare Folge, nicht ein
 * Nebeneffekt.
 */
export async function beendeAlleSitzungen(): Promise<void> {
  await melde('sessions_ended');
  const { error } = await getSupabase().auth.signOut({ scope: 'global' });
  if (error) throw new Error('Die Sitzungen konnten nicht beendet werden.');
}

/**
 * Fordert eine Mail zum Zurücksetzen des Kennworts an.
 *
 * Läuft ohne Anmeldung und meldet deshalb nichts ins Auditlog: Es gibt kein
 * Konto, dem der Vorgang zuzuordnen wäre, und ein Eintrag „für diese Adresse
 * wurde zurückgesetzt" wäre selbst eine Auskunft darüber, wer ein Konto hat.
 * Der Anmeldedienst führt den Vorgang; die Änderung des Kennworts wird beim
 * Setzen protokolliert.
 */
export async function fordereKennwortMailAn(email: string): Promise<void> {
  await getSupabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/mein-konto`,
  });
}

// -----------------------------------------------------------------------------
// Zweiter Faktor (STAFF-004b)
// -----------------------------------------------------------------------------

/**
 * Der zweite Faktor ist eine Einmalkennwort-App (TOTP) und kein SMS-Code.
 *
 * SMS bräuchte einen weiteren Dienstleister mit Zugang zu Rufnummern der
 * Mitarbeitenden (§3.5, ADR-002) und ist zudem das schwächere Verfahren. TOTP
 * kommt ohne beides aus: Der Anmeldedienst und die App auf dem Telefon teilen
 * ein Geheimnis, das die Praxisplattform nie zu sehen bekommt.
 */
export interface MfaEinrichtung {
  factorId: string;
  /** Der QR-Code als fertiges Bild vom Anmeldedienst — hier entsteht keiner. */
  qrCode: string;
  /** Dieselbe Angabe zum Abtippen, wenn die Kamera nicht mitspielt. */
  secret: string;
}

export interface MfaFaktor {
  id: string;
  bestaetigt: boolean;
}

export async function ladeMfaFaktoren(): Promise<MfaFaktor[]> {
  const { data, error } = await getSupabase().auth.mfa.listFactors();
  if (error) throw new Error('Der Stand des zweiten Faktors ließ sich nicht laden.');
  return (data?.totp ?? []).map((faktor) => ({
    id: faktor.id,
    bestaetigt: faktor.status === 'verified',
  }));
}

export async function starteMfaEinrichtung(): Promise<MfaEinrichtung> {
  const { data, error } = await getSupabase().auth.mfa.enroll({ factorType: 'totp' });
  if (error || !data) throw new Error('Der zweite Faktor konnte nicht vorbereitet werden.');
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/**
 * Schließt die Einrichtung mit dem ersten Code aus der App ab.
 *
 * Ohne diesen Schritt bliebe ein unbestätigter Faktor stehen, der beim
 * Anmelden nichts tut — die Person hielte sich für geschützt und wäre es
 * nicht.
 */
export async function bestaetigeMfa(factorId: string, code: string): Promise<void> {
  const { error } = await getSupabase().auth.mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\s/g, ''),
  });
  if (error) throw new Error('Der Code wurde nicht angenommen. Bitte erneut versuchen.');
  await melde('mfa_enrolled');
}

export async function entferneMfa(factorId: string): Promise<void> {
  const { error } = await getSupabase().auth.mfa.unenroll({ factorId });
  if (error) throw new Error('Der zweite Faktor konnte nicht entfernt werden.');
  await melde('mfa_removed');
}
