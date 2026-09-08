import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { fetchAssignableTherapists } from '@/features/appointments/api';
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

/**
 * Formular für die Änderung der Stammdaten.
 *
 * Vorbefüllt aus dem gelesenen Datensatz. Die Prüfung hier ist Bedienkomfort;
 * verbindlich sind Berechtigung, Organisationszugehörigkeit des Patienten und
 * Normalisierung in `update_patient` (ADR-004). Status, Organisation und
 * Portalzugang sind bewusst keine Eingabefelder.
 */
function EditPatientForm({ patient }: { patient: Patient }) {
  const [werte, setWerte] = useState<Record<StammdatenFeld, string>>(() =>
    patientToFormValues(patient),
  );
  const [fehler, setFehler] = useState<Partial<Record<StammdatenFeld, string>>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Auswahl für die feste Therapeut:in (PAT-005). Schlägt die Abfrage fehl,
  // bleibt die Auswahl leer - das Formular bleibt bedienbar.
  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  const zurueck = `/patienten/${patient.id}`;

  const mutation = useMutation({
    mutationFn: (values: PatientMasterDataValues) => updatePatient(patient.id, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
      void navigate(zurueck, { replace: true });
    },
  });

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
      <Link
        to={zurueck}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zur Akte
      </Link>

      <PageHeader
        title="Stammdaten bearbeiten"
        description={`${fullName(patient)} · Mit * markierte Felder sind erforderlich.`}
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {mutation.isError ? (
          <div className="mb-6">
            <ErrorState
              title="Die Stammdaten konnten nicht gespeichert werden."
              description="Bitte erneut versuchen. Sind Sie noch angemeldet und berechtigt?"
            />
          </div>
        ) : null}

        <PatientMasterDataFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          therapeutinnen={therapeuten.data ?? []}
        />

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird gespeichert …' : 'Änderungen speichern'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
            Abbrechen
          </Button>
        </div>
      </form>

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Änderungen an Stammdaten werden protokolliert. Der Versorgungsstatus wird hier nicht
        verändert.
      </p>
    </>
  );
}

export function EditPatientPage() {
  const { patientId } = useParams<{ patientId: string }>();

  const { data, isPending, isError } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  return (
    <>
      {isPending ? <LoadingState label="Patientendaten werden geladen …" /> : null}
      {isError ? <ErrorState title="Die Patientendaten konnten nicht geladen werden." /> : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Datensatz existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}
      {data ? <EditPatientForm patient={data} /> : null}
    </>
  );
}
