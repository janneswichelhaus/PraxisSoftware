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

/** Der nächste Schritt nach einem Ladefehler - ohne Ratefrage (WRT-01). */
export const VERBINDUNG_PRUEFEN = 'Bitte die Verbindung prüfen und erneut versuchen.';

/** Das Nachladen ist gescheitert, der bisherige Stand steht noch da (ZST-03). */
export const STAND_VERALTET =
  'Der angezeigte Stand konnte nicht aktualisiert werden. Bitte die Verbindung prüfen.';
