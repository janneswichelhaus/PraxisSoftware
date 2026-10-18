import { ohneFormatierung } from './formatierung';

/** Grenzen der Aufgabe am Server (PRX-012): Titel 200, Notiz 1000 Zeichen. */
export const TITEL_MAX = 200;
export const NOTIZ_MAX = 1000;

/** Titel und Notiz aus einer Nachricht - rein, damit es sich prüfen lässt. */
export function aufgabeAus(text: string, herkunft: string): { titel: string; notiz: string } {
  const zeilen = text.split('\n').map((z) => z.trim());
  const erste = ohneFormatierung(zeilen.find((z) => z !== '') ?? '');
  const titel = erste.length > TITEL_MAX ? `${erste.slice(0, TITEL_MAX - 1)}…` : erste;
  const rest = `${text.trim()}\n\n${herkunft}`;
  return { titel, notiz: rest.length > NOTIZ_MAX ? `${rest.slice(0, NOTIZ_MAX - 1)}…` : rest };
}
