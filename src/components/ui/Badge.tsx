import type { ReactNode } from 'react';

export type Ton = 'neutral' | 'akzent' | 'positiv' | 'warnung' | 'kritisch';

const toene: Record<Ton, string> = {
  neutral: 'bg-surface-sunken text-ink-muted',
  akzent: 'bg-accent-soft text-accent',
  positiv: 'bg-positiv-soft text-positiv',
  warnung: 'bg-warnung-soft text-warnung',
  kritisch: 'bg-danger-soft text-danger',
};

/**
 * Kurzes Statuszeichen.
 *
 * Der Zustand steht immer als Text im Abzeichen, der Ton ergänzt ihn nur.
 * Bedeutung darf nicht allein an einer Farbe hängen (WCAG 1.4.1).
 */
export function Badge({ ton = 'neutral', children }: { ton?: Ton; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toene[ton]}`}
    >
      {children}
    </span>
  );
}
