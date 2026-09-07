import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { z } from 'zod';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PrescriptionFormFields, type PositionsFehler } from './PrescriptionFormFields';
import {
  createPrescription,
  deletePrescription,
  fetchPrescribers,
  fetchPrescription,
  itemsToFormValues,
  leerePosition,
  leereVerordnung,
  positionSchema,
  prescriptionFormSchema,
  prescriptionToFormValues,
  updatePrescription,
  type PositionEingabe,
  type PrescriptionDetail,
  type PrescriptionFeld,
} from './api';

type Positionen = z.output<typeof positionSchema>[];

/**
 * Formular für das Anlegen und Ändern einer Verordnung (VER-003).
 *
 * Anlegen und Ändern erfassen dieselben Felder; getrennt sind nur Überschrift,
 * Rücksprungziel und der Schreibvorgang. Die Prüfung hier ist Bedienkomfort —
 * verbindlich prüfen `create_prescription` und `update_prescription`,
 * einschließlich der Rollen (ADR-004, ANN-011).
 */
function VerordnungsFormular({
  patientId,
  bestand,
}: {
  patientId: string;
  bestand: PrescriptionDetail | null;
}) {
  const [werte, setWerte] = useState<Record<PrescriptionFeld, string>>(() =>
    bestand ? prescriptionToFormValues(bestand) : leereVerordnung,
  );
  const [positionen, setPositionen] = useState<PositionEingabe[]>(() =>
    bestand ? itemsToFormValues(bestand) : [{ ...leerePosition }],
  );
  const [fehler, setFehler] = useState<Partial<Record<PrescriptionFeld, string>>>({});
  const [positionsFehler, setPositionsFehler] = useState<PositionsFehler[]>([]);
  const [loeschRueckfrage, setLoeschRueckfrage] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const zurueck = `/patienten/${patientId}`;

  const verordner = useQuery({
    queryKey: ['prescribers'],
    queryFn: fetchPrescribers,
    retry: false,
  });

  async function akteAuffrischen() {
    await queryClient.invalidateQueries({ queryKey: ['patient-prescriptions', patientId] });
    await queryClient.invalidateQueries({
      queryKey: ['patient-prescriptions-clinical', patientId],
    });
  }

  const speichern = useMutation({
    mutationFn: async ({
      values,
      items,
    }: {
      values: z.output<typeof prescriptionFormSchema>;
      items: Positionen;
    }) => {
      if (bestand) {
        await updatePrescription(bestand.id, values, items);
        return bestand.id;
      }
      return createPrescription(patientId, values, items);
    },
    onSuccess: async (id) => {
      await akteAuffrischen();
      if (bestand) await queryClient.invalidateQueries({ queryKey: ['prescription', id] });
      void navigate(zurueck, { replace: true });
    },
  });

  const loeschen = useMutation({
    mutationFn: () => deletePrescription(bestand!.id),
    onSuccess: async () => {
      await akteAuffrischen();
      void navigate(zurueck, { replace: true });
    },
  });

  function setzen(feld: PrescriptionFeld, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
  }

  function positionSetzen(index: number, feld: keyof PositionEingabe, wert: string) {
    setPositionen((bisher) =>
      bisher.map((position, i) => (i === index ? { ...position, [feld]: wert } : position)),
    );
    setPositionsFehler((bisher) =>
      bisher.map((eintrag, i) => (i === index ? { ...eintrag, [feld]: undefined } : eintrag)),
    );
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Schutz gegen mehrfaches Absenden: solange ein Vorgang läuft, wird kein
    // zweiter gestartet.
    if (speichern.isPending) return;

    const kopf = prescriptionFormSchema.safeParse(werte);
    const gefunden: Partial<Record<PrescriptionFeld, string>> = {};
    if (!kopf.success) {
      for (const problem of kopf.error.issues) {
        const feld = problem.path[0] as PrescriptionFeld | undefined;
        if (feld && !gefunden[feld]) gefunden[feld] = problem.message;
      }
    }

    const geprueft: Positionen = [];
    const positionsProbleme: PositionsFehler[] = positionen.map(() => ({}));
    positionen.forEach((position, index) => {
      const ergebnis = positionSchema.safeParse(position);
      if (ergebnis.success) geprueft.push(ergebnis.data);
      else {
        for (const problem of ergebnis.error.issues) {
          const feld = problem.path[0] as keyof PositionEingabe | undefined;
          if (feld && !positionsProbleme[index]![feld]) {
            positionsProbleme[index]![feld] = problem.message;
          }
        }
      }
    });

    setFehler(gefunden);
    setPositionsFehler(positionsProbleme);

    const alleFelderOk = Object.keys(gefunden).length === 0;
    const allePositionenOk = positionsProbleme.every((p) => Object.keys(p).length === 0);
    if (!alleFelderOk || !allePositionenOk || !kopf.success) return;

    speichern.mutate({ values: kopf.data, items: geprueft });
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
        title={bestand ? 'Verordnung bearbeiten' : 'Verordnung erfassen'}
        description="Mit * markierte Felder sind erforderlich."
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {speichern.isError ? (
          <div className="mb-6">
            <ErrorState
              title="Die Verordnung konnte nicht gespeichert werden."
              description="Bitte erneut versuchen. Sind Sie noch angemeldet und berechtigt?"
            />
          </div>
        ) : null}
        {verordner.isError ? (
          <div className="mb-6">
            <ErrorState title="Die Verordner:innen konnten nicht geladen werden." />
          </div>
        ) : null}

        <PrescriptionFormFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          positionen={positionen}
          positionsFehler={positionsFehler}
          onPositionChange={positionSetzen}
          onPositionHinzufuegen={() => setPositionen((bisher) => [...bisher, { ...leerePosition }])}
          onPositionEntfernen={(index) =>
            setPositionen((bisher) => bisher.filter((_, i) => i !== index))
          }
          verordnerinnen={verordner.data ?? []}
          verordnerAnlegenZiel={`/verordner/neu?zurueck=${encodeURIComponent(
            bestand
              ? `/patienten/${patientId}/verordnungen/${bestand.id}/bearbeiten`
              : `/patienten/${patientId}/verordnungen/neu`,
          )}`}
        />

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={speichern.isPending}>
            {speichern.isPending
              ? 'Wird gespeichert …'
              : bestand
                ? 'Änderungen speichern'
                : 'Verordnung speichern'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
            Abbrechen
          </Button>
        </div>
      </form>

      {/* Löschen ist der Weg für eine Verordnung, die in der falschen Akte
          gelandet ist (Art. 16 DSGVO). Bewusst mit Rückfrage und außerhalb des
          Formulars, damit kein versehentliches Absenden sie auslöst. */}
      {bestand ? (
        <div className="border-line mt-10 border-t pt-6">
          {loeschRueckfrage ? (
            <div className="border-line-strong bg-surface-sunken max-w-xl rounded-lg border p-4">
              <p className="text-ink text-sm">
                Die Verordnung wird endgültig entfernt, samt ihren Positionen. Der Vorgang wird
                protokolliert. Für eine falsch zugeordnete Verordnung ist das der richtige Weg; für
                eine abgelaufene nicht — sie gehört in die Akte.
              </p>
              {loeschen.isError ? (
                <p className="text-danger mt-2 text-sm">
                  Die Verordnung konnte nicht gelöscht werden.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={loeschen.isPending}
                  onClick={() => {
                    if (loeschen.isPending) return;
                    loeschen.mutate();
                  }}
                >
                  {loeschen.isPending ? 'Wird gelöscht …' : 'Ja, Verordnung löschen'}
                </Button>
                {/* Eigener Name statt „Abbrechen": auf dieser Seite gibt es
                    schon einen Abbrechen-Knopf im Formular, und zwei gleich
                    benannte Schaltflaechen sind vorgelesen nicht zu
                    unterscheiden. */}
                <Button type="button" variant="quiet" onClick={() => setLoeschRueckfrage(false)}>
                  Nicht löschen
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setLoeschRueckfrage(true)}>
              Verordnung löschen
            </Button>
          )}
        </div>
      ) : null}

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Anlegen, Ändern und Löschen einer Verordnung werden protokolliert.
      </p>
    </>
  );
}

export function NewPrescriptionPage() {
  const { patientId } = useParams<{ patientId: string }>();
  if (!patientId) return null;
  return <VerordnungsFormular patientId={patientId} bestand={null} />;
}

export function EditPrescriptionPage() {
  const { patientId, prescriptionId } = useParams<{
    patientId: string;
    prescriptionId: string;
  }>();

  const { data, isPending, isError } = useQuery({
    queryKey: ['prescription', prescriptionId],
    queryFn: () => fetchPrescription(prescriptionId!),
    enabled: Boolean(prescriptionId),
    retry: false,
  });

  if (!patientId) return null;

  return (
    <>
      {isPending ? <LoadingState label="Verordnung wird geladen …" /> : null}
      {isError ? <ErrorState title="Die Verordnung konnte nicht geladen werden." /> : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Datensatz existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}
      {data ? <VerordnungsFormular patientId={patientId} bestand={data} /> : null}
    </>
  );
}
