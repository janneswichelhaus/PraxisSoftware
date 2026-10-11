/**
 * Zwecke, deren Einwilligung hier nur noch zum Widerruf steht. Gilt in der
 * Akte und auf der Plattform; deshalb hier und nicht in einem der beiden
 * Features (ADR-023 Punkt 26).
 *
 *   * `patient_photos` - ANN-316 (ADR-017 Fassung 4 Punkt 57, BEF-135): Eine
 *     Arbeitshilfe entsteht nicht mehr, also wird die Einwilligung zu Fotos
 *     nicht mehr angeboten. Wer sie erteilt hat, sieht sie weiter, um sie zu
 *     widerrufen - der Widerruf löscht vorhandene Arbeitshilfen.
 *   * `message_attachments` - ANN-333 (ADR-017 Punkt 61, KOM-005): Angeboten
 *     wird sie, wenn die Person zum ersten Mal etwas an eine Rückfrage hängen
 *     will, nicht auf Vorrat. Erteilt steht sie zum Widerruf da.
 */
const NUR_ZUM_WIDERRUF: readonly string[] = ['patient_photos', 'message_attachments'];

export function einwilligungAngeboten(zweck: string, erteilt: boolean): boolean {
  return erteilt || !NUR_ZUM_WIDERRUF.includes(zweck);
}
