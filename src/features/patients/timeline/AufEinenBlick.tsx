import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { Textlink } from '@/components/ui/Textlink';
import { mitRueckweg } from '@/lib/rueckweg';
import { fetchVorbereitung, vorbereitungKey } from './api';
import { aufgaben, type Aufgabe } from './eintraege';

/** Die offenen Aufgaben als Liste; die Zeile führt dorthin, wo sie erledigt wird (ANN-848). */
export function ZuTun({ liste, hier }: { liste: readonly Aufgabe[]; hier: string }) {
  return (
    <Listenabschnitt titel="Zu tun" anzahl={liste.length} leer={{ titel: 'Nichts offen' }}>
      {liste.map((a) => (
        <ListRow
          key={a.schluessel}
          titel={a.titel}
          meta={a.meta ?? undefined}
          status={a.abzeichen ? <Badge ton="warnung">{a.abzeichen}</Badge> : undefined}
          to={mitRueckweg(a.ziel, hier)}
        />
      ))}
    </Listenabschnitt>
  );
}

/**
 * Oben im Reiter „Termine“: was für diese Person ansteht und die Wege zu Vorbereitung und
 * Zeitstrahl - kein neuer Reiter (ANN-847). Ohne offene Aufgabe bleibt nur die Wegzeile.
 */
export function AufEinenBlick({
  patientId,
  thema,
}: {
  patientId: string;
  /** Das Thema einer Rückfrage als Wort; die Seite reicht es aus ihrer Domäne herein. */
  thema: (thema: string) => string;
}) {
  const ort = useLocation();
  const hier = `${ort.pathname}${ort.search}`;
  const abfrage = useQuery({
    queryKey: vorbereitungKey(patientId),
    queryFn: () => fetchVorbereitung(patientId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  return (
    <div className="mb-6 flex flex-col gap-4">
      <Abfragezustand
        abfrage={abfrage}
        laden="Offene Aufgaben werden geladen …"
        fehler="Die offenen Aufgaben konnten nicht geladen werden."
      >
        {(v) => {
          const liste = v ? aufgaben(v, patientId, thema) : [];
          return liste.length > 0 ? <ZuTun liste={liste} hier={hier} /> : null;
        }}
      </Abfragezustand>
      <nav aria-label="Auf einen Blick" className="flex flex-wrap gap-x-6 gap-y-2">
        <Textlink to={mitRueckweg(`/patienten/${patientId}/vorbereiten`, hier)} alleinstehend>
          Sitzung vorbereiten
        </Textlink>
        <Textlink to={mitRueckweg(`/patienten/${patientId}/zeitstrahl`, hier)} alleinstehend>
          Zeitstrahl
        </Textlink>
      </nav>
    </div>
  );
}
