import { symbolknopfKlassen } from '@/components/ui/buttonStile';
import { telHref } from '@/lib/telefon';

/**
 * Symbole des Eingangs (DESIGN.md Lücke 9.15: Raster 20, Strich 2, runde
 * Enden, `currentColor`, für Vorlesesoftware ausgeblendet). Sie bleiben hier,
 * bis ein zweiter Bereich sie braucht.
 */

/** Ein Telefonhörer. */
export function TelefonSymbol({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M4.5 3h3l1.5 4-2 1.2a9 9 0 0 0 4.8 4.8L13 11l4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A13.5 13.5 0 0 1 3 4.6 1.5 1.5 0 0 1 4.5 3Z" />
    </svg>
  );
}

/** Ein Stift: ändern. */
export function StiftSymbol({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5Z" />
      <path d="M11.5 5.5l3 3" />
    </svg>
  );
}

/** Drei Punkte: mehr zu dieser Zeile. */
export function MehrSymbol({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle cx="4.5" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="15.5" cy="10" r="1.6" />
    </svg>
  );
}

/**
 * Anrufen als `tel:`-Verweis in Gestalt eines `Symbolknopf` (44 × 44 px):
 * ein Ziel nach draußen, deshalb ein Link und kein Knopf (Regel 9). Der Name
 * nennt Person und Nummer - das Symbol allein sagt der Vorlesesoftware nichts.
 * Ab 640 px steht die Nummer daneben: Am Schreibtisch wählt man sie oft am
 * Tischtelefon, und dann muss man sie lesen können.
 */
export function Anrufknopf({
  nummer,
  beschriftung,
  onClick,
}: {
  nummer: string;
  /** Zugänglicher Name, etwa „Max Mustermann anrufen, Tel. +49 …". */
  beschriftung: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={telHref(nummer)}
      aria-label={beschriftung}
      onClick={onClick}
      className={symbolknopfKlassen(
        'secondary',
        'text-sm font-semibold sm:w-auto sm:gap-2 sm:px-3',
      )}
    >
      <TelefonSymbol />
      <span className="hidden tabular-nums sm:inline">{nummer}</span>
    </a>
  );
}
