import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { roleLabel } from '@/components/ui/roleLabels';
import { getTrainingClient } from '@/features/training/api';
import { fetchTrainingAuskunft } from './api';
import { AuskunftErgebnis } from './BetroffenenrechtePage';
import { TRAINING_KATEGORIEN } from './kategorien';

/**
 * Auskunft nach Art. 15 zu einem Trainingsverhältnis (BEF-182).
 *
 * Training ist ein eigenes Rechtsverhältnis mit eigener Akte (ADR-021); die
 * Auskunft zur Akte nennt es ausdrücklich nicht. Diese Seite gibt die
 * getrennte Kopie - wie an der Akte: auf Knopfdruck, nicht beim Öffnen, weil
 * jede Kopie protokolliert wird (ADR-010 Punkt 2). Ein Löschverlangen zum
 * Training läuft wie das Beenden des Verhältnisses über dessen Seite.
 *
 * Sichtbar nur für `owner`; verbindlich prüft `export_training_record`
 * (ADR-004).
 */
export function TrainingAuskunftPage() {
  const { relationshipId = '' } = useParams();
  const kundin = useQuery({
    queryKey: ['training-client', relationshipId],
    queryFn: () => getTrainingClient(relationshipId),
    enabled: Boolean(relationshipId),
  });
  const auskunft = useMutation({ mutationFn: () => fetchTrainingAuskunft(relationshipId) });
  const erstellt = auskunft.data !== undefined;

  return (
    <>
      <Rueckweg
        standard={`/training/${relationshipId}?bereich=stammdaten`}
        beschriftung="Zurück zu den Stammdaten"
      />
      <PageHeader
        title="Auskunft zum Training"
        description={
          kundin.data ? `${kundin.data.given_name} ${kundin.data.family_name}` : undefined
        }
      />
      <Abfragezustand
        abfrage={kundin}
        laden="Trainingsverhältnis wird geladen …"
        fehler="Das Trainingsverhältnis konnte nicht geladen werden."
        inKarte
      >
        {(daten) =>
          daten === null ? (
            <ErrorState
              title="Nicht gefunden"
              description="Dieses Trainingsverhältnis gibt es nicht oder es ist für Ihren Zugang nicht freigegeben."
            />
          ) : (
            <>
              <Section titel="Auskunft nach Art. 15 DSGVO">
                {/* Wie an der Akte (PAT-23): Nach dem Erstellen tritt der Knopf
                    zurück - jeder weitere Tipp ist ein neuer, protokollierter Export. */}
                <Button
                  type="button"
                  variant={erstellt ? 'quiet' : 'primary'}
                  disabled={auskunft.isPending}
                  onClick={() => auskunft.mutate()}
                >
                  {auskunft.isPending
                    ? 'Wird erstellt …'
                    : erstellt
                      ? 'Neu erstellen'
                      : 'Auskunft erstellen'}
                </Button>
                {auskunft.isError ? (
                  <div className="mt-4">
                    <ErrorState
                      title="Die Auskunft konnte nicht erstellt werden."
                      description={VERBINDUNG_PRUEFEN}
                    />
                  </div>
                ) : null}
                {auskunft.data ? (
                  <AuskunftErgebnis auskunft={auskunft.data} kategorien={TRAINING_KATEGORIEN} />
                ) : null}
              </Section>
              <div className="mt-8">
                <Kleingedrucktes>
                  Vorgang nach dem Verfahren für Betroffenenrechte, vorbehalten der Rolle „
                  {roleLabel('owner')}“. Jede Auskunft erstellt eine Kopie aller Daten dieses
                  Trainingsverhältnisses und wird protokolliert; die Daten einer Behandlung stehen
                  in der Auskunft an der Akte. Die Anwendung verschickt nichts.
                </Kleingedrucktes>
              </div>
            </>
          )
        }
      </Abfragezustand>
    </>
  );
}
