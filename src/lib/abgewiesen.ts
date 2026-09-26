/**
 * Ist eine Serverfunktion gescheitert — auch dann, wenn `supabase-js` es nicht
 * als Fehler meldet (G6c, ANN-115)?
 *
 * Seit G6c weisen die Schreibpfade für Rollen und Konten, Legal Hold und
 * Löschaufträge ohne Ausnahme ab: Sie schreiben den Versuch ins Auditlog,
 * setzen HTTP 403 und kehren zurück, damit der Eintrag die Transaktion
 * überlebt. Eine Funktion mit Skalar-Rückgabe liefert dabei den Körper `null`,
 * und `supabase-js` liest `JSON.parse("null")` als „kein Fehler". Ohne diese
 * Prüfung hielte der Aufrufer die Abweisung für einen Erfolg — beim Einladen
 * ginge danach sogar die Anmeldemail hinaus.
 *
 * Die Oberfläche ruft diese Pfade für eine abgewiesene Rolle nie auf; die
 * Prüfung ist die zweite Linie, nicht die Zugriffskontrolle (ADR-004).
 */
export function abgewiesen(antwort: { error: unknown; status?: number }): boolean {
  return antwort.error !== null || antwort.status === 403;
}
