import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { GeocodeResult, LocationErrorCode } from '@/lib/location/contract';
import type { Quelle } from '@/lib/location/funktion';
import {
  GENAUIGKEIT_TEXT,
  brauchtBestaetigung,
  geocodiere,
  trefferanzahlText,
} from '@/lib/location/geocode';
import { clearGarage, fetchStandorte, saveGarage, saveTourStart, type Standort } from './startort';

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
        <OrtFormular key={standort.id} standort={standort} art="startort" />
      ) : (
        <p className="text-ink-muted text-sm">Für die Praxis ist noch kein Standort angelegt.</p>
      )}
    </Section>
  );
}

/**
 * Garage (Abstellort der Räder, UBK-015, ANN-240): Beginn und Ende der Tour,
 * wenn gesetzt. Getrennt vom Startort - der ist zugleich der Ort der
 * Praxistermine und bleibt, wo die Praxis ist. Eine Adresse der Praxis, keine
 * Wohnadresse (§20).
 */
export function GarageEinstellung() {
  const standorte = useQuery({ queryKey: ['standorte'], queryFn: fetchStandorte, retry: false });
  const standort = standorte.data?.[0];

  return (
    <Section
      titel="Garage (Abstellort der Räder)"
      hinweis="Hier beginnt und endet die Tour, wenn eine Garage gesetzt ist – sonst an der Praxis. Der Startort oben bleibt der Ort der Praxistermine. Eine Adresse der Praxis, keine Wohnadresse."
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
        <OrtFormular key={`${standort.id}-garage`} standort={standort} art="garage" />
      ) : (
        <p className="text-ink-muted text-sm">Für die Praxis ist noch kein Standort angelegt.</p>
      )}
    </Section>
  );
}

/** Was an Startort und Garage verschieden ist: Felder, Wörter, Speicherweg. */
const ORTSARTEN = {
  startort: {
    wer: 'Der Startort',
    knopf: 'Als Startort speichern',
    gespeichert: 'Der Startort ist gespeichert.',
    speichern: saveTourStart,
  },
  garage: {
    wer: 'Die Garage',
    knopf: 'Als Garage speichern',
    gespeichert: 'Die Garage ist gespeichert.',
    speichern: saveGarage,
  },
} as const;

type Ortsart = keyof typeof ORTSARTEN;

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
function verortungsfehler(code: LocationErrorCode, wer = 'Der Startort'): string {
  switch (code) {
    case 'not_found':
      return 'Zu dieser Adresse hat der Kartendienst keinen Treffer gefunden. Bitte die Schreibweise prüfen.';
    case 'timeout':
    case 'unavailable':
    case 'rate_limited':
      return 'Der Kartendienst ist gerade nicht erreichbar. Bitte später erneut verorten.';
    case 'not_configured':
      return `Für die Praxis ist kein Kartendienst eingerichtet. ${wer} bleibt vorerst ohne Kartenposition.`;
    case 'unauthorized':
      return `Der Kartendienst nimmt die Anfrage der Praxis nicht an – das ist ein Einrichtungsschritt. ${wer} bleibt vorerst ohne Kartenposition.`;
    case 'session_invalid':
      return 'Die Anmeldung gilt nicht mehr. Bitte neu anmelden und dann erneut verorten.';
    case 'function_unavailable':
    case 'invalid_request':
      return 'Die Verortung ist gerade nicht möglich. Bitte später erneut verorten.';
  }
}

function OrtFormular({ standort, art }: { standort: Standort; art: Ortsart }) {
  const queryClient = useQueryClient();
  const kennung = useId();
  const feldId = (feld: keyof Anschrift) => `${kennung}-${feld}`;
  const texte = ORTSARTEN[art];
  const garage = art === 'garage';
  const [werte, setWerte] = useState<Anschrift>(
    garage
      ? {
          street: standort.garage_street ?? '',
          houseNumber: standort.garage_house_number ?? '',
          postalCode: standort.garage_postal_code ?? '',
          city: standort.garage_city ?? '',
        }
      : {
          street: standort.street ?? '',
          houseNumber: standort.house_number ?? '',
          postalCode: standort.postal_code ?? '',
          city: standort.city ?? '',
        },
  );
  const genauigkeit = garage ? standort.garage_geocode_precision : standort.geocode_precision;
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
      texte.speichern(
        standort.id,
        gefunden.anschrift,
        gefunden.wert,
        brauchtBestaetigung(gefunden.wert),
      ),
    onSuccess: async () => {
      setTreffer(null);
      setMeldung({ ton: 'erfolg', text: texte.gespeichert });
      await queryClient.invalidateQueries({ queryKey: ['standorte'] });
    },
  });

  // UBK-015: Ohne Garage beginnt und endet die Tour wieder an der Praxis.
  const entfernen = useMutation({
    mutationFn: () => clearGarage(standort.id),
    onSuccess: async () => {
      setWerte({ street: '', houseNumber: '', postalCode: '', city: '' });
      setTreffer(null);
      setMeldung({
        ton: 'erfolg',
        text: 'Die Garage ist entfernt. Die Tour beginnt und endet an der Praxis.',
      });
      await queryClient.invalidateQueries({ queryKey: ['standorte'] });
    },
  });

  const suchen = useMutation({
    mutationFn: (zu: Anschrift) => geocodiere({ ...zu, countryCode: 'DE' }),
    onSuccess: (ergebnis, zu) => {
      if (!ergebnis.ok) {
        setMeldung({ ton: 'fehler', text: verortungsfehler(ergebnis.error.code, texte.wer) });
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
        {garage
          ? genauigkeit
            ? `Garage: verortet, ${GENAUIGKEIT_TEXT[genauigkeit]}.`
            : 'Noch keine Garage – die Tour beginnt und endet an der Praxis.'
          : genauigkeit
            ? `${standort.name}: verortet, ${GENAUIGKEIT_TEXT[genauigkeit]}.`
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
        <div className="border-line-strong max-w-xl space-y-2 border-l-2 py-1 pl-3 text-sm">
          <p>
            Treffer {GENAUIGKEIT_TEXT[treffer.wert.precision]}
            {treffer.wert.matchLabel ? `: ${treffer.wert.matchLabel}` : ''}.
          </p>
          {trefferanzahlText(treffer.wert) ? (
            <Statusmeldung ton="warnung">{trefferanzahlText(treffer.wert)}</Statusmeldung>
          ) : null}
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
            {speichern.isPending ? 'Wird gespeichert …' : texte.knopf}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="secondary" disabled={suchen.isPending}>
            {suchen.isPending ? 'Wird verortet …' : 'Adresse verorten'}
          </Button>
          {garage && standort.garage_street ? (
            <Button
              type="button"
              variant="quiet"
              disabled={entfernen.isPending}
              onClick={() => entfernen.mutate()}
            >
              {entfernen.isPending ? 'Wird entfernt …' : 'Garage entfernen'}
            </Button>
          ) : null}
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
          {texte.wer} konnte nicht gespeichert werden. Bitte die Verbindung prüfen und erneut
          speichern.
        </Statusmeldung>
      ) : null}
      {entfernen.isError ? (
        <Statusmeldung ton="fehler">
          Die Garage konnte nicht entfernt werden. Bitte die Verbindung prüfen und erneut versuchen.
        </Statusmeldung>
      ) : null}
    </form>
  );
}
