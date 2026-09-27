import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Inhaltsflaeche } from '@/components/ui/Card';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { GeocodeResult, LocationErrorCode } from '@/lib/location/contract';
import { GENAUIGKEIT_TEXT, brauchtBestaetigung, geocodiere } from '@/lib/location/geocode';
import type { Quelle } from '@/lib/location/funktion';
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

/**
 * Was die Person liest, wenn die Verortung scheitert (PAT-15).
 *
 * Eigene Sätze statt der Titel aus der Routenberechnung: „Kartendienst weist
 * den Serverschlüssel ab" oder „Routenfunktion antwortet nicht" standen hier
 * vor dem Satz - Einrichtungsbegriffe ohne Handlung, dazu aus einer anderen
 * Funktion. Jeder Satz sagt, was los ist und was jetzt geht; keiner nennt eine
 * Adresse oder einen Schlüssel (ADR-011). Der Satz bleibt bei dem, der es war
 * (BEF-027): Scheitert die eigene Funktion, heißt es nicht, der Kartendienst
 * sei es gewesen.
 */
function verortungsfehler(code: LocationErrorCode): string {
  switch (code) {
    case 'not_found':
      return 'Zu dieser Adresse hat der Kartendienst keinen Treffer gefunden. Bitte die Schreibweise prüfen.';
    case 'timeout':
    case 'unavailable':
    case 'rate_limited':
      return 'Der Kartendienst ist gerade nicht erreichbar. Bitte später erneut verorten.';
    case 'not_configured':
      return 'Für die Praxis ist kein Kartendienst eingerichtet. Die Adresse bleibt vorerst ohne Kartenposition.';
    case 'unauthorized':
      return 'Der Kartendienst nimmt die Anfrage der Praxis nicht an – das ist ein Einrichtungsschritt. Die Adresse bleibt vorerst ohne Kartenposition.';
    case 'session_invalid':
      return 'Die Anmeldung gilt nicht mehr. Bitte neu anmelden und dann erneut verorten.';
    case 'function_unavailable':
    case 'invalid_request':
      return 'Die Verortung ist gerade nicht möglich. Bitte später erneut verorten.';
  }
}

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
        setFehler(verortungsfehler(ergebnis.error.code));
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

  // Sagt, was fehlt, statt eines Gedankenstrichs mit Klammer (PAT-15).
  if (!anschrift) return <span>Für die Kartenposition fehlen Straße, PLZ oder Ort.</span>;

  return (
    <div className="space-y-2">
      <p>Noch nicht verortet – ohne Kartenposition fehlt der Hausbesuch auf der Tourenkarte.</p>
      {treffer ? (
        // Der Treffer ist eine Auskunft und steht deshalb auf der Fläche des
        // Systems, nicht in einem eigenen Kasten (PAT-14).
        <Inhaltsflaeche className="space-y-2">
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
        </Inhaltsflaeche>
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
