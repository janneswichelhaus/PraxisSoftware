/**
 * Fortschrittsbalken, 6 px hoch (Design-Handoff 2026-10-01, Abschnitt 7):
 * Spur in der Linienfarbe, der erreichte Teil in der Hauptfarbe.
 *
 * Für Vorlesesoftware ausgeblendet - die Zahl steht immer als Text daneben
 * („1 von 6 verbraucht"), der Balken wiederholt sie nur fürs Auge
 * (Abschnitt 9). Ohne Gesamtzahl gibt es keinen Balken.
 */
export function ProgressBar({ wert, von }: { wert: number; von: number }) {
  if (von <= 0) return null;
  const anteil = Math.min(1, Math.max(0, wert / von));
  return (
    <span aria-hidden="true" className="bg-spur rounded-pill mt-2 block h-1.5 overflow-hidden">
      <span
        data-fortschritt=""
        className="bg-accent rounded-pill block h-full"
        style={{ width: `${Math.round(anteil * 100)}%` }}
      />
    </span>
  );
}
