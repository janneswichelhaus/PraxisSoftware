// Der Vertrag zwischen Function und Terminal (ANN-837): Ein Auftrag trägt Betrag, Währung und eine
// zufällige Referenz. Für Name, Rechnungsnummer oder Leistung hat er kein Feld.

export interface Zahlauftrag {
  readonly betragCent: number;
  readonly waehrung: string;
  /** Je Versuch neu und zufällig; sie verrät dem Zahlungsdienst nichts über die Person. */
  readonly referenz: string;
}

export type Terminalergebnis =
  | { readonly status: 'angenommen'; readonly transaktion: string }
  | { readonly status: 'abgelehnt' }
  | { readonly status: 'abgebrochen' }
  | { readonly status: 'nicht_erreichbar' };

export interface Terminaladapter {
  readonly id: 'mock';
  readonly quelle: 'anbieter' | 'nachbildung';
  kassiere(auftrag: Zahlauftrag): Promise<Terminalergebnis>;
}

/** Warum eine Rechnung jetzt nicht zahlbar ist; die Oberfläche hat für jeden Grund einen Satz. */
export type Zahlbarkeit = 'open_amount' | 'cancelled' | 'not_issued' | 'amount';

export type Fehlerklasse =
  | 'session_invalid'
  | 'invalid_request'
  | 'forbidden'
  | 'not_configured'
  | 'not_payable'
  | 'declined'
  | 'cancelled'
  | 'unavailable'
  | 'timeout'
  | 'not_booked';

export interface Fehler {
  readonly code: Fehlerklasse;
  readonly message: string;
  readonly detail?: Zahlbarkeit;
  /** Nur bei `not_booked`: abgebucht, aber nicht gebucht; die Kennung braucht das Büro. */
  readonly transaktion?: string;
}

export interface Statuswert {
  readonly verfuegbar: boolean;
  readonly quelle: 'anbieter' | 'nachbildung' | null;
}

export interface Zahlungswert {
  readonly zahlung: string;
  readonly transaktion: string;
  readonly quelle: 'anbieter' | 'nachbildung';
}

export type Antwort<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: Fehler };
