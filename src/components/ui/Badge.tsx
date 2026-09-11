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
 * Zeichen der drei Statustöne (DS-001).
 *
 * In der Palette „Flasche & Salbei" sind `akzent` und `positiv` **dieselbe
 * Farbe** — Hauptfarbe auf Salbei hell. Vorher hielt ein Test die beiden
 * Flächen über ihre Buntheit auseinander; das geht jetzt nicht mehr, und es
 * soll auch nicht: das Design System unterscheidet Status über ein Zeichen,
 * nicht über einen Farbton („Status-Pillen tragen ein Zeichen (✓ ! ×) plus
 * Text, weil Farbe nie allein trägt").
 *
 * `neutral` und `akzent` sind kein Status und tragen deshalb keins.
 */
const zeichen: Partial<Record<Ton, string>> = {
  positiv: '✓',
  warnung: '!',
  kritisch: '×',
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
      className={`rounded-pill inline-flex shrink-0 items-center gap-1 px-2.5 py-0.5 text-xs font-medium ${toene[ton]}`}
    >
      {/* Das Zeichen ist für Vorlesesoftware ausgeblendet: der Zustand steht
          daneben als Wort, und „Häkchen Abgeschlossen" wäre nur Rauschen. */}
      {zeichen[ton] ? <span aria-hidden="true">{zeichen[ton]}</span> : null}
      {children}
    </span>
  );
}
