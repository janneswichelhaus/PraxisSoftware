/**
 * Das Laufrad, die Markenform der Plattform (Handoff 2026-10-22, Abschnitt 3;
 * `marke/README.md`): ein Rad mit Nabe und vier Speichen - die Speiche, die im
 * Startbild zum O der Wortmarke wird. Nur als Fläche in der Hero-Karte und im
 * Leerzustand, nie neben der Wortmarke. Es trägt keine Bedeutung und ist für
 * Vorlesesoftware unsichtbar.
 *
 * Zeichnung im 200er-Raster. `kraeftig` ist die Fassung für kleine Größen
 * (Leerzustand, 44 px): dickere Striche, damit das Rad noch als Rad liest.
 */
export function Laufrad({
  className = '',
  kraeftig = false,
}: {
  className?: string;
  kraeftig?: boolean;
}) {
  const [rad, nabe, nabenradius, speiche] = kraeftig ? [16, 10, 12, 6] : [14, 6, 9, 3];
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      data-laufrad=""
      className={className}
    >
      <circle cx="100" cy="100" r="84" strokeWidth={rad} />
      <circle cx="100" cy="100" r={nabenradius} strokeWidth={nabe} />
      <path d="M100 16v168M16 100h168M41 41l118 118M159 41L41 159" strokeWidth={speiche} />
    </svg>
  );
}
