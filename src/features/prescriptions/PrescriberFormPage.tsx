import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PrescriberFormFields } from './PrescriberFormFields';
import {
  VerordnerBereitsVorhanden,
  createPrescriber,
  fetchPrescriber,
  leereVerordnerdaten,
  prescriberName,
  prescriberSchemaForm,
  prescriberToFormValues,
  prescriptionDraftKey,
  updatePrescriber,
  type Prescriber,
  type PrescriberFeld,
  type PrescriberValues,
  type PrescriptionDraft,
} from './api';

/**
 * Gemeinsames Formular für Anlegen und Ändern einer Verordner:in.
 *
 * Anders als bei den Patientenstammdaten sind die beiden Vorgänge hier bis auf
 * Überschrift und Rücksprungziel gleich; eine zweite Seite wäre eine Kopie
 * ohne eigenen Inhalt. Die Berechtigung prüft in beiden Fällen der Server
 * (ADR-004).
 */
function VerordnerFormular({ bestand, zurueck }: { bestand: Prescriber | null; zurueck: string }) {
  const [werte, setWerte] = useState<Record<PrescriberFeld, string>>(() =>
    bestand ? prescriberToFormValues(bestand) : leereVerordnerdaten,
  );
  const [fehler, setFehler] = useState<Partial<Record<PrescriberFeld, string>>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (values: PrescriberValues) => {
      if (bestand) {
        await updatePrescriber(bestand.id, values);
        return bestand.id;
      }
      return createPrescriber(values);
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['prescribers'] });
      if (bestand) {
        await queryClient.invalidateQueries({ queryKey: ['prescriber', bestand.id] });
      } else {
        // Kommt die Anlage aus dem Verordnungsformular (VER-003), liegt dort
        // ein Entwurf unter genau diesem Rücksprungpfad - die neue
        // Verordner:in wird darin nachgetragen, sobald er existiert. Ohne
        // Entwurf (Aufruf direkt aus der Verordnerkartei) ändert sich nichts.
        queryClient.setQueryData<PrescriptionDraft>(prescriptionDraftKey(zurueck), (bisher) =>
          bisher ? { ...bisher, neuerVerordnerId: id } : bisher,
        );
      }
      void navigate(zurueck, { replace: true });
    },
  });

  function setzen(feld: PrescriberFeld, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Schutz gegen mehrfaches Absenden: solange ein Vorgang läuft, wird kein
    // zweiter gestartet.
    if (mutation.isPending) return;

    const ergebnis = prescriberSchemaForm.safeParse(werte);
    if (!ergebnis.success) {
      const gefunden: Partial<Record<PrescriberFeld, string>> = {};
      for (const problem of ergebnis.error.issues) {
        const feld = problem.path[0] as PrescriberFeld | undefined;
        if (feld && !gefunden[feld]) gefunden[feld] = problem.message;
      }
      setFehler(gefunden);
      return;
    }

    setFehler({});
    mutation.mutate(ergebnis.data);
  }

  const doppelt = mutation.error instanceof VerordnerBereitsVorhanden;

  return (
    <>
      <Link
        to={zurueck}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück
      </Link>

      <PageHeader
        title={bestand ? 'Verordner:in bearbeiten' : 'Neue:r Verordner:in'}
        description={
          bestand
            ? `${prescriberName(bestand)} · Mit * markierte Felder sind erforderlich.`
            : 'Nur der Nachname ist erforderlich; alles Weitere hilft bei der Folgeverordnung.'
        }
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {mutation.isError ? (
          <div className="mb-6">
            <ErrorState
              title={
                doppelt
                  ? 'Diese Verordner:in ist bereits erfasst.'
                  : 'Die Verordner:in konnte nicht gespeichert werden.'
              }
              description={
                doppelt
                  ? 'Name und Praxis stimmen mit einem vorhandenen Eintrag überein. Bitte den vorhandenen Eintrag verwenden oder die Praxis ergänzen.'
                  : 'Bitte erneut versuchen. Sind Sie noch angemeldet und berechtigt?'
              }
            />
          </div>
        ) : null}

        <PrescriberFormFields werte={werte} fehler={fehler} onChange={setzen} />

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending
              ? 'Wird gespeichert …'
              : bestand
                ? 'Änderungen speichern'
                : 'Verordner:in anlegen'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
            Abbrechen
          </Button>
        </div>
      </form>

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Erfasst werden ausschließlich berufliche Kontaktdaten. Kassenmerkmale wie die Arztnummer
        werden nicht gespeichert.
      </p>
    </>
  );
}

export function NewPrescriberPage() {
  // Wer aus dem Verordnungsformular kommt, soll dorthin zurückkehren. Der
  // Parameter wird bewusst nur als Pfad innerhalb der Anwendung akzeptiert.
  const [params] = useSearchParams();
  const ziel = params.get('zurueck');
  const zurueck = ziel && ziel.startsWith('/') && !ziel.startsWith('//') ? ziel : '/verordner';

  return <VerordnerFormular bestand={null} zurueck={zurueck} />;
}

export function EditPrescriberPage() {
  const { prescriberId } = useParams<{ prescriberId: string }>();

  const { data, isPending, isError } = useQuery({
    queryKey: ['prescriber', prescriberId],
    queryFn: () => fetchPrescriber(prescriberId!),
    enabled: Boolean(prescriberId),
    retry: false,
  });

  return (
    <>
      {isPending ? <LoadingState label="Verordner:in wird geladen …" /> : null}
      {isError ? <ErrorState title="Die Verordner:in konnte nicht geladen werden." /> : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Datensatz existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}
      {data ? <VerordnerFormular bestand={data} zurueck="/verordner" /> : null}
    </>
  );
}
