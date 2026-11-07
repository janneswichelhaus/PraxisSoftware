export interface Route {
  muster: string;
  pfad: string;
  bereich: string;
  etikett: string;
  konten: readonly string[];
  ziel?: string;
  ohneDaten?: string;
}
export const IDS: Readonly<Record<string, string>>;
export const BEREICHE: readonly string[];
export const ROUTEN: readonly Route[];
export const AUSGENOMMEN: readonly { muster: string; grund: string }[];
