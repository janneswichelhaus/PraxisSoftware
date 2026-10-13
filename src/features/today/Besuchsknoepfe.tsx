import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { symbolknopfKlassen, type SymbolGroesse } from '@/components/ui/buttonStile';
import type { DayPlanEntry } from './api';
import {
  VERSPAETUNG_MINUTEN,
  anrufNummer,
  smsHref,
  smsNummer,
  verspaetungsText,
} from './besuchswege';
import { terminName } from './tagesstart';

/** Hörer im 20er-Raster, Strich 1,75, runde Enden (DESIGN.md 9.15). */
function TelefonSymbol() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="size-5"
    >
      <path d="M5.4 3.25h2.3l1.15 3.35-1.65 1.1a9.6 9.6 0 0 0 5.1 5.1l1.1-1.65 3.35 1.15v2.3a1.5 1.5 0 0 1-1.6 1.5A13.1 13.1 0 0 1 3.9 4.85a1.5 1.5 0 0 1 1.5-1.6Z" />
    </svg>
  );
}

/**
 * Anrufen mit einem Tipp (Auftrag C1): ein Symbol, keine Nummer im Bild.
 *
 * Die Nummer steht nur im Ziel des Links, nicht auf dem Bildschirm - die
 * Gründe für das „i“ (Umstehende lesen mit, AKTE-008) bleiben gewahrt. Gewählt
 * wird zuerst Mobil (`anrufNummer`); beide Nummern stehen weiter hinter dem
 * „i“ der Karte. Ohne Nummer gibt es keinen Knopf.
 */
export function AnrufKnopf({
  termin,
  groesse = 'normal',
}: {
  termin: DayPlanEntry;
  groesse?: SymbolGroesse;
}) {
  const nummer = anrufNummer(termin);
  if (!nummer) return null;
  return (
    <a
      href={nummer.href}
      aria-label={`Anrufen: ${terminName(termin)}`}
      title="Anrufen"
      className={symbolknopfKlassen('secondary', 'shrink-0', groesse)}
    >
      <TelefonSymbol />
    </a>
  );
}

/**
 * „Später da?“ - die Verspätung als SMS vom Diensttelefon (ANN-476).
 *
 * Ein Tipp öffnet drei Chips mit den Minuten, der zweite übergibt Nummer und
 * Vorlagentext an die SMS-App; abgeschickt wird dort, von Hand. Steht in einer
 * umbrechenden Knopfreihe: Die Chips rücken als eigene Zeile darunter.
 */
export function SpaeterDa({ termin, praxis }: { termin: DayPlanEntry; praxis: string }) {
  const [offen, setOffen] = useState(false);
  const bereichId = useId();
  const nummer = smsNummer(termin);
  if (!nummer) return null;
  return (
    <>
      <Button
        type="button"
        variant="quiet"
        groesse="kompakt"
        aria-expanded={offen}
        aria-controls={offen ? bereichId : undefined}
        onClick={() => setOffen((bisher) => !bisher)}
      >
        Später da?
      </Button>
      {offen ? (
        <div
          id={bereichId}
          role="group"
          aria-label="Verspätung per SMS ankündigen"
          className="order-last flex w-full flex-wrap gap-2"
        >
          {VERSPAETUNG_MINUTEN.map((minuten) => (
            <Chip key={minuten} href={smsHref(nummer, verspaetungsText(praxis, minuten))}>
              <span aria-hidden="true">+</span>
              {minuten} min
              <span className="sr-only"> per SMS ankündigen</span>
            </Chip>
          ))}
        </div>
      ) : null}
    </>
  );
}
