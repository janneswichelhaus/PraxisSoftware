/**
 * Der Heilmittelkatalog des Formulars (VER-EPIC-002, ANN-066).
 *
 * **Eine Liste im Code, keine Tabelle.** Die Vorgabe verlangt eine
 * vordefinierte Auswahl mit beschrifteten Kästchen und schließt eine freie
 * Katalogverwaltung ausdrücklich aus; Preise kommen mit ABR-001. Eine Tabelle
 * mit Pflegeoberfläche wäre genau das Zukunftsfeature, das ADR-014 §11
 * verbietet — und sie wäre schwerer zurückzunehmen als diese fünf Zeilen.
 *
 * `remedy` ist der Wert, der in `treatment_base_items.remedy` landet und
 * dort bleibt. Er ist deshalb **kein Anzeigetext**: „Krankengymnastik" und
 * „Manuelle Therapie" heißen genau so, wie sie vor VER-EPIC-002 erfasst wurden,
 * damit eine Bestandsverordnung ihr Kästchen wiederfindet statt als
 * unbekannter Wert dazustehen.
 *
 * Die Doppelbehandlung ist ein **eigener Eintrag** und kein Zusatzhaken: Sie
 * ist eine andere Leistung, keine Eigenschaft derselben. Die Kombination
 * KG-Doppelbehandlung + MT-Doppelbehandlung + Hausbesuch ist damit vollständig
 * möglich, ohne dass ein Eintrag einen anderen ausschließt.
 *
 * **Der Katalog steht nicht in der Datenbank**, und das ist Absicht: Ein
 * Heilmittel außerhalb dieser Liste bleibt gültig. Sonst würde eine
 * Bestandsposition („Wärmetherapie") beim nächsten Speichern abgewiesen — das
 * Gegenteil von „Bestandswerte bleiben erhalten".
 *
 * Wer den Katalog ändert, ändert ihn hier. Ein entfernter Eintrag verschwindet
 * aus der Auswahl; vorhandene Positionen mit diesem Heilmittel bleiben als
 * Bestand stehen und sichtbar (`istBestand`).
 */
export interface Heilmittel {
  /** Gespeicherter Wert. Stabil — daran hängen später die Leistungen. */
  remedy: string;
  /** Was am Kästchen steht. */
  beschriftung: string;
}

export const HEILMITTEL: readonly Heilmittel[] = [
  { remedy: 'Krankengymnastik', beschriftung: 'Krankengymnastik (KG)' },
  { remedy: 'Krankengymnastik als Doppelbehandlung', beschriftung: 'KG als Doppelbehandlung' },
  { remedy: 'Manuelle Therapie', beschriftung: 'Manuelle Therapie (MT)' },
  { remedy: 'Manuelle Therapie als Doppelbehandlung', beschriftung: 'MT als Doppelbehandlung' },
  { remedy: 'Hausbesuch', beschriftung: 'Hausbesuch' },
];

/** `true`, wenn dieses Heilmittel nicht (mehr) im Katalog steht. */
export function istBestand(remedy: string): boolean {
  return !HEILMITTEL.some((eintrag) => eintrag.remedy === remedy);
}
