import { useId, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { NachladeHinweis, Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import {
  Eintragszeile,
  Mahlzeitziel,
  Minuszeichen,
  Pfeilzeichen,
  Pluszeichen,
} from '@/components/ui/Tagebuchbausteine';
import { Textlink } from '@/components/ui/Textlink';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { leseZahl } from '@/features/nutrition/eingabe';
import { feldtext } from '@/features/nutrition/lebensmittel';
import {
  kcal,
  MAHLZEIT_NAMEN,
  MAHLZEITEN,
  mengeText,
  type Eintrag,
  type Mahlzeit,
} from '@/features/nutrition/tagebuch';
import { zahl } from '@/features/nutrition/texte';
import { tagePlus } from '@/lib/datum';
import {
  tagebuchSchluessel,
  ladeTagebuch,
  tagebuchAendern,
  tagebuchKopieren,
  tagebuchLoeschen,
  wasserZaehlen,
  zahlenAusblenden,
  type EigenesTagebuch,
  type Plattformzugang,
} from './api';
import { Abschnitt, Aufklappzeilen } from './Ernaehrungsteile';
import { TagebuchErinnerungen } from './TagebuchErinnerungen';
import {
  eintragenAdresse,
  ernaehrungAdresse,
  literZahl,
  literZiel,
  tagebuchAdresse,
  tagZeilen,
} from './tagebuchAdresse';

/**
 * Das Ernährungstagebuch (ADR-027 Punkte 10 und 11): Energie und Nährstoffe als „x von y“, Wasser
 * mit einem Tipp, die Mahlzeiten. Gerechnet hat der Server, kein Lebensmittel wird bewertet
 * (ADR-006 Punkt 14); die Begleitung bekommt nichts, in der Adresse steht nur der Tag.
 */
export function Tagebuch({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const { search } = useLocation();
  const tag = /^\d{4}-\d{2}-\d{2}$/.test(suche.get('tag') ?? '') ? suche.get('tag') : null;
  const abfrage = useQuery({
    queryKey: tagebuchSchluessel(zugang.access_id, tag ?? 'heute'),
    queryFn: () => ladeTagebuch(zugang.access_id, tag),
  });
  const { data } = abfrage;

  return (
    <>
      {/* Von der Übersicht reist der Rückweg in der Adresse mit und heißt „Übersicht“. */}
      <Rueckweg standard={ernaehrungAdresse(search)} beschriftung="Ernährung" />
      <PageHeader title="Tagebuch" stufe="seite" />
      {data === undefined ? (
        abfrage.isError ? (
          <div className="mt-8">
            <ErrorState
              title="Ihr Tagebuch konnte nicht geladen werden."
              description={VERBINDUNG_PRUEFEN}
              onErneut={() => abfrage.refetch()}
            />
          </div>
        ) : (
          <Ladezustand />
        )
      ) : data === null ? (
        <div className="mt-8">
          <EmptyState
            markenform
            title="Zurzeit keine Ernährungsberatung"
            description="Vereinbaren Sie eine Ernährungsberatung mit Ihrer Praxis, finden Sie sie hier."
          />
        </div>
      ) : (
        <Inhalt
          zugang={zugang}
          daten={data}
          nachladen={
            abfrage.isError ? (
              <NachladeHinweis
                laeuft={abfrage.isFetching}
                onErneut={() => void abfrage.refetch()}
              />
            ) : null
          }
        />
      )}
    </>
  );
}

/** Am Rechner Energie und Wasser nebeneinander, Abstand 48 (Handoff 2026-10-29, Abschnitt 4). */
const ZWEI_SPALTEN =
  'flex flex-col gap-10 [.plattform-schrift[data-rechner]_&]:grid [.plattform-schrift[data-rechner]_&]:grid-cols-2 [.plattform-schrift[data-rechner]_&]:items-start [.plattform-schrift[data-rechner]_&]:gap-12';

/** Name und Wert einer Zeile; unter 23rem der Wert unter dem Namen. */
const ZEILE =
  'flex flex-wrap items-baseline justify-between gap-x-2 max-[23rem]:flex-col max-[23rem]:items-start';

const OHNE_NETZ = 'Eintragen geht wieder mit Verbindung.';

function Inhalt({
  zugang,
  daten,
  nachladen,
}: {
  zugang: Plattformzugang;
  daten: EigenesTagebuch;
  nachladen: ReactNode;
}) {
  const { state, search } = useLocation() as {
    state: { eingetragen?: string } | null;
    search: string;
  };
  const verbunden = useIstVerbunden();
  const ohneNetzId = useId();
  const [offen, setOffen] = useState<Eintrag | null>(null);
  // Ohne Netz bleibt alles lesbar; was schreibt, ist gesperrt, und unter „Wasser“ steht warum.
  const gesperrt = daten.can_write && !verbunden;

  return (
    <div className="mt-3 flex flex-col gap-10 [.plattform-schrift[data-rechner]_&]:gap-12">
      <Tagesleiste tag={daten.day.day} heute={daten.today} anfang={daten.started_on} />
      {nachladen}
      {!daten.enabled ? (
        <Statusmeldung ton="neutral">
          Ihr Tagebuch ist ausgeschaltet.{' '}
          <Textlink to={ernaehrungAdresse(search)}>Unter „Ernährung“ einschalten</Textlink>
        </Statusmeldung>
      ) : null}
      {state?.eingetragen ? <Rueckmeldung>„{state.eingetragen}“ eingetragen.</Rueckmeldung> : null}
      <div className={ZWEI_SPALTEN}>
        {/* ADR-027 Punkt 11: „Zahlen ausblenden“ ist die Einstellung der Person. */}
        {daten.hide_numbers ? null : <EnergieUndNaehrstoffe daten={daten} />}
        <Wasser zugang={zugang} daten={daten} gesperrt={gesperrt} ohneNetzId={ohneNetzId} />
      </div>
      <Mahlzeiten
        daten={daten}
        gesperrt={gesperrt}
        ohneNetzId={ohneNetzId}
        {...(daten.can_delete && verbunden ? { onOeffnen: setOffen } : {})}
      />
      {daten.can_write || daten.can_delete || daten.enabled ? (
        <Aufklappzeilen linieOben>
          {daten.can_write ? <Kopieren zugang={zugang} daten={daten} /> : null}
          {daten.can_delete ? <Einstellungen zugang={zugang} daten={daten} /> : null}
          {daten.enabled ? <TagebuchErinnerungen zugang={zugang} /> : null}
        </Aufklappzeilen>
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

/** Vortag und Folgetag als Knöpfe 48 mit Rahmen; dazwischen der Tag, auch bei „Heute“ mit Datum. */
function Tagesleiste({ tag, heute, anfang }: { tag: string; heute: string; anfang: string }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const { name, datum } = tagZeilen(tag, heute);
  return (
    <nav
      aria-label="Tag wählen"
      className="flex items-center justify-between gap-2 max-[23rem]:flex-wrap"
    >
      <Symbolknopf
        beschriftung="Vortag"
        variant="secondary"
        groesse="gross"
        disabled={tag <= anfang}
        onClick={() => void navigate(tagebuchAdresse(tagePlus(tag, -1), search, heute))}
      >
        <Pfeilzeichen richtung="links" />
      </Symbolknopf>
      {/* Unter 23rem steht der Tag über den Knöpfen, damit „Donnerstag,“ ganz bleibt. */}
      <p
        aria-live="polite"
        className="min-w-0 text-center leading-snug wrap-break-word max-[23rem]:order-first max-[23rem]:basis-full"
      >
        <strong className="block font-bold">{name}</strong>
        <span className="text-ink-muted block">{datum}</span>
      </p>
      <Symbolknopf
        beschriftung="Folgetag"
        variant="secondary"
        groesse="gross"
        disabled={tag >= heute}
        onClick={() => void navigate(tagebuchAdresse(tagePlus(tag, 1), search, heute))}
      >
        <Pfeilzeichen richtung="rechts" />
      </Symbolknopf>
    </nav>
  );
}

/** Gramm wie gespeichert: ganze Zahlen ohne, sonst mit einer Stelle („8,1“). */
function gramm(wert: number): string {
  return zahl(wert, wert % 1 === 0 ? 0 : 1);
}

/**
 * „297 von 1466 kcal“ statt „noch übrig“, über dem Ziel ebenso, der Balken bleibt dann voll und
 * kein Wort kommt dazu (Frage 4 des Handoffs). Ohne Zielwerte nur die Energie.
 */
function EnergieUndNaehrstoffe({ daten }: { daten: EigenesTagebuch }) {
  const ziele = daten.targets;
  const summe = daten.day.totals;
  // Das Leerzeichen zwischen Name und Wert ist für Vorlesesoftware; im Raster zählt es nicht.
  const energie = (
    <>
      <span className="font-semibold">Energie</span>{' '}
    </>
  );
  return (
    <Abschnitt titel="Energie und Nährstoffe" abstand="gap-4">
      {ziele ? (
        <>
          <div className="flex flex-col gap-2">
            <p className={ZEILE}>
              {energie}
              <span className="tabular-nums">
                <strong className="text-abschnitt">{zahl(summe.energy_kcal)}</strong>{' '}
                <span className="text-ink-muted">von {kcal(ziele.energy_kcal)}</span>
              </span>
            </p>
            <ProgressBar kante wert={summe.energy_kcal} von={ziele.energy_kcal} />
          </div>
          <div className="flex flex-col gap-3">
            <Naehrstoff name="Eiweiß" wert={summe.protein_g} ziel={ziele.protein_g} />
            <Naehrstoff
              name="Kohlenhydrate"
              wert={summe.carbohydrate_g}
              ziel={ziele.carbohydrate_g}
            />
            <Naehrstoff name="Fett" wert={summe.fat_g} ziel={ziele.fat_g} />
          </div>
        </>
      ) : (
        <p className={ZEILE}>
          {energie}
          <span className="tabular-nums">
            <strong className="text-abschnitt">{zahl(summe.energy_kcal)}</strong>
            {'\u00a0'}kcal
          </span>
        </p>
      )}
    </Abschnitt>
  );
}

function Naehrstoff({ name, wert, ziel }: { name: string; wert: number; ziel: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className={ZEILE}>
        <span className="text-ink-muted">{name}</span>{' '}
        <span className="tabular-nums">
          {gramm(wert)} <span className="text-ink-muted">von {zahl(ziel)}&nbsp;g</span>
        </span>
      </p>
      <ProgressBar kante dicht wert={wert} von={ziel} />
    </div>
  );
}

function useNeuLaden(zugang: Plattformzugang) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: tagebuchSchluessel(zugang.access_id) });
}

/** Wasser mit einem Tipp (ADR-027 Punkt 10), in Litern; ein Glas zurück daneben. */
function Wasser({
  zugang,
  daten,
  gesperrt,
  ohneNetzId,
}: {
  zugang: Plattformzugang;
  daten: EigenesTagebuch;
  gesperrt: boolean;
  ohneNetzId: string;
}) {
  const neuLaden = useNeuLaden(zugang);
  const glas = daten.glass_ml;
  const zaehlen = useMutation({
    mutationFn: (ml: number) => wasserZaehlen(zugang.access_id, daten.day.day, ml),
    onSuccess: () => neuLaden(),
  });
  const ziel = daten.targets?.water_ml;
  const menge = daten.day.water_ml;
  const beschreibung = gesperrt ? { 'aria-describedby': ohneNetzId } : {};
  return (
    <Abschnitt
      titel="Wasser"
      rechts={
        <p role="status" className="tabular-nums">
          <strong className="font-bold">{literZahl(menge)}</strong>
          {ziel ? (
            <>
              {' '}
              <span className="text-ink-muted">von {literZiel(ziel)}</span>
            </>
          ) : (
            <span className="text-ink-muted">{'\u00a0'}l</span>
          )}
        </p>
      }
    >
      {gesperrt ? (
        <p id={ohneNetzId} className="text-ink-muted">
          {OHNE_NETZ}
        </p>
      ) : null}
      {ziel ? <ProgressBar kante wert={menge} von={ziel} /> : null}
      {daten.can_write ? (
        <div className="grid grid-cols-[minmax(0,1fr)_4rem] gap-2 max-[23rem]:grid-cols-[minmax(0,1fr)_3.5rem]">
          {/* Unter 23rem ohne Zeichen: Sonst ragte es bei „1 Glas (250 ml)“ über den Rand. */}
          <Button
            type="button"
            variant="secondary"
            groesse="gross"
            disabled={gesperrt || zaehlen.isPending}
            onClick={() => zaehlen.mutate(glas)}
            {...beschreibung}
          >
            <Pluszeichen className="size-5.5 max-[23rem]:hidden" />
            <span className="sr-only">+</span> 1 Glas ({zahl(glas)}&nbsp;ml)
          </Button>
          {/* 56 hoch wie „1 Glas“: Ein leises Minus war in der Sonne kaum mehr als ein Strich. */}
          <Symbolknopf
            variant="secondary"
            groesse="gross"
            beschriftung="Ein Glas weniger"
            className="min-h-14 min-w-16 max-[23rem]:min-w-14"
            disabled={gesperrt || zaehlen.isPending || menge === 0}
            onClick={() => zaehlen.mutate(-glas)}
            {...beschreibung}
          >
            <Minuszeichen />
          </Symbolknopf>
        </div>
      ) : null}
      {zaehlen.isError ? <Statusmeldung ton="fehler">{zaehlen.error.message}</Statusmeldung> : null}
    </Abschnitt>
  );
}

/**
 * Je Mahlzeit mit Einträgen ein Block mit „+“, die leeren zusammen in einer Zeile mit Pillen
 * (Handoff 2026-10-29, Abschnitt 3); ohne Schreibrecht nur zum Lesen.
 */
function Mahlzeiten({
  daten,
  gesperrt,
  ohneNetzId,
  onOeffnen,
}: {
  daten: EigenesTagebuch;
  gesperrt: boolean;
  ohneNetzId: string;
  onOeffnen?: (eintrag: Eintrag) => void;
}) {
  const { search } = useLocation();
  const leerId = useId();
  const tag = daten.day.day;
  const teile = MAHLZEITEN.map((mahlzeit) => {
    const teil = daten.day.meals.find((m) => m.meal === mahlzeit);
    return { mahlzeit, eintraege: teil?.entries ?? [], kcal: teil?.totals.energy_kcal ?? 0 };
  });
  const leer = teile.filter((t) => t.eintraege.length === 0);
  const ziel = (mahlzeit: Mahlzeit, form: 'rund' | 'pille') => (
    <Mahlzeitziel
      form={form}
      name={MAHLZEIT_NAMEN[mahlzeit]}
      to={eintragenAdresse(tag, mahlzeit, search, daten.today)}
      gesperrt={gesperrt}
      beschreibung={ohneNetzId}
    />
  );
  return (
    <Abschnitt titel="Mahlzeiten">
      <div className="border-line border-t">
        {teile
          .filter((t) => t.eintraege.length > 0)
          .map((t) => (
            <div key={t.mahlzeit} className="border-line border-b py-3">
              <Zwischentitel {...(daten.can_write ? { aktion: ziel(t.mahlzeit, 'rund') } : {})}>
                <span className="font-bold">{MAHLZEIT_NAMEN[t.mahlzeit]}</span>
                {daten.hide_numbers ? null : (
                  <>
                    {' '}
                    <span className="text-ink-muted font-normal">· {kcal(t.kcal)}</span>
                  </>
                )}
              </Zwischentitel>
              <ul className="flex flex-col">
                {t.eintraege.map((e) => (
                  <li key={e.id}>
                    <Eintragszeile
                      name={e.name}
                      menge={mengeFest(e)}
                      energie={daten.hide_numbers ? undefined : kcal(e.energy_kcal)}
                      onOeffnen={onOeffnen ? () => onOeffnen(e) : undefined}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        {leer.length > 0 ? (
          <div className="border-line flex flex-col gap-2 border-b py-4">
            {daten.can_write ? (
              <>
                <p id={leerId} className="text-ink-muted">
                  Noch nichts eingetragen:
                </p>
                <ul aria-labelledby={leerId} className="flex flex-wrap gap-2">
                  {leer.map((t) => (
                    <li key={t.mahlzeit}>{ziel(t.mahlzeit, 'pille')}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-ink-muted">
                Noch nichts eingetragen: {leer.map((t) => MAHLZEIT_NAMEN[t.mahlzeit]).join(', ')}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </Abschnitt>
  );
}

/** Die Menge ohne Umbruch hinter einer Zahl: „150 g“ und „1 Portion“ bleiben zusammen. */
function mengeFest(eintrag: Eintrag): string {
  return mengeText(eintrag).replace(/(\d) /g, '$1\u00a0');
}

/** Die Form der Seite, solange der Tag lädt: Tagesleiste, Energie mit Balken, Wasser, Mahlzeiten. */
function Ladezustand() {
  return (
    <SkelettBereich
      beschriftung="Ihr Tagebuch wird geladen"
      className="mt-3 flex flex-col gap-10 [.plattform-schrift[data-rechner]_&]:gap-12"
    >
      <span className="flex items-center justify-between gap-2">
        <Skelett form="hauptknopf" className="w-12 shrink-0" />
        <span className="flex min-w-0 flex-col items-center gap-2">
          <Skelett form="zeile" className="w-16" />
          <Skelett form="zeile" className="w-44 max-w-full" />
        </span>
        <Skelett form="hauptknopf" className="w-12 shrink-0" />
      </span>
      <span className={ZWEI_SPALTEN}>
        <span className="flex flex-col gap-4">
          <span className="flex flex-col gap-2">
            <span className="flex items-center justify-between gap-2">
              <Skelett form="zeile" className="w-21" />
              <Skelett form="titel" className="w-38 max-w-[55%]" />
            </span>
            <Skelett form="balken" />
          </span>
          {['w-16', 'w-31', 'w-11'].map((breite) => (
            <span key={breite} className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between gap-2">
                <Skelett form="zeile" className={`${breite} max-w-[45%]`} />
                <Skelett form="zeile" className="w-24 max-w-[45%]" />
              </span>
              <Skelett form="balken" className="max-h-2" />
            </span>
          ))}
        </span>
        <span className="flex flex-col gap-3">
          <span className="flex items-center justify-between gap-2">
            <Skelett form="titel" className="w-23" />
            <Skelett form="zeile" className="w-31 max-w-[50%]" />
          </span>
          <Skelett form="balken" />
          <span className="grid grid-cols-[minmax(0,1fr)_4rem] gap-2 max-[23rem]:grid-cols-[minmax(0,1fr)_3.5rem]">
            <Skelett form="knopf" />
            <Skelett form="knopf" />
          </span>
        </span>
      </span>
      <span className="flex flex-col gap-3">
        <Skelett form="titel" className="w-35 max-w-full" />
        <span className="flex items-center justify-between gap-2 pt-3">
          <Skelett form="zeile" className="w-45 max-w-[70%]" />
          <Skelett form="kreis" className="shrink-0" />
        </span>
        <span className="flex items-center justify-between gap-3">
          <Skelett form="zeile" className="w-48 max-w-[60%]" />
          <Skelett form="zeile" className="w-18" />
        </span>
        <span className="flex flex-wrap gap-2 pt-4">
          <Skelett form="kreis" className="min-w-36" />
          <Skelett form="kreis" className="min-w-34" />
          <Skelett form="kreis" className="min-w-26" />
        </span>
      </span>
    </SkelettBereich>
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
  const neuLaden = useNeuLaden(zugang);
  const portion = eintrag.portion_label !== null;
  const [mahlzeit, setMahlzeit] = useState<Mahlzeit>(eintrag.meal);
  const [wert, setWert] = useState(feldtext(portion ? eintrag.portion_count : eintrag.amount));
  const [fehler, setFehler] = useState<string | undefined>();
  const aendern = useMutation({
    mutationFn: (angabe: { menge: number | null; anzahl: number | null }) =>
      tagebuchAendern(zugang.access_id, eintrag.id, mahlzeit, angabe),
    onSuccess: async () => {
      await neuLaden();
      onSchliessen();
    },
  });
  const loeschen = useMutation({
    mutationFn: () => tagebuchLoeschen(zugang.access_id, eintrag.id),
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
  const neuLaden = useNeuLaden(zugang);
  const tag = daten.day.day;
  const [von, setVon] = useState(tag > daten.started_on ? tagePlus(tag, -1) : tag);
  const [teil, setTeil] = useState<Mahlzeit | 'tag'>('tag');
  const [kopiert, setKopiert] = useState<number | null>(null);
  const kopieren = useMutation({
    mutationFn: () => tagebuchKopieren(zugang.access_id, von, teil === 'tag' ? null : teil, tag),
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
  const neuLaden = useNeuLaden(zugang);
  const [aus, setAus] = useState(daten.hide_numbers);
  const schalten = useMutation({
    mutationFn: (neu: boolean) => zahlenAusblenden(zugang.access_id, neu),
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
