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
 *
 * 28 px hoch, 14 px in 600 (Design-Handoff 2026-10-01; bis dahin 12 px in
 * 500). Kein Bedienziel: Das Abzeichen wird gelesen, nicht getippt.
 *
 * `eigenesZeichen` ersetzt das Zeichen des Tons. Das braucht, wer eine Sache
 * unterscheidet, die kein Status ist — die Mitteilungswege am Termin etwa
 * (CAL-012): vier Abzeichen im selben Ton, die sich am Bild auseinanderhalten
 * lassen müssen. Es bleibt für Vorlesesoftware ausgeblendet; getragen wird die
 * Bedeutung weiterhin vom Text daneben.
 */
export function Badge({
  ton = 'neutral',
  eigenesZeichen,
  children,
}: {
  ton?: Ton;
  eigenesZeichen?: ReactNode;
  children: ReactNode;
}) {
  const bild = eigenesZeichen ?? zeichen[ton];

  return (
    <span
      className={`rounded-pill inline-flex min-h-7 shrink-0 items-center gap-1 px-3 text-sm font-semibold ${toene[ton]}`}
    >
      {/* Das Zeichen ist für Vorlesesoftware ausgeblendet: der Zustand steht
          daneben als Wort, und „Häkchen Abgeschlossen" wäre nur Rauschen. */}
      {bild ? <span aria-hidden="true">{bild}</span> : null}
      {children}
    </span>
  );
}
