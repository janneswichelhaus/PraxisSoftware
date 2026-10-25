/**
 * Die Tasche als Strichsymbol, Raster 24, Strich 2: was man für eine Übung
 * braucht oder womit sie geht - in den `Dosierungsmarken` („mit Rucksack
 * 3 kg“) und in der Anleitung („Sie brauchen:“). Für Vorlesesoftware
 * ausgeblendet; das Wort daneben sagt es.
 */
export function TascheSymbol({ className = 'size-5' }: { className?: string }) {
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
      className={className}
    >
      <path d="M9 7a3 3 0 0 1 6 0" />
      <path d="M6.5 9h11l1.5 11h-14z" />
    </svg>
  );
}
