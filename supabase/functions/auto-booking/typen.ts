import type { Coordinate } from '../location-provider/typen.ts';

// Der Vertrag der Function `auto-booking` (ANN-865): was der Browser schickt, was er zurückbekommt
// und was zwischen Datenbank und Kartendienst wandert. Namen, Adressen und Uhrzeiten gehen nie an den
// Kartendienst (ADR-019 Punkt 12).

export interface Wunschfenster {
  readonly weekday: number;
  readonly from: string;
  readonly to: string;
}

/** Was gebucht werden soll: ein Hausbesuch für eine Akte in einem Zeitraum. */
export interface Auftrag {
  readonly patient: string;
  readonly person: string | null;
  readonly dauerMinuten: number;
  readonly von: string;
  readonly bis: string;
  readonly wunschzeiten: readonly Wunschfenster[];
  readonly grundlage: string | null;
  readonly warteliste: string | null;
}

/** Ein Weg, den die Datenbank für die Prüfung braucht: nur zwei Koordinaten und ihr Schlüssel. */
export interface Weg {
  readonly key: string;
  readonly from: Coordinate;
  readonly to: Coordinate;
}

export interface Plan {
  readonly tage: number;
  readonly seitengroesse: number;
  readonly ziel: Coordinate;
  readonly wege: readonly Weg[];
}

/** `null`: Der Kartendienst fand keinen Weg oder nur eine Schätzung (ADR-019 Punkt 38). */
export interface Fahrzeit {
  readonly key: string;
  readonly seconds: number | null;
}

export interface Termin {
  readonly id: string;
  readonly person: string;
  readonly name: string | null;
  readonly datum: string;
  readonly beginn: string;
  readonly ende: string;
  readonly gebiet: 'none' | 'match' | 'outside';
}

export type Buchung =
  | { readonly ausgang: 'gebucht'; readonly termin: Termin }
  | { readonly ausgang: 'keiner'; readonly ungeprueft: number; readonly knapp: number }
  | { readonly ausgang: 'nochmal' };

export const FEHLERKLASSEN = [
  'session_invalid',
  'invalid_request',
  'forbidden',
  'not_configured',
  'not_found',
  'address_incomplete',
  'address_not_located',
  'waitlist_closed',
  'travel_unavailable',
  'too_many_routes',
  'unavailable',
  'outcome_unknown',
  'busy',
] as const;
export type Fehlerklasse = (typeof FEHLERKLASSEN)[number];

export type Wert =
  | { readonly ergebnis: 'gebucht'; readonly termin: Termin }
  | { readonly ergebnis: 'kein_platz'; readonly ungeprueft: number; readonly knapp: number };

export type Antwort =
  | { readonly ok: true; readonly value: Wert }
  | {
      readonly ok: false;
      readonly error: { readonly code: Fehlerklasse; readonly message: string };
    };
