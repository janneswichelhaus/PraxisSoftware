import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { ErrorState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { formatDate } from '@/lib/datum';
import { fetchPatient, findPossibleDuplicates, fullName, type Patient } from './record/api';
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
    <Tile
      label={titel}
      zusatz={
        person.date_of_birth ? `geb. ${formatDate(person.date_of_birth)}` : 'ohne Geburtsdatum'
      }
    >
      {person.given_name} {person.family_name}
    </Tile>
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

  const abfrage = useQuery({
    queryKey: ['patient-merge-preview', dubletteId, patient.id],
    queryFn: () => previewPatientMerge(dubletteId, patient.id),
    retry: false,
    // Die Vorschau ist eine Momentaufnahme für genau diese Entscheidung.
    gcTime: 0,
  });

  const mutation = useMutation({
    mutationFn: () => mergePatients(dubletteId, patient.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
      queryClient.removeQueries({ queryKey: ['patient', dubletteId] });
      onFertig();
    },
  });

  return (
    <Section titel="Vorschau">
      <Abfragezustand
        abfrage={abfrage}
        laden="Vorschau wird geladen …"
        fehler="Die Vorschau konnte nicht geladen werden."
      >
        {(data) => {
          const wandert = wandertMit(data.counts);
          const gesperrt = data.blockers.length > 0;
          return (
            <>
              {/* Am Telefon untereinander - die bleibende Akte oben -, ab
                  etwa 560 px nebeneinander (TileGrid „breit“). */}
              <TileGrid>
                <Kopf titel="Bleibt" person={data.target} />
                <Kopf titel="Geht darin auf" person={data.source} />
              </TileGrid>

              <DetailList>
                <DetailRow label="Wandert mit">
                  {wandert.length > 0 ? wandert.join(', ') : 'Nichts außer den Stammdaten.'}
                </DetailRow>
                {data.conflicts.length > 0 ? (
                  <DetailRow label="In beiden Akten verschieden – es bleibt der Wert von hier">
                    {data.conflicts.map(feldLabel).join(', ')}
                  </DetailRow>
                ) : null}
                {data.appended.length > 0 ? (
                  <DetailRow label="Wird angehängt">
                    {data.appended.map(feldLabel).join(', ')}
                  </DetailRow>
                ) : null}
              </DetailList>

              {gesperrt ? (
                <div className="mt-4 flex flex-col gap-2">
                  {data.blockers.map((sperre) => (
                    <Statusmeldung key={sperre} ton="warnung">
                      {sperrText(sperre)}
                    </Statusmeldung>
                  ))}
                  <Formularfuss>
                    <Button variant="secondary" onClick={onAndere}>
                      Andere Akte wählen
                    </Button>
                  </Formularfuss>
                </div>
              ) : (
                <div className="mt-6">
                  <Checkbox
                    label="Beide Akten betreffen dieselbe Person."
                    checked={geprueft}
                    onChange={(event) => setGeprueft(event.target.checked)}
                  />
                  {mutation.isError ? (
                    <Statusmeldung ton="fehler" className="mt-3">
                      Die Akten konnten nicht zusammengeführt werden. Es hat sich nichts geändert.
                    </Statusmeldung>
                  ) : null}
                  {/* ANN-150: nicht rückgängig - das steht vor dem Knopf, nicht
                      danach, als Satz über den Knöpfen. */}
                  <Formularfuss zusatz="Nicht rückgängig zu machen. Ausgestellte Rechnungen und abgeschlossene Dokumentation bleiben, wie sie sind; nur ihr Bezug wechselt. Die leere Akte wird gelöscht.">
                    <Button
                      disabled={!geprueft || mutation.isPending}
                      onClick={() => mutation.mutate()}
                    >
                      {mutation.isPending ? 'Wird zusammengeführt …' : 'Zusammenführen'}
                    </Button>
                    <Button variant="quiet" onClick={onAndere} disabled={mutation.isPending}>
                      Andere Akte wählen
                    </Button>
                  </Formularfuss>
                </div>
              )}
            </>
          );
        }}
      </Abfragezustand>
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

  // Die möglichen Dubletten nach der Regel des Dublettenhinweises als Zeilen,
  // jede andere Akte über die Suche darunter.
  return (
    <Section titel="Welche Akte ist die Dublette?">
      {moegliche.length > 0 ? (
        <ListRows className="mb-4">
          {moegliche.map((treffer) => (
            <ListRow
              key={treffer.id}
              onClick={() => onAuswahl(treffer.id)}
              titel={`${treffer.given_name} ${treffer.family_name}`}
              meta={
                treffer.date_of_birth
                  ? `geb. ${formatDate(treffer.date_of_birth)}`
                  : 'ohne Geburtsdatum'
              }
            />
          ))}
        </ListRows>
      ) : null}
      <div className="max-w-formular">
        <Patientensuche
          label="Andere Akte suchen"
          labelSichtbar
          onAuswahl={(id) => {
            if (id !== patient.id) onAuswahl(id);
          }}
        />
      </div>
    </Section>
  );
}

export function ZusammenfuehrenPage() {
  const { patientId = '' } = useParams();
  const [dublette, setDublette] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  const abfrage = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    enabled: Boolean(patientId),
  });
  const { data } = abfrage;

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

      <Abfragezustand
        abfrage={abfrage}
        laden="Akte wird geladen …"
        fehler="Die Akte konnte nicht geladen werden."
      >
        {(patient) =>
          patient === null ? (
            <ErrorState
              title="Nicht gefunden"
              description="Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben."
            />
          ) : fertig ? (
            <div className="flex flex-col items-start gap-4">
              <Rueckmeldung className="w-full">
                Die Dublette ist in dieser Akte aufgegangen.
              </Rueckmeldung>
              <ButtonLink to={`/patienten/${patient.id}`}>Zur Akte</ButtonLink>
            </div>
          ) : dublette === null ? (
            <Auswahl patient={patient} onAuswahl={setDublette} />
          ) : (
            <Vorschau
              patient={patient}
              dubletteId={dublette}
              onFertig={() => setFertig(true)}
              onAndere={() => setDublette(null)}
            />
          )
        }
      </Abfragezustand>
    </>
  );
}
