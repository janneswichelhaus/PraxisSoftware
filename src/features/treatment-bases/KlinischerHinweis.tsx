import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { setTreatmentBasisClinicalNote, type ClinicalTreatmentBasis } from './api';

/** Höchstlänge, dieselbe wie die Constraint an `treatment_bases.prescriber_note`. */
const HOECHSTLAENGE = 2000;

/**
 * Der behandlungsrelevante Hinweis aus einer Verordnung erfassen oder ändern
 * (ABN-007, BEF-098).
 *
 * Ein klinisches Feld, getrennt von den organisatorischen „Anmerkungen“ des
 * Formulars: etwa „keine Belastung über 20 kg“. Erfassen dürfen die
 * behandelnden Rollen; lesen alle, die die Dokumentation lesen, auch das Büro
 * (ANN-214). Der Knopf ist nur Darstellung — verbindlich prüft
 * `set_treatment_basis_clinical_note`.
 */
export function KlinischerHinweis({
  verordnung,
  patientId,
}: {
  verordnung: ClinicalTreatmentBasis;
  patientId: string;
}) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState(verordnung.prescriber_note ?? '');
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const [gespeichert, setGespeichert] = useState(false);

  const mutation = useMutation({
    mutationFn: (neu: string) =>
      setTreatmentBasisClinicalNote(verordnung.id, neu, verordnung.updated_at),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['patient-treatment-bases-clinical', patientId],
      });
      setOffen(false);
      setGespeichert(true);
    },
  });

  if (!offen) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        {gespeichert ? <Statusmeldung ton="erfolg">Hinweis gespeichert.</Statusmeldung> : null}
        <div className="flex">
          <Button
            type="button"
            variant="quiet"
            onClick={() => {
              setText(verordnung.prescriber_note ?? '');
              setFehler(undefined);
              setGespeichert(false);
              setOffen(true);
            }}
          >
            {verordnung.prescriber_note
              ? 'Behandlungsrelevanten Hinweis ändern'
              : 'Behandlungsrelevanten Hinweis erfassen'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="mt-3 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        if (text.trim().length > HOECHSTLAENGE) {
          setFehler(`Höchstens ${HOECHSTLAENGE} Zeichen.`);
          return;
        }
        mutation.mutate(text);
      }}
    >
      <TextArea
        label="Behandlungsrelevanter Hinweis"
        hint="Aus der Verordnung, etwa eine Belastungsgrenze. Klinisch: Lesen können alle, die die Dokumentation lesen. Leer lassen entfernt den Hinweis."
        value={text}
        error={fehler}
        rows={3}
        onChange={(event) => {
          setText(event.target.value);
          setFehler(undefined);
        }}
      />
      {mutation.isError ? (
        <Statusmeldung ton="fehler">{mutation.error.message}</Statusmeldung>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Wird gespeichert …' : 'Hinweis speichern'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={mutation.isPending}
          onClick={() => setOffen(false)}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
