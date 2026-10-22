import { NICHT_AKUT, zusage } from './nachrichtentexte';
import { Notfallsatz } from './Notfallsatz';

/**
 * Zusage und Notfallhinweis über jedem Eingabefeld für Nachrichten
 * (IDEA-KOM-002, DSN-001 4.1; Handoff 2026-10-22, Abschnitt 3): eine ruhige
 * Fläche mit dem Zeichen eines Telefons, dauerhaft, ohne Schließen-Knopf.
 * Der Wortlaut bleibt (`zusage`, `NICHT_AKUT`, `NOTFALL`); 112 und 116117
 * sind Anruf-Links mit 44 px Ziel (`Notrufnummer`). Die Karte steht dort,
 * wo man schreibt, nicht auf der Übersicht (Entscheidung Jannes 2026-10-22).
 */
export function Notfallkarte({
  werktage,
  className = '',
}: {
  werktage: number;
  className?: string;
}) {
  return (
    <div
      role="note"
      aria-label="Hinweis zu Antwortzeit und Notfällen"
      className={`bg-surface-sunken rounded-card text-ink flex gap-3.5 p-5 ${className}`.trim()}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className="mt-0.5 size-6 shrink-0"
      >
        <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
      </svg>
      <div className="min-w-0">
        <p>{zusage(werktage)}</p>
        <p className="mt-1">
          <strong>{NICHT_AKUT}</strong> <Notfallsatz />
        </p>
      </div>
    </div>
  );
}
