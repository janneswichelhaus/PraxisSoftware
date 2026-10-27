// Die Schnittstelle der Domäne portal: Andere Domänen importieren nur, was hier einzeln steht.
// Seiten stehen nicht darin; src/routes und src/app binden direkt ein (ANN-755).

export { AnhangHerausgabe } from './messages/AnhangHerausgabe';
export { NachrichtenInDerAkte } from './messages/InDieAkte';
export {
  OffeneRueckfragen,
  RueckfragenAbschnitt,
  TrainingRueckfragen,
} from './messages/RueckfragenAbschnitt';
export { fetchRueckfragen, rueckfragenKey, type Verhaeltnisart } from './messages/api';
export { BenachrichtigungsSchalter } from './platform-access/BenachrichtigungsSchalter';
export { PlattformAbschnitt, PlattformzugangBeenden } from './platform-access/PlattformAbschnitt';
export { type Plattformzugang } from './platform-access/api';
export { anzeigezustand, usePlattformzugang, zugangBeendbar } from './platform-access/zustand';
export { bereinigeTon, tontyp } from './platform/videometadaten';
