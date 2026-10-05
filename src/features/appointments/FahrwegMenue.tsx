import { useEffect, useRef, type CSSProperties } from 'react';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import type { NavigationTarget } from '@/lib/location/contract';
import { buildNavigationUrl, navigationOeffnen } from '@/lib/location/navigation';
import { formatiereStrecke } from '@/lib/location/strecke';

/** Was das Menü über einen Fahrweg weiß - von der Seite zusammengesetzt. */
export interface FahrwegAuskunft {
  /** „Garage", „Praxis" oder die Bezeichnung des Termins davor. */
  von: string;
  /** Die Bezeichnung des Termins danach, am Rückweg „Garage" oder „Praxis". */
  nach: string;
  minuten: number;
  meter: number | null;
  /** Das Ziel für die Navigation - nur die Koordinate (ANN-018). */
  ziel: NavigationTarget | null;
  rueckweg: boolean;
  /** Die Tour dieser Person an diesem Tag. */
  tourZiel: string;
}

/**
 * Menü an einem angetippten Fahrweg (UBK-016, ANN-241): von → nach, Minuten,
 * Kilometer, „Navigation starten" und „Zur Tour".
 *
 * Kein Fenster über dem Kalender, sondern ein Kasten an der Stelle - wie die
 * Rückfrage beim Verschieben (FIX-017). „Navigation starten" ist der
 * vorhandene Handoff: Die URL entsteht erst beim Tippen und trägt nur die
 * Koordinate des Ziels und den Fahrradmodus (ADR-019 Punkt 20 bis 22). Die
 * Ziel-App ist Google Maps wie am Termin (`NavigationStarten`).
 */
export function FahrwegMenue({
  weg,
  onSchliessen,
  className = '',
  style,
}: {
  weg: FahrwegAuskunft;
  onSchliessen: () => void;
  className?: string;
  style?: CSSProperties | undefined;
}) {
  const ersterRef = useRef<HTMLButtonElement>(null);
  const schliessenRef = useRef<HTMLButtonElement>(null);

  // Der Fokus geht in das Menü, ohne die Seite springen zu lassen (KAL-21).
  useEffect(() => {
    (ersterRef.current ?? schliessenRef.current)?.focus({ preventScroll: true });
  }, [weg.von, weg.nach]);

  const ziel = weg.ziel;
  const titel = weg.rueckweg ? 'Rückweg' : 'Fahrweg';

  return (
    <div
      role="group"
      aria-label={titel}
      data-testid="fahrweg-menue"
      className={`border-line-strong bg-surface rounded-card border-2 p-3 ${className}`}
      style={style}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onSchliessen();
      }}
    >
      <p className="text-ink text-sm font-semibold">{titel}</p>
      <p className="text-ink mt-1 text-sm">
        {weg.von} <span aria-hidden="true">→</span>
        <span className="sr-only"> nach </span> {weg.nach}
      </p>
      <p className="text-ink-muted text-sm tabular-nums">
        ≈ {weg.minuten} Min.
        {weg.meter !== null && weg.meter > 0 ? ` · ${formatiereStrecke(weg.meter)}` : ''}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ziel ? (
          <Button
            ref={ersterRef}
            type="button"
            groesse="kompakt"
            onClick={() => navigationOeffnen(buildNavigationUrl(ziel, 'google_maps'))}
          >
            Navigation starten
          </Button>
        ) : null}
        <ButtonLink to={weg.tourZiel} variant="secondary" groesse="kompakt">
          Zur Tour
        </ButtonLink>
        <Button
          ref={schliessenRef}
          type="button"
          variant="quiet"
          groesse="kompakt"
          onClick={onSchliessen}
        >
          Schließen
        </Button>
      </div>
    </div>
  );
}
