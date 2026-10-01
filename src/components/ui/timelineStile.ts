/**
 * Das Raster eines Zeitstrahls, geteilt von der Jetzt-Marke (`NowMarker`) und
 * den Einträgen, die eine Seite selbst zeichnet (Design-Handoff 2026-10-01,
 * Abschnitt 5).
 *
 * Drei Spalten: die Uhrzeit (52 px), die Schiene mit dem Punkt (20 px), der
 * Inhalt. Eigene Datei aus demselben Grund wie `aufklappStile.ts`: Marke und
 * Einträge müssen dieselben Spalten treffen, sonst steht der Punkt der Marke
 * neben der Schiene.
 */
export const zeitstrahlRaster = 'grid grid-cols-[52px_20px_minmax(0,1fr)] gap-x-2.5';

/** Die Schiene in der mittleren Spalte: 2 px in `line`, über die ganze Höhe des Eintrags. */
export const zeitstrahlSchiene = 'bg-line absolute inset-y-0 left-[9px] w-0.5';
