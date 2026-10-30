import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wortmarke } from '@/components/ui/Wortmarke';
import {
  DurchfuehrungKontext,
  abgelegteZugaenge,
  wartendeEinheiten,
  type Ablageplan,
  type Durchfuehrungstraeger,
} from './ablage';
import { EinheitMitWarteschlange } from './Durchfuehrung';

/**
 * Die lokale Ansicht nach der Freigabe ohne Netz (TRK-009, ADR-024 Punkt 9,
 * ADR-025 Punkt 16).
 *
 * Sie zeigt nur, was auf dem Gerät liegt: die Pläne zum Üben und, beim
 * Üben, die Haken, die noch warten. Keine Nachrichten, keine Termine, nichts
 * vom Server - der antwortet ohne Netz nicht, und eine Sitzung gibt diese
 * Freigabe nicht. Übertragen wird hier nie (`anstossen: null`); das geschieht
 * erst nach dem Entsperren mit Verbindung.
 */
export function LokaleUebungen({
  besitzer,
  onSperren,
}: {
  besitzer: string;
  onSperren: () => void;
}) {
  const traeger: Durchfuehrungstraeger = { besitzer, anstossen: null };
  const [gewaehlt, setGewaehlt] = useState<{ zugangId: string; plan: Ablageplan } | null>(null);
  const [beendet, setBeendet] = useState(false);
  const zugaenge = useQuery({
    queryKey: ['lokale-uebungen', besitzer],
    queryFn: () => abgelegteZugaenge(besitzer),
    gcTime: 0,
  });

  return (
    <DurchfuehrungKontext.Provider value={traeger}>
      <div className="plattform-schrift bg-canvas flex min-h-dvh flex-col">
        {/* Kopf mit „Sperren“ und der Hinweis bleiben auch beim Üben stehen
            (ADR-025 Punkt 16); die Durchführung darunter in ganzer Breite. */}
        <header className="border-line flex items-center justify-between gap-3 border-b px-5 py-3">
          <Wortmarke hoehe={28} />
          <Button variant="quiet" onClick={onSperren}>
            Sperren
          </Button>
        </header>
        <div className="max-w-formular mx-auto w-full px-5 pt-5 max-[23rem]:px-3">
          <Statusmeldung ton="warnung">
            Ohne Verbindung. Hier ist nur, was auf diesem Gerät liegt.
          </Statusmeldung>
        </div>
        {gewaehlt ? (
          <main className="flex flex-1 flex-col pt-4">
            <EinheitMitWarteschlange
              zugangId={gewaehlt.zugangId}
              plan={gewaehlt.plan}
              onZurueck={() => setGewaehlt(null)}
              onBeendet={() => {
                setGewaehlt(null);
                setBeendet(true);
              }}
            />
          </main>
        ) : (
          <main className="max-w-formular mx-auto w-full flex-1 px-5 pb-10">
            <Auswahl
              besitzer={besitzer}
              zugaenge={zugaenge.data}
              laedt={zugaenge.isPending}
              beendet={beendet}
              onWahl={(zugangId, plan) => {
                setBeendet(false);
                setGewaehlt({ zugangId, plan });
              }}
            />
          </main>
        )}
      </div>
    </DurchfuehrungKontext.Provider>
  );
}

function Auswahl({
  besitzer,
  zugaenge,
  laedt,
  beendet,
  onWahl,
}: {
  besitzer: string;
  zugaenge: Awaited<ReturnType<typeof abgelegteZugaenge>> | undefined;
  laedt: boolean;
  beendet: boolean;
  onWahl: (zugangId: string, plan: Ablageplan) => void;
}) {
  const wartend = useQuery({
    queryKey: ['lokale-warteschlange', besitzer, beendet],
    queryFn: () => wartendeEinheiten(besitzer),
    gcTime: 0,
  });
  if (laedt) return <LoadingState label="Ihre Übungen werden geladen …" />;
  const plaene = (zugaenge ?? []).flatMap((z) =>
    z.plaene.map((plan) => ({ zugangId: z.zugangId, vertreten: z.vertreten, plan })),
  );
  const anzahl = wartend.data?.length ?? 0;
  return (
    <>
      <div className="mt-6">
        <PageHeader title="Übungen" />
      </div>
      {beendet ? (
        <Statusmeldung ton="neutral" className="mt-3">
          Ihre Einheit liegt auf diesem Gerät. Sie wird übertragen, sobald Verbindung besteht und
          Sie die Anwendung entsperrt haben.
        </Statusmeldung>
      ) : null}
      {anzahl > 0 ? (
        <p className="text-ink-muted mt-3" data-testid="wartehinweis">
          {anzahl === 1
            ? 'Eine Einheit liegt noch auf diesem Gerät und ist noch nicht übertragen.'
            : `${anzahl} Einheiten liegen noch auf diesem Gerät und sind noch nicht übertragen.`}
        </p>
      ) : null}
      {plaene.length === 0 ? (
        <EmptyState
          markenform
          title="Kein Plan auf diesem Gerät"
          description="Mit Verbindung laden Sie Ihre Übungen; danach geht es auch ohne."
        />
      ) : (
        plaene.map(({ zugangId, vertreten, plan }) => (
          <Section key={`${zugangId}-${plan.id}`} titel={plan.title}>
            {vertreten ? <p className="text-ink-muted mb-3">für {vertreten}</p> : null}
            <Button className="mt-3 w-full" onClick={() => onWahl(zugangId, plan)}>
              Jetzt üben
            </Button>
          </Section>
        ))
      )}
    </>
  );
}
