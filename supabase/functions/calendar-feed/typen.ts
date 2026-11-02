// Was die Function vom Abo kennt (ANN-838): je Termin Kennung, Zeit und Art, nichts sonst.

export type Art = 'home_visit' | 'practice' | 'video';

export interface Eintrag {
  /** SHA-256 aus Termin und Abo, ohne Rückschluss auf den Termin. */
  readonly uid: string;
  readonly beginn: Date;
  readonly ende: Date;
  readonly art: Art;
}

/** `eintraege: null` heißt: Adresse unbekannt oder das Konto gilt nicht mehr. */
export type Abruf =
  | { readonly ok: true; readonly eintraege: readonly Eintrag[] | null }
  | { readonly ok: false };

export interface Quelle {
  readonly lies: (adresse: string) => Promise<Abruf>;
}
