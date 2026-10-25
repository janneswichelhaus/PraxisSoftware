import type { ReactNode } from 'react';
import { Schrittliste } from '@/components/ui/Schrittliste';
import { TascheSymbol } from '@/components/ui/TascheSymbol';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import type { Ablageplan } from './ablage';

/**
 * Wie eine Übung geht, unter Bühne und Marken (Handoff 2026-10-24, Abschnitte
 * 5.2 und 5.3): „So geht’s“ mit den Schritten der Fachperson (Nummer im Kreis
 * 32, ein einziger Schritt als Absatz), dann „Sie brauchen:“ und „Hinweis:“
 * mit Zeichen. Derselbe Inhalt in der Durchführung und im Fenster „Übung zum
 * Nachlesen“ (BEF-215); `ebene` folgt dem Namen in der Bühne darüber - in der
 * Durchführung der Seitentitel, im Fenster eine Ebene tiefer.
 */
export function Anleitung({
  position,
  ebene = 2,
}: {
  position: Ablageplan['items'][number];
  ebene?: 2 | 3;
}) {
  if (!position.instruction && position.equipment.length === 0 && !position.note) return null;
  return (
    <div className="flex flex-col gap-4">
      {position.instruction ? (
        <div>
          <Zwischentitel ebene={ebene} stufe="abschnitt">
            So geht’s
          </Zwischentitel>
          <Schrittliste text={position.instruction} gross />
        </div>
      ) : null}
      {position.equipment.length > 0 ? (
        <Angabe zeichen={TASCHE} wort="Sie brauchen:">
          {position.equipment.join(', ')}
        </Angabe>
      ) : null}
      {position.note ? (
        <Angabe zeichen={HINWEIS} wort="Hinweis:">
          {position.note}
        </Angabe>
      ) : null}
    </div>
  );
}

function Angabe({
  zeichen,
  wort,
  children,
}: {
  zeichen: ReactNode;
  wort: string;
  children: string;
}) {
  return (
    <p className="text-ink flex items-start gap-3">
      {zeichen}
      <span className="min-w-0">
        <span className="font-semibold">{wort} </span>
        {children}
      </span>
    </p>
  );
}

/** Zeichen 22 in der Hauptfarbe, für Vorlesesoftware ausgeblendet. */
function Zeichen({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="text-accent mt-0.5 size-5.5 shrink-0"
    >
      {children}
    </svg>
  );
}

/** Eine Tasche: was man braucht. */
const TASCHE = <TascheSymbol className="text-accent mt-0.5 size-5.5 shrink-0" />;
/** Ein Kreis mit „i“: der Hinweis der Fachperson. */
const HINWEIS = (
  <Zeichen>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Zeichen>
);
