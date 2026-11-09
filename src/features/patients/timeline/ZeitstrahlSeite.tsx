import { useMemo, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge, STATUSZEICHEN } from '@/components/ui/Badge';
import { Disclosure } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { formatDate, monatLang, tagePlus } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { instrumentName } from '@/features/clinical';
import { themaName } from '@/features/portal';
import { fetchPatient, fullName } from '../record/api';
import { bauartLabels } from '../treatment-bases/api';
import {
  fetchZeitstrahl,
  zeitstrahlKey,
  type Zeitstrahleintrag,
  type Zeitstrahlfenster,
} from './api';
import { nachMonat, zeile, type Namen } from './eintraege';

/** Die Wörter für Instrumente, Themen und Bauarten aus ihren Domänen; die Seite setzt zusammen. */
function useNamen(): Namen {
  return useMemo(
    () => ({
      instrument: (kennung) => instrumentName(kennung),
      thema: (thema) => themaName(thema),
      bauart: (bauart) => bauartLabels[bauart as keyof typeof bauartLabels] ?? 'Grundlage',
    }),
    [],
  );
}

/**
 * Was mit einer Person geschehen ist, über alle Bereiche: nur anordnen, der Inhalt steht dort,
 * wohin die Zeile führt (ANN-847). Je Monat ein Abschnitt, „Weiter zurück“ holt das Fenster davor.
 */
export function ZeitstrahlSeite() {
  const { patientId = '' } = useParams();
  const zurueck = `/patienten/${patientId}/termine`;
  const person = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const abfrage = useInfiniteQuery({
    queryKey: zeitstrahlKey(patientId),
    queryFn: ({ pageParam }) => fetchZeitstrahl(patientId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (seite) => (seite?.has_more ? tagePlus(seite.from, -1) : undefined),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const namen = useNamen();
  const fenster = abfrage.data?.pages ?? [];
  const erstes = fenster[0];
  return (
    <>
      <Rueckweg standard={zurueck} className="mb-3" />
      <div className="max-w-spalte flex flex-col gap-8 [&>*]:mt-0">
        <PageHeader
          title="Zeitstrahl"
          description={person.data ? fullName(person.data) : undefined}
        />
        <Abfragezustand
          abfrage={{ ...abfrage, data: abfrage.data ? erstes : undefined }}
          laden="Zeitstrahl wird geladen …"
          fehler="Zeitstrahl nicht geladen."
          inKarte
          leer={{ wenn: (f) => !f, titel: 'Nicht gefunden' }}
        >
          {() => (
            <Fenster
              fenster={fenster.filter((f): f is Zeitstrahlfenster => f !== null)}
              patientId={patientId}
              namen={namen}
              weiter={
                abfrage.hasNextPage ? (
                  <Button
                    variant="secondary"
                    onClick={() => void abfrage.fetchNextPage()}
                    disabled={abfrage.isFetchingNextPage}
                  >
                    {abfrage.isFetchingNextPage ? 'Wird geladen …' : 'Weiter zurück'}
                  </Button>
                ) : null
              }
            />
          )}
        </Abfragezustand>
        <Kleingedrucktes>
          Angeordnet, nicht bewertet. Das Öffnen wird wie das Öffnen der Akte protokolliert.
        </Kleingedrucktes>
      </div>
    </>
  );
}

function Fenster({
  fenster,
  patientId,
  namen,
  weiter,
}: {
  fenster: Zeitstrahlfenster[];
  patientId: string;
  namen: Namen;
  weiter: ReactNode;
}) {
  const letztes = fenster.at(-1)!;
  const heute = letztes.today;
  const zone = letztes.time_zone;
  const alle = fenster.flatMap((f) => f.entries);
  // Rückblick zuerst: Kommendes steht eingeklappt darüber, nicht nur grau dazwischen.
  const kommend = alle.filter((e) => e.on > heute).reverse();
  const monate = nachMonat(alle.filter((e) => e.on <= heute));
  const hier = `/patienten/${patientId}/zeitstrahl`;
  const alsZeile = (e: Zeitstrahleintrag, i: number) => {
    const z = zeile(e, patientId, zone, namen);
    return (
      <ListRow
        key={`${e.kind}-${e.ref ?? ''}-${e.on}-${i}`}
        zeit={<span className="tabular-nums">{formatDate(e.on).slice(0, 6)}</span>}
        titel={z.titel}
        meta={z.meta ?? undefined}
        status={
          z.abzeichen ? (
            <Badge eigenesZeichen={STATUSZEICHEN[z.abzeichen.zeichen]}>{z.abzeichen.wort}</Badge>
          ) : undefined
        }
        {...(z.ziel ? { to: mitRueckweg(z.ziel, hier) } : {})}
      />
    );
  };
  return (
    <div className="flex flex-col gap-8">
      {kommend.length > 0 ? (
        <Disclosure summary="Kommend" anzahl={kommend.length} kopf="label">
          <ListRows beschriftung="Kommend">{kommend.map(alsZeile)}</ListRows>
        </Disclosure>
      ) : null}
      {monate.length === 0 ? (
        <Listenabschnitt
          titel={`Seit ${formatDate(letztes.from)}`}
          leer={{ titel: 'Nichts in diesem Zeitraum' }}
        />
      ) : null}
      {monate.map((m) => (
        <Listenabschnitt key={m.monat} titel={monatLang(m.monat)} anzahl={m.eintraege.length}>
          {m.eintraege.map(alsZeile)}
        </Listenabschnitt>
      ))}
      {weiter ? <div>{weiter}</div> : null}
    </div>
  );
}
