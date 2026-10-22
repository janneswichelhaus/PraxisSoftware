import type { ButtonHTMLAttributes, Ref } from 'react';

/**
 * Der Zweitknopf „Menü“ im Kopf der Plattform unter 23rem (Handoff
 * 2026-10-22, Abschnitt 3; ANN-682): drei Striche, offen ein Kreuz, dazu das
 * Wort. Wie `Button variant="secondary"` - Rahmen `line-strong`, Schrift in
 * der Hauptfarbe, 48 hoch -, aber mit 8 statt 20 px Rand: Bei 188 px Breite
 * stünde er sonst nicht neben der Wortmarke. Was er öffnet, sagen
 * `aria-expanded` und `aria-controls`.
 *
 * Druck wie an den Knöpfen der Plattform: die vertiefte Fläche und 98 % in
 * 120 ms, bei „Bewegung reduzieren“ nur die Fläche (DR-117).
 */
export function Menueknopf({
  offen,
  steuert,
  ref,
  ...props
}: {
  offen: boolean;
  /** Die Kennung des Menüs, das der Knopf öffnet. */
  steuert: string;
  ref?: Ref<HTMLButtonElement>;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'type'>) {
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={offen}
      aria-controls={steuert}
      className="nicht-drucken border-line-strong text-accent not-disabled:hover:bg-accent-soft rounded-button ease-druck active:bg-surface-sunken inline-flex min-h-12 items-center justify-center gap-1 border px-2 font-bold transition-[color,background-color,border-color,scale] duration-120 motion-safe:active:scale-98"
      {...props}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        {offen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
      </svg>
      Menü
    </button>
  );
}
