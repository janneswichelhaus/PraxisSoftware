/**
 * Eine Zahl an einem Ziel der Navigation - „3 neu“ am Teamchat (TEAM-002,
 * ANN-647), ab 100 „99+“. Die Zahl
 * ist für Vorlesesoftware ein Teil des Namens („Nachrichten, 3 neu“), das Bild
 * nur Darstellung. Ohne Anzahl steht nichts da.
 */
export function Zaehlmarke({
  anzahl,
  wort = 'neu',
  auf = 'flaeche',
  className = '',
}: {
  anzahl: number;
  /** Was gezählt wird - für Vorlesesoftware. */
  wort?: string;
  /**
   * Worauf sie steht. Auf weißem Grund (Tableiste) in der Hauptfarbe mit
   * weißem Rand, der sie vom Symbol darunter löst - ein Rand, kein Schatten
   * (DS-001). Auf dem Tiefgrün der Seitenleiste in Salbei mit Tiefgrün als
   * Schrift: Die Hauptfarbe verschwände dort.
   */
  auf?: 'flaeche' | 'leiste';
  className?: string;
}) {
  if (anzahl <= 0) return null;
  const farbe =
    auf === 'leiste'
      ? 'bg-salbei text-surface-inverse'
      : 'bg-accent text-surface border-surface border-2';
  return (
    <span
      className={`${farbe} rounded-pill inline-flex h-5 min-w-5 items-center justify-center px-1.5 text-xs leading-none font-semibold tabular-nums ${className}`.trim()}
    >
      <span aria-hidden="true">{anzahl > 99 ? '99+' : anzahl}</span>
      <span className="sr-only">
        , {anzahl} {wort}
      </span>
    </span>
  );
}
