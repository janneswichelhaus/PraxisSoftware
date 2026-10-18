import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { leseZahl } from '@/features/nutrition/eingabe';
import { Zielwertliste } from '@/features/nutrition/Rechenweg';
import { ERNAEHRUNG_EINWILLIGUNG, kg, zahl } from '@/features/nutrition/texte';
import { ernaehrungSchluessel, type EigeneErnaehrung, type Plattformzugang } from './api';
import { useNurLesen, usePlattformApi } from './einsicht';
import { PLATTFORM_PFAD } from './pfade';
import { datum } from './zeit';

/**
 * Ernährung auf der Plattform (ERN-002, ADR-027, PROJECT_PRINCIPLES.md 4.11):
 * die eigenen Zielwerte mit Rechenweg, das Gewicht, das Zielgewicht, der
 * Schalter des Tagebuchs und die Einwilligung.
 *
 * Nur für die Person und ihre rechtliche Vertretung; die Begleitung sieht
 * nichts davon (der Server gibt ihr nichts). Gerechnet hat der Server; hier
 * steht keine Aussage über die Gesundheit und kein Etikett zum Gewicht
 * (ADR-006 Punkt 14).
 */
export function Ernaehrung({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ernaehrungSchluessel(zugang.access_id),
    queryFn: () => api.ladeErnaehrung(zugang.access_id),
  });

  return (
    <>
      <Rueckweg standard={`${PLATTFORM_PFAD}/ich`} beschriftung="Zu „Ich“" />
      <PageHeader title="Ernährung" />
      {isPending ? (
        <LoadingState label="Ihre Ernährung wird geladen …" inKarte />
      ) : isError ? (
        <ErrorState
          title="Ihre Ernährung konnte nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => void refetch()}
        />
      ) : !data ? (
        <EmptyState inKarte title="Zurzeit keine Ernährungsberatung." />
      ) : (
        <Inhalt zugang={zugang} daten={data} />
      )}
    </>
  );
}

function Inhalt({ zugang, daten }: { zugang: Plattformzugang; daten: EigeneErnaehrung }) {
  const p = daten.profile;
  const z = p.targets;
  const jetzt = p.weights[0];
  const widerrufen = p.consent?.state === 'withdrawn';
  return (
    <div className="flex flex-col gap-8">
      {widerrufen ? (
        <Statusmeldung ton="warnung">
          Einwilligung widerrufen am {datum(p.consent!.occurred_on)}. Es wird nichts mehr
          eingetragen.
        </Statusmeldung>
      ) : null}
      <TileGrid spalte="kachel">
        {z.status === 'ok' ? <Tile label="Energie am Tag">{zahl(z.energy.kcal)} kcal</Tile> : null}
        <Tile label="Gewicht" zusatz={jetzt ? `am ${datum(jetzt.measured_on)}` : undefined}>
          {jetzt ? kg(jetzt.weight_kg) : '–'}
        </Tile>
      </TileGrid>
      <Section titel="Ihre Zielwerte">
        <Zielwertliste zielwerte={z} />
      </Section>
      <Gewicht zugang={zugang} daten={daten} />
      <Zielgewicht zugang={zugang} daten={daten} />
      <Tagebuch zugang={zugang} daten={daten} />
      <Einwilligung zugang={zugang} daten={daten} />
      <Kleingedrucktes>
        Ihre Zielwerte rechnet die Anwendung aus veröffentlichten Formeln für Ernährung und
        Körpergewicht im Alltag. Sie sagen nichts über Ihre Gesundheit; Ihre Praxis kann sie
        anpassen.
      </Kleingedrucktes>
    </div>
  );
}

function useNeuLaden(zugang: Plattformzugang) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ernaehrungSchluessel(zugang.access_id) });
}

function Gewicht({ zugang, daten }: { zugang: Plattformzugang; daten: EigeneErnaehrung }) {
  const api = usePlattformApi();
  const nurLesen = useNurLesen();
  const neuLaden = useNeuLaden(zugang);
  const [wert, setWert] = useState('');
  const [fehler, setFehler] = useState<string | undefined>();
  const [eingetragen, setEingetragen] = useState(0);
  const eintragen = useMutation({
    mutationFn: (kilo: number) =>
      api.ernaehrungGewichtEintragen(zugang.access_id, daten.today, kilo),
    onSuccess: async () => {
      setWert('');
      setEingetragen((n) => n + 1);
      await neuLaden();
    },
  });
  const schreibbar = daten.can_write && !nurLesen;
  return (
    <Section titel="Gewicht">
      {schreibbar ? (
        <form
          aria-label="Gewicht eintragen"
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const kilo = leseZahl(wert);
            if (kilo === null || kilo < 20 || kilo > 350) {
              setFehler('Bitte Ihr Gewicht in kg angeben, etwa 72,5.');
              return;
            }
            setFehler(undefined);
            eintragen.mutate(kilo);
          }}
        >
          <Field
            label="Gewicht heute (kg)"
            inputMode="decimal"
            autoComplete="off"
            value={wert}
            error={fehler}
            onChange={(event) => setWert(event.target.value)}
          />
          {eintragen.isError ? (
            <Statusmeldung ton="fehler">{eintragen.error.message}</Statusmeldung>
          ) : null}
          {eingetragen > 0 ? <Rueckmeldung key={eingetragen}>Eingetragen.</Rueckmeldung> : null}
          <Formularfuss dicht>
            <Button type="submit" disabled={eintragen.isPending}>
              {eintragen.isPending ? 'Wird eingetragen …' : 'Eintragen'}
            </Button>
          </Formularfuss>
        </form>
      ) : null}
      {daten.profile.weights.length > 0 ? (
        <ListRows
          beschriftung="Ihr Gewichtsverlauf"
          rahmen={false}
          className={schreibbar ? 'mt-4' : ''}
        >
          {daten.profile.weights.map((eintrag) => (
            <ListRow
              key={eintrag.measured_on}
              dicht
              titel={kg(eintrag.weight_kg)}
              meta={`${datum(eintrag.measured_on)}${eintrag.source === 'practice' ? ' · in der Praxis' : ''}`}
            />
          ))}
        </ListRows>
      ) : null}
    </Section>
  );
}

function Zielgewicht({ zugang, daten }: { zugang: Plattformzugang; daten: EigeneErnaehrung }) {
  const api = usePlattformApi();
  const nurLesen = useNurLesen();
  const neuLaden = useNeuLaden(zugang);
  const p = daten.profile;
  const [wert, setWert] = useState(p.target_weight_kg === null ? '' : zahl(p.target_weight_kg, 1));
  const [fehler, setFehler] = useState<string | undefined>();
  const [gespeichert, setGespeichert] = useState(0);
  const setzen = useMutation({
    mutationFn: (kilo: number | null) => api.ernaehrungZielgewichtSetzen(zugang.access_id, kilo),
    onSuccess: async () => {
      setGespeichert((n) => n + 1);
      await neuLaden();
    },
  });
  const unten = daten.target_weight_floor_kg;
  if (!daten.can_write || nurLesen) {
    return (
      <Section titel="Zielgewicht">
        <p className="text-ink text-base">
          {p.target_weight_kg === null ? 'Kein Zielgewicht gewählt.' : kg(p.target_weight_kg)}
        </p>
      </Section>
    );
  }
  return (
    <Section titel="Zielgewicht">
      <form
        aria-label="Zielgewicht wählen"
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
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
          hint={`Mindestens ${kg(unten)}. Leer lassen, wenn Sie keines wählen möchten.`}
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
        <Formularfuss dicht>
          <Button type="submit" variant="secondary" disabled={setzen.isPending}>
            {setzen.isPending ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
        </Formularfuss>
      </form>
    </Section>
  );
}

function Tagebuch({ zugang, daten }: { zugang: Plattformzugang; daten: EigeneErnaehrung }) {
  const api = usePlattformApi();
  const nurLesen = useNurLesen();
  const neuLaden = useNeuLaden(zugang);
  const schalten = useMutation({
    mutationFn: (an: boolean) => api.ernaehrungTagebuchSchalten(zugang.access_id, an),
    onSuccess: () => neuLaden(),
  });
  const an = daten.profile.diary_enabled;
  // Einschalten braucht die Einwilligung; ausschalten geht immer.
  const bedienbar = !nurLesen && (an || daten.can_write);
  return (
    <Section titel="Ernährungstagebuch">
      <Checkbox
        label="Ernährungstagebuch führen"
        hint={
          an
            ? daten.profile.consent?.state === 'withdrawn'
              ? 'Angehalten, weil die Einwilligung widerrufen ist.'
              : 'Eingeschaltet. Ausschalten nimmt nichts weg.'
            : 'Aus. Sie entscheiden selbst, ob Sie es führen.'
        }
        checked={an}
        disabled={!bedienbar || schalten.isPending}
        onChange={(event) => schalten.mutate(event.target.checked)}
      />
      {schalten.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {schalten.error.message}
        </Statusmeldung>
      ) : null}
    </Section>
  );
}

function Einwilligung({ zugang, daten }: { zugang: Plattformzugang; daten: EigeneErnaehrung }) {
  const api = usePlattformApi();
  const nurLesen = useNurLesen();
  const neuLaden = useNeuLaden(zugang);
  const stand = daten.profile.consent;
  const erteilt = stand?.state === 'granted';
  const schreiben = useMutation({
    mutationFn: (erteilen: boolean) =>
      api.ernaehrungEinwilligen(zugang.access_id, erteilen, daten.wording_version),
    onSuccess: () => neuLaden(),
  });
  return (
    <Section titel="Einwilligung">
      <p className="text-ink text-base">
        {erteilt
          ? `Erteilt am ${datum(stand.occurred_on)}${stand.source === 'practice' ? ' in der Praxis' : ''}.`
          : stand
            ? `Widerrufen am ${datum(stand.occurred_on)}.`
            : 'Nicht erteilt.'}
      </p>
      <div className="mt-3">
        <Disclosure summary="Wortlaut">
          <p className="text-ink max-w-prose text-base leading-relaxed">
            {ERNAEHRUNG_EINWILLIGUNG}
          </p>
        </Disclosure>
      </div>
      {nurLesen ? null : erteilt ? (
        <div className="mt-4">
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
        </div>
      ) : daten.can_grant ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            disabled={schreiben.isPending}
            onClick={() => schreiben.mutate(true)}
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
    </Section>
  );
}
