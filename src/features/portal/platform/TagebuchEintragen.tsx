import { useEffect, useId, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { HakenSymbol } from '@/components/ui/HakenSymbol';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { GESPERRT, KAESTCHEN_GESPERRT } from '@/components/ui/Tagebuchbausteine';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import {
  LebensmittelSuche,
  Quellenangabe,
  Trefferzeile,
} from '@/features/nutrition/LebensmittelSuche';
import type { Lebensmittel } from '@/features/nutrition/lebensmittel';
import {
  energieDerMenge,
  FREIE_MENGE,
  istMahlzeit,
  kcal,
  letzteMenge,
  MAHLZEIT_NAMEN,
  mengePruefen,
  mengeText,
  vorbelegung,
  type Mahlzeit,
  type Mengenangabe,
  type Schnellwahl,
} from '@/features/nutrition/tagebuch';
import { zahl } from '@/features/nutrition/texte';
import {
  ernaehrungSchluessel,
  tagebuchSchluessel,
  favoritSetzen,
  ladeErnaehrung,
  ladeTagebuch,
  lebensmittelQuellen,
  lebensmittelSuchen,
  tagebuchEintragen,
  type EigeneErnaehrung,
  type EigenesTagebuch,
  type Plattformzugang,
} from './api';
import { tagName, zurueckZumTag } from './tagebuchAdresse';

/** Was zuletzt eingetragen wurde, für den Haken an seiner Zeile. */
type Eingetragen = Pick<Lebensmittel, 'kind' | 'id' | 'name'> & { mal: number };

/** So lange steht der Haken am Eintrag: lang genug zum Sehen, kurz genug für das Nächste. */
const BESTAETIGUNG_MS = 3000;

/**
 * Ein Lebensmittel ins Tagebuch (ADR-027 Punkte 8 bis 10); die Werte rechnet der Server,
 * der Suchbegriff steht nie in der Adresse. Danach bleibt die Seite offen, der Haken steht am
 * Eintrag (ANN-813); „← Tagebuch“ führt zum Tag zurück (ANN-798).
 */
export function TagebuchEintragen({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const { search } = useLocation();
  const tagAusAdresse = /^\d{4}-\d{2}-\d{2}$/.test(suche.get('tag') ?? '')
    ? suche.get('tag')
    : null;
  const roh = suche.get('mahlzeit');
  const mahlzeit: Mahlzeit = istMahlzeit(roh) ? roh : 'snack';
  const ernaehrung = useQuery({
    queryKey: ernaehrungSchluessel(zugang.access_id),
    queryFn: () => ladeErnaehrung(zugang.access_id),
  });
  // Zuletzt, Favoriten und „Zahlen ausblenden“ kommen mit dem Tag (ERN-008).
  const tagebuch = useQuery({
    queryKey: tagebuchSchluessel(zugang.access_id, tagAusAdresse ?? 'heute'),
    queryFn: () => ladeTagebuch(zugang.access_id, tagAusAdresse),
  });
  // Ohne Tag in der Adresse: heute.
  const heute = tagebuch.data?.today;
  const tag = tagAusAdresse ?? heute ?? null;
  // Zurück zum selben Tag, mit dessen eigenem Rückweg; die Zeile mit dem Tag nur, wenn nicht heute.
  const zumTag = zurueckZumTag(search, tagAusAdresse, heute);
  const geladen = tagebuch.data !== undefined && ernaehrung.data !== undefined;
  const gescheitert =
    (tagebuch.data === undefined && tagebuch.isError) ||
    (ernaehrung.data === undefined && ernaehrung.isError);
  // Die Bestätigung steht am Eintrag selbst, eine Weile lang; jede neue beginnt von vorn (`mal`).
  const [eingetragen, setEingetragen] = useState<Eingetragen | null>(null);
  useEffect(() => {
    if (!eingetragen) return;
    const uhr = window.setTimeout(() => setEingetragen(null), BESTAETIGUNG_MS);
    return () => window.clearTimeout(uhr);
  }, [eingetragen]);

  return (
    <>
      <Rueckweg standard={zumTag} beschriftung="Tagebuch" />
      <PageHeader
        title={`${MAHLZEIT_NAMEN[mahlzeit]} eintragen`}
        description={tag && heute && tag !== heute ? tagName(tag, heute) : undefined}
        stufe="seite"
      />
      {/* Zu sehen ist der Haken am Eintrag, vorgelesen dieser Satz; der Fokus bleibt am „+“, und
          nichts schiebt die Liste (ANN-813). Kopf zu Inhalt 24 (DESIGN.md, Rhythmus). */}
      <p role="status" className="sr-only">
        {eingetragen ? `„${eingetragen.name}“ eingetragen.` : null}
      </p>
      <div className="mt-6">
        {!geladen ? (
          gescheitert ? (
            <ErrorState
              title="Ihr Tagebuch konnte nicht geladen werden."
              description={VERBINDUNG_PRUEFEN}
              onErneut={() => Promise.all([tagebuch.refetch(), ernaehrung.refetch()])}
            />
          ) : (
            <Ladezustand />
          )
        ) : !tagebuch.data || !tagebuch.data.can_write || !ernaehrung.data ? (
          <EmptyState
            markenform
            title="Hier lässt sich gerade nichts eintragen."
            description={ohneEintragen(tagebuch.data, ernaehrung.data)}
            aktion={
              tagebuch.data ? (
                <ButtonLink to={zumTag} variant="secondary">
                  Zum Tagebuch
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <Suche
            zugang={zugang}
            ernaehrung={ernaehrung.data}
            tagebuch={tagebuch.data}
            tag={tag!}
            mahlzeit={mahlzeit}
            eingetragen={eingetragen}
            onEingetragen={(f) =>
              setEingetragen((alt) => ({
                kind: f.kind,
                id: f.id,
                name: f.name,
                mal: (alt?.mal ?? 0) + 1,
              }))
            }
          />
        )}
      </div>
      <Quellenangabe laden={lebensmittelQuellen} />
    </>
  );
}

/** Warum hier nichts einzutragen ist, als ein Satz; der Weg zurück steht daneben (ANN-801). */
function ohneEintragen(tagebuch: EigenesTagebuch | null, ernaehrung: EigeneErnaehrung | null) {
  if (!tagebuch || !ernaehrung) return 'Zurzeit läuft keine Ernährungsberatung.';
  if (!tagebuch.enabled) return 'Ihr Tagebuch ist ausgeschaltet.';
  if (ernaehrung.can_grant) return 'Ohne Ihre Einwilligung wird nichts eingetragen.';
  return 'Ihr Zugang ist nur noch zum Lesen.';
}

/** Die Form der Seite, solange sie lädt: das Suchfeld und Zeilen darunter. */
function Ladezustand() {
  return (
    <SkelettBereich beschriftung="Ihr Tagebuch wird geladen" className="flex flex-col gap-4">
      <Skelett form="zeile" className="w-44 max-w-full" />
      <Skelett form="hauptknopf" />
      <Skelett form="titel" className="mt-4 w-24" />
      {['w-40', 'w-32', 'w-36'].map((breite) => (
        <span key={breite} className="flex flex-col gap-2 py-2">
          <Skelett form="zeile" className={`${breite} max-w-2/3`} />
          <Skelett form="zeile" className="w-52 max-w-full" />
        </span>
      ))}
    </SkelettBereich>
  );
}

/** Wo ein Lebensmittel unter zuletzt oder den Favoriten steht. */
function gleich(a: Pick<Lebensmittel, 'kind' | 'id'>, b: Pick<Lebensmittel, 'kind' | 'id'>) {
  return a.kind === b.kind && a.id === b.id;
}

function Suche({
  zugang,
  ernaehrung,
  tagebuch,
  tag,
  mahlzeit,
  eingetragen,
  onEingetragen,
}: {
  zugang: Plattformzugang;
  ernaehrung: EigeneErnaehrung;
  tagebuch: EigenesTagebuch;
  tag: string;
  mahlzeit: Mahlzeit;
  eingetragen: Pick<Lebensmittel, 'kind' | 'id'> | null;
  onEingetragen: (f: Lebensmittel) => void;
}) {
  const ohneZahlen = tagebuch.hide_numbers;
  const bestaetigt = (f: Lebensmittel) => eingetragen !== null && gleich(f, eingetragen);
  const haken = (f: Lebensmittel) => (bestaetigt(f) ? <Eintragshaken /> : undefined);
  const verbunden = useIstVerbunden();
  const ohneNetzId = useId();
  const letzte = (f: Lebensmittel) =>
    [...tagebuch.recent, ...tagebuch.favorites].find((s) => gleich(s.food, f));
  return (
    <LebensmittelSuche
      suchen={(begriff) => lebensmittelSuchen(zugang.access_id, begriff)}
      schluessel={['platform-foods', zugang.access_id]}
      eigene={ernaehrung.profile.own_foods}
      ohneZahlen={ohneZahlen}
      trefferStatus={haken}
      ohneBegriff={(oeffnen) => (
        // Unter 23rem rückt „+“ unter den Namen: Ein Lebensmittel bricht nur zwischen Wörtern.
        <div className="flex flex-col gap-8 max-[23rem]:[&_li]:flex-wrap max-[23rem]:[&_li>:first-child]:basis-full max-[23rem]:[&_li>:nth-child(2)]:ml-auto max-[23rem]:[&_li>:nth-child(2)]:pb-2 [&>*]:mt-0">
          {verbunden ? null : (
            <p id={ohneNetzId} className="text-ink-muted">
              Eintragen geht wieder mit Verbindung.
            </p>
          )}
          {tagebuch.favorites.length > 0 ? (
            <Listenabschnitt titel="Favoriten">
              {tagebuch.favorites.map((s) => (
                <Schnellzeile
                  key={`${s.food.kind}-${s.food.id}`}
                  zugang={zugang}
                  s={s}
                  tag={tag}
                  mahlzeit={mahlzeit}
                  ohneZahlen={ohneZahlen}
                  onOeffnen={oeffnen}
                  onEingetragen={onEingetragen}
                  bestaetigt={bestaetigt(s.food)}
                  ohneNetz={verbunden ? undefined : ohneNetzId}
                />
              ))}
            </Listenabschnitt>
          ) : null}
          <Listenabschnitt
            titel="Zuletzt"
            leer={{ titel: 'Lebensmittel suchen, etwa „Haferflocken“.' }}
          >
            {tagebuch.recent.map((s) => (
              <Schnellzeile
                key={`${s.food.kind}-${s.food.id}`}
                zugang={zugang}
                s={s}
                tag={tag}
                mahlzeit={mahlzeit}
                ohneZahlen={ohneZahlen}
                onOeffnen={oeffnen}
                onEingetragen={onEingetragen}
                bestaetigt={bestaetigt(s.food)}
                ohneNetz={verbunden ? undefined : ohneNetzId}
              />
            ))}
          </Listenabschnitt>
          {ernaehrung.profile.own_foods.length > 0 ? (
            <Listenabschnitt titel="Eigene Lebensmittel">
              {ernaehrung.profile.own_foods.map((f) => (
                <Trefferzeile
                  key={f.id}
                  f={f}
                  onOeffnen={oeffnen}
                  ohneZahlen={ohneZahlen}
                  status={haken(f)}
                />
              ))}
            </Listenabschnitt>
          ) : null}
        </div>
      )}
      fensterInhalt={(f, schliessen) => {
        const vorher = letzte(f);
        const anfang = vorher ? letzteMenge(vorher) : undefined;
        return (
          <MengeWaehlen
            zugang={zugang}
            f={f}
            tag={tag}
            mahlzeit={mahlzeit}
            ohneZahlen={ohneZahlen}
            onEingetragen={() => {
              schliessen();
              onEingetragen(f);
            }}
            {...(anfang ? { anfang } : {})}
            unten={
              <Favorit
                zugang={zugang}
                f={f}
                an={tagebuch.favorites.some((s) => gleich(s.food, f))}
              />
            }
          />
        );
      }}
    />
  );
}

/**
 * Eine Zeile aus zuletzt oder den Favoriten: der Tipp auf die Zeile öffnet
 * die Menge, „+“ trägt die Menge vom letzten Mal sofort ein.
 */
function Schnellzeile({
  zugang,
  s,
  tag,
  mahlzeit,
  ohneZahlen,
  onOeffnen,
  onEingetragen,
  bestaetigt,
  ohneNetz,
}: {
  zugang: Plattformzugang;
  s: Schnellwahl;
  tag: string;
  mahlzeit: Mahlzeit;
  ohneZahlen: boolean;
  onOeffnen: (f: Lebensmittel) => void;
  onEingetragen: (f: Lebensmittel) => void;
  /** Gerade eingetragen: Statt „+“ steht eine Weile der Haken (ANN-813). */
  bestaetigt: boolean;
  /** Ohne Netz die Kennung des Satzes, der sagt, warum „+“ gesperrt ist. */
  ohneNetz?: string | undefined;
}) {
  const eintragen = useEintragen(zugang, s.food, tag, mahlzeit, () => onEingetragen(s.food));
  const anfang = letzteMenge(s);
  const geprueft = anfang ? mengePruefen(s.food, anfang.einheit, anfang.wert) : null;
  const menge = geprueft && 'menge' in geprueft ? geprueft : null;
  const text = menge
    ? mengeText({
        amount: menge.menge,
        base_unit: s.food.base_unit,
        portion_label: menge.angabe.art === 'portion' ? menge.angabe.label : null,
        portion_count: menge.angabe.art === 'portion' ? menge.angabe.anzahl : null,
      })
    : null;
  return (
    <ListRow
      titel={s.food.name}
      meta={[text, menge && !ohneZahlen ? kcal(energieDerMenge(s.food, menge.menge)) : null]
        .filter(Boolean)
        .join(' · ')}
      onClick={() => onOeffnen(s.food)}
      {...(menge
        ? {
            aktion: (
              <Symbolknopf
                beschriftung={`${s.food.name} eintragen (${text})`}
                variant="secondary"
                className={GESPERRT}
                {...(ohneNetz ? { 'aria-disabled': true, 'aria-describedby': ohneNetz } : {})}
                // Ein Riegel statt `disabled`: Ein gesperrter Knopf verlöre den Fokus (ANN-813).
                onClick={() => {
                  if (!ohneNetz && !eintragen.isPending) eintragen.mutate(menge.angabe);
                }}
              >
                {bestaetigt ? (
                  <HakenSymbol className="haken-gesetzt size-5" />
                ) : (
                  <span aria-hidden="true" className="text-xl">
                    +
                  </span>
                )}
              </Symbolknopf>
            ),
          }
        : {})}
      {...(eintragen.isError
        ? {
            darunter: <Statusmeldung ton="fehler">{eintragen.error.message}</Statusmeldung>,
          }
        : {})}
    />
  );
}

/** Der Haken an einem Treffer, der gerade aus dem Fenster eingetragen wurde (ANN-813). */
function Eintragshaken() {
  return (
    <span className="text-accent inline-flex size-11 items-center justify-center">
      <HakenSymbol className="haken-gesetzt size-5" />
    </span>
  );
}

/** Eintragen und auf der Seite bleiben - aus dem Fenster wie aus einer Zeile. */
function useEintragen(
  zugang: Plattformzugang,
  f: Lebensmittel,
  tag: string,
  mahlzeit: Mahlzeit,
  onEingetragen: (name: string) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (angabe: Mengenangabe) =>
      tagebuchEintragen(zugang.access_id, tag, mahlzeit, f, angabe),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tagebuchSchluessel(zugang.access_id) });
      onEingetragen(f.name);
    },
  });
}

/** Favorit an oder ab - sofort gespeichert. */
function Favorit({ zugang, f, an }: { zugang: Plattformzugang; f: Lebensmittel; an: boolean }) {
  const queryClient = useQueryClient();
  const verbunden = useIstVerbunden();
  const [wert, setWert] = useState(an);
  const setzen = useMutation({
    mutationFn: (neu: boolean) => favoritSetzen(zugang.access_id, f, neu),
    // Der Haken folgt dem Tipp sofort; geht es schief, springt er zurück.
    onMutate: (neu) => setWert(neu),
    onError: (_fehler, neu) => setWert(!neu),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tagebuchSchluessel(zugang.access_id) }),
  });
  return (
    <div className={verbunden ? undefined : KAESTCHEN_GESPERRT}>
      <Checkbox
        label="Favorit"
        hint={verbunden ? undefined : 'Ändern geht wieder mit Verbindung.'}
        checked={wert}
        aria-disabled={verbunden ? undefined : true}
        onChange={(event) => {
          if (verbunden) setzen.mutate(event.target.checked);
        }}
      />
      {setzen.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {setzen.error.message}
        </Statusmeldung>
      ) : null}
    </div>
  );
}

/** Die Menge im Fenster des Lebensmittels - vorbelegt, mit einem Tipp eingetragen. */
export function MengeWaehlen({
  zugang,
  f,
  tag,
  mahlzeit,
  anfang,
  ohneZahlen = false,
  unten,
  onEingetragen,
}: {
  zugang: Plattformzugang;
  f: Lebensmittel;
  tag: string;
  mahlzeit: Mahlzeit;
  onEingetragen: (name: string) => void;
  /** Vorbelegung, etwa die Menge vom letzten Mal (ERN-008). */
  anfang?: { einheit: string; wert: string };
  ohneZahlen?: boolean;
  /** Unter dem Knopf, etwa „Favorit“ (ERN-008). */
  unten?: ReactNode;
}) {
  const start = anfang ?? vorbelegung(f);
  const [einheit, setEinheit] = useState(start.einheit);
  const [wert, setWert] = useState(start.wert);
  const [fehler, setFehler] = useState<string | undefined>();
  const eintragen = useEintragen(zugang, f, tag, mahlzeit, onEingetragen);
  const verbunden = useIstVerbunden();
  const ohneNetzId = useId();
  const geprueft = mengePruefen(f, einheit, wert);
  const wahlen = [
    ...f.portions.map((p) => ({ wert: p.label, text: p.label })),
    { wert: FREIE_MENGE, text: f.base_unit === 'ml' ? 'Milliliter' : 'Gramm' },
  ];
  return (
    <form
      aria-label="Menge wählen"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!verbunden) return;
        if ('fehler' in geprueft) {
          setFehler(geprueft.fehler);
          return;
        }
        setFehler(undefined);
        eintragen.mutate(geprueft.angabe);
      }}
    >
      {wahlen.length > 1 ? (
        <Wahlreihe
          legende="Einheit"
          wahlen={wahlen}
          gewaehlt={einheit}
          onWaehlen={(neu) => {
            setEinheit(neu);
            setWert(neu === FREIE_MENGE ? '100' : '1');
          }}
        />
      ) : null}
      <Field
        label={einheit === FREIE_MENGE ? `Menge (${f.base_unit})` : 'Anzahl'}
        hint={
          einheit !== FREIE_MENGE && 'menge' in geprueft
            ? `${zahl(geprueft.menge, geprueft.menge % 1 === 0 ? 0 : 1)} ${f.base_unit}`
            : undefined
        }
        inputMode="decimal"
        autoComplete="off"
        value={wert}
        error={fehler}
        onChange={(event) => setWert(event.target.value)}
      />
      {!ohneZahlen && 'menge' in geprueft ? (
        <p className="text-ink text-base font-semibold" aria-live="polite">
          {kcal(energieDerMenge(f, geprueft.menge))}
        </p>
      ) : null}
      {eintragen.isError ? (
        <Statusmeldung ton="fehler">{eintragen.error.message}</Statusmeldung>
      ) : null}
      {verbunden ? null : (
        <p id={ohneNetzId} className="text-ink-muted">
          Eintragen geht wieder mit Verbindung.
        </p>
      )}
      <Formularfuss dicht>
        <Button
          type="submit"
          disabled={eintragen.isPending}
          className={GESPERRT}
          {...(verbunden ? {} : { 'aria-disabled': true, 'aria-describedby': ohneNetzId })}
        >
          {eintragen.isPending ? 'Wird eingetragen …' : 'Eintragen'}
        </Button>
      </Formularfuss>
      {unten}
    </form>
  );
}
