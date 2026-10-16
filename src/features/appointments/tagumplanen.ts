/**
 * „Tag umplanen“ geführt (Überholung 6, G2, ANN-574) - die Folge ohne
 * Oberfläche.
 *
 * Zwei Teile: Erst wird abgesagt - Grund, Auswahl der Termine (alle
 * vorgewählt, abwählbar), Rückfrage -, dann wird angerufen, eine Person je
 * Seite mit „Erreicht“ oder „Nicht erreicht“, am Ende steht, wer noch fehlt.
 *
 * Der Anrufstand liegt nur in der Adresse, als Kennungen ohne Namen
 * (ADR-011): `?abgesagt=` nennt die eben abgesagten Termine (KAL-06),
 * `erreicht=` und `nicht=` die Antworten. So übersteht die Liste den Wechsel
 * in die Telefon-App, das Zurück und ein Neuladen, ohne dass am Server ein
 * Anrufprotokoll entsteht.
 */

export type UmplanSeite =
  | { art: 'grund' }
  | { art: 'termine' }
  | { art: 'absagen' }
  | { art: 'anruf'; id: string }
  | { art: 'fertig' };

export type Anrufergebnis = 'erreicht' | 'nicht';
export type Anrufstand = Readonly<Record<string, Anrufergebnis>>;

/** Parameter der Anrufliste: die Kennungen der eben abgesagten Termine. */
export const ABGESAGT_PARAM = 'abgesagt';
const ERREICHT_PARAM = 'erreicht';
const NICHT_PARAM = 'nicht';

/** Höchstens so viele Kennungen je Liste - mehr Termine hat kein Tag. */
const HOECHSTENS = 100;

function kennungen(wert: string | null): string[] {
  if (wert === null || wert === '') return [];
  return wert
    .split(',')
    .filter((kennung) => /^[\w-]{1,64}$/.test(kennung))
    .slice(0, HOECHSTENS);
}

/**
 * Die abgesagten Kennungen aus der Adresse - oder `null` vor der Absage.
 *
 * Die Kennungen filtern nur den geladenen Tagesplan und gehen nie an den
 * Server; geprüft wird deshalb nur ihre Form, und die Liste ist begrenzt.
 */
export function leseAbgesagt(suche: URLSearchParams): string[] | null {
  const wert = suche.get(ABGESAGT_PARAM);
  return wert === null ? null : kennungen(wert);
}

/** Wer schon angerufen wurde und mit welchem Ergebnis. */
export function leseAnrufstand(suche: URLSearchParams): Anrufstand {
  const stand: Record<string, Anrufergebnis> = {};
  for (const id of kennungen(suche.get(ERREICHT_PARAM))) stand[id] = 'erreicht';
  for (const id of kennungen(suche.get(NICHT_PARAM))) stand[id] = 'nicht';
  return stand;
}

/** Die Adresse mit einem neuen Anrufstand; alles andere bleibt. */
export function mitAnrufstand(suche: URLSearchParams, stand: Anrufstand): URLSearchParams {
  const naechste = new URLSearchParams(suche);
  const erreicht = Object.keys(stand).filter((id) => stand[id] === 'erreicht');
  const nicht = Object.keys(stand).filter((id) => stand[id] === 'nicht');
  if (erreicht.length > 0) naechste.set(ERREICHT_PARAM, erreicht.join(','));
  else naechste.delete(ERREICHT_PARAM);
  if (nicht.length > 0) naechste.set(NICHT_PARAM, nicht.join(','));
  else naechste.delete(NICHT_PARAM);
  return naechste;
}

/** Wer als Nächstes dran ist: die erste Person ohne Ergebnis, sonst niemand. */
export function naechsterAnruf(
  reihenfolge: readonly string[],
  stand: Anrufstand,
  nach?: string,
): string | null {
  const ab = nach === undefined ? 0 : reihenfolge.indexOf(nach) + 1;
  return (
    reihenfolge.slice(ab).find((id) => stand[id] === undefined) ??
    reihenfolge.find((id) => stand[id] === undefined) ??
    null
  );
}

/** Die erste Seite der Anrufliste: wer noch fehlt, sonst der Abschluss. */
export function ersteAnrufseite(reihenfolge: readonly string[], stand: Anrufstand): UmplanSeite {
  const id = naechsterAnruf(reihenfolge, stand);
  return id ? { art: 'anruf', id } : { art: 'fertig' };
}

/** Kennung einer Seite für den Baustein (Tippsperre, neuer Fokus). */
export function seitenKennung(seite: UmplanSeite): string {
  return seite.art === 'anruf' ? `anruf-${seite.id}` : seite.art;
}

const ABSAGE_SEITEN = ['grund', 'termine', 'absagen'] as const;

/** „Schritt 2 von 3“ beim Absagen, „Anruf 2 von 5“ beim Anrufen. */
export function umplanStand(
  seite: UmplanSeite,
  reihenfolge: readonly string[],
): { text: string; wert: number; von: number } | undefined {
  if (seite.art === 'anruf') {
    const nummer = reihenfolge.indexOf(seite.id) + 1;
    return {
      text: `Anruf ${nummer} von ${reihenfolge.length}`,
      wert: nummer,
      von: reihenfolge.length,
    };
  }
  if (seite.art === 'fertig') return undefined;
  const nummer = ABSAGE_SEITEN.indexOf(seite.art) + 1;
  return {
    text: `Schritt ${nummer} von ${ABSAGE_SEITEN.length}`,
    wert: nummer,
    von: ABSAGE_SEITEN.length,
  };
}

/** „1 Termin“, aber „2 Termine“ - eine Schaltfläche darf nicht falsch klingen. */
export function terminWort(anzahl: number): string {
  return anzahl === 1 ? 'Termin' : 'Termine';
}

/** „mit 1 Termin“, aber „mit 2 Terminen“ - der Dativ. */
export function terminDativ(anzahl: number): string {
  return anzahl === 1 ? 'Termin' : 'Terminen';
}
