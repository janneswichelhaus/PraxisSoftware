import { Fragment, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { ORDNEN_NACHBILDUNG, ORDNEN_RECHTSSATZ, type Ordnen } from './ordnen';

/** „Ordnen“ neben „Sprechen“; nur da, wenn es etwas zu ordnen gibt. */
export function OrdnenKnopf({ ordnen, gesperrt }: { ordnen: Ordnen; gesperrt: boolean }) {
  return (
    <Button
      type="button"
      variant="secondary"
      groesse="normal"
      className="flex-1 sm:flex-none"
      disabled={gesperrt || ordnen.laeuft}
      onClick={() => void ordnen.starten()}
    >
      {ordnen.laeuft ? 'Wird geordnet …' : 'Ordnen'}
    </Button>
  );
}

/** Der geordnete Text über dem Feld, zum Lesen; entschieden wird in der Leiste am Daumen. */
export function GeordneterVorschlag({ ordnen }: { ordnen: Ordnen }) {
  const abschnitt = useRef<HTMLDivElement>(null);
  const da = ordnen.vorschlag !== undefined;

  // Der Vorschlag erscheint über dem Feld; der Fokus folgt ihm für Vorlesesoftware.
  useEffect(() => {
    if (da) abschnitt.current?.focus();
  }, [da]);

  if (!ordnen.vorschlag) {
    return ordnen.meldung ? (
      <Statusmeldung ton={ordnen.meldung.ton} className="shrink-0 px-4 py-2">
        {ordnen.meldung.text}
      </Statusmeldung>
    ) : null;
  }

  return (
    <div
      ref={abschnitt}
      tabIndex={-1}
      className="bg-canvas border-line nicht-drucken shrink-0 border-b px-4 py-3 focus:outline-none"
    >
      <Section titel="Geordnet – bitte prüfen">
        <div className="flex flex-col gap-3">
          {ordnen.vorschlag.quelle === 'nachbildung' ? (
            <Statusmeldung ton="warnung">{ORDNEN_NACHBILDUNG}</Statusmeldung>
          ) : null}
          <div>
            {ordnen.vorschlag.abschnitte.map((teil) => (
              <Fragment key={teil.titel}>
                <Zwischentitel>{teil.titel}</Zwischentitel>
                <p className="text-ink max-w-prose text-base wrap-anywhere whitespace-pre-wrap">
                  {teil.text}
                </p>
              </Fragment>
            ))}
          </div>
          <Kleingedrucktes>{ORDNEN_RECHTSSATZ}</Kleingedrucktes>
        </div>
      </Section>
    </div>
  );
}

/**
 * Die Entscheidung über den Vorschlag, in der klebenden Leiste statt „Sprechen“. Verwerfen
 * fragt nicht nach: Der eigene Text steht unverändert im Feld.
 */
export function Ordnungsentscheidung({
  ordnen,
  gesperrt,
  onUebernehmen,
}: {
  ordnen: Ordnen;
  /** Solange die Seite schreibt, ist das Feld festgehalten. */
  gesperrt: boolean;
  onUebernehmen: (text: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Geordneter Text"
      className="border-line nicht-drucken flex items-center gap-2 border-t px-3 py-2"
    >
      <Button type="button" variant="quiet" groesse="normal" onClick={ordnen.verwerfen}>
        Verwerfen
      </Button>
      <Button
        type="button"
        groesse="normal"
        className="ml-auto flex-1 sm:flex-none"
        disabled={gesperrt}
        onClick={() => {
          const text = ordnen.uebernehmen();
          if (text) onUebernehmen(text);
        }}
      >
        Übernehmen
      </Button>
    </div>
  );
}
