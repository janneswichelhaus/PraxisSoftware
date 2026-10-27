import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
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
import { tagebuchAdresse, tagName } from './tagebuchAdresse';

/**
 * Ein Lebensmittel ins Tagebuch (ERN-007, ADR-027 Punkte 9 und 10):
 * suchen, antippen, Menge wählen, eintragen. Die Menge ist eine Portion der
 * Quelle mal einer Anzahl oder g bzw. ml; die Werte rechnet der Server.
 *
 * Tag und Mahlzeit stehen in der Adresse, der Suchbegriff nie (ADR-027
 * Punkt 8). Nach dem Eintragen geht es zurück zum Tag.
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
  const tag = tagAusAdresse ?? tagebuch.data?.today ?? null;

  return (
    <>
      <Rueckweg standard={tagebuchAdresse(tagAusAdresse, search)} beschriftung="Zum Tagebuch" />
      <PageHeader
        title={`${MAHLZEIT_NAMEN[mahlzeit]} eintragen`}
        description={tag && tagebuch.data ? tagName(tag, tagebuch.data.today) : undefined}
      />
      <Abfragezustand
        abfrage={tagebuch}
        laden="Wird geladen …"
        fehler="Ihr Tagebuch konnte nicht geladen werden."
        inKarte
        leer={{
          wenn: (daten) => !daten || !daten.can_write || !ernaehrung.data,
          titel: 'Hier lässt sich gerade nichts eintragen.',
        }}
      >
        {(daten) => (
          <Suche
            zugang={zugang}
            ernaehrung={ernaehrung.data!}
            tagebuch={daten!}
            tag={tag!}
            mahlzeit={mahlzeit}
          />
        )}
      </Abfragezustand>
      <Quellenangabe laden={lebensmittelQuellen} />
    </>
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
}: {
  zugang: Plattformzugang;
  ernaehrung: EigeneErnaehrung;
  tagebuch: EigenesTagebuch;
  tag: string;
  mahlzeit: Mahlzeit;
}) {
  const ohneZahlen = tagebuch.hide_numbers;
  const letzte = (f: Lebensmittel) =>
    [...tagebuch.recent, ...tagebuch.favorites].find((s) => gleich(s.food, f));
  return (
    <LebensmittelSuche
      suchen={(begriff) => lebensmittelSuchen(zugang.access_id, begriff)}
      schluessel={['platform-foods', zugang.access_id]}
      eigene={ernaehrung.profile.own_foods}
      ohneZahlen={ohneZahlen}
      ohneBegriff={(oeffnen) => (
        <div className="flex flex-col gap-8 [&>*]:mt-0">
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
              />
            ))}
          </Listenabschnitt>
          {ernaehrung.profile.own_foods.length > 0 ? (
            <Listenabschnitt titel="Eigene Lebensmittel">
              {ernaehrung.profile.own_foods.map((f) => (
                <Trefferzeile key={f.id} f={f} onOeffnen={oeffnen} ohneZahlen={ohneZahlen} />
              ))}
            </Listenabschnitt>
          ) : null}
        </div>
      )}
      fensterInhalt={(f) => {
        const vorher = letzte(f);
        const anfang = vorher ? letzteMenge(vorher) : undefined;
        return (
          <MengeWaehlen
            zugang={zugang}
            f={f}
            tag={tag}
            mahlzeit={mahlzeit}
            ohneZahlen={ohneZahlen}
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
}: {
  zugang: Plattformzugang;
  s: Schnellwahl;
  tag: string;
  mahlzeit: Mahlzeit;
  ohneZahlen: boolean;
  onOeffnen: (f: Lebensmittel) => void;
}) {
  const eintragen = useEintragen(zugang, s.food, tag, mahlzeit);
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
                disabled={eintragen.isPending}
                onClick={() => eintragen.mutate(menge.angabe)}
              >
                <span aria-hidden="true" className="text-xl">
                  +
                </span>
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

/** Eintragen und zurück zum Tag - aus dem Fenster wie aus einer Zeile. */
function useEintragen(zugang: Plattformzugang, f: Lebensmittel, tag: string, mahlzeit: Mahlzeit) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { search } = useLocation();
  return useMutation({
    mutationFn: (angabe: Mengenangabe) =>
      tagebuchEintragen(zugang.access_id, tag, mahlzeit, f, angabe),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tagebuchSchluessel(zugang.access_id) });
      void navigate(tagebuchAdresse(tag, search), {
        replace: true,
        state: { eingetragen: f.name },
      });
    },
  });
}

/** Favorit an oder ab - sofort gespeichert. */
function Favorit({ zugang, f, an }: { zugang: Plattformzugang; f: Lebensmittel; an: boolean }) {
  const queryClient = useQueryClient();
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
    <div>
      <Checkbox
        label="Favorit"
        checked={wert}
        onChange={(event) => setzen.mutate(event.target.checked)}
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
}: {
  zugang: Plattformzugang;
  f: Lebensmittel;
  tag: string;
  mahlzeit: Mahlzeit;
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
  const eintragen = useEintragen(zugang, f, tag, mahlzeit);
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
      <Formularfuss dicht>
        <Button type="submit" disabled={eintragen.isPending}>
          {eintragen.isPending ? 'Wird eingetragen …' : 'Eintragen'}
        </Button>
      </Formularfuss>
      {unten}
    </form>
  );
}
