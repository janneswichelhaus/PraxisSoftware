import { useId, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { HeroKarte } from '@/components/ui/HeroKarte';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { NachladeHinweis, Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { GESPERRT, KAESTCHEN_GESPERRT, Pfeilzeichen } from '@/components/ui/Tagebuchbausteine';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { leseZahl } from '@/features/nutrition/eingabe';
import { Rechenweg } from '@/features/nutrition/Rechenweg';
import { kcal } from '@/features/nutrition/tagebuch';
import { ERNAEHRUNG_EINWILLIGUNG, FEHLT_TEXTE, kg, zahl } from '@/features/nutrition/texte';
import type { Zielwerte as Werte } from '@/features/nutrition/zielwerte';
import {
  ernaehrungSchluessel,
  ernaehrungEinwilligen,
  ernaehrungGewichtEintragen,
  ernaehrungTagebuchSchalten,
  ernaehrungZielgewichtSetzen,
  ladeErnaehrung,
  ladeTagebuch,
  tagebuchSchluessel,
  type EigeneErnaehrung,
  type EigenesTagebuch,
  type Plattformzugang,
} from './api';
import { Abschnitt, Aufklappzeilen } from './Ernaehrungsteile';
import { PLATTFORM_PFAD } from './pfade';
import { literZahl, literZiel, tagebuchVonDerErnaehrung } from './tagebuchAdresse';
import { fest, tagUndMonat } from './zeit';

/**
 * Ernährung auf der Plattform (ADR-027): das Tagebuch von heute als Hauptsache, Gewicht, Zielwerte
 * mit Rechenweg, Seltenes unter „Mehr“. Nur für die Person und ihre rechtliche Vertretung; gerechnet
 * hat der Server, kein Etikett zum Gewicht und keine Aussage über die Gesundheit (ADR-006 Punkt 14).
 */
export function Ernaehrung({ zugang }: { zugang: Plattformzugang }) {
  const abfrage = useQuery({
    queryKey: ernaehrungSchluessel(zugang.access_id),
    queryFn: () => ladeErnaehrung(zugang.access_id),
  });
  const { data } = abfrage;

  return (
    <>
      <Rueckweg standard={`${PLATTFORM_PFAD}/ich`} beschriftung="Ich" />
      <PageHeader title="Ernährung" stufe="seite" />
      {data === undefined ? (
        abfrage.isError ? (
          <div className="mt-8">
            <ErrorState
              title="Ihre Ernährung konnte nicht geladen werden."
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

/** Ein Tag in Worten, das Jahr nur, wenn es nicht das laufende der Praxis ist. */
function amTag(tag: string, heute: string): string {
  return fest(tagUndMonat(tag, new Date(`${heute}T12:00:00`)));
}

function Inhalt({
  zugang,
  daten,
  nachladen,
}: {
  zugang: Plattformzugang;
  daten: EigeneErnaehrung;
  nachladen: ReactNode;
}) {
  const p = daten.profile;
  const { search } = useLocation();
  const widerrufen = p.consent?.state === 'withdrawn';
  // Die Hauptsache nur, wo eingetragen werden kann; sonst steht der Zustand unter „Mehr“.
  const mitHeute = daten.can_write && p.diary_enabled && p.ended_on === null;
  const eigene = p.own_foods.length;
  return (
    <div className="mt-10 flex flex-col gap-10 [.plattform-schrift[data-rechner]_&]:mt-12 [.plattform-schrift[data-rechner]_&]:gap-12">
      {nachladen}
      {widerrufen ? (
        <Statusmeldung ton="warnung">
          Einwilligung widerrufen am {amTag(p.consent!.occurred_on, daten.today)}. Es wird nichts
          mehr eingetragen.
        </Statusmeldung>
      ) : null}
      {mitHeute ? <Heute zugang={zugang} ziel={tagebuchVonDerErnaehrung(search)} /> : null}
      <Gewicht zugang={zugang} daten={daten} />
      <Abschnitt titel="Ihre Zielwerte">
        <Zielwerte zielwerte={p.targets} />
      </Abschnitt>
      <Abschnitt titel="Mehr">
        <Aufklappzeilen linieOben>
          <ListRows rahmen={false} className={`border-line border-b ${ZEILEN}`}>
            {p.diary_enabled && !mitHeute ? (
              <ListRow to={tagebuchVonDerErnaehrung(search)} titel="Tagebuch" status={WEITER} />
            ) : null}
            <ListRow
              to={`${PLATTFORM_PFAD}/ernaehrung/lebensmittel${search}`}
              titel="Lebensmittel"
              meta={
                eigene > 0
                  ? `Nachschlagen · ${eigene} ${eigene === 1 ? 'eigenes' : 'eigene'}`
                  : 'Nachschlagen und eigene anlegen'
              }
              status={WEITER}
            />
          </ListRows>
          <Zielgewicht zugang={zugang} daten={daten} />
          <Tagebuchschalter zugang={zugang} daten={daten} />
          <Einwilligung zugang={zugang} daten={daten} />
        </Aufklappzeilen>
      </Abschnitt>
      <Kleingedrucktes>
        Ihre Zielwerte rechnet die Anwendung aus veröffentlichten Formeln für Ernährung und
        Körpergewicht im Alltag. Sie sagen nichts über Ihre Gesundheit; Ihre Praxis kann sie
        anpassen.
      </Kleingedrucktes>
    </div>
  );
}

/**
 * Das Tagebuch von heute als Hero-Karte (ANN-797). Den Stand liefert die Abfrage des Tagebuchs
 * selbst (`ladeErnaehrung` kennt ihn nicht); bis sie antwortet, stehen nur Titel und Knopf.
 */
function Heute({ zugang, ziel }: { zugang: Plattformzugang; ziel: string }) {
  const { data } = useQuery({
    queryKey: tagebuchSchluessel(zugang.access_id, 'heute'),
    queryFn: () => ladeTagebuch(zugang.access_id, null),
  });
  return (
    <HeroKarte
      etikett="Tagebuch"
      titel="Heute"
      satz={
        data
          ? standZeilen(data).map((zeile) => (
              <span key={zeile} className="block tabular-nums">
                {zeile}
              </span>
            ))
          : undefined
      }
      aktion={{ text: 'Heute eintragen', to: ziel }}
    />
  );
}

/** „297 von 1466 kcal“ und „Wasser 0,5 von 2,6 l“; mit „Zahlen ausblenden“ nur das Wasser. */
function standZeilen(t: EigenesTagebuch): string[] {
  const ziele = t.targets;
  const wasser = ziele
    ? `Wasser ${literZahl(t.day.water_ml)} von ${literZiel(ziele.water_ml)}`
    : `Wasser ${literZahl(t.day.water_ml)}\u00a0l`;
  if (t.hide_numbers) return [wasser];
  const energie = ziele
    ? `${zahl(t.day.totals.energy_kcal)} von ${kcal(ziele.energy_kcal)}`
    : kcal(t.day.totals.energy_kcal);
  return [energie, wasser];
}

function useNeuLaden(zugang: Plattformzugang) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ernaehrungSchluessel(zugang.access_id) });
}

/** Die jüngsten Einträge stehen offen, ältere hinter dem Aufklapper. */
const OFFEN = 3;

function Gewicht({ zugang, daten }: { zugang: Plattformzugang; daten: EigeneErnaehrung }) {
  const neuLaden = useNeuLaden(zugang);
  const verbunden = useIstVerbunden();
  const ohneNetzId = useId();
  const [wert, setWert] = useState('');
  const [fehler, setFehler] = useState<string | undefined>();
  const [eingetragen, setEingetragen] = useState(0);
  const eintragen = useMutation({
    mutationFn: (kilo: number) => ernaehrungGewichtEintragen(zugang.access_id, daten.today, kilo),
    onSuccess: async () => {
      setWert('');
      setEingetragen((n) => n + 1);
      await neuLaden();
    },
  });
  const verlauf = [...daten.profile.weights].sort((a, b) =>
    b.measured_on.localeCompare(a.measured_on),
  );
  // Je Tag gilt ein Gewicht (ANN-621); steht heute schon eines, steht es da.
  const heute = verlauf.find((eintrag) => eintrag.measured_on === daten.today);
  const hinweis = heute
    ? `Heute steht schon ${kg(heute.weight_kg)}${heute.source === 'practice' ? ' aus der Praxis' : ''}. Eintragen ersetzt es.`
    : undefined;
  // Die Zeilen in 400 wie im Entwurf; die Zeile selbst ist der Baustein.
  const zeile = (eintrag: (typeof verlauf)[number]) => (
    <ListRow
      key={eintrag.measured_on}
      titel={
        <span className="font-normal">
          {amTag(eintrag.measured_on, daten.today)}
          {eintrag.source === 'practice' ? (
            <>
              {' '}
              <span className="text-ink-muted">· in der Praxis</span>
            </>
          ) : null}
        </span>
      }
      betrag={<span className="font-normal whitespace-nowrap">{kg(eintrag.weight_kg)}</span>}
    />
  );
  return (
    <Abschnitt titel="Gewicht">
      {daten.can_write ? (
        <form
          aria-label="Gewicht eintragen"
          className="max-w-formular flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!verbunden) return;
            const kilo = leseZahl(wert);
            if (kilo === null || kilo < 20 || kilo > 350) {
              setFehler('Bitte Ihr Gewicht in kg angeben, etwa 72,5.');
              return;
            }
            setFehler(undefined);
            eintragen.mutate(kilo);
          }}
        >
          {/* „Heute eintragen“ ist der Hauptknopf der Seite, dieser hier der zweite. */}
          <Field
            label="Gewicht heute"
            hint={hinweis}
            einheit="kg"
            inputMode="decimal"
            autoComplete="off"
            placeholder={verlauf[0] ? `etwa ${zahl(verlauf[0].weight_kg, 1)}` : undefined}
            value={wert}
            error={fehler}
            onChange={(event) => setWert(event.target.value)}
            daneben={
              <Button
                type="submit"
                variant="secondary"
                disabled={eintragen.isPending}
                className={GESPERRT}
                {...(verbunden ? {} : { 'aria-disabled': true, 'aria-describedby': ohneNetzId })}
              >
                {eintragen.isPending ? 'Wird eingetragen …' : heute ? 'Ersetzen' : 'Eintragen'}
              </Button>
            }
          />
          {verbunden ? null : (
            <p id={ohneNetzId} className="text-ink-muted">
              Eintragen geht wieder mit Verbindung.
            </p>
          )}
          {eintragen.isError ? (
            <Statusmeldung ton="fehler">{eintragen.error.message}</Statusmeldung>
          ) : null}
          {eingetragen > 0 ? <Rueckmeldung key={eingetragen}>Eingetragen.</Rueckmeldung> : null}
        </form>
      ) : null}
      {verlauf.length > 0 ? (
        <div>
          <ListRows
            rahmen={false}
            beschriftung="Ihr Gewichtsverlauf"
            className="border-line border-y"
          >
            {verlauf.slice(0, OFFEN).map(zeile)}
          </ListRows>
          {verlauf.length > OFFEN ? (
            <Aufklappzeilen>
              <Disclosure summary="Ältere Einträge" anzahl={verlauf.length - OFFEN}>
                <ListRows
                  rahmen={false}
                  beschriftung="Ältere Einträge"
                  className="border-line border-t"
                >
                  {verlauf.slice(OFFEN).map(zeile)}
                </ListRows>
              </Disclosure>
            </Aufklappzeilen>
          ) : null}
        </div>
      ) : null}
    </Abschnitt>
  );
}

/**
 * Die Zielwerte als Zeilen, Abzeichen unter dem Wert; was die Zeit bis zum Zielgewicht angeht,
 * steht als Satz darunter. Der Rechenweg steht daneben (ADR-006 Punkt 14 b).
 */
function Zielwerte({ zielwerte }: { zielwerte: Werte }) {
  if (zielwerte.status === 'missing') {
    return (
      <p className="text-ink-muted">
        Für Zielwerte fehlt noch:{' '}
        {zielwerte.missing.map((feld) => FEHLT_TEXTE[feld] ?? feld).join(', ')}.
      </p>
    );
  }
  const z = zielwerte;
  const wochen = z.target_weight.kg !== null ? z.target_weight.weeks : null;
  return (
    <>
      <dl className="border-line border-t">
        <Zielzeile
          name="Energie"
          wert={kcal(z.energy.kcal)}
          gesetzt={z.energy.overridden}
          warnung={z.energy.below_bmr ? 'unter dem Grundumsatz' : null}
        />
        <Zielzeile
          name="Eiweiß"
          wert={`${zahl(z.protein.g)}\u00a0g`}
          gesetzt={z.protein.overridden}
        />
        <Zielzeile
          name="Kohlenhydrate"
          wert={`${zahl(z.carbohydrate.g)}\u00a0g`}
          gesetzt={z.carbohydrate.overridden}
        />
        <Zielzeile name="Fett" wert={`${zahl(z.fat.g)}\u00a0g`} gesetzt={z.fat.overridden} />
        <Zielzeile name="Wasser" wert={literZiel(z.water.ml)} gesetzt={z.water.overridden} />
        {z.target_weight.kg !== null ? (
          <Zielzeile
            name="Zielgewicht"
            wert={kg(z.target_weight.kg)}
            warnung={
              z.target_weight.below_floor ? `unter BMI ${zahl(z.target_weight.bmi_floor, 1)}` : null
            }
          />
        ) : null}
      </dl>
      {wochen !== null ? (
        <p className="text-ink-muted">
          Rechnerisch etwa {zahl(wochen)} {wochen === 1 ? 'Woche' : 'Wochen'} bis zum Zielgewicht.
        </p>
      ) : null}
      <Aufklappzeilen>
        <Disclosure summary="Rechenweg">
          <Rechenweg z={z} />
        </Disclosure>
      </Aufklappzeilen>
    </>
  );
}

function Zielzeile({
  name,
  wert,
  gesetzt = false,
  warnung = null,
}: {
  name: string;
  wert: string;
  gesetzt?: boolean;
  warnung?: string | null;
}) {
  return (
    <div className="border-line flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b py-3 max-[23rem]:flex-col">
      <dt className="text-ink-muted">{name}</dt>
      <dd className="ml-auto flex flex-col items-end gap-1 text-right max-[23rem]:ml-0 max-[23rem]:items-start max-[23rem]:text-left">
        <span className="whitespace-nowrap tabular-nums">{wert}</span>
        {gesetzt ? <Badge ton="akzent">von der Beratung gesetzt</Badge> : null}
        {warnung ? <Badge ton="warnung">{warnung}</Badge> : null}
      </dd>
    </div>
  );
}

/** Der Pfeil einer Zeile unter „Mehr“ sagt „weiter“; unter 23rem stünde er allein in einer Zeile. */
const WEITER = (
  <Pfeilzeichen richtung="rechts" className="text-ink-muted size-5.5 max-[23rem]:hidden" />
);

/** Unter 23rem hat die Seite 12 Rand: Das Ziel einer Zeile reicht nur so weit hinaus. */
const ZEILEN =
  'max-[23rem]:[&_.listenzeile]:-mx-3 max-[23rem]:[&_.listenzeile]:w-[calc(100%+1.5rem)] max-[23rem]:[&_.listenzeile]:px-3';

function Zielgewicht({ zugang, daten }: { zugang: Plattformzugang; daten: EigeneErnaehrung }) {
  const neuLaden = useNeuLaden(zugang);
  const verbunden = useIstVerbunden();
  const ohneNetzId = useId();
  const p = daten.profile;
  const [wert, setWert] = useState(p.target_weight_kg === null ? '' : zahl(p.target_weight_kg, 1));
  const [fehler, setFehler] = useState<string | undefined>();
  const [gespeichert, setGespeichert] = useState(0);
  const setzen = useMutation({
    mutationFn: (kilo: number | null) => ernaehrungZielgewichtSetzen(zugang.access_id, kilo),
    onSuccess: async () => {
      setGespeichert((n) => n + 1);
      await neuLaden();
    },
  });
  const unten = daten.target_weight_floor_kg;
  const titel = `Zielgewicht · ${p.target_weight_kg === null ? 'keines' : kg(p.target_weight_kg)}`;
  if (!daten.can_write) {
    return (
      <Disclosure summary={titel}>
        <p className="text-ink text-base">
          {p.target_weight_kg === null ? 'Kein Zielgewicht gewählt.' : kg(p.target_weight_kg)}
        </p>
      </Disclosure>
    );
  }
  return (
    <Disclosure summary={titel}>
      <form
        aria-label="Zielgewicht wählen"
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!verbunden) return;
          const kilo = leseZahl(wert);
          if (wert.trim() !== '' && (kilo === null || kilo < unten || kilo > 300)) {
            setFehler(`Bitte mindestens ${kg(unten)} angeben.`);
            return;
          }
          setFehler(undefined);
          setzen.mutate(kilo);
        }}
      >
        <Field
          label="Ihr Zielgewicht (kg)"
          hint={`Mindestens ${kg(unten)}; leer heißt keines.`}
          inputMode="decimal"
          autoComplete="off"
          value={wert}
          error={fehler}
          onChange={(event) => setWert(event.target.value)}
        />
        {p.target_weight_source === 'counsellor' && p.target_weight_kg !== null ? (
          <p className="text-ink-muted text-base">Mit Ihrer Praxis vereinbart.</p>
        ) : null}
        {setzen.isError ? <Statusmeldung ton="fehler">{setzen.error.message}</Statusmeldung> : null}
        {gespeichert > 0 ? <Rueckmeldung key={gespeichert}>Gespeichert.</Rueckmeldung> : null}
        {verbunden ? null : (
          <p id={ohneNetzId} className="text-ink-muted text-base">
            Speichern geht wieder mit Verbindung.
          </p>
        )}
        <Formularfuss dicht>
          <Button
            type="submit"
            variant="secondary"
            disabled={setzen.isPending}
            className={GESPERRT}
            {...(verbunden ? {} : { 'aria-disabled': true, 'aria-describedby': ohneNetzId })}
          >
            {setzen.isPending ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
        </Formularfuss>
      </form>
    </Disclosure>
  );
}

function Tagebuchschalter({ zugang, daten }: { zugang: Plattformzugang; daten: EigeneErnaehrung }) {
  const neuLaden = useNeuLaden(zugang);
  const verbunden = useIstVerbunden();
  const schalten = useMutation({
    mutationFn: (an: boolean) => ernaehrungTagebuchSchalten(zugang.access_id, an),
    onSuccess: () => neuLaden(),
  });
  const an = daten.profile.diary_enabled;
  // Einschalten braucht die Einwilligung; ausschalten geht immer.
  const bedienbar = an || daten.can_write;
  const angehalten = an && daten.profile.consent?.state === 'withdrawn';
  const gesperrt = bedienbar && !verbunden;
  const hinweis = [
    angehalten ? 'Angehalten, weil die Einwilligung widerrufen ist.' : null,
    gesperrt ? 'Ändern geht wieder mit Verbindung.' : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    // Weiche Trennstelle: Bei 200 % brach das lange Wort sonst ohne Strich mitten im Wort.
    <Disclosure
      summary={`Ernährungs\u00ADtagebuch · ${angehalten ? 'angehalten' : an ? 'an' : 'aus'}`}
    >
      <div className={gesperrt ? KAESTCHEN_GESPERRT : undefined}>
        <Checkbox
          label="Ernährungstagebuch führen"
          hint={hinweis || undefined}
          checked={an}
          disabled={!bedienbar || schalten.isPending}
          aria-disabled={gesperrt ? true : undefined}
          onChange={(event) => {
            if (!gesperrt) schalten.mutate(event.target.checked);
          }}
        />
      </div>
      {schalten.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {schalten.error.message}
        </Statusmeldung>
      ) : null}
    </Disclosure>
  );
}

function Einwilligung({ zugang, daten }: { zugang: Plattformzugang; daten: EigeneErnaehrung }) {
  const neuLaden = useNeuLaden(zugang);
  const verbunden = useIstVerbunden();
  const ohneNetzId = useId();
  const stand = daten.profile.consent;
  const erteilt = stand?.state === 'granted';
  const schreiben = useMutation({
    mutationFn: (erteilen: boolean) =>
      ernaehrungEinwilligen(zugang.access_id, erteilen, daten.wording_version),
    onSuccess: () => neuLaden(),
  });
  const zustand = erteilt
    ? `erteilt am ${amTag(stand.occurred_on, daten.today)}`
    : stand
      ? `widerrufen am ${amTag(stand.occurred_on, daten.today)}`
      : 'nicht erteilt';
  return (
    <Disclosure summary={`Einwilligung · ${zustand}`}>
      {erteilt && stand.source === 'practice' ? (
        <p className="text-ink mb-2 text-base">In der Praxis auf Papier erteilt.</p>
      ) : null}
      <p className="text-ink max-w-prose text-base leading-relaxed">{ERNAEHRUNG_EINWILLIGUNG}</p>
      {erteilt ? (
        <div className="mt-4">
          {verbunden ? (
            <Rueckfrage
              ausloeser="Einwilligung widerrufen"
              ausloeserVariante="quiet"
              bestaetigen="Widerrufen"
              bestaetigenLaeuft="Wird widerrufen …"
              fehler={schreiben.error?.message}
              onBestaetigen={() => schreiben.mutateAsync(false)}
            >
              <p>Danach wird nichts mehr eingetragen. Ihre Praxis erfährt davon.</p>
            </Rueckfrage>
          ) : (
            // Die Rückfrage kennt keine Sperre: ohne Netz steht ihr Auslöser gesperrt da.
            <Button
              type="button"
              variant="quiet"
              className={GESPERRT}
              aria-disabled
              aria-describedby={ohneNetzId}
            >
              Einwilligung widerrufen
            </Button>
          )}
        </div>
      ) : daten.can_grant ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            disabled={schreiben.isPending}
            className={GESPERRT}
            {...(verbunden ? {} : { 'aria-disabled': true, 'aria-describedby': ohneNetzId })}
            onClick={() => {
              if (verbunden) schreiben.mutate(true);
            }}
          >
            {schreiben.isPending ? 'Wird gespeichert …' : 'Erneut einwilligen'}
          </Button>
          {schreiben.isError ? (
            <Statusmeldung ton="fehler" className="mt-2">
              {schreiben.error.message}
            </Statusmeldung>
          ) : null}
        </div>
      ) : null}
      {!verbunden && (erteilt || daten.can_grant) ? (
        <p id={ohneNetzId} className="text-ink-muted mt-2 text-base">
          {erteilt ? 'Widerrufen' : 'Einwilligen'} geht wieder mit Verbindung.
        </p>
      ) : null}
    </Disclosure>
  );
}

/** Die Form der Seite, solange sie lädt: Hero, Gewicht mit Zeilen, Zielwerte. */
function Ladezustand() {
  return (
    <SkelettBereich
      beschriftung="Ihre Ernährung wird geladen"
      className="mt-10 flex flex-col gap-10 [.plattform-schrift[data-rechner]_&]:mt-12 [.plattform-schrift[data-rechner]_&]:gap-12"
    >
      <Skelett form="hero" />
      <span className="flex flex-col gap-3">
        <Skelett form="titel" className="w-24" />
        <Skelett form="zeile" className="w-32 max-w-full" />
        <span className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
          <Skelett form="hauptknopf" />
          <Skelett form="hauptknopf" />
        </span>
        {['w-40', 'w-36', 'w-32'].map((breite) => (
          <span key={breite} className="flex items-center justify-between gap-3 py-4">
            <Skelett form="zeile" className={`${breite} max-w-3/5`} />
            <Skelett form="zeile" className="w-16" />
          </span>
        ))}
      </span>
      <span className="flex flex-col gap-3">
        <Skelett form="titel" className="w-36 max-w-full" />
        {['w-18', 'w-14', 'w-31', 'w-10'].map((breite) => (
          <span key={breite} className="flex items-center justify-between gap-3 py-3">
            <Skelett form="zeile" className={`${breite} max-w-1/2`} />
            <Skelett form="zeile" className="w-20" />
          </span>
        ))}
      </span>
    </SkelettBereich>
  );
}
