import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { mitRueckweg } from '@/lib/rueckweg';
import { Patientensuche } from '@/features/patients/Patientensuche';
import type { Variante } from '@/features/exercise/exercises/api';
import { PLAENE_SCHLUESSEL, planPfad, savePosition } from './api';
import { planFuerUebung } from './zielplan';
import { neuePosition, standardDosis } from './hinzufuegen';

/**
 * „Zu einem Plan“ auf der Übungsseite (Restbefunde der Praxis-Prüfung):
 * die gezeigte Variante einer Patient:in in den Übungsplan legen, ohne erst
 * zur Akte und dort durch die Auswahl zu gehen.
 *
 * Ein Tipp öffnet die Suche, ein Tipp wählt die Person; danach steht die
 * Planseite mit der Übung offen, dort wird wie gewohnt zugewiesen. Die
 * Dosierung ist die Standarddosierung des Katalogs (ANN-384), wie beim
 * Hinzufügen im Plan. Gesucht wird über `search_patients` (ab drei Zeichen,
 * nur Name und Geburtsdatum); schreiben darf, wen `can_write_exercise_plans`
 * lässt - die Schaltfläche folgt der Rolle nur.
 */
export function ZuEinemPlan({ variante, rueckweg }: { variante: Variante; rueckweg: string }) {
  const [offen, setOffen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const hinzufuegen = useMutation({
    mutationFn: async (patientId: string) => {
      const planId = await planFuerUebung(patientId);
      await savePosition(neuePosition(planId, variante.id, standardDosis(variante)));
      return { patientId, planId };
    },
    onSuccess: async ({ patientId, planId }) => {
      await queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL });
      void navigate(mitRueckweg(planPfad('therapy', patientId, planId), rueckweg));
    },
  });

  return (
    <>
      <Button
        type="button"
        variant="primary"
        disabled={variante.archived}
        onClick={() => {
          hinzufuegen.reset();
          setOffen(true);
        }}
      >
        Zu einem Plan
      </Button>
      {offen ? (
        <Dialogfenster titel="Zu einem Übungsplan" onSchliessen={() => setOffen(false)}>
          <p className="text-ink-muted mb-3 text-sm">{variante.name}</p>
          {/* Die Trefferliste klappt unter dem Feld auf; ohne diese Höhe
              schnitt das Fenster sie am Telefon ab (Sichtung 375 px). */}
          <div className="min-h-80">
            <Patientensuche
              label="Für wen?"
              labelSichtbar
              onAuswahl={(patientId) => {
                if (!hinzufuegen.isPending) hinzufuegen.mutate(patientId);
              }}
            />
            {hinzufuegen.isPending ? (
              <Statusmeldung ton="neutral" className="mt-3">
                Wird hinzugefügt …
              </Statusmeldung>
            ) : null}
            {hinzufuegen.isError ? (
              <Statusmeldung ton="fehler" className="mt-3">
                {hinzufuegen.error.message}
              </Statusmeldung>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="quiet" onClick={() => setOffen(false)}>
              Abbrechen
            </Button>
          </div>
        </Dialogfenster>
      ) : null}
    </>
  );
}
