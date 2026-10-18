/**
 * Der Takt, in dem der Teamchat Wartendes von selbst noch einmal versucht -
 * Nachrichten im Ausgang (`ausgang.ts`) und Anhänge (`entwurfsanhaenge.ts`).
 * Eine eigene Datei, weil der Ausgang seit TEAM-005 die Anhänge kennt und
 * die Anhänge den Takt (ANN-654).
 */
export const WIEDERHOLEN_MS = 15_000;
