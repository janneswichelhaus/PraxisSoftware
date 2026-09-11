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
        <h1 className="text-ink text-[1.375rem] font-semibold tracking-[-0.01em] sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="text-ink-muted mt-1 max-w-prose text-sm">{description}</p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}
