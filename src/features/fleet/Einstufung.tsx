import type { Severity } from './bike3d/zones';

/** Die Einstufung einer Stelle als Zeichen und Wort (DESIGN.md Regel 5). */
export function Einstufung({ einstufung }: { einstufung: Severity }) {
  return einstufung === 'problem' ? (
    <span className="text-danger font-medium">
      <span aria-hidden="true">× </span>Problem
    </span>
  ) : (
    <span className="text-warnung font-medium">
      <span aria-hidden="true">! </span>Beobachten
    </span>
  );
}
