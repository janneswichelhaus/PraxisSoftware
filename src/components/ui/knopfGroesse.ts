import { createContext } from 'react';
import type { Groesse } from './buttonStile';

/**
 * Die Größe, die ein `Button` oder `ButtonLink` ohne eigene Angabe annimmt
 * (Design-Fundament, ANN-403).
 *
 * Seitenkopf (`PageHeader`) und Objektkopf (`Objektkopf`) setzen hier
 * `kompakt`: Aktionen im Kopf sind 44 px hoch, nicht 48 (DESIGN.md, Regel
 * „Kopf“). Bis dahin stand an jeder Seite selbst, wie groß ihr Anlegen-Knopf
 * ist - meist in voller Größe, und am Telefon brach er unter den Titel.
 *
 * Eine ausdrückliche Angabe am Knopf gewinnt immer: `groesse="normal"` bleibt
 * 48 px, auch im Kopf.
 */
export const KnopfGroesseKontext = createContext<Groesse | undefined>(undefined);

export const KnopfGroesse = KnopfGroesseKontext.Provider;
