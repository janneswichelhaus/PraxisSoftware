import { useEffect, useRef } from 'react';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { UMFORMEN_RECHTSSATZ, umformenKnopf, umformenNachbildung, type Umformen } from './umformen';

/** Die Hilfen unter dem Antwortfeld; ohne Text sagt die Seite, was fehlt. */
export function Umformknoepfe({
  umformen,
  leer,
  onLeer,
}: {
  umformen: Umformen;
  leer: boolean;
  onLeer: () => void;
}) {
  if (umformen.angeboten.length === 0 || umformen.vorschlag) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {umformen.angeboten.map((zweck) => (
        <Button
          key={zweck}
          type="button"
          variant="secondary"
          groesse="kompakt"
          disabled={umformen.laeuft !== undefined}
          onClick={() => (leer ? onLeer() : void umformen.starten(zweck))}
        >
          {umformen.laeuft === zweck ? 'Wird umgeformt …' : umformenKnopf(zweck)}
        </Button>
      ))}
    </div>
  );
}

/**
 * Der Vorschlag unter dem Antwortfeld: je Satz die Quelle daneben, damit geprüft werden kann,
 * was der eigene Text sagte. Verwerfen fragt nicht nach - der eigene Text steht noch im Feld.
 */
export function Umformvorschlag({
  umformen,
  onUebernehmen,
}: {
  umformen: Umformen;
  onUebernehmen: (text: string) => void;
}) {
  const abschnitt = useRef<HTMLDivElement>(null);
  const da = umformen.vorschlag !== undefined;

  // Der Vorschlag erscheint ohne Seitenwechsel; der Fokus folgt ihm für Vorlesesoftware.
  useEffect(() => {
    if (da) abschnitt.current?.focus();
  }, [da]);

  if (!umformen.vorschlag) {
    return umformen.meldung ? (
      <Statusmeldung ton={umformen.meldung.ton}>{umformen.meldung.text}</Statusmeldung>
    ) : null;
  }

  return (
    <div ref={abschnitt} tabIndex={-1} className="flex flex-col gap-3 focus:outline-none">
      <Zwischentitel>Vorschlag – bitte prüfen</Zwischentitel>
      {umformen.vorschlag.quelle === 'nachbildung' && umformen.vorschlagZweck ? (
        <Statusmeldung ton="warnung">{umformenNachbildung(umformen.vorschlagZweck)}</Statusmeldung>
      ) : null}
      <ListRows beschriftung="Vorschlag Satz für Satz">
        {umformen.vorschlag.saetze.map((satz, stelle) => (
          <ListRow
            key={stelle}
            titel={<span className="wrap-anywhere">{satz.text}</span>}
            meta={
              satz.unveraendert ? undefined : (
                <span className="wrap-anywhere">Aus: „{satz.quelle}“</span>
              )
            }
            // Ehrlich für beide Fälle: nichts umzuformen, oder die Prüfung ließ die Quelle stehen.
            status={
              satz.unveraendert ? (
                <Badge eigenesZeichen={STATUSZEICHEN.fehlt}>nicht umgeformt</Badge>
              ) : undefined
            }
          />
        ))}
      </ListRows>
      <Kleingedrucktes>{UMFORMEN_RECHTSSATZ}</Kleingedrucktes>
      {/* Wie ein Formularende: Hauptknopf zuerst, am Telefon in voller Breite (DESIGN.md 9.5). */}
      <Formularfuss dicht>
        <Button
          type="button"
          onClick={() => {
            const text = umformen.uebernehmen();
            if (text) onUebernehmen(text);
          }}
        >
          Übernehmen
        </Button>
        <Button type="button" variant="quiet" onClick={umformen.verwerfen}>
          Verwerfen
        </Button>
      </Formularfuss>
    </div>
  );
}
