import { getSupabase } from '@/lib/supabase';
import { protokolliereFehler } from '@/lib/protokoll';
import { meldeSelbstAb } from '@/features/core';

/**
 * Das eigene Konto: erst der Vorgang beim Anmeldedienst (§3.4), dann der Vermerk, dass er
 * stattfand, nie mit PIN, Token oder Geheimnis. Ein gescheiterter Vermerk hält nichts auf;
 * `sessions_ended` vermerkt vorher den Versuch, danach schreibt keine Sitzung mehr (ANN-044).
 */

// Kein `password_changed`: Kein Konto hat ein Kennwort (ADR-025 Punkt 9).
type Sicherheitsereignis = 'sessions_ended' | 'mfa_enrolled' | 'mfa_removed';

/**
 * Meldet im Nachhinein, ohne den Ablauf aufzuhalten. `rpc` wirft bei einem Serverfehler nicht,
 * deshalb zählt `error`; der Fehlschlag geht ohne Kontoangabe ins Betriebslog (ADR-011).
 */
async function melde(ereignis: Sicherheitsereignis): Promise<void> {
  const { error } = await getSupabase().rpc('log_account_security_event', { p_event: ereignis });
  if (error) {
    protokolliereFehler({ ereignis: 'audit.kontoereignis_nicht_vermerkt' });
  }
}

/**
 * Meldet vorab den Versuch (ANN-044, Fassung 2).
 *
 * Der Vermerk hält fest, dass diese Person die Beendigung **ausgelöst** hat —
 * nicht, dass sie überall gewirkt hat. Das ist der ehrliche Inhalt: Ob ein
 * fremdes Gerät den Zugriff schon verloren hat, sieht diese Anwendung nicht.
 * Scheitert er, hält er den Vorgang nicht auf; der Fehlschlag steht im
 * Betriebslog wie bei `melde`.
 */
async function meldeVersuch(ereignis: Sicherheitsereignis): Promise<void> {
  const { error } = await getSupabase().rpc('log_account_security_event', { p_event: ereignis });
  if (error) {
    protokolliereFehler({ ereignis: 'audit.kontoereignis_nicht_vermerkt' });
  }
}

/**
 * Mindestlänge des Kennworts in Zeichen (ANN-027).
 *
 * Länge statt Zeichenklassen: Das BSI und das NIST empfehlen seit Jahren
 * Passphrasen und raten von erzwungener Komplexität und regelmäßigem Wechsel
 * ab. Durchgesetzt wird die Regel vom Anmeldedienst — aber nur, weil
 * `supabase/config.toml` unter `[auth]` dieselbe Zahl setzt; ohne sie gälte
 * dort der Standard von sechs Zeichen (R3-013). Hier steht sie, damit das
 * Formular nicht erst der Server abweist; ein Test hält beide Stellen
 * zusammen.
 */
export const KENNWORT_MINDESTLAENGE = 12;

/**
 * Beendet alle Sitzungen dieses Kontos — auch die auf anderen Geräten.
 *
 * Der Punkt aus R10 der Roadmap: Wer sein Diensttelefon verliert, muss das
 * angemeldete Gerät ohne fremde Hilfe abmelden können.
 *
 * **Was `scope: 'global'` wirklich tut** (ANN-044): Der Anmeldedienst löscht
 * alle Sitzungen des Kontos und mit ihnen die Erneuerungstoken. Ein verlorenes
 * Gerät kann sich damit nicht mehr verlängern. Sein **bereits ausgestelltes**
 * Zugriffstoken bleibt aber bis zum Ablauf gültig, weil die Datenschnittstelle
 * nur die Signatur und `exp` prüft und dafür nicht in die Datenbank sieht. Das
 * Fenster ist `jwt_expiry` aus `supabase/config.toml`, heute 3600 Sekunden.
 *
 * Sofort wirkt allein die **Sperre des Zugangs** durch die Praxisleitung: Die
 * Datenbank liest bei jeder Anfrage `user_profiles.is_active`
 * (`app.current_organization_id()`), und ein gesperrtes Profil liefert keine
 * Organisation mehr. Wer ein Gerät wirklich verloren hat, braucht deshalb
 * beides — und die Oberfläche sagt das an der Stelle der Entscheidung.
 */
export async function beendeAlleSitzungen(): Promise<void> {
  // Vor dem Vorgang, weil danach kein `auth.uid()` mehr existiert - siehe
  // Dateikopf und ANN-044. Scheitert der Vermerk, wird trotzdem abgemeldet.
  await meldeVersuch('sessions_ended');
  // Selbst ausgelöst: Die Anmeldemaske dieses Geräts sagt danach nicht
  // „Ihre Sitzung wurde beendet" (BEF-047); die anderen Geräte sagen es.
  const { error } = await meldeSelbstAb(() => getSupabase().auth.signOut({ scope: 'global' }));
  if (error) throw new Error('Die Sitzungen konnten nicht beendet werden.');
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

/**
 * Bestätigt den eingerichteten zweiten Faktor für diese Sitzung (AAL2).
 *
 * Der Anmeldedienst verlangt ihn beim Einrichten und Entfernen eines
 * Passkeys, wenn das Konto einen hat (ADR-025 Fassung 2). Kein Auditeintrag:
 * Es ändert sich nichts am Konto, nur an dieser Sitzung.
 */
export async function bestaetigeZweitenFaktor(code: string): Promise<void> {
  const faktoren = await ladeMfaFaktoren();
  const faktor = faktoren.find((f) => f.bestaetigt);
  if (!faktor) throw new Error('Für dieses Konto ist kein zweiter Faktor eingerichtet.');
  const { error } = await getSupabase().auth.mfa.challengeAndVerify({
    factorId: faktor.id,
    code: code.replace(/\s/g, ''),
  });
  if (error) throw new Error('Der Code wurde nicht angenommen. Bitte erneut versuchen.');
}
