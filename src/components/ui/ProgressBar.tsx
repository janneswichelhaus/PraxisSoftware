/**
 * Fortschrittsbalken, 6 px hoch (Design-Handoff 2026-10-01, Abschnitt 7):
 * Spur in der Linienfarbe, der erreichte Teil in der Hauptfarbe.
 *
 * Für Vorlesesoftware ausgeblendet - die Zahl steht immer als Text daneben
 * („1 von 6 verbraucht"), der Balken wiederholt sie nur fürs Auge
 * (Abschnitt 9). Ohne Gesamtzahl gibt es keinen Balken.
 */
export function ProgressBar({
  wert,
  von,
  kante = false,
  dicht = false,
}: {
  wert: number;
  von: number;
  /** Helle Fläche mit Kante statt dunkler Spur, 12 hoch (Tagebuch, Verlauf); die Kante hält 3:1. */
  kante?: boolean;
  /** Mit `kante` 8 statt 12 hoch, etwa für die Nährstoffe. */
  dicht?: boolean;
}) {
  if (von <= 0) return null;
  const anteil = Math.min(1, Math.max(0, wert / von));
  const spur = kante
    ? `bg-surface border-line-strong rounded-pill block overflow-hidden border ${dicht ? 'h-2' : 'h-3'}`
    : 'bg-spur rounded-pill mt-2 block h-1.5 overflow-hidden';
  return (
    <span aria-hidden="true" className={spur}>
      <span
        data-fortschritt=""
        className={`bg-accent rounded-pill block h-full ${kante ? 'ease-druck motion-safe:transition-[width] motion-safe:duration-[240ms]' : ''}`}
        style={{ width: `${Math.round(anteil * 100)}%` }}
      />
    </span>
  );
}
