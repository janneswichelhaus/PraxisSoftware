/**
 * Typen der Edge Function `patient-file-verify` (ABN-025).
 *
 * Bewusst ohne Namen, ohne Patientenkennung, ohne Inhalt: Die Function kennt
 * Datei-Kennung, Ablageort und Ankündigung — mehr braucht die Prüfung nicht
 * (ADR-017 Punkt 50, ADR-011).
 */

/** Was die Datenbank dem Dienst über eine bestätigte Datei sagt. */
export interface Ankuendigung {
  readonly bucket_id: string;
  readonly object_key: string;
  readonly mime_type: string;
  readonly byte_size: number;
  readonly checksum_sha256: string;
  readonly already_verified: boolean;
}

/** Ergebnis je Prüfung (Punkt 49); `metadata_ok` ist bei PDF `null`. */
export interface Pruefergebnis {
  readonly content_type_ok: boolean;
  readonly checksum_ok: boolean;
  readonly metadata_ok: boolean | null;
}

/** Was `record_patient_file_verification` zurückgibt. */
/** `held`: Befund unter Legal Hold - nichts verworfen, nur protokolliert. */
export type Eintrag =
  'passed' | 'rejected' | 'held' | 'already_verified' | 'not_found' | 'not_confirmed';

/** Ein Aufruf an die eigene Instanz: Ergebnis oder Fehlerklasse, nie Inhalt. */
export type Ergebnis<T> = { readonly ok: true; readonly wert: T } | { readonly ok: false };

/**
 * Was die Function loggt (ADR-011, ADR-017 Punkt 50): Kennung, Ergebnisklasse
 * und Dauer. Kein Feld für Bytes, Namen oder Objektschlüssel.
 */
export interface Protokolleintrag {
  readonly dateiId: string | null;
  readonly klasse:
    | 'passed'
    | 'rejected'
    | 'held'
    | 'already_verified'
    | 'not_found'
    | 'not_confirmed'
    | 'session_rejected'
    | 'not_configured'
    | 'instance_error'
    | 'bad_request';
  readonly dauerMs: number;
}
