import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import {
  MITNEHMEN_HOECHSTLAENGE,
  MITNEHMEN_HOECHSTZAHL,
  setTakeAlongItems,
  type Patient,
} from './api';

/** Eine Zeile je Eintrag; leere Zeilen zählen nicht. */
function zeilen(text: string): string[] {
  return text
    .split('\n')
    .map((zeile) => zeile.trim())
    .filter((zeile) => zeile.length > 0);
}

/** Dieselbe Formregel wie `app.take_along_items_valid`, nur für die Meldung am Feld. */
function formFehler(eintraege: string[]): string | undefined {
  if (eintraege.length > MITNEHMEN_HOECHSTZAHL) {
    return `Höchstens ${MITNEHMEN_HOECHSTZAHL} Einträge.`;
  }
  if (eintraege.some((eintrag) => eintrag.length > MITNEHMEN_HOECHSTLAENGE)) {
    return `Ein Eintrag hat höchstens ${MITNEHMEN_HOECHSTLAENGE} Zeichen.`;
  }
  return undefined;
}

/**
 * „Mitnehmen": was für einen Besuch aufs Rad muss (PRX-007, ANN-138).
 *
 * Von Hand gepflegt - die Anwendung schlägt aus Befund oder Dokumentation
 * nichts vor (ADR-006). Ein Merkmal der Person wie die Behandlungsliege; am
 * Termin steht es im Kurzblick, in der Übersicht nur zusammengezählt.
 * Verbindlich prüft `set_take_along_items` Rolle und Form.
 */
export function Mitnehmen({ patient, darfAendern }: { patient: Patient; darfAendern: boolean }) {
  const queryClient = useQueryClient();
  const liste = patient.take_along_items ?? [];
  const [entwurf, setEntwurf] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (eintraege: string[]) => setTakeAlongItems(patient.id, eintraege),
    onSuccess: async () => {
      setEntwurf(null);
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
      // Die Übersicht zählt die Liste über die Tagesliste zusammen.
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
    },
  });

  if (entwurf !== null) {
    const eintraege = zeilen(entwurf);
    const fehler = formFehler(eintraege);
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!fehler) mutation.mutate(eintraege);
        }}
      >
        <TextArea
          label="Material zum Mitnehmen"
          hint="Ein Eintrag je Zeile, etwa „Theraband“ oder „Übungsplan ausgedruckt“."
          rows={4}
          value={entwurf}
          error={fehler}
          onChange={(event) => setEntwurf(event.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending || fehler !== undefined}>
            {mutation.isPending ? 'Wird gespeichert …' : 'Liste speichern'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              mutation.reset();
              setEntwurf(null);
            }}
          >
            Abbrechen
          </Button>
        </div>
        {mutation.isError ? (
          <Statusmeldung ton="fehler">
            Die Liste zum Mitnehmen konnte nicht gespeichert werden. Bitte die Verbindung prüfen und
            erneut versuchen.
          </Statusmeldung>
        ) : null}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* UX-005e: Eine leere Liste bekommt keinen Satz - der Knopf „Material
          eintragen" sagt schon, dass nichts da ist. */}
      {liste.length > 0 ? (
        <ul className="text-ink list-disc pl-5">
          {liste.map((eintrag) => (
            <li key={eintrag} className="wrap-anywhere">
              {eintrag}
            </li>
          ))}
        </ul>
      ) : null}
      {darfAendern ? (
        <div>
          <Button variant="secondary" onClick={() => setEntwurf(liste.join('\n'))}>
            {liste.length > 0 ? 'Liste ändern' : 'Material eintragen'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
