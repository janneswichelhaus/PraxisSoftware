/**
 * Die Sätze der Abfragezustände, einmal (Design-Fundament, ANN-406).
 *
 * „Bitte die Verbindung prüfen und erneut versuchen.“ stand bis dahin rund
 * 200-mal wörtlich im Code, in fünf Abwandlungen („… später erneut
 * versuchen“, „… erneut tippen“). Neue Seiten nehmen den Satz von hier - über
 * `Abfragezustand` oder als `description` eines `ErrorState`; bestehende
 * ziehen beim Umbau nach. Eigene Datei aus demselben Grund wie
 * `buttonStile.ts` (schnelles Neuladen).
 */

/** Der nächste Schritt nach einem Fehler ohne Knopf „Erneut versuchen“ (L7: mit Knopf entfällt er). */
export const VERBINDUNG_PRUEFEN = 'Bitte die Verbindung prüfen und erneut versuchen.';

/** Das Nachladen ist gescheitert, der bisherige Stand steht noch da; der Knopf daneben sagt den Rest. */
export const STAND_VERALTET = 'Stand nicht aktuell.';
