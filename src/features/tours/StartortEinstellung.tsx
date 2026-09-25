import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { GeocodeResult } from '@/lib/location/contract';
import type { Quelle } from '@/lib/location/funktion';
import { GENAUIGKEIT_TEXT, brauchtBestaetigung, geocodiere } from '@/lib/location/geocode';
import { FEHLERTEXTE } from './karte/fehlertexte';
import { fetchStandorte, saveTourStart, type Standort } from './startort';

/**
 * Startort der Touren (MAP-006a): Adresse des Standorts und ihre Position.
 *
 * Eine Grundeinstellung wie das Praxisraster — nur owner, verbindlich prüft
 * `set_location_tour_start`. Geocodiert wird beim Speichern der Adresse, nie
 * beim Öffnen einer Karte (ADR-019 Punkt 14).
 */
export function StartortEinstellung() {
  const standorte = useQuery({ queryKey: ['standorte'], queryFn: fetchStandorte, retry: false });
  const standort = standorte.data?.[0];

  return (
    <section className="border-line bg-surface rounded-card mb-8 border p-5">
      <h2 className="text-ink text-base font-semibold">Startort der Touren</h2>
      <p className="text-ink-muted mt-1 max-w-prose text-sm">
        Von hier beginnt die Tagesroute, wenn nichts anderes gewählt ist. Eine Adresse der Praxis,
        keine Wohnadresse.
      </p>
      {standorte.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          Die Standorte konnten nicht geladen werden.
        </Statusmeldung>
      ) : null}
      {standort ? <StartortFormular key={standort.id} standort={standort} /> : null}
    </section>
  );
}

function StartortFormular({ standort }: { standort: Standort }) {
  const queryClient = useQueryClient();
  const [werte, setWerte] = useState({
    street: standort.street ?? '',
    houseNumber: standort.house_number ?? '',
    postalCode: standort.postal_code ?? '',
    city: standort.city ?? '',
  });
  // Der Treffer trägt die Anschrift, die geocodiert wurde; gespeichert wird
  // genau diese, auch wenn die Felder inzwischen anders aussehen.
  const [treffer, setTreffer] = useState<{
    wert: GeocodeResult;
    quelle: Quelle;
    anschrift: typeof werte;
  } | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const speichern = useMutation({
    mutationFn: (gefunden: { wert: GeocodeResult; anschrift: typeof werte }) =>
      saveTourStart(
        standort.id,
        gefunden.anschrift,
        gefunden.wert,
        brauchtBestaetigung(gefunden.wert),
      ),
    onSuccess: async () => {
      setTreffer(null);
      setMeldung('Der Startort ist gespeichert.');
      await queryClient.invalidateQueries({ queryKey: ['standorte'] });
    },
  });

  const suchen = useMutation({
    mutationFn: (zu: typeof werte) => geocodiere({ ...zu, countryCode: 'DE' }),
    onSuccess: (ergebnis, zu) => {
      if (!ergebnis.ok) {
        setMeldung(
          ergebnis.error.code === 'not_found'
            ? 'Zu dieser Adresse gibt es keinen Treffer.'
            : FEHLERTEXTE[ergebnis.error.code].titel,
        );
        return;
      }
      setMeldung(null);
      setTreffer({ wert: ergebnis.value, quelle: ergebnis.quelle, anschrift: zu });
    },
  });

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!werte.street.trim() || !werte.postalCode.trim() || !werte.city.trim()) {
      setMeldung('Straße, Postleitzahl und Ort sind nötig.');
      return;
    }
    suchen.mutate(werte);
  }

  function setzen(feld: keyof typeof werte, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    setTreffer(null);
  }

  return (
    <form className="mt-4 space-y-3" onSubmit={absenden} noValidate>
      <p className="text-sm">
        {standort.geocode_precision
          ? `${standort.name}: verortet, ${GENAUIGKEIT_TEXT[standort.geocode_precision]}.`
          : `${standort.name}: noch ohne Startort.`}
      </p>
      <div className="grid max-w-xl gap-3 sm:grid-cols-[1fr_8rem]">
        <Field
          label="Straße"
          value={werte.street}
          onChange={(e) => setzen('street', e.target.value)}
        />
        <Field
          label="Hausnummer"
          value={werte.houseNumber}
          onChange={(e) => setzen('houseNumber', e.target.value)}
        />
        <Field
          label="Postleitzahl"
          value={werte.postalCode}
          onChange={(e) => setzen('postalCode', e.target.value)}
        />
        <Field label="Ort" value={werte.city} onChange={(e) => setzen('city', e.target.value)} />
      </div>

      {treffer ? (
        <div className="border-line rounded-card max-w-xl space-y-2 border p-3 text-sm">
          <p>
            Treffer {GENAUIGKEIT_TEXT[treffer.wert.precision]}
            {treffer.wert.matchLabel ? `: ${treffer.wert.matchLabel}` : ''}.
          </p>
          {treffer.quelle === 'nachbildung' ? (
            <Statusmeldung ton="warnung">
              Nachbildung ohne Kartendienst: Die Position ist erfunden.
            </Statusmeldung>
          ) : null}
          <Button
            type="button"
            disabled={speichern.isPending}
            onClick={() => speichern.mutate(treffer)}
          >
            Als Startort speichern
          </Button>
        </div>
      ) : (
        <Button type="submit" variant="secondary" disabled={suchen.isPending}>
          {suchen.isPending ? 'Wird verortet …' : 'Adresse verorten'}
        </Button>
      )}

      {meldung ? <Statusmeldung>{meldung}</Statusmeldung> : null}
      {speichern.isError ? (
        <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
      ) : null}
    </form>
  );
}
