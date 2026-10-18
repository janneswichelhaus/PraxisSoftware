import { useState, type FormEvent } from 'react';
import { todayInTimeZone } from '@/features/appointments/api';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Field } from '@/components/ui/Field';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { freieZeit, type Zeitvorschlag } from './zeit';

/**
 * Einen Zeitpunkt wählen - für „Später senden“ (ANN-643) und „Erinnern“
 * (ANN-646): zwei bis vier Vorschläge mit einem Tipp, darunter Tag und
 * Uhrzeit frei. Unten am Telefon, mit dem Daumen erreichbar (`Dialogfenster`).
 */
export function Zeitwahl({
  titel,
  vorschlaege,
  zeitzone,
  bestaetigen,
  laeuft,
  fehler,
  onWaehlen,
  onSchliessen,
}: {
  titel: string;
  vorschlaege: readonly Zeitvorschlag[];
  zeitzone: string;
  /** Beschriftung des Knopfs für die freie Wahl, etwa „Planen“. */
  bestaetigen: string;
  laeuft: boolean;
  fehler?: string | undefined;
  onWaehlen: (um: string) => void;
  onSchliessen: () => void;
}) {
  const [datum, setDatum] = useState(() => todayInTimeZone(zeitzone));
  const [uhrzeit, setUhrzeit] = useState('08:00');
  const frei = freieZeit(datum, uhrzeit, zeitzone);

  function absenden(e: FormEvent) {
    e.preventDefault();
    // Das Fenster steht im Baum oft in einem anderen Formular (der Eingabe);
    // React reicht das Absenden auch durch ein Portal hinauf.
    e.stopPropagation();
    if (frei && !laeuft) onWaehlen(frei);
  }

  return (
    <Dialogfenster titel={titel} onSchliessen={onSchliessen}>
      <div className="flex flex-col gap-4">
        <ListRows beschriftung="Vorschläge">
          {vorschlaege.map((v) => (
            <ListRow
              key={v.text}
              dicht
              titel={v.text}
              onClick={() => {
                if (!laeuft) onWaehlen(v.um);
              }}
            />
          ))}
        </ListRows>
        <form onSubmit={absenden} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Tag"
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
            />
            <Field
              label="Uhrzeit"
              type="time"
              value={uhrzeit}
              onChange={(e) => setUhrzeit(e.target.value)}
            />
          </div>
          {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
          <Button type="submit" disabled={!frei || laeuft}>
            {laeuft ? 'Wird gespeichert …' : bestaetigen}
          </Button>
        </form>
      </div>
    </Dialogfenster>
  );
}
