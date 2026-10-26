import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { Textlink } from '@/components/ui/Textlink';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import { leseZahl } from '@/features/nutrition/eingabe';
import { feldtext } from '@/features/nutrition/lebensmittel';
import {
  grammVon,
  kcal,
  MAHLZEIT_NAMEN,
  MAHLZEITEN,
  mengeText,
  nochUebrig,
  wasserText,
  type Eintrag,
  type Mahlzeit,
} from '@/features/nutrition/tagebuch';
import { liter, zahl } from '@/features/nutrition/texte';
import { tagebuchSchluessel, type EigenesTagebuch, type Plattformzugang } from './api';
import { useNurLesen, usePlattformApi } from './einsicht';
import { PLATTFORM_PFAD } from './pfade';
import { TagebuchErinnerungen } from './TagebuchErinnerungen';
import { eintragenAdresse, tagebuchAdresse, tagName } from './tagebuchAdresse';
import { tagePlus } from '@/lib/datum';

/**
 * Das Ernährungstagebuch auf der Plattform (ERN-007, ADR-027 Punkte 10 und
 * 11): ein Tag mit „noch übrig“, Eiweiß, Kohlenhydraten und Fett, Wasser mit
 * einem Tipp und den vier Mahlzeiten. Ein Tipp auf einen Eintrag ändert
 * Menge oder Mahlzeit oder löscht ihn.
 *
 * Nur für die Person und ihre rechtliche Vertretung; die Begleitung bekommt
 * nichts (der Server gibt ihr nichts). Gerechnet hat der Server; hier steht
 * keine Bewertung eines Lebensmittels (ADR-006 Punkt 14). Der Tag steht in
 * der Adresse, nie ein Lebensmittel.
 */
/** Die Suche ohne Tag - für den Weg zurück zur Ernährung. */
function zurueck(suche: URLSearchParams): string {
  const p = new URLSearchParams(suche);
  p.delete('tag');
  const rest = p.toString();
  return rest === '' ? '' : `?${rest}`;
}

export function Tagebuch({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const [suche] = useSearchParams();
  const tag = /^\d{4}-\d{2}-\d{2}$/.test(suche.get('tag') ?? '') ? suche.get('tag') : null;
  const abfrage = useQuery({
    queryKey: tagebuchSchluessel(zugang.access_id, tag ?? 'heute'),
    queryFn: () => api.ladeTagebuch(zugang.access_id, tag),
  });

  return (
    <>
      <Rueckweg
        standard={`${PLATTFORM_PFAD}/ernaehrung${zurueck(suche)}`}
        beschriftung="Zur Ernährung"
      />
      <PageHeader title="Tagebuch" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Ihr Tagebuch wird geladen …"
        fehler="Ihr Tagebuch konnte nicht geladen werden."
        inKarte
        leer={{ wenn: (daten) => !daten, titel: 'Zurzeit keine Ernährungsberatung.' }}
      >
        {(daten) => <Inhalt zugang={zugang} daten={daten!} />}
      </Abfragezustand>
    </>
  );
}

function Inhalt({ zugang, daten }: { zugang: Plattformzugang; daten: EigenesTagebuch }) {
  const nurLesen = useNurLesen();
  const { state, search } = useLocation() as {
    state: { eingetragen?: string } | null;
    search: string;
  };
  const [offen, setOffen] = useState<Eintrag | null>(null);
  const tag = daten.day.day;
  const schreibbar = daten.can_write && !nurLesen;

  return (
    <div className="flex flex-col gap-8 [&>*]:mt-0">
      <Tagesleiste tag={tag} heute={daten.today} anfang={daten.started_on} />
      {!daten.enabled ? (
        <Statusmeldung ton="neutral">
          Ihr Tagebuch ist ausgeschaltet.{' '}
          <Textlink to={`${PLATTFORM_PFAD}/ernaehrung${zurueck(new URLSearchParams(search))}`}>
            Unter „Ernährung“ einschalten
          </Textlink>
        </Statusmeldung>
      ) : null}
      {state?.eingetragen ? <Rueckmeldung>„{state.eingetragen}“ eingetragen.</Rueckmeldung> : null}
      {/* ADR-027 Punkt 11: „Zahlen ausblenden“ ist die Einstellung der Person. */}
      {daten.hide_numbers ? null : <Uebersicht daten={daten} />}
      <Wasser zugang={zugang} daten={daten} schreibbar={schreibbar} />
      {MAHLZEITEN.map((mahlzeit) => {
        const teil = daten.day.meals.find((m) => m.meal === mahlzeit)!;
        return (
          // Leer steht in der Karte wie das Gefüllte daneben (DESIGN.md Regel 8);
          // „Eintragen“ in voller Größe wie jeder Knopf der Plattform.
          <Listenabschnitt
            key={mahlzeit}
            titel={MAHLZEIT_NAMEN[mahlzeit]}
            leer={{ titel: 'Nichts eingetragen.' }}
            {...(schreibbar
              ? {
                  aktion: (
                    <ButtonLink
                      to={eintragenAdresse(tag, mahlzeit, search)}
                      variant="secondary"
                      aria-label={`${MAHLZEIT_NAMEN[mahlzeit]} eintragen`}
                    >
                      Eintragen
                    </ButtonLink>
                  ),
                }
              : {})}
          >
            {teil.entries.map((e) => (
              <ListRow
                key={e.id}
                titel={e.name}
                meta={mengeText(e)}
                {...(daten.hide_numbers ? {} : { betrag: kcal(e.energy_kcal) })}
                {...(daten.can_delete && !nurLesen ? { onClick: () => setOffen(e) } : {})}
              />
            ))}
          </Listenabschnitt>
        );
      })}
      {!nurLesen ? (
        <div className="flex flex-col gap-2">
          {daten.can_write ? <Kopieren zugang={zugang} daten={daten} /> : null}
          {daten.can_delete ? <Einstellungen zugang={zugang} daten={daten} /> : null}
          {daten.enabled ? <TagebuchErinnerungen zugang={zugang} /> : null}
        </div>
      ) : null}
      {offen ? (
        <EintragFenster
          zugang={zugang}
          daten={daten}
          eintrag={offen}
          onSchliessen={() => setOffen(null)}
        />
      ) : null}
    </div>
  );
}

function Tagesleiste({ tag, heute, anfang }: { tag: string; heute: string; anfang: string }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  return (
    <nav aria-label="Tag wählen" className="flex items-center justify-between gap-2">
      <Symbolknopf
        beschriftung="Vortag"
        disabled={tag <= anfang}
        onClick={() => void navigate(tagebuchAdresse(tagePlus(tag, -1), search, heute))}
      >
        <span aria-hidden="true" className="text-2xl">
          ‹
        </span>
      </Symbolknopf>
      <p className="text-ink text-base font-semibold" aria-live="polite">
        {tagName(tag, heute)}
      </p>
      <Symbolknopf
        beschriftung="Folgetag"
        disabled={tag >= heute}
        onClick={() => void navigate(tagebuchAdresse(tagePlus(tag, 1), search, heute))}
      >
        <span aria-hidden="true" className="text-2xl">
          ›
        </span>
      </Symbolknopf>
    </nav>
  );
}

/** „Noch übrig“ als Kachel, die drei Makronährstoffe als Zeilen mit Balken. */
function Uebersicht({ daten }: { daten: EigenesTagebuch }) {
  const ziele = daten.targets;
  const summe = daten.day.totals;
  if (!ziele) {
    return (
      <TileGrid>
        <Tile label="Gegessen">{kcal(summe.energy_kcal)}</Tile>
      </TileGrid>
    );
  }
  const rest = nochUebrig(ziele.energy_kcal, summe.energy_kcal);
  return (
    <div className="flex flex-col gap-3">
      <TileGrid>
        <Tile
          label={rest.ueber ? 'Energie' : 'Noch übrig'}
          zusatz={
            <>
              {kcal(summe.energy_kcal)} von {kcal(ziele.energy_kcal)}
              <ProgressBar wert={summe.energy_kcal} von={ziele.energy_kcal} />
            </>
          }
        >
          {rest.wert}
        </Tile>
      </TileGrid>
      <ListRows beschriftung="Makronährstoffe">
        <Makro label="Eiweiß" wert={summe.protein_g} ziel={ziele.protein_g} />
        <Makro label="Kohlenhydrate" wert={summe.carbohydrate_g} ziel={ziele.carbohydrate_g} />
        <Makro label="Fett" wert={summe.fat_g} ziel={ziele.fat_g} />
      </ListRows>
    </div>
  );
}

function Makro({ label, wert, ziel }: { label: string; wert: number; ziel: number }) {
  return (
    <ListRow
      dicht
      titel={label}
      betrag={grammVon(wert, ziel)}
      darunter={<ProgressBar wert={wert} von={ziel} />}
    />
  );
}

function useNeuLaden(zugang: Plattformzugang) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: tagebuchSchluessel(zugang.access_id) });
}

/** Wasser mit einem Tipp (ADR-027 Punkt 10); ein Glas zurück daneben. */
function Wasser({
  zugang,
  daten,
  schreibbar,
}: {
  zugang: Plattformzugang;
  daten: EigenesTagebuch;
  schreibbar: boolean;
}) {
  const api = usePlattformApi();
  const neuLaden = useNeuLaden(zugang);
  const glas = daten.glass_ml;
  const zaehlen = useMutation({
    mutationFn: (ml: number) => api.wasserZaehlen(zugang.access_id, daten.day.day, ml),
    onSuccess: () => neuLaden(),
  });
  const ziel = daten.targets?.water_ml;
  const menge = daten.day.water_ml;
  return (
    <Section titel="Wasser">
      <p className="text-ink text-base">
        {wasserText(menge)}
        {/* Das Ziel wie unter „Ernährung“ und in der Akte (`liter`), nicht
            auf zwei Stellen: dort „2,6 l“, hier sonst „2,57 l“. */}
        {ziel ? ` von ${liter(ziel)}` : ''}
      </p>
      {ziel ? <ProgressBar wert={menge} von={ziel} /> : null}
      {schreibbar ? (
        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1 sm:flex-none"
            disabled={zaehlen.isPending}
            onClick={() => zaehlen.mutate(glas)}
          >
            + 1 Glas ({zahl(glas)} ml)
          </Button>
          {/* Mit Rand und in der Höhe von „+ 1 Glas“ (48 px): Ein leises Minus
              war in der Sonne kaum mehr als ein Strich. */}
          <Symbolknopf
            variant="secondary"
            groesse="gross"
            beschriftung="Ein Glas weniger"
            disabled={zaehlen.isPending || menge === 0}
            onClick={() => zaehlen.mutate(-glas)}
          >
            <span aria-hidden="true" className="text-xl">
              −
            </span>
          </Symbolknopf>
        </div>
      ) : null}
      {zaehlen.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {zaehlen.error.message}
        </Statusmeldung>
      ) : null}
    </Section>
  );
}

/** Ein Eintrag: Menge und Mahlzeit ändern oder löschen. */
function EintragFenster({
  zugang,
  daten,
  eintrag,
  onSchliessen,
}: {
  zugang: Plattformzugang;
  daten: EigenesTagebuch;
  eintrag: Eintrag;
  onSchliessen: () => void;
}) {
  const api = usePlattformApi();
  const neuLaden = useNeuLaden(zugang);
  const portion = eintrag.portion_label !== null;
  const [mahlzeit, setMahlzeit] = useState<Mahlzeit>(eintrag.meal);
  const [wert, setWert] = useState(feldtext(portion ? eintrag.portion_count : eintrag.amount));
  const [fehler, setFehler] = useState<string | undefined>();
  const aendern = useMutation({
    mutationFn: (angabe: { menge: number | null; anzahl: number | null }) =>
      api.tagebuchAendern(zugang.access_id, eintrag.id, mahlzeit, angabe),
    onSuccess: async () => {
      await neuLaden();
      onSchliessen();
    },
  });
  const loeschen = useMutation({
    mutationFn: () => api.tagebuchLoeschen(zugang.access_id, eintrag.id),
    onSuccess: async () => {
      await neuLaden();
      onSchliessen();
    },
  });
  const loeschenKnopf = (
    <Rueckfrage
      ausloeser="Löschen"
      ausloeserVariante="quiet"
      bestaetigen="Löschen"
      bestaetigenLaeuft="Wird gelöscht …"
      fehler={loeschen.error?.message}
      onBestaetigen={() => loeschen.mutateAsync()}
    >
      <p>„{eintrag.name}“ wird aus dem Tagebuch gelöscht.</p>
    </Rueckfrage>
  );
  return (
    <Dialogfenster
      titel={eintrag.name}
      beschreibung={`${MAHLZEIT_NAMEN[eintrag.meal]} · ${mengeText(eintrag)}`}
      onSchliessen={onSchliessen}
    >
      {daten.can_write ? (
        <form
          aria-label="Eintrag ändern"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const n = leseZahl(wert);
            const grenze = portion ? 20 : 5000;
            if (n === null || n <= 0 || n > grenze) {
              setFehler(
                portion
                  ? 'Bitte die Anzahl angeben, bis 20.'
                  : 'Bitte die Menge angeben, bis 5000.',
              );
              return;
            }
            setFehler(undefined);
            aendern.mutate(portion ? { menge: null, anzahl: n } : { menge: n, anzahl: null });
          }}
        >
          <Field
            label={portion ? `Anzahl (${eintrag.portion_label})` : `Menge (${eintrag.base_unit})`}
            inputMode="decimal"
            autoComplete="off"
            value={wert}
            error={fehler}
            onChange={(event) => setWert(event.target.value)}
          />
          <Wahlreihe
            legende="Mahlzeit"
            wahlen={MAHLZEITEN.map((m) => ({ wert: m, text: MAHLZEIT_NAMEN[m] }))}
            gewaehlt={mahlzeit}
            onWaehlen={setMahlzeit}
          />
          {aendern.isError ? (
            <Statusmeldung ton="fehler">{aendern.error.message}</Statusmeldung>
          ) : null}
          <Formularfuss dicht>
            <Button type="submit" disabled={aendern.isPending}>
              {aendern.isPending ? 'Wird gespeichert …' : 'Speichern'}
            </Button>
          </Formularfuss>
          <div>{loeschenKnopf}</div>
        </form>
      ) : (
        loeschenKnopf
      )}
    </Dialogfenster>
  );
}

/** Eine Mahlzeit oder den ganzen Tag von einem anderen Tag hierher kopieren (ERN-008). */
function Kopieren({ zugang, daten }: { zugang: Plattformzugang; daten: EigenesTagebuch }) {
  const api = usePlattformApi();
  const neuLaden = useNeuLaden(zugang);
  const tag = daten.day.day;
  const [von, setVon] = useState(tag > daten.started_on ? tagePlus(tag, -1) : tag);
  const [teil, setTeil] = useState<Mahlzeit | 'tag'>('tag');
  const [kopiert, setKopiert] = useState<number | null>(null);
  const kopieren = useMutation({
    mutationFn: () =>
      api.tagebuchKopieren(zugang.access_id, von, teil === 'tag' ? null : teil, tag),
    onSuccess: async (anzahl) => {
      setKopiert(anzahl);
      await neuLaden();
    },
  });
  return (
    <Disclosure summary="Von einem anderen Tag kopieren">
      <form
        aria-label="Kopieren"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setKopiert(null);
          kopieren.mutate();
        }}
      >
        <Field
          label="Von"
          type="date"
          min={daten.started_on}
          max={daten.today}
          value={von}
          onChange={(event) => setVon(event.target.value)}
        />
        <Wahlreihe
          legende="Was"
          wahlen={[
            { wert: 'tag' as const, text: 'Ganzer Tag' },
            ...MAHLZEITEN.map((m) => ({ wert: m, text: MAHLZEIT_NAMEN[m] })),
          ]}
          gewaehlt={teil}
          onWaehlen={setTeil}
        />
        {kopieren.isError ? (
          <Statusmeldung ton="fehler">{kopieren.error.message}</Statusmeldung>
        ) : null}
        {kopiert !== null ? (
          <Rueckmeldung key={kopiert}>
            {kopiert === 0
              ? 'Dort steht nichts.'
              : kopiert === 1
                ? '1 Eintrag kopiert.'
                : `${kopiert} Einträge kopiert.`}
          </Rueckmeldung>
        ) : null}
        <Formularfuss dicht>
          <Button type="submit" variant="secondary" disabled={kopieren.isPending || !von}>
            {kopieren.isPending ? 'Wird kopiert …' : 'Hierher kopieren'}
          </Button>
        </Formularfuss>
      </form>
    </Disclosure>
  );
}

/** „Zahlen ausblenden“ (ADR-027 Punkt 11) - die Einstellung der Person. */
function Einstellungen({ zugang, daten }: { zugang: Plattformzugang; daten: EigenesTagebuch }) {
  const api = usePlattformApi();
  const neuLaden = useNeuLaden(zugang);
  const [aus, setAus] = useState(daten.hide_numbers);
  const schalten = useMutation({
    mutationFn: (neu: boolean) => api.zahlenAusblenden(zugang.access_id, neu),
    // Der Haken folgt dem Tipp sofort; geht es schief, springt er zurück.
    onMutate: (neu) => setAus(neu),
    onError: (_fehler, neu) => setAus(!neu),
    onSuccess: () => neuLaden(),
  });
  return (
    <Disclosure summary="Einstellungen">
      <Checkbox
        label="Zahlen ausblenden"
        hint="Mahlzeiten ohne Kalorien und Nährwerte."
        checked={aus}
        onChange={(event) => schalten.mutate(event.target.checked)}
      />
      {schalten.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {schalten.error.message}
        </Statusmeldung>
      ) : null}
    </Disclosure>
  );
}
