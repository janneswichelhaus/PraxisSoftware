import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import {
  UMFORMEN_NACHBILDUNG,
  UMFORMEN_RECHTSSATZ,
  umformenKnopf,
  type Umformen,
} from './umformen';

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
      {umformen.vorschlag.quelle === 'nachbildung' ? (
        <Statusmeldung ton="warnung">{UMFORMEN_NACHBILDUNG}</Statusmeldung>
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
            status={satz.unveraendert ? <Badge>unverändert</Badge> : undefined}
          />
        ))}
      </ListRows>
      <div className="flex flex-wrap gap-3">
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
      </div>
      <Kleingedrucktes>{UMFORMEN_RECHTSSATZ}</Kleingedrucktes>
    </div>
  );
}
