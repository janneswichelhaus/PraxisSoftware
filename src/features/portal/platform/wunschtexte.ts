import { EINGABETEXTE, type Verlustschutztexte } from '@/app/Textverlustschutz';

/**
 * Die Rückfrage vor dem Weggehen aus einem Terminwunsch (Überholung 6): Sie
 * spricht vom Wunsch, der noch nicht gesendet ist - gespeichert wird hier
 * nichts, deshalb gibt es nur „Verwerfen“ und „Weiter ausfüllen“.
 */
export const WUNSCHSCHUTZ: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Wunsch noch nicht gesendet',
  weitergehen: 'Ihre Angaben gehen beim Weitergehen verloren.',
  abmelden: 'Ihre Angaben gehen beim Abmelden verloren.',
  ohneVerbindung:
    'Ohne Verbindung lässt sich Ihr Wunsch gerade nicht senden. Ihre Angaben bleiben stehen – bitte warten, bis die Verbindung zurück ist.',
  zeile: {
    weitergehen: 'Ihr Wunsch ist noch nicht gesendet.',
    abmelden: 'Ihr Wunsch ist noch nicht gesendet – abmelden?',
    bleiben: 'Weiter ausfüllen',
  },
};
