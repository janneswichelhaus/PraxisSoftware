import type { ReactNode } from 'react';

/** Ladezustand mit Textalternative statt reiner Animation. */
export function LoadingState({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <p role="status" className="text-ink-muted py-10 text-center text-sm">
      {label}
    </p>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string | undefined;
}) {
  return (
    <div className="py-12 text-center">
      <p className="text-ink text-[0.9375rem] font-medium">{title}</p>
      {description ? <p className="text-ink-muted mt-1 text-sm">{description}</p> : null}
    </div>
  );
}

/**
 * Fehlermeldung.
 *
 * PROJECT_PRINCIPLES.md 13: Bei unsicherem Zustand lieber blockieren und einen
 * verständlichen Fehler zeigen. Es werden bewusst keine technischen Details
 * ausgegeben, die Rückschlüsse auf fremde Daten erlauben.
 */
export function ErrorState({
  title,
  description,
}: {
  title: string;
  description?: ReactNode | undefined;
}) {
  return (
    <div role="alert" className="rounded-card border-danger/25 bg-danger-soft border px-4 py-3">
      {/* Titel und Erklärung sind Fließtext: eigene Zeilenlänge, seit das
          Gerüst die volle Fensterbreite nutzt (UI-001). */}
      <p className="text-danger max-w-prose text-[0.9375rem] font-medium">{title}</p>
      {description ? (
        <p className="text-ink-muted mt-1 max-w-prose text-sm">{description}</p>
      ) : null}
    </div>
  );
}
