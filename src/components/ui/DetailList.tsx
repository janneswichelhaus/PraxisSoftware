import type { ReactNode } from 'react';

/**
 * Beschriftete Angaben auf einer Detailseite (UI-000).
 *
 * Die Zeile stand vorher in vier Dateien einzeln: Patientenakte,
 * Mitarbeiterdatensatz, Termindetail und Verordnungskarte. Drei nahmen nur
 * `string` entgegen, eine auch Elemente — an dieser Stelle entstehen die
 * `tel:`- und `mailto:`-Links, deshalb gilt hier `ReactNode`.
 *
 * Bewusst als Definitionsliste: Vorlesesoftware liest Bezeichnung und Wert
 * zusammen, statt zwei zusammenhanglose Textfragmente.
 *
 * Nicht zu verwechseln mit `DataRow` aus `Card.tsx`: das ist die kompakte,
 * rechtsbündige Zeile **innerhalb einer Karte**. Diese hier hat eine
 * Beschriftungsspalte und bricht auf schmalen Displays um.
 */
export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="divide-line border-line mt-2 divide-y border-t">{children}</dl>;
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-6 sm:py-2.5">
      <dt className="text-ink-muted text-sm sm:w-44 sm:shrink-0">{label}</dt>
      {/* whitespace-pre-line: mehrzeilige Freitexte wie der Zugangshinweis
          behalten ihre Absaetze (PAT-005). */}
      <dd className="text-ink text-[0.9375rem] whitespace-pre-line">{children}</dd>
    </div>
  );
}
