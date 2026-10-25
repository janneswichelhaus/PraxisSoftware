import { EINGABETEXTE, type Verlustschutztexte } from '@/features/documentation/Textverlustschutz';

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

/**
 * Ohne Netz sind Wünschen, Ändern und Absagen gesperrt (Handoff 2026-10-24
 * „Termine“, Frage 4; ANN-741): der Satz unter dem gesperrten Knopf - auf
 * der Liste und auf der Seite des Termins.
 */
export const WUENSCHE_OHNE_NETZ = 'Wünschen, Ändern und Absagen gehen wieder mit Verbindung.';
