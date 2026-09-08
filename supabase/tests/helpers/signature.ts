/**
 * Hilfen zum Pruefen von Funktionssignaturen.
 *
 * Mehrere Tests halten die Zusage aus ADR-003 fest, dass eine RPC keine
 * Organisation und keine beliebigen Fremdschluessel entgegennimmt. Sobald eine
 * Funktion aus fachlichen Gruenden doch einen Verweis braucht, soll der Test
 * nicht "keine uuid" pruefen, sondern **welche** - sonst faellt beim naechsten
 * Feld niemandem auf, dass ein weiterer Verweis dazugekommen ist.
 */

/**
 * Namen aller Parameter vom Typ `uuid` aus der Ausgabe von
 * `pg_get_function_arguments`, in Deklarationsreihenfolge.
 *
 * Die Ausgabe hat je Parameter die Form `name typ [DEFAULT ausdruck]` und ist
 * mit ", " verkettet; DEFAULT-Ausdruecke enthalten in unseren Signaturen kein
 * Komma.
 */
export function uuidParameter(argumente: string): string[] {
  return argumente
    .split(', ')
    .map((eintrag) => eintrag.trim().split(/\s+/))
    .filter(([, typ]) => typ === 'uuid')
    .map(([name]) => name!);
}
