import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Listenfehler } from '@/features/appointments/Rueckmeldungen';
import {
  FAHRZEITFAKTOR_SCHLUESSEL,
  FAHRZEITFAKTOR_VOREINSTELLUNG,
  FAHRZEITFAKTOR_WERTE,
} from './fahrzeitfaktor';
import { fetchFahrzeitfaktor, saveFahrzeitfaktor } from './fahrzeitfaktor-api';

/** Die Geschwindigkeit, mit der der Kartendienst für das Lastenrad rechnet (gemessen, ANN-237). */
const DIENST_KMH = 23;

/** „1,5“ – das Komma, wie es in der Praxis gelesen wird. */
function faktorText(faktor: number): string {
  return faktor.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Was ein Faktor im Alltag heißt: „≈ 15 km/h“. */
function tempoText(faktor: number): string {
  return `≈ ${Math.round(DIENST_KMH / faktor)} km/h`;
}

/**
 * Fahrzeitfaktor der Praxis (UBK-010, ANN-237).
 *
 * Steht auf der Planungsseite neben dem Startort der Touren: eine
 * Grundeinstellung wie das Raster, nur owner, verbindlich prüft
 * `set_travel_time_factor`. Ohne geladenen Wert keine Auswahl - sonst
 * überschriebe ein Tipp den unbekannten Wert der Praxis mit der
 * Voreinstellung (wie bei der Dokumentationsfrist, ORG-14).
 */
export function FahrzeitfaktorEinstellung() {
  const queryClient = useQueryClient();
  const faktor = useQuery({
    queryKey: FAHRZEITFAKTOR_SCHLUESSEL,
    queryFn: fetchFahrzeitfaktor,
    retry: false,
  });
  const [wert, setWert] = useState(FAHRZEITFAKTOR_VOREINSTELLUNG);
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    if (faktor.data !== undefined) setWert(faktor.data);
  }, [faktor.data]);

  const mutation = useMutation({
    mutationFn: () => saveFahrzeitfaktor(wert),
    onSuccess: () => {
      setGespeichert(true);
      // Alle Fahrzeiten lesen den Faktor beim Rendern; die Antworten des
      // Kartendienstes bleiben im Zwischenspeicher, nichts wird neu gefragt.
      void queryClient.invalidateQueries({ queryKey: FAHRZEITFAKTOR_SCHLUESSEL });
    },
  });

  const geladen = faktor.data !== undefined;

  return (
    <Section
      titel="Fahrzeitfaktor"
      hinweis={`Der Kartendienst rechnet mit dem Lastenrad mit rund ${DIENST_KMH} km/h. Jede Fahrzeit in Tour, Übersicht, Kalender und Terminsuche wird mit diesem Faktor malgenommen – 1,5 entspricht rund 15 km/h. Gilt für die ganze Praxis.`}
    >
      <div className="max-w-xs">
        <Select
          label="Faktor"
          value={String(wert)}
          disabled={!geladen}
          onChange={(e) => {
            setWert(Number(e.target.value));
            setGespeichert(false);
          }}
        >
          {geladen ? (
            FAHRZEITFAKTOR_WERTE.map((f) => (
              <option key={f} value={String(f)}>
                {`${faktorText(f)} (${tempoText(f)})`}
              </option>
            ))
          ) : (
            <option value={String(wert)}>
              {faktor.isError ? 'Nicht geladen' : 'Wird geladen …'}
            </option>
          )}
        </Select>
      </div>

      {faktor.isError && !geladen ? (
        <div className="mt-3">
          <Listenfehler
            text="Der Fahrzeitfaktor konnte nicht geladen werden. Bis dahin lässt er sich nicht ändern."
            onErneut={() => void faktor.refetch()}
          />
        </div>
      ) : null}

      {mutation.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {mutation.error.message} Bitte die Verbindung prüfen und erneut speichern.
        </Statusmeldung>
      ) : null}
      {gespeichert && !mutation.isPending && !mutation.isError ? (
        <Statusmeldung ton="erfolg" className="mt-3">
          Der Fahrzeitfaktor ist gespeichert.
        </Statusmeldung>
      ) : null}

      <div className="mt-4">
        <Button
          type="button"
          disabled={mutation.isPending || !geladen}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Wird gespeichert …' : 'Faktor speichern'}
        </Button>
      </div>
    </Section>
  );
}
