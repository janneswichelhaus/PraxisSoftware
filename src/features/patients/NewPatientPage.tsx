import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { leseRueckweg } from '@/lib/rueckweg';
import { fetchAssignableTherapists } from '@/features/appointments/api';
import {
  createPatient,
  leereStammdaten,
  patientMasterDataSchema,
  type StammdatenFeld,
} from './api';
import { PatientMasterDataFields } from './PatientMasterDataFields';

/**
 * Anlage eines neuen Patienten.
 *
 * Die Prüfung im Formular dient der Bedienbarkeit. Verbindlich sind
 * Berechtigung, Organisationszuordnung und Normalisierung in der
 * Serverfunktion `create_patient` (ADR-004).
 */
export function NewPatientPage() {
  const [werte, setWerte] = useState<Record<StammdatenFeld, string>>(leereStammdaten);
  const [fehler, setFehler] = useState<Partial<Record<StammdatenFeld, string>>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suche] = useSearchParams();

  /**
   * Der Abstecher aus einem laufenden Vorgang (UX-012).
   *
   * „Die Person steht noch gar nicht in der Kartei" passiert beim Anlegen
   * eines Termins ständig. Vorher war das eine Sackgasse: Kartei öffnen,
   * anlegen, zurückfinden, von vorn beginnen. Kommt ein Rückweg mit, führt
   * das Anlegen dorthin zurück — und nimmt die neue Kennung mit, damit der
   * begonnene Vorgang sie sofort verwenden kann.
   */
  const zurueck = leseRueckweg(suche, '/patienten');

  // Auswahl für die feste Therapeut:in (PAT-005). Schlägt die Abfrage fehl,
  // bleibt die Auswahl leer - das Formular bleibt bedienbar.
  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: createPatient,
    onSuccess: async (patientId) => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      const trenner = zurueck.includes('?') ? '&' : '?';
      void navigate(
        zurueck === '/patienten'
          ? `/patienten/${patientId}`
          : `${zurueck}${trenner}patient=${patientId}`,
        { replace: true },
      );
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
      <Rueckweg standard="/patienten" beschriftung="Zurück zur Liste" />

      <PageHeader
        title="Neue:r Patient:in"
        description="Stammdaten für die Aufnahme in die Praxis. Mit * markierte Felder sind erforderlich."
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {mutation.isError ? (
          <div className="mb-6">
            <ErrorState
              title="Der Patient konnte nicht angelegt werden."
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
            {mutation.isPending ? 'Wird angelegt …' : 'Patient anlegen'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
            Abbrechen
          </Button>
        </div>
      </form>

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Es werden ausschließlich organisatorische Stammdaten erfasst. Klinische Angaben und ein
        Portalzugang entstehen hier nicht.
      </p>
    </>
  );
}
