import type { ReactNode } from 'react';

/**
 * Kopf einer Seite: Titel, erklärender Satz, Aktionen.
 *
 * Der Satz unter dem Titel ist Fließtext und begrenzt sich selbst auf ein
 * lesbares Maß. Seit UI-001 nutzt das Gerüst die volle Fensterbreite; ohne die
 * Begrenzung liefe dieser Satz auf einem breiten Bildschirm über die ganze
 * Seite.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {/* Seitentitel als `--type-h2` in der Hauptfarbe (DS-001). Der Titel
            ist die einzige Stelle, an der die Marke im Inhalt vorkommt —
            deshalb Hauptfarbe statt Tinte. */}
        <h1 className="text-accent text-h2 tracking-display font-extrabold">{title}</h1>
        {description ? (
          <p className="text-ink-muted mt-1 max-w-prose text-sm">{description}</p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}
