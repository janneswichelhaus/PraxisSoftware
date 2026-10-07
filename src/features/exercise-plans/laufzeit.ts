/**
 * Wo ein zugewiesener Plan in seiner Laufzeit steht (UEB-005, UEB-007).
 *
 * Kalendertage als `YYYY-MM-DD` in der Zeitzone der Praxis; „heute" liefert
 * der Server. Ob die Wiedervorlage ansteht, entscheidet der Server
 * (`review_due`, ANN-302) - hier steht nur, was am Datum abzulesen ist.
 */
export type Laufzeitstand = 'laeuft' | 'laeuft_aus' | 'abgelaufen';

export function laufzeitStand(
  laeuftBis: string,
  heute: string,
  wiedervorlage = false,
): Laufzeitstand {
  if (laeuftBis < heute) return 'abgelaufen';
  return wiedervorlage ? 'laeuft_aus' : 'laeuft';
}

/**
 * Vorschlag für das Ende beim Zuweisen: sechs Wochen (ANN-302). Nur die
 * Voreinstellung des Feldes; die Fachperson wählt.
 */
export const LAUFZEIT_VORSCHLAG_TAGE = 42;

/**
 * Längste Laufzeit ab Zuweisung oder Verlängerung: 26 Wochen (ANN-302).
 * Verbindlich ist `app.exercise_plan_max_days()`; hier nur für die Prüfung im
 * Formular.
 */
export const LAUFZEIT_HOECHSTENS_TAGE = 182;

/** Kalendertag plus `tage`, als `YYYY-MM-DD` - ohne Zeitzonenrechnung. */
export function tagPlus(tag: string, tage: number): string {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}
