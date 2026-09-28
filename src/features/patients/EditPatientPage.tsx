import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hinweisfenster } from '@/components/ui/Dialogfenster';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { alsFormularfehler } from '@/lib/formularfehler';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { leseRueckweg } from '@/lib/rueckweg';
import { fetchAssignableTherapists } from '@/features/appointments/api';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import {
  fetchPatient,
  fullName,
  patientMasterDataSchema,
  patientToFormValues,
  updatePatient,
  type Patient,
  type PatientMasterDataValues,
  type StammdatenFeld,
} from './api';
import { PatientMasterDataFields } from './PatientMasterDataFields';
import {
  STAMMDATEN_BESCHRIFTUNG,
  STAMMDATEN_REIHENFOLGE,
  stammdatenFeldId,
} from './stammdatenfelder';

const TITEL = 'Stammdaten bearbeiten';

/**
 * Formular für die Änderung der Stammdaten.
 *
 * Vorbefüllt aus dem gelesenen Datensatz. Die Prüfung hier ist Bedienkomfort;
 * verbindlich sind Berechtigung, Organisationszugehörigkeit des Patienten und
 * Normalisierung in `update_patient` (ADR-004). Status, Organisation und
 * Portalzugang sind bewusst keine Eingabefelder.
 *
 * Wie beim Anlegen fragt die Seite, bevor ungespeicherte Änderungen verloren
 * gehen (PAT-02, ANN-046): ungespeichert ist, was vom gelesenen Stand abweicht.
 */
function EditPatientForm({ patient }: { patient: Patient }) {
  const ausgang = useMemo(() => patientToFormValues(patient), [patient]);
  const [werte, setWerte] = useState<Record<StammdatenFeld, string>>(ausgang);
  const [fehler, setFehler] = useState<Partial<Record<StammdatenFeld, string>>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suche] = useSearchParams();
  const speichernRef = useRef<HTMLButtonElement>(null);
  const [fokusAufSpeichern, setFokusAufSpeichern] = useState(false);

  const ungespeichert = STAMMDATEN_REIHENFOLGE.some((feld) => werte[feld] !== ausgang[feld]);
  const { freigeben, schutz } = useTextverlustschutz({ ungespeichert, texte: EINGABETEXTE });

  // Auswahl für die feste Therapeut:in (PAT-005). Schlägt die Abfrage fehl,
  // bleibt die bisherige Zuordnung als Auswahl stehen (PAT-20).
  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  // Zurück in die Stammdaten und nicht auf die Übersicht der Akte: Dort steht,
  // was gerade geändert wurde (AKTE-005). Die Übersicht zeigt Termine und
  // Verordnungen - der geänderte Ort käme dort gar nicht vor.
  //
  // Kommt die Änderung aus einem laufenden Vorgang - „für die E-Mail fehlt die
  // Adresse", „für den Hausbesuch fehlt die Anschrift" -, führt sie dorthin
  // zurück (UX-012). Aus der Akte kommt der Weg samt deren eigenem Rückweg
  // mit; wer aus dem Kalender kam, findet nach dem Speichern dorthin zurück
  // (PAT-08).
  const zurueck = leseRueckweg(suche, `/patienten/${patient.id}/stammdaten`);

  const mutation = useMutation({
    mutationFn: (values: PatientMasterDataValues) => updatePatient(patient.id, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
      // Gespeichert: Der eigene Weg hinaus ist kein Verlust (ANN-046).
      freigeben();
      void navigate(zurueck, { replace: true });
    },
  });

  // Nach dem Fehlerfenster steht der Fokus wieder auf „Änderungen speichern"
  // (PAT-03) - erst nach dem Schließen, solange ist die Seite gesperrt.
  useEffect(() => {
    if (!fokusAufSpeichern) return;
    speichernRef.current?.focus();
    setFokusAufSpeichern(false);
  }, [fokusAufSpeichern]);

  function setzen(feld: StammdatenFeld, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Schutz gegen mehrfaches Absenden: solange ein Vorgang läuft, wird kein
    // zweiter gestartet. Der Button ist zusätzlich deaktiviert.
    if (mutation.isPending) return;

    const ergebnis = patientMasterDataSchema.safeParse(werte);
    if (!ergebnis.success) {
      const gefunden: Partial<Record<StammdatenFeld, string>> = {};
      for (const problem of ergebnis.error.issues) {
        const feld = problem.path[0] as StammdatenFeld | undefined;
        if (feld && !gefunden[feld]) gefunden[feld] = problem.message;
      }
      setFehler(gefunden);
      return;
    }

    setFehler({});
    mutation.mutate(ergebnis.data);
  }

  return (
    <>
      <PageHeader
        title={TITEL}
        description={`${fullName(patient)} · Mit * markierte Felder sind erforderlich.`}
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        <Fehlerzusammenfassung
          fehler={alsFormularfehler(
            STAMMDATEN_REIHENFOLGE,
            STAMMDATEN_BESCHRIFTUNG,
            fehler,
            stammdatenFeldId,
          )}
        />

        <PatientMasterDataFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          therapeutinnen={therapeuten.data ?? []}
          therapeutinnenStand={
            therapeuten.isPending ? 'laedt' : therapeuten.isError ? 'fehler' : 'bereit'
          }
          bisherigeTherapeutin={patient.primary_therapist_name}
        />

        {/* Die Rückfrage vor dem Weggehen steht dort, wo gearbeitet wird -
            über den Knöpfen (PAT-02). */}
        {schutz}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button ref={speichernRef} type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird gespeichert …' : 'Änderungen speichern'}
          </Button>
          {/* Ein Seitenwechsel ist ein Link (UIK-13) - und läuft damit durch
              dieselbe Rückfrage wie jeder andere Weg hinaus. */}
          <ButtonLink to={zurueck} variant="secondary">
            Abbrechen
          </ButtonLink>
        </div>
      </form>

      {/* Ein Fehlschlag kann nicht neben dem Knopf stehen, der ihn auslöst: Am
          Telefon lag der Kasten oben im Formular, weit über dem Knopf. Deshalb
          als Fenster über dem Inhalt (ANN-058, PAT-03, ZST-10). */}
      {mutation.isError ? (
        <Hinweisfenster
          titel="Die Stammdaten konnten nicht gespeichert werden."
          onSchliessen={() => {
            mutation.reset();
            setFokusAufSpeichern(true);
          }}
        >
          Die Eingaben stehen noch im Formular. Bitte die Verbindung prüfen und erneut speichern.
        </Hinweisfenster>
      ) : null}

      <p className="text-ink-muted mt-10 max-w-prose text-xs leading-relaxed">
        Änderungen an Stammdaten werden protokolliert. Der Versorgungsstatus wird hier nicht
        verändert.
      </p>
    </>
  );
}

export function EditPatientPage() {
  const { patientId = '' } = useParams<{ patientId: string }>();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    enabled: Boolean(patientId),
    retry: false,
  });

  return (
    <>
      {/* Der Rückweg steht vor jedem Zustand - auch im Fehlerfall gibt es
          einen Weg hinaus, nicht nur die Zurück-Taste des Browsers (PAT-22). */}
      <Rueckweg
        standard={`/patienten/${patientId}/stammdaten`}
        beschriftung="Zurück zu den Stammdaten"
      />

      {data ? (
        <EditPatientForm patient={data} />
      ) : (
        <>
          <PageHeader title={TITEL} />
          {isPending ? <LoadingState label="Patientendaten werden geladen …" /> : null}
          {isError ? (
            <ErrorState
              title="Die Patientendaten konnten nicht geladen werden."
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
        </>
      )}
    </>
  );
}
