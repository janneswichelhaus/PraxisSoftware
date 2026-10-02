/**
 * Ein Abstecher: mitten in einem Formular etwas anderes anlegen und
 * zurückkommen, ohne das Getippte zu verlieren (ANN-019, UX-009, UX-012).
 *
 * Der Fall kommt im Praxisalltag ständig vor. Beim Erfassen einer Verordnung
 * fehlt die Verordner:in in der Kartei; beim Anlegen eines Termins ist die
 * Patient:in noch gar nicht aufgenommen; vor der Termin-E-Mail fehlt die
 * Adresse. Jedes Mal führt der Weg auf eine andere Seite und wieder zurück —
 * und ohne diesen Speicher steht danach ein leeres Formular da.
 *
 * Die Regeln stammen aus ANN-019 und der Behebung ihres Restpunkts in UX-009;
 * hier stehen sie an einer Stelle statt in jedem Formular neu:
 *
 *   * **Nur im Arbeitsspeicher.** Kein `localStorage`, kein `sessionStorage`.
 *     Ein Entwurf kann klinische Freitexte enthalten (Diagnose, Therapieziel)
 *     oder Stammdaten; beides soll nirgendwo länger liegen als für diesen
 *     einen Abstecher (§18, ADR-011). Ein Neuladen verwirft ihn.
 *   * **Nicht im Query-Cache.** Ein über `setQueryData` abgelegter Wert hat
 *     ohne beobachtenden `useQuery` keinen aktiven Beobachter und kann von der
 *     normalen Garbage Collection verworfen werden, während der Abstecher noch
 *     läuft.
 *   * **Gebunden an Vorgang und Benutzer.** Der Schlüssel verbindet eine
 *     Zufallskennung je Abstecher mit der Benutzer-ID: Ein Kontowechsel im
 *     selben Tab übernimmt nie den Entwurf einer anderen Person, und ein
 *     unabhängiger neuer Besuch derselben Seite bringt eine neue Kennung mit
 *     und findet deshalb nichts vor.
 *   * **Kein stiller Verfall (ABN-019, BEF-110, ANN-019 Fassung 2).** Bis
 *     hierher galt ein Entwurf nach 30 Minuten als abgebrochen und wurde beim
 *     nächsten Zugriff still verworfen, ebenso bei jeder Abmeldung. Jetzt
 *     bleibt er, bis das Formular ihn zurückholt oder die Person ihn
 *     ausdrücklich verwirft: Beim freiwilligen Abmelden fragt die Anwendung
 *     (`AbstecherAbmeldewache`); eine automatische Abmeldung oder Sperre
 *     lässt ihn liegen, und nur dasselbe Konto findet ihn wieder. Ein
 *     Neuladen verwirft ihn weiterhin - er liegt nur im Arbeitsspeicher.
 *
 * Der Rücksprungpfad selbst trägt die Kennung mit (`?vorgang=…`), damit es für
 * beides genau eine Quelle gibt.
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
