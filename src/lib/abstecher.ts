/**
 * Abstecher: mitten im Formular etwas anderes anlegen und mit dem Getippten zurückkommen (ANN-019).
 * Nur im Arbeitsspeicher (§18, ADR-011), nicht im Query-Cache, den die Garbage Collection leert;
 * gebunden an Vorgang und Konto, ohne stilles Verfallen. Die Kennung reist im Rücksprungpfad mit.
 */

interface Eintrag {
  inhalt: unknown;
  angelegtAm: number;
}

const speicher = new Map<string, Eintrag>();

function schluessel(vorgang: string, userId: string): string {
  return `${userId} ${vorgang}`;
}

/**
 * Eine neue Vorgangskennung.
 *
 * `crypto.randomUUID` ist im Browser und in der Testumgebung vorhanden; der
 * Rückfall deckt ältere Umgebungen ab. Die Kennung ist kein Geheimnis - sie
 * unterscheidet nur zwei Besuche derselben Seite voneinander und steht sichtbar
 * in der Adresszeile.
 */
export function neueVorgangskennung(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Liest die Vorgangskennung aus einem Rücksprungpfad. */
export function vorgangAusPfad(pfad: string): string | null {
  const frage = pfad.indexOf('?');
  if (frage < 0) return null;
  return new URLSearchParams(pfad.slice(frage + 1)).get('vorgang');
}

/** Legt den Formularzustand vor dem Abstecher ab. */
export function abstecherAblegen<T>(vorgang: string, userId: string, inhalt: T): void {
  speicher.set(schluessel(vorgang, userId), { inhalt, angelegtAm: Date.now() });
}

/**
 * Liest einen Entwurf, ohne ihn zu entfernen (siehe `abstecherEntfernen`) -
 * zwei getrennte Schritte, damit ein lesender Aufruf aus einem
 * Zustands-Initialisierer heraus wiederholbar bleibt (React StrictMode ruft ihn
 * im Entwicklungsmodus zweimal auf). Ein einer anderen Person gehörender
 * Entwurf gilt als nicht vorhanden; ein alter verfällt nicht still (ABN-019).
 */
export function abstecherAnsehen<T>(vorgang: string, userId: string): T | undefined {
  const eintrag = speicher.get(schluessel(vorgang, userId));
  if (!eintrag) return undefined;
  return eintrag.inhalt as T;
}

/** Liegt für diese Person ein Entwurf, der noch auf seine Rückkehr wartet? */
export function abstecherOffen(userId: string): boolean {
  for (const key of speicher.keys()) if (key.startsWith(`${userId} `)) return true;
  return false;
}

/** Verwirft die Entwürfe einer Person - nach ihrer ausdrücklichen Antwort (ABN-019). */
export function abstecherVerwerfenFuer(userId: string): void {
  for (const key of [...speicher.keys()]) if (key.startsWith(`${userId} `)) speicher.delete(key);
}

/**
 * Ergänzt einen vorhandenen Entwurf um das Ergebnis des Abstechers - die neu
 * angelegte Verordner:in, die neu aufgenommene Patient:in. Ohne passenden
 * Entwurf passiert nichts.
 */
export function abstecherErgaenzen<T extends object>(
  vorgang: string,
  userId: string,
  ergaenzung: Partial<T>,
): void {
  const key = schluessel(vorgang, userId);
  const eintrag = speicher.get(key);
  if (!eintrag) return;
  speicher.set(key, {
    ...eintrag,
    inhalt: { ...(eintrag.inhalt as T), ...ergaenzung },
  });
}

/**
 * Entfernt einen Entwurf endgültig - nach dem Wiederaufbau des Formulars,
 * damit ein späterer, unabhängiger Besuch derselben Seite nichts mehr
 * vorfindet. Mehrfacher Aufruf ist unschädlich (React StrictMode).
 */
export function abstecherEntfernen(vorgang: string, userId: string): void {
  speicher.delete(schluessel(vorgang, userId));
}

/** Verwirft alle Entwürfe aller Benutzer:innen (Tests; VER-003). */
export function alleAbstecherVerwerfen(): void {
  speicher.clear();
}
