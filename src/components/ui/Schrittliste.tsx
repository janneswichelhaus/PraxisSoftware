import { zeilen } from './zeilen';

/**
 * Eine Anleitung in nummerierten Schritten (DESIGN.md Lücke 9.10): je Zeile
 * des Textes ein Schritt mit seiner Nummer im Kreis davor. Ein Text aus einer
 * einzigen Zeile bleibt ein Absatz - eine „1“ vor einem einzelnen Satz sagt
 * nichts.
 *
 * Seit 2026-10-15 trägt die Übung keine Zeichnung mehr (ANN-539); die Schritte
 * sind die Erklärung. Für Vorlesesoftware steht „Schritt n:“ vor dem Satz.
 */
export function Schrittliste({ text, leer }: { text: string | null; leer?: string }) {
  const schritte = zeilen(text);
  if (schritte.length === 0) {
    return leer ? <p className="text-ink-muted">{leer}</p> : null;
  }
  if (schritte.length === 1) {
    return <p className="text-ink max-w-prose">{schritte[0]}</p>;
  }
  return (
    <ol className="flex max-w-prose flex-col gap-3">
      {schritte.map((schritt, index) => (
        <li key={index} className="text-ink flex gap-3">
          <span
            aria-hidden="true"
            className="bg-accent-soft text-accent rounded-pill inline-flex size-7 shrink-0 items-center justify-center text-sm font-semibold"
          >
            {index + 1}
          </span>
          <span className="min-w-0 pt-0.5">
            <span className="sr-only">Schritt {index + 1}: </span>
            {schritt}
          </span>
        </li>
      ))}
    </ol>
  );
}
