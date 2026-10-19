import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import {
  LebensmittelSuche,
  Quellenangabe,
  Trefferzeile,
} from '@/features/nutrition/LebensmittelSuche';
import { QUELLENNAME, type Lebensmittel } from '@/features/nutrition/lebensmittel';
import {
  energieDerMenge,
  FREIE_MENGE,
  istMahlzeit,
  kcal,
  MAHLZEIT_NAMEN,
  mengePruefen,
  vorbelegung,
  type Mahlzeit,
} from '@/features/nutrition/tagebuch';
import { zahl } from '@/features/nutrition/texte';
import {
  ernaehrungSchluessel,
  tagebuchSchluessel,
  type EigeneErnaehrung,
  type Plattformzugang,
} from './api';
import { useNurLesen, usePlattformApi } from './einsicht';
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
  const api = usePlattformApi();
  const [suche] = useSearchParams();
  const { search } = useLocation();
  const tagAusAdresse = /^\d{4}-\d{2}-\d{2}$/.test(suche.get('tag') ?? '')
    ? suche.get('tag')
    : null;
  const roh = suche.get('mahlzeit');
  const mahlzeit: Mahlzeit = istMahlzeit(roh) ? roh : 'snack';
  const ernaehrung = useQuery({
    queryKey: ernaehrungSchluessel(zugang.access_id),
    queryFn: () => api.ladeErnaehrung(zugang.access_id),
  });
  // Ohne Tag in der Adresse: heute.
  const tag = tagAusAdresse ?? ernaehrung.data?.today ?? null;

  return (
    <>
      <Rueckweg standard={tagebuchAdresse(tagAusAdresse, search)} beschriftung="Zum Tagebuch" />
      <PageHeader
        title={`${MAHLZEIT_NAMEN[mahlzeit]} eintragen`}
        description={tag && ernaehrung.data ? tagName(tag, ernaehrung.data.today) : undefined}
      />
      <Abfragezustand
        abfrage={ernaehrung}
        laden="Wird geladen …"
        fehler="Ihr Tagebuch konnte nicht geladen werden."
        inKarte
        leer={{
          wenn: (daten) => !daten || !daten.can_write || !daten.profile.diary_enabled,
          titel: 'Hier lässt sich gerade nichts eintragen.',
        }}
      >
        {(daten) => <Suche zugang={zugang} daten={daten!} tag={tag!} mahlzeit={mahlzeit} />}
      </Abfragezustand>
      <Quellenangabe laden={api.lebensmittelQuellen} />
    </>
  );
}

function Suche({
  zugang,
  daten,
  tag,
  mahlzeit,
  ohneBegriff,
}: {
  zugang: Plattformzugang;
  daten: EigeneErnaehrung;
  tag: string;
  mahlzeit: Mahlzeit;
  ohneBegriff?: (oeffnen: (f: Lebensmittel) => void) => ReactNode;
}) {
  const api = usePlattformApi();
  return (
    <LebensmittelSuche
      suchen={(begriff) => api.lebensmittelSuchen(zugang.access_id, begriff)}
      schluessel={['platform-foods', zugang.access_id]}
      eigene={daten.profile.own_foods}
      ohneBegriff={
        ohneBegriff ??
        ((oeffnen) => (
          <Listenabschnitt
            titel="Eigene Lebensmittel"
            leer={{ titel: 'Lebensmittel suchen, etwa „Haferflocken“.' }}
          >
            {daten.profile.own_foods.map((f) => (
              <Trefferzeile key={f.id} f={f} onOeffnen={oeffnen} />
            ))}
          </Listenabschnitt>
        ))
      }
      fensterInhalt={(f) => <MengeWaehlen zugang={zugang} f={f} tag={tag} mahlzeit={mahlzeit} />}
    />
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
  const api = usePlattformApi();
  const nurLesen = useNurLesen();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { search } = useLocation();
  const start = anfang ?? vorbelegung(f);
  const [einheit, setEinheit] = useState(start.einheit);
  const [wert, setWert] = useState(start.wert);
  const [fehler, setFehler] = useState<string | undefined>();
  const eintragen = useMutation({
    mutationFn: (angabe: Parameters<typeof api.tagebuchEintragen>[4]) =>
      api.tagebuchEintragen(zugang.access_id, tag, mahlzeit, f, angabe),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tagebuchSchluessel(zugang.access_id) });
      void navigate(tagebuchAdresse(tag, search), {
        replace: true,
        state: { eingetragen: f.name },
      });
    },
  });
  const geprueft = mengePruefen(f, einheit, wert);
  const wahlen = [
    ...f.portions.map((p) => ({ wert: p.label, text: p.label })),
    { wert: FREIE_MENGE, text: f.base_unit === 'ml' ? 'Milliliter' : 'Gramm' },
  ];
  if (nurLesen) return null;
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
      <p className="text-ink-muted text-base">
        {[f.brand, QUELLENNAME[f.source]].filter(Boolean).join(' · ')}
      </p>
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
