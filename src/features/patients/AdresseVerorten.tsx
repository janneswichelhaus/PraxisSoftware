import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { GeocodeResult } from '@/lib/location/contract';
import { GENAUIGKEIT_TEXT, brauchtBestaetigung, geocodiere } from '@/lib/location/geocode';
import type { Quelle } from '@/lib/location/funktion';
import { FEHLERTEXTE } from '@/features/tours/karte/fehlertexte';
import { setPatientAddressCoordinate, type Patient } from './api';

/**
 * Die Adresse auf der Karte verorten (MAP-006a, ANN-016).
 *
 * **Nur auf ausdrückliche Handlung und nur, solange die Adresse keine
 * Koordinate hat.** Eine Koordinate verfällt serverseitig mit jeder
 * Adressänderung; danach steht hier wieder der Knopf. Beim Öffnen der Akte
 * oder einer Karte wird nichts geocodiert (ADR-019 Punkt 14).
 *
 * Hinaus gehen die fünf Felder der Anschrift, nie der Name (Punkt 12). Der
 * Anzeigetext des Treffers wird gezeigt, damit die Person ihn prüfen kann,
 * und danach verworfen. Unterhalb der Hausnummer bestätigt sie den Treffer —
 * sonst bleibt die Adresse ohne Koordinate.
 */

interface Anschrift {
  readonly street: string;
  readonly houseNumber: string;
  readonly postalCode: string;
  readonly city: string;
}

function vollstaendigeAnschrift(patient: Patient): Anschrift | null {
  if (!patient.street || !patient.postal_code || !patient.city) return null;
  return {
    street: patient.street,
    houseNumber: patient.house_number ?? '',
    postalCode: patient.postal_code,
    city: patient.city,
  };
}

export function AdresseVerorten({ patient }: { patient: Patient }) {
  const queryClient = useQueryClient();
  const anschrift = vollstaendigeAnschrift(patient);
  // Der Treffer trägt die Anschrift, zu der er gehört: Gespeichert wird genau
  // diese, nicht die, die beim Tippen auf „übernehmen" gerade angezeigt wird.
  // Hat sie sich inzwischen geändert, lehnt der Server ab (40001).
  const [treffer, setTreffer] = useState<{
    wert: GeocodeResult;
    quelle: Quelle;
    anschrift: Anschrift;
  } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const speichern = useMutation({
    mutationFn: ({
      wert,
      bestaetigt,
      zu,
    }: {
      wert: GeocodeResult;
      bestaetigt: boolean;
      zu: Anschrift;
    }) => setPatientAddressCoordinate(patient.id, zu, wert, bestaetigt),
    onSuccess: async () => {
      setTreffer(null);
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
    },
  });

  const suchen = useMutation({
    mutationFn: (zu: Anschrift) => geocodiere({ ...zu, countryCode: 'DE' }),
    onSuccess: (ergebnis, zu) => {
      if (!ergebnis.ok) {
        setFehler(
          ergebnis.error.code === 'not_found'
            ? 'Zu dieser Adresse hat der Kartendienst keinen Treffer gefunden. Bitte die Schreibweise prüfen.'
            : `${FEHLERTEXTE[ergebnis.error.code].titel}. Die Adresse bleibt ohne Kartenposition.`,
        );
        return;
      }
      setFehler(null);
      // Hausnummerngenau und vom Anbieter: ohne Rückfrage speichern. Alles
      // andere legt die Person selbst fest (ANN-016) - auch jede Position der
      // Nachbildung, damit niemand eine erfundene Koordinate unbemerkt übernimmt.
      if (!brauchtBestaetigung(ergebnis.value) && ergebnis.quelle === 'anbieter') {
        speichern.mutate({ wert: ergebnis.value, bestaetigt: false, zu });
        return;
      }
      setTreffer({ wert: ergebnis.value, quelle: ergebnis.quelle, anschrift: zu });
    },
  });

  if (patient.geocode_precision) {
    return (
      <span>
        Verortet, {GENAUIGKEIT_TEXT[patient.geocode_precision]}
        {patient.geocode_precision !== 'address' ? ' (bestätigt)' : ''}
      </span>
    );
  }

  if (!anschrift) return <span>— (Adresse unvollständig)</span>;

  return (
    <div className="space-y-2">
      <p>Noch nicht verortet — ohne Kartenposition fehlt der Hausbesuch auf der Tourenkarte.</p>
      {treffer ? (
        <div className="border-line rounded-card space-y-2 border p-3">
          <p>
            Treffer {GENAUIGKEIT_TEXT[treffer.wert.precision]}
            {treffer.wert.matchLabel ? `: ${treffer.wert.matchLabel}` : ''}.
          </p>
          {treffer.quelle === 'nachbildung' ? (
            <Statusmeldung ton="warnung">
              Nachbildung ohne Kartendienst: Die Position ist erfunden.
            </Statusmeldung>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={speichern.isPending}
              onClick={() =>
                speichern.mutate({
                  wert: treffer.wert,
                  bestaetigt: brauchtBestaetigung(treffer.wert),
                  zu: treffer.anschrift,
                })
              }
            >
              Treffer übernehmen
            </Button>
            <Button type="button" variant="secondary" onClick={() => setTreffer(null)}>
              Verwerfen
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={suchen.isPending || speichern.isPending}
          onClick={() => suchen.mutate(anschrift)}
        >
          {suchen.isPending ? 'Wird verortet …' : 'Adresse verorten'}
        </Button>
      )}
      {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
      {speichern.isError ? (
        <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
      ) : null}
    </div>
  );
}
