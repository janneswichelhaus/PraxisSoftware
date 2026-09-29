import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { fetchPatient, findPossibleDuplicates, fullName, type Patient } from './api';
import { Patientensuche } from './Patientensuche';
import {
  feldLabel,
  mergePatients,
  previewPatientMerge,
  sperrText,
  wandertMit,
  type Zusammenfuehrungsplan,
} from './zusammenfuehren';

/**
 * Dublette übernehmen (PRX-018, PRX-EPIC-003b).
 *
 * Die geöffnete Akte ist die, die bleibt: Wer sie aus den Stammdaten heraus
 * aufruft, hat sie als die richtige vor Augen. Ausgewählt wird die Dublette —
 * die möglichen aus der Regel des Dublettenhinweises oben, jede andere über
 * die Suche. Vor dem Bestätigen zeigt die Vorschau beide Akten nebeneinander,
 * was mitwandert, was verschieden ist und was sperrt. Verbindlich prüft der
 * Server Rolle, Praxis und Sperren (ADR-004).
 */

function Kopf({ titel, person }: { titel: string; person: Zusammenfuehrungsplan['source'] }) {
  return (
    <Card className="flex-1">
      <p className="text-ink-muted text-sm">{titel}</p>
      <p className="text-ink mt-1 font-medium">
        {person.given_name} {person.family_name}
      </p>
      <p className="text-ink-muted text-sm">
        {person.date_of_birth ? `geb. ${formatDate(person.date_of_birth)}` : 'ohne Geburtsdatum'}
        {' · '}
        {person.status === 'active' ? 'in Versorgung' : 'nicht in Versorgung'}
      </p>
    </Card>
  );
}

function Vorschau({
  patient,
  dubletteId,
  onFertig,
  onAndere,
}: {
  patient: Patient;
  dubletteId: string;
  onFertig: () => void;
  onAndere: () => void;
}) {
  const queryClient = useQueryClient();
  const [geprueft, setGeprueft] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['patient-merge-preview', dubletteId, patient.id],
    queryFn: () => previewPatientMerge(dubletteId, patient.id),
    retry: false,
    // Die Vorschau ist eine Momentaufnahme für genau diese Entscheidung.
    gcTime: 0,
  });

  const mutation = useMutation({
    mutationFn: () => mergePatients(dubletteId, patient.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
      queryClient.removeQueries({ queryKey: ['patient', dubletteId] });
      onFertig();
    },
  });

  if (isPending) return <LoadingState label="Vorschau wird geladen …" />;
  if (isError) {
    return (
      <ErrorState
        title="Die Vorschau konnte nicht geladen werden."
        description="Bitte die Verbindung prüfen und später erneut versuchen."
        onErneut={() => void refetch()}
      />
    );
  }

  const wandert = wandertMit(data.counts);
  const gesperrt = data.blockers.length > 0;

  return (
    <Section titel="Vorschau" ebene={3}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Kopf titel="Bleibt" person={data.target} />
        <Kopf titel="Geht darin auf" person={data.source} />
      </div>

      <dl className="mt-4 flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-ink-muted">Wandert mit</dt>
          <dd className="text-ink">
            {wandert.length > 0 ? wandert.join(', ') : 'Nichts außer den Stammdaten.'}
          </dd>
        </div>
        {data.conflicts.length > 0 ? (
          <div>
            <dt className="text-ink-muted">
              In beiden Akten verschieden – es bleibt der Wert von hier
            </dt>
            <dd className="text-ink">{data.conflicts.map(feldLabel).join(', ')}</dd>
          </div>
        ) : null}
        {data.appended.length > 0 ? (
          <div>
            <dt className="text-ink-muted">Wird angehängt</dt>
            <dd className="text-ink">{data.appended.map(feldLabel).join(', ')}</dd>
          </div>
        ) : null}
      </dl>

      {gesperrt ? (
        <div className="mt-4 flex flex-col gap-2">
          {data.blockers.map((sperre) => (
            <Statusmeldung key={sperre} ton="warnung">
              {sperrText(sperre)}
            </Statusmeldung>
          ))}
          <div>
            <Button variant="secondary" onClick={onAndere}>
              Andere Akte wählen
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <Checkbox
            label="Beide Akten betreffen dieselbe Person."
            checked={geprueft}
            onChange={(event) => setGeprueft(event.target.checked)}
          />
          {/* ANN-150: nicht rückgängig - das steht vor dem Knopf, nicht danach. */}
          <p className="text-ink-muted text-sm">
            Nicht rückgängig zu machen. Ausgestellte Rechnungen und abgeschlossene Dokumentation
            bleiben, wie sie sind; nur ihr Bezug wechselt. Die leere Akte wird gelöscht.
          </p>
          {mutation.isError ? (
            <Statusmeldung ton="fehler">
              Die Akten konnten nicht zusammengeführt werden. Es hat sich nichts geändert.
            </Statusmeldung>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button disabled={!geprueft || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Wird zusammengeführt …' : 'Zusammenführen'}
            </Button>
            <Button variant="secondary" onClick={onAndere} disabled={mutation.isPending}>
              Andere Akte wählen
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

function Auswahl({ patient, onAuswahl }: { patient: Patient; onAuswahl: (id: string) => void }) {
  const { data } = useQuery({
    queryKey: ['patient-duplicates', patient.id],
    queryFn: () =>
      findPossibleDuplicates(patient.given_name, patient.family_name, patient.date_of_birth),
    retry: false,
  });
  const moegliche = (data ?? []).filter((treffer) => treffer.id !== patient.id);

  return (
    <Section titel="Welche Akte ist die Dublette?" ebene={3}>
      {moegliche.length > 0 ? (
        <>
          <p className="text-ink-muted mb-2 text-sm">
            Mögliche Dubletten nach Name und Geburtsdatum:
          </p>
          <ul className="mb-4 flex flex-col gap-2">
            {moegliche.map((treffer) => (
              <li key={treffer.id}>
                <Button variant="secondary" onClick={() => onAuswahl(treffer.id)}>
                  {treffer.given_name} {treffer.family_name}
                  {treffer.date_of_birth
                    ? `, geb. ${formatDate(treffer.date_of_birth)}`
                    : ', ohne Geburtsdatum'}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <Patientensuche
        label="Andere Akte suchen"
        labelSichtbar
        onAuswahl={(id) => {
          if (id !== patient.id) onAuswahl(id);
        }}
      />
    </Section>
  );
}

export function ZusammenfuehrenPage() {
  const { patientId = '' } = useParams();
  const [dublette, setDublette] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    enabled: Boolean(patientId),
  });

  return (
    <>
      <Rueckweg
        standard={`/patienten/${patientId}/stammdaten`}
        beschriftung="Zurück zu den Stammdaten"
      />
      <PageHeader
        title="Dublette übernehmen"
        description={
          data
            ? // Kurz genug, dass „bleibt" auch am Telefon nicht hinter „Mehr"
              // verschwindet - es ist die eine Aussage dieser Seite.
              `Diese Akte bleibt: ${fullName(data)}.`
            : undefined
        }
      />

      {isPending ? <LoadingState label="Akte wird geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Akte konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und später erneut versuchen."
          onErneut={() => void refetch()}
        />
      ) : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}

      {data && fertig ? (
        <div className="flex flex-col items-start gap-3">
          <Statusmeldung ton="erfolg">Die Dublette ist in dieser Akte aufgegangen.</Statusmeldung>
          <ButtonLink to={`/patienten/${data.id}`}>Zur Akte</ButtonLink>
        </div>
      ) : null}

      {data && !fertig && dublette === null ? (
        <Auswahl patient={data} onAuswahl={setDublette} />
      ) : null}

      {data && !fertig && dublette !== null ? (
        <Vorschau
          patient={data}
          dubletteId={dublette}
          onFertig={() => setFertig(true)}
          onAndere={() => setDublette(null)}
        />
      ) : null}
    </>
  );
}
