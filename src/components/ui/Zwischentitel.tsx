import type { ReactNode } from 'react';

/**
 * Eine Überschrift **innerhalb** eines Abschnitts oder einer Karte
 * (Design-Fundament, DESIGN.md Lücke 9.2): „Person“, „Kontakt“, „Adresse“ in
 * einem Block der Stammdaten, „Sätze“ und „Hinweise“ auf einer Übung.
 *
 * Bis dahin stand sie 46-mal von Hand da, in mindestens acht Größen
 * (`text-base font-semibold`, `text-[1.0625rem]`, `text-h4 font-bold`,
 * `text-lg`, `text-xl` …). Jetzt eine: 16 px in 600, Tinte - die häufigste
 * Form im Bestand. 16 px Abstand nach oben (nicht als erstes Kind), 8 nach
 * unten.
 *
 * Der Abschnittstitel darüber bleibt `Section` (12 px Versalien, Leise); der
 * Seitentitel bleibt `PageHeader` bzw. `Objektkopf`. `ebene` wählt nur das
 * Element (h3 unter einem `Section` mit h2, h4 eine Stufe tiefer), nie die
 * Größe. `aktion` steht rechts daneben, etwa ein Textlink „Bearbeiten“.
 */
export function Zwischentitel({
  children,
  ebene = 3,
  aktion,
  id,
}: {
  children: ReactNode;
  ebene?: 3 | 4;
  aktion?: ReactNode;
  /** Für `aria-labelledby` einer Gruppe darunter. */
  id?: string;
}) {
  const Element = ebene === 4 ? 'h4' : 'h3';
  const titel = (
    <Element id={id} className="text-ink text-base font-semibold">
      {children}
    </Element>
  );
  if (!aktion) {
    return <div className="mt-4 mb-2 first:mt-0">{titel}</div>;
  }
  return (
    <div className="mt-4 mb-2 flex min-h-11 flex-wrap items-center justify-between gap-x-3 first:mt-0">
      {titel}
      {aktion}
    </div>
  );
}
