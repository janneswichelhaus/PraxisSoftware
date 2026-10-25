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
 * Zeichen für Zustände ohne eigenen Ton (ANN-485, Regel 5 „Status = Zeichen
 * + Wort“): `neutral` und `akzent` tragen von sich aus keins, ein Zustand
 * braucht aber eins (Sichtung 13.10.2026, A6). Über `eigenesZeichen`:
 *
 *   * `fehlt` - (noch) nicht gegeben („Nicht erteilt“).
 *   * `wartet` - liegt bei jemand anderem („bei der Praxis“).
 *   * `abgelehnt` - bewusst nicht („Abgelehnt am …“), wie „× Abgesagt“.
 *   * `unbekannt` - nicht geprüft („Fahrweg nicht geprüft“).
 *   * `antwort` - eine Antwort liegt vor („beantwortet“).
 *   * `neu` - noch nicht gesehen („2 neu“, TEAM-001).
 *   * `erwaehnt` - die Person ist gemeint („für dich“, TEAM-001).
 *
 * Kein „○“: In der Schrift der Anwendung las es sich als großes O.
 */
export const STATUSZEICHEN = {
  fehlt: '–',
  wartet: '…',
  abgelehnt: '×',
  unbekannt: '?',
  antwort: '↩',
  neu: '●',
  erwaehnt: '@',
} as const;

/**
 * Kurzes Statuszeichen.
 *
 * Der Zustand steht immer als Text im Abzeichen, der Ton ergänzt ihn nur.
 * Bedeutung darf nicht allein an einer Farbe hängen (WCAG 1.4.1).
 *
 * 28 px hoch, 14 px in 600 (Design-Handoff 2026-10-01; bis dahin 12 px in
 * 500). Kein Bedienziel: Das Abzeichen wird gelesen, nicht getippt.
 *
 * Es bricht nur zwischen Wörtern (BEF-220): `.plattform-schrift` lässt
 * Fließtext überall brechen, und so stand „Änderung angefragt“ als
 * „Änderun|g angefrag|t“ in einer schmalen Spalte. Höchstens so breit wie
 * die Zeile; ein Wort, das allein breiter ist, bricht noch (ANN-733).
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
      className={`rounded-pill inline-flex min-h-7 max-w-full shrink-0 items-center gap-1 px-3 py-0.5 text-sm font-semibold wrap-break-word hyphens-manual ${toene[ton]}`}
    >
      {/* Das Zeichen ist für Vorlesesoftware ausgeblendet: der Zustand steht
          daneben als Wort, und „Häkchen Abgeschlossen" wäre nur Rauschen. */}
      {bild ? <span aria-hidden="true">{bild}</span> : null}
      {children}
    </span>
  );
}
