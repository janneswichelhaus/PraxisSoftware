import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
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
import { leseZahl } from '@/features/nutrition/eingabe';
import { Zielwertliste } from '@/features/nutrition/Rechenweg';
import { ERNAEHRUNG_EINWILLIGUNG, kg, zahl } from '@/features/nutrition/texte';
import {
  ernaehrungSchluessel,
  ernaehrungEinwilligen,
  ernaehrungGewichtEintragen,
  ernaehrungTagebuchSchalten,
  ernaehrungZielgewichtSetzen,
  ladeErnaehrung,
  type EigeneErnaehrung,
  type Plattformzugang,
} from './api';
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
  const abfrage = useQuery({
    queryKey: ernaehrungSchluessel(zugang.access_id),
    queryFn: () => ladeErnaehrung(zugang.access_id),
  });

  return (
    <>
      <Rueckweg standard={`${PLATTFORM_PFAD}/ich`} beschriftung="Ich" />
      <PageHeader title="Ernährung" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Ihre Ernährung wird geladen …"
        fehler="Ihre Ernährung konnte nicht geladen werden."
        inKarte
        leer={{ wenn: (daten) => !daten, titel: 'Zurzeit keine Ernährungsberatung.' }}
      >
        {(daten) => <Inhalt zugang={zugang} daten={daten!} />}
      </Abfragezustand>
    </>
  );
}

function Inhalt({ zugang, daten }: { zugang: Plattformzugang; daten: EigeneErnaehrung }) {
  const p = daten.profile;
  const { search } = useLocation();
  const widerrufen = p.consent?.state === 'withdrawn';
  return (
    <div className="flex flex-col gap-8 [&>*]:mt-0">
      {widerrufen ? (
        <Statusmeldung ton="warnung">
          Einwilligung widerrufen am {datum(p.consent!.occurred_on)}. Es wird nichts mehr
          eingetragen.
        </Statusmeldung>
      ) : null}
      {/* Die eine Aufgabe zuerst; Seltenes eingeklappt (DESIGN.md Grundsatz 4). */}
      {p.diary_enabled ? (
        <ListRows beschriftung="Tagebuch">
          <ListRow
            to={`${PLATTFORM_PFAD}/ernaehrung/tagebuch${search}`}
            titel="Tagebuch"
            meta="Heute eintragen, Wasser zählen"
          />
        </ListRows>
      ) : null}
      <Gewicht zugang={zugang} daten={daten} />
      <Section titel="Ihre Zielwerte">
        <Zielwertliste zielwerte={p.targets} />
      </Section>
      {/* ERN-EPIC-002: nachschlagen und eigene Lebensmittel anlegen. */}
      <ListRows beschriftung="Lebensmittel">
        <ListRow
          to={`${PLATTFORM_PFAD}/ernaehrung/lebensmittel${search}`}
          titel="Lebensmittel"
          meta={
            p.own_foods.length > 0
              ? `Nachschlagen · ${p.own_foods.length} eigene`
              : 'Nachschlagen und eigene anlegen'
          }
        />
      </ListRows>
      <div className="flex flex-col gap-2">
        <Zielgewicht zugang={zugang} daten={daten} />
        <Tagebuch zugang={zugang} daten={daten} />
        <Einwilligung zugang={zugang} daten={daten} />
      </div>
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
  const neuLaden = useNeuLaden(zugang);
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
  const schreibbar = daten.can_write;
  // Je Tag gilt ein Gewicht (ANN-621); steht heute schon eines, steht es da.
  const heute = daten.profile.weights.find((eintrag) => eintrag.measured_on === daten.today);
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
            hint={
              heute
                ? `Heute steht schon ${kg(heute.weight_kg)}${heute.source === 'practice' ? ' aus der Praxis' : ''}. Eintragen ersetzt es.`
                : undefined
            }
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
              {eintragen.isPending ? 'Wird eingetragen …' : heute ? 'Ersetzen' : 'Eintragen'}
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
  const neuLaden = useNeuLaden(zugang);
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
        <Formularfuss dicht>
          <Button type="submit" variant="secondary" disabled={setzen.isPending}>
            {setzen.isPending ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
        </Formularfuss>
      </form>
    </Disclosure>
  );
}

function Tagebuch({ zugang, daten }: { zugang: Plattformzugang; daten: EigeneErnaehrung }) {
  const neuLaden = useNeuLaden(zugang);
  const schalten = useMutation({
    mutationFn: (an: boolean) => ernaehrungTagebuchSchalten(zugang.access_id, an),
    onSuccess: () => neuLaden(),
  });
  const an = daten.profile.diary_enabled;
  // Einschalten braucht die Einwilligung; ausschalten geht immer.
  const bedienbar = an || daten.can_write;
  const angehalten = an && daten.profile.consent?.state === 'withdrawn';
  return (
    <Disclosure summary={`Ernährungstagebuch · ${angehalten ? 'angehalten' : an ? 'an' : 'aus'}`}>
      <Checkbox
        label="Ernährungstagebuch führen"
        hint={angehalten ? 'Angehalten, weil die Einwilligung widerrufen ist.' : undefined}
        checked={an}
        disabled={!bedienbar || schalten.isPending}
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

function Einwilligung({ zugang, daten }: { zugang: Plattformzugang; daten: EigeneErnaehrung }) {
  const neuLaden = useNeuLaden(zugang);
  const stand = daten.profile.consent;
  const erteilt = stand?.state === 'granted';
  const schreiben = useMutation({
    mutationFn: (erteilen: boolean) =>
      ernaehrungEinwilligen(zugang.access_id, erteilen, daten.wording_version),
    onSuccess: () => neuLaden(),
  });
  const zustand = erteilt
    ? `erteilt am ${datum(stand.occurred_on)}`
    : stand
      ? `widerrufen am ${datum(stand.occurred_on)}`
      : 'nicht erteilt';
  return (
    <Disclosure summary={`Einwilligung · ${zustand}`}>
      {erteilt && stand.source === 'practice' ? (
        <p className="text-ink mb-2 text-base">In der Praxis auf Papier erteilt.</p>
      ) : null}
      <p className="text-ink max-w-prose text-base leading-relaxed">{ERNAEHRUNG_EINWILLIGUNG}</p>
      {erteilt ? (
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
    </Disclosure>
  );
}
