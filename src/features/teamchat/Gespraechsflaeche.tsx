import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { PageHeader } from '@/components/ui/PageHeader';
import { Spaltenkopf } from '@/components/ui/Spaltenkopf';
import type { CurrentUser } from '@/features/core/session/types';
import { RUECKWEG_PARAM, istInternerPfad, rueckwegBeschriftung } from '@/lib/rueckweg';
import { gesperrtSatz, kanalTitel, type Kanal } from './api';
import { Details } from './Details';
import { Eingabe } from './Eingabe';
import type { Spalten } from './flaeche';
import { TEAMCHAT, gespraechPfad, threadPfad } from './pfade';
import { merkeOffen } from './speicher';
import { Verlaufsansicht, type Verlaufssteuerung } from './Verlaufsansicht';
import { Kreuz, Schloss, Zurueck } from './Zeichen';

/** Die Zeile unter dem Titel - was für ein Gespräch, für wen. */
function unterzeile(kanal: Kanal): string {
  switch (kanal.kind) {
    case 'channel':
      return kanal.description ?? 'Offener Kanal';
    case 'private':
      return kanal.description ?? `Privat · ${kanal.member_count ?? 0} Mitglieder`;
    case 'group':
      return `${kanal.member_count ?? 0} Personen`;
    case 'fleet':
      return 'Alle, die die Radflotte lesen';
    default:
      return kanal.partner_active === false ? 'Nicht mehr im Team' : 'Direktnachricht';
  }
}

/**
 * Ein offenes Gespräch (TEAM-002, ANN-648): Kopf, rollender Verlauf, die
 * Eingabe am Fuß - im Teamchat und, als Gespräch der Flotte, in der
 * Radflotte (ANN-613).
 *
 * Ein offener Thread steht ab 1000 px Breite **neben** dem Gespräch (wie
 * Slack), darunter **an seiner Stelle** mit dem Weg zurück. Gespräch und
 * Thread haben je ihren eigenen Verlauf, Lesestand, Entwurf und Scrollstand;
 * beide stehen unter eigenem Schlüssel, nichts wandert beim Wechsel mit.
 *
 * Wer aus der Suche, „Für später“, „Für dich“ oder den Threads an eine Stelle
 * springt, bringt den Rückweg in der Adresse mit (`?zurueck=`, UX-012): Der
 * Pfeil führt dorthin zurück, auch aus der Radflotte, statt zur Liste der
 * Gespräche - der nächste Treffer ist dann einen Tipp entfernt.
 */
export function Gespraechsflaeche({
  user,
  kanal,
  threadId,
  sprungZu,
  spalten,
  zurueck,
}: {
  user: CurrentUser;
  kanal: Kanal;
  threadId: string | null;
  /** Eine Stelle aus Suche, „Für dich“ oder „Für später“. */
  sprungZu: string | null;
  spalten: Spalten;
  /** Der Weg zurück, solange nur eine Spalte Platz hat. */
  zurueck: string;
}) {
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const kontoId = user.profile.id;
  const eigeneId = user.staffMemberId ?? null;
  const gesperrt = gesperrtSatz(kanal);
  const gespraech = useRef<Verlaufssteuerung>(null);
  const thread = useRef<Verlaufssteuerung>(null);
  const [details, setDetails] = useState(false);
  const [adresse] = useSearchParams();
  const herkunft = adresse.get(RUECKWEG_PARAM);
  const von = istInternerPfad(herkunft) ? herkunft : null;
  const nebeneinander = spalten === 3;
  const zeigeGespraech = threadId === null || nebeneinander;

  // Am Rechner öffnet der Teamchat wieder hier (wie Slack).
  useEffect(() => {
    if (kanal.kind !== 'fleet') merkeOffen(kontoId, kanal.id);
  }, [kontoId, kanal.id, kanal.kind]);

  const titel =
    kanal.kind === 'private' ? (
      <span className="inline-flex max-w-full items-center gap-1.5">
        <Schloss className="size-5 shrink-0" />
        <span className="sr-only">Privater Kanal </span>
        {kanal.name}
      </span>
    ) : (
      kanalTitel(kanal)
    );
  const zurueckKnopf = (ziel: string, beschriftung: string) => (
    <ButtonLink
      to={ziel}
      variant="quiet"
      groesse="kompakt"
      aria-label={beschriftung}
      className="-ml-2 shrink-0 px-2"
    >
      <Zurueck />
    </ButtonLink>
  );

  return (
    <div className="flex min-h-0 flex-1">
      {zeigeGespraech ? (
        <section aria-label={kanalTitel(kanal)} className="flex min-w-0 flex-1 flex-col">
          <div className="border-line bg-surface flex shrink-0 items-start gap-1 border-b px-4 pt-3 sm:px-6">
            {spalten === 1
              ? von
                ? zurueckKnopf(von, rueckwegBeschriftung(von))
                : zurueckKnopf(
                    zurueck,
                    // Aus der Radflotte geht es in die Radflotte, nicht zu den Gesprächen.
                    zurueck === TEAMCHAT
                      ? 'Zurück zu den Gesprächen'
                      : rueckwegBeschriftung(zurueck),
                  )
              : null}
            <div className="min-w-0 flex-1">
              <PageHeader
                kompakt
                title={titel}
                description={<span className="line-clamp-1">{unterzeile(kanal)}</span>}
                actions={
                  <Button variant="quiet" onClick={() => setDetails(true)}>
                    Details
                  </Button>
                }
              />
            </div>
          </div>
          <Verlaufsansicht
            key={kanal.id}
            user={user}
            kanal={kanal}
            sprungZu={threadId === null ? sprungZu : null}
            gesperrt={gesperrt !== null}
            zeitzone={zeitzone}
            threadPfadFuer={(wurzel) => threadPfad(kanal, wurzel)}
            steuerung={gespraech}
          />
          <Eingabe
            key={`eingabe-${kanal.id}`}
            kontoId={kontoId}
            eigeneId={eigeneId}
            kanal={kanal}
            zeitzone={zeitzone}
            gesperrt={gesperrt}
            onGesendet={() => gespraech.current?.ansEnde()}
            onLetzteBearbeiten={() => gespraech.current?.bearbeiteLetzte()}
          />
        </section>
      ) : null}

      {threadId ? (
        <section
          aria-label="Thread"
          className={
            nebeneinander
              ? 'border-line w-threadspalte flex shrink-0 flex-col border-l'
              : 'flex min-w-0 flex-1 flex-col'
          }
        >
          {nebeneinander ? (
            <Spaltenkopf
              titel="Thread"
              beschreibung={kanalTitel(kanal)}
              aktionen={
                <ButtonLink
                  to={gespraechPfad(kanal)}
                  variant="quiet"
                  aria-label="Thread schließen"
                  className="px-2"
                >
                  <Kreuz />
                </ButtonLink>
              }
            />
          ) : (
            <div className="border-line bg-surface flex shrink-0 items-start gap-1 border-b px-4 pt-3 sm:px-6">
              {von
                ? zurueckKnopf(von, rueckwegBeschriftung(von))
                : zurueckKnopf(gespraechPfad(kanal), `Zurück zu ${kanalTitel(kanal)}`)}
              <div className="min-w-0 flex-1">
                <PageHeader kompakt title="Thread" description={kanalTitel(kanal)} />
              </div>
            </div>
          )}
          <Verlaufsansicht
            key={threadId}
            user={user}
            kanal={kanal}
            threadId={threadId}
            sprungZu={sprungZu}
            gesperrt={gesperrt !== null}
            zeitzone={zeitzone}
            steuerung={thread}
          />
          <Eingabe
            key={`eingabe-${kanal.id}-${threadId}`}
            kontoId={kontoId}
            eigeneId={eigeneId}
            kanal={kanal}
            threadId={threadId}
            zeitzone={zeitzone}
            gesperrt={gesperrt}
            onGesendet={() => thread.current?.ansEnde()}
            onLetzteBearbeiten={() => thread.current?.bearbeiteLetzte()}
          />
        </section>
      ) : null}

      {details ? (
        <Details
          kanal={kanal}
          eigeneId={eigeneId}
          zeitzone={zeitzone}
          onSchliessen={() => setDetails(false)}
        />
      ) : null}
    </div>
  );
}
