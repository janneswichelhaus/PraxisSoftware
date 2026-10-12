/**
 * Die Ablage auf dem Gerät (ADR-024 Punkt 5, TRK-EPIC-003).
 *
 * Höchstens so viele Tage nach dem letzten Laden mit Verbindung liegt etwas
 * auf dem Gerät; der Server nimmt eine Einheit ebenso lange an
 * (`app.offline_transfer_days()`, ANN-357).
 */
export const OFFLINE_FRIST_TAGE = 7;
