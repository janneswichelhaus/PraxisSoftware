import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { GeocodeResult, LocationErrorCode } from '@/lib/location/contract';
import type { Quelle } from '@/lib/location/funktion';
import { GENAUIGKEIT_TEXT, brauchtBestaetigung, geocodiere } from '@/lib/location/geocode';
import { fetchStandorte, saveTourStart, type Standort } from './startort';

/**
 * Startort der Touren (MAP-006a): Adresse des Standorts und ihre Position.
 *
 * Eine Grundeinstellung wie das Praxisraster — nur owner, verbindlich prüft
 * `set_location_tour_start`. Geocodiert wird beim Speichern der Adresse, nie
 * beim Öffnen einer Karte (ADR-019 Punkt 14).
 *
 * Ein Abschnitt wie jeder andere, ohne eigenen weißen Kasten: Formulare
 * stehen nicht auf einer zweiten Fläche (UI-002c, UIK-20, TER-18). Den
 * Abstand zu den Nachbarn setzt die Planungsseite, die ihn einbindet.
 */
export function StartortEinstellung() {
  const standorte = useQuery({ queryKey: ['standorte'], queryFn: fetchStandorte, retry: false });
  const standort = standorte.data?.[0];

  return (
    <Section
      titel="Startort der Touren"
      hinweis="Von hier beginnt die Tagesroute, wenn nichts anderes gewählt ist. Eine Adresse der Praxis, keine Wohnadresse."
    >
      {standorte.isPending ? (
        <LoadingState label="Standorte werden geladen …" />
      ) : standorte.isError ? (
        <ErrorState
          title="Die Standorte konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => standorte.refetch()}
        />
      ) : standort ? (
        <StartortFormular key={standort.id} standort={standort} />
      ) : (
        <p className="text-ink-muted text-sm">Für die Praxis ist noch kein Standort angelegt.</p>
      )}
    </Section>
  );
}

interface Anschrift {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
}

/** Ohne diese Felder geht keine Anfrage hinaus; der Fehler steht am Feld. */
const PFLICHTFELDER: readonly { feld: keyof Anschrift; fehler: string }[] = [
  { feld: 'street', fehler: 'Bitte die Straße angeben.' },
  { feld: 'postalCode', fehler: 'Bitte die Postleitzahl angeben.' },
  { feld: 'city', fehler: 'Bitte den Ort angeben.' },
];

/**
 * Was die Person liest, wenn sich die Adresse nicht verorten ließ - mit dem
 * nächsten Schritt (TER-18, ZST-12, PAT-15).
 *
 * Dieselben Sätze wie beim Verorten einer Patientenadresse
 * (`AdresseVerorten`): Es ist derselbe Vorgang. Die Texte der
 * Routenberechnung (`FEHLERTEXTE`) sprechen von Stopps und Fahrzeiten und
 * passen hier nicht. Keiner nennt eine Adresse oder einen Schlüssel
 * (ADR-011), und keiner schiebt dem Kartendienst zu, was die eigene
 * Funktion war (BEF-027).
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
      return 'Für die Praxis ist kein Kartendienst eingerichtet. Der Startort bleibt vorerst ohne Kartenposition.';
    case 'unauthorized':
      return 'Der Kartendienst nimmt die Anfrage der Praxis nicht an – das ist ein Einrichtungsschritt. Der Startort bleibt vorerst ohne Kartenposition.';
    case 'session_invalid':
      return 'Die Anmeldung gilt nicht mehr. Bitte neu anmelden und dann erneut verorten.';
    case 'function_unavailable':
    case 'invalid_request':
      return 'Die Verortung ist gerade nicht möglich. Bitte später erneut verorten.';
  }
}

function StartortFormular({ standort }: { standort: Standort }) {
  const queryClient = useQueryClient();
  const kennung = useId();
  const feldId = (feld: keyof Anschrift) => `${kennung}-${feld}`;
  const [werte, setWerte] = useState<Anschrift>({
    street: standort.street ?? '',
    houseNumber: standort.house_number ?? '',
    postalCode: standort.postal_code ?? '',
    city: standort.city ?? '',
  });
  const [pflichtfehler, setPflichtfehler] = useState<Partial<Record<keyof Anschrift, string>>>({});
  // Der Treffer trägt die Anschrift, die geocodiert wurde; gespeichert wird
  // genau diese, auch wenn die Felder inzwischen anders aussehen.
  const [treffer, setTreffer] = useState<{
    wert: GeocodeResult;
    quelle: Quelle;
    anschrift: Anschrift;
  } | null>(null);
  // Erfolg und Fehler sehen verschieden aus und werden verschieden
  // vorgelesen (TER-18, ZST-12): Bis UXR-003 standen beide als neutrale Zeile.
  const [meldung, setMeldung] = useState<{ ton: 'erfolg' | 'fehler'; text: string } | null>(null);

  const speichern = useMutation({
    mutationFn: (gefunden: { wert: GeocodeResult; anschrift: Anschrift }) =>
      saveTourStart(
        standort.id,
        gefunden.anschrift,
        gefunden.wert,
        brauchtBestaetigung(gefunden.wert),
      ),
    onSuccess: async () => {
      setTreffer(null);
      setMeldung({ ton: 'erfolg', text: 'Der Startort ist gespeichert.' });
      await queryClient.invalidateQueries({ queryKey: ['standorte'] });
    },
  });

  const suchen = useMutation({
    mutationFn: (zu: Anschrift) => geocodiere({ ...zu, countryCode: 'DE' }),
    onSuccess: (ergebnis, zu) => {
      if (!ergebnis.ok) {
        setMeldung({ ton: 'fehler', text: verortungsfehler(ergebnis.error.code) });
        return;
      }
      setMeldung(null);
      setTreffer({ wert: ergebnis.value, quelle: ergebnis.quelle, anschrift: zu });
    },
  });

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fehlend = PFLICHTFELDER.filter(({ feld }) => !werte[feld].trim());
    setPflichtfehler(Object.fromEntries(fehlend.map(({ feld, fehler }) => [feld, fehler])));
    const erstes = fehlend[0];
    if (erstes) {
      // Der Fehler steht am Feld; der Fokus geht dorthin, wo zu tun ist
      // (Oberflächen-Checkliste Punkt 7).
      setMeldung(null);
      document.getElementById(feldId(erstes.feld))?.focus();
      return;
    }
    suchen.mutate(werte);
  }

  function setzen(feld: keyof Anschrift, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    setTreffer(null);
    if (wert.trim()) setPflichtfehler((bisher) => ({ ...bisher, [feld]: undefined }));
  }

  return (
    <form className="space-y-4" onSubmit={absenden} noValidate>
      <p className="text-sm">
        {standort.geocode_precision
          ? `${standort.name}: verortet, ${GENAUIGKEIT_TEXT[standort.geocode_precision]}.`
          : `${standort.name}: noch ohne Startort.`}
      </p>
      {/* Straße und Hausnummer, darunter Postleitzahl und Ort - die schmale
          Spalte jeweils für die kurze Angabe (TER-18, RSP-12), wie im
          Stammdatenformular. */}
      <div className="grid max-w-xl gap-4 sm:grid-cols-[1fr_8rem]">
        <Field
          label="Straße"
          feldId={feldId('street')}
          value={werte.street}
          error={pflichtfehler.street}
          onChange={(e) => setzen('street', e.target.value)}
        />
        <Field
          label="Hausnummer"
          feldId={feldId('houseNumber')}
          value={werte.houseNumber}
          onChange={(e) => setzen('houseNumber', e.target.value)}
        />
      </div>
      {/* Ziffernblock für die Postleitzahl. Bewusst ohne `autoComplete`: Der
          Browser böte die eigene, meist private Anschrift an - hier gehört
          eine Adresse der Praxis hin, keine Wohnadresse (§20). */}
      <div className="grid max-w-xl gap-4 sm:grid-cols-[8rem_1fr]">
        <Field
          label="Postleitzahl"
          feldId={feldId('postalCode')}
          inputMode="numeric"
          value={werte.postalCode}
          error={pflichtfehler.postalCode}
          onChange={(e) => setzen('postalCode', e.target.value)}
        />
        <Field
          label="Ort"
          feldId={feldId('city')}
          value={werte.city}
          error={pflichtfehler.city}
          onChange={(e) => setzen('city', e.target.value)}
        />
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
            {speichern.isPending ? 'Wird gespeichert …' : 'Als Startort speichern'}
          </Button>
        </div>
      ) : (
        <div>
          <Button type="submit" variant="secondary" disabled={suchen.isPending}>
            {suchen.isPending ? 'Wird verortet …' : 'Adresse verorten'}
          </Button>
        </div>
      )}

      {meldung ? <Statusmeldung ton={meldung.ton}>{meldung.text}</Statusmeldung> : null}
      {suchen.isError ? (
        <Statusmeldung ton="fehler">
          Die Adresse ließ sich gerade nicht verorten. Bitte die Verbindung prüfen und erneut
          versuchen.
        </Statusmeldung>
      ) : null}
      {speichern.isError ? (
        <Statusmeldung ton="fehler">
          Der Startort konnte nicht gespeichert werden. Bitte die Verbindung prüfen und erneut
          speichern.
        </Statusmeldung>
      ) : null}
    </form>
  );
}
