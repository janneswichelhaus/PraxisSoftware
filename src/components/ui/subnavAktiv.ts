import { matchPath } from 'react-router-dom';
import type { SubNavEintrag } from './SubNav';

/** Liegt `pathname` auf `pfad` oder darunter? */
export function liegtUnter(pfad: string, pathname: string): boolean {
  return matchPath({ path: pfad, end: false }, pathname) !== null;
}

/** Ist der Eintrag auf `pathname` aktiv - genau oder über einen seiner `pfade`? */
export function istAktiv(eintrag: SubNavEintrag, pathname: string): boolean {
  if (matchPath({ path: eintrag.to, end: eintrag.end ?? true }, pathname)) return true;
  return (eintrag.pfade ?? []).some((pfad) => liegtUnter(pfad, pathname));
}
