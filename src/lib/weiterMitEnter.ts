import type { KeyboardEvent } from 'react';

/** Was als Eingabe gilt; Knöpfe, Kästchen und Auswahlpunkte lösen Enter selbst aus. */
const FELDER = 'input:not([type=hidden]), select, textarea';
const OHNE_WEITER = new Set(['submit', 'button', 'reset', 'checkbox', 'radio', 'file']);

function sichtbar(element: HTMLElement): boolean {
  if ((element as HTMLInputElement).disabled) return false;
  // Ein Feld in einem zugeklappten Aufklapper ist nicht erreichbar.
  const aufklapper = element.closest('details');
  if (aufklapper && !aufklapper.open && !element.closest('summary')) return false;
  return true;
}

/**
 * „Weiter“ auf der Tastatur des Telefons (K11, ANN-543): Enter in einem
 * einzeiligen Feld springt ins nächste Feld, statt das Formular halb
 * ausgefüllt abzuschicken. Im letzten Feld schickt Enter ab - wie der Knopf.
 * Ein Zeilenumbruch im Textfeld bleibt ein Zeilenumbruch.
 *
 * Als `onKeyDown` an das `<form>`; die Felder tragen `enterKeyHint="next"`.
 */
export function weiterMitEnter(event: KeyboardEvent<HTMLFormElement>): void {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
  const ziel = event.target;
  if (!(ziel instanceof HTMLInputElement) || OHNE_WEITER.has(ziel.type)) return;
  const felder = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FELDER)).filter(
    sichtbar,
  );
  const naechstes = felder[felder.indexOf(ziel) + 1];
  if (!naechstes) return;
  event.preventDefault();
  naechstes.focus();
}
