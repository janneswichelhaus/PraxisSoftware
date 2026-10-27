import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { FragebogenFelder } from '@/features/clinical/assessments/FragebogenFelder';
import {
  antwortFehler,
  type Antwort,
  type Antworten,
} from '@/features/clinical/assessments/antworten';
import { beschriftung, frageFeldId } from '@/features/clinical/assessments/darstellung';
import type { ScoreDefinition, ScoreItem } from '@/features/clinical/assessments/schema';
import type { Formularfehler } from '@/lib/formularfehler';
import {
  befundbogenSchluessel,
  befundbogenAbsenden,
  befundbogenSpeichern,
  befundbogenVerwerfen,
  ladeBefundbogen,
  type Bogenstand,
  type Plattformzugang,
} from './api';
import { bogenschritte, schrittTitel } from './bogenschritte';
import { BOGEN_TITEL, bogenVorlage, fuerDiePlattform } from './instrumentwahl';
import { PLATTFORM_PFAD } from './pfade';
import { datum } from './zeit';

/**
 * „Befundbogen ausfüllen" (POR-012, §7, DSN-001 4.1): der Anamnesebogen vor
 * dem ersten Termin, von der Person selbst.
 *
 * Dieselben Fragen wie in der Praxis - gezeichnet vom geteilten Baustein
 * `FragebogenFelder`, geprüft mit denselben Regeln (`antwortFehler`); was
 * die Person absendet, prüft der Server noch einmal gegen die Definition
 * (ABN-014). Absenden heißt abgeschlossen: Die Therapeut:in liest den Bogen
 * beim Termin und korrigiert dort, wenn nötig (ANN-248).
 *
 * Welche Bögen hier stehen, sagt die Definition (`ausgefuellt_von: patient`,
 * aktiv); heute ist das der Anamnesebogen. Ein Entwurf wird auf dem Server
 * gesichert, nie im Browser (ADR-001).
 *
 * Auf der Plattform heißt er nach seinem Zweck „Fragebogen vor dem ersten
 * Termin“ (DR-125); Name und Fassung der Vorlage stehen im Kleingedruckten.
 */
export function Befundbogen({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const bereich = new URLSearchParams(
    Object.fromEntries([...suche.entries()].filter(([k]) => k === 'bereich' || k === 'zugang')),
  ).toString();
  const zurueck = `${PLATTFORM_PFAD}${bereich ? `?${bereich}` : ''}`;
  const stand = useQuery({
    queryKey: befundbogenSchluessel(zugang.access_id),
    queryFn: () => ladeBefundbogen(zugang.access_id),
  });
  const instrument = fuerDiePlattform()[0];

  return (
    <>
      <Rueckweg standard={zurueck} beschriftung="Zur Übersicht" />
      {stand.isPending ? (
        <LoadingState label="Ihr Fragebogen wird geladen …" inKarte />
      ) : stand.data === undefined ? (
        <ErrorState
          title="Ihr Fragebogen konnte nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => stand.refetch()}
        />
      ) : !instrument || zugang.relationship_kind !== 'treatment' ? (
        <>
          <PageHeader title={BOGEN_TITEL} />
          <p className="text-ink max-w-prose text-base leading-relaxed">
            Hier gibt es zurzeit nichts auszufüllen.
          </p>
        </>
      ) : zugang.access_kind === 'companion' ? (
        // ANN-248: Angaben zur eigenen Gesundheit macht die Person selbst; der
        // Server weist eine Begleitung ab, hier steht der Grund als Satz.
        <>
          <PageHeader title={BOGEN_TITEL} />
          <p className="text-ink max-w-prose text-base leading-relaxed">
            Den Fragebogen füllt {zugang.represented_name ?? 'die Person'} selbst aus. Als
            Begleitung lesen Sie mit, machen aber keine Angaben zur Gesundheit.
          </p>
        </>
      ) : (
        <Bogen
          zugang={zugang}
          definition={instrument}
          stand={stand.data.filter((b) => b.instrument_id === instrument.meta.id)}
          zurueck={zurueck}
        />
      )}
    </>
  );
}

function Bogen({
  zugang,
  definition,
  stand,
  zurueck,
}: {
  zugang: Plattformzugang;
  definition: ScoreDefinition;
  stand: Bogenstand[];
  zurueck: string;
}) {
  const abgeschlossen = stand.find((b) => b.status === 'abgeschlossen');
  const entwurf = stand.find((b) => b.status === 'entwurf' && b.source === 'platform');
  if (abgeschlossen) {
    return (
      <>
        <PageHeader title={BOGEN_TITEL} />
        <Statusmeldung ton="erfolg">
          Ihr Fragebogen liegt der Praxis vor
          {abgeschlossen.completed_at ? ` (seit ${datum(abgeschlossen.completed_at)})` : ''}. Danke!
          Ihre Therapeut:in sieht Ihre Angaben beim nächsten Termin.
        </Statusmeldung>
        <p className="text-ink-muted mt-3 max-w-prose text-sm">
          Hat sich etwas geändert, besprechen Sie es bitte beim Termin.
        </p>
      </>
    );
  }
  return (
    <Formular
      key={entwurf?.id ?? 'neu'}
      zugang={zugang}
      definition={definition}
      entwurf={entwurf}
      zurueck={zurueck}
    />
  );
}

/**
 * Der Bogen zum Ausfüllen, in Schritten mit sichtbarem Fortschritt
 * (`bogenschritte`, ANN-467). Geprüft wird beim „Weiter“ der Schritt, beim
 * „Absenden“ der ganze Bogen - mit denselben Regeln wie in der Praxis.
 * Zwischenspeichern geht in jedem Schritt; die Antworten sind dieselben wie
 * vorher, nur die Anzeige ist geteilt.
 */
function Formular({
  zugang,
  definition,
  entwurf,
  zurueck,
}: {
  zugang: Plattformzugang;
  definition: ScoreDefinition;
  entwurf: Bogenstand | undefined;
  zurueck: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [antworten, setAntworten] = useState<Antworten>(
    () => (entwurf?.answers as Antworten | null) ?? {},
  );
  const [fehlerJeFrage, setFehlerJeFrage] = useState<Record<string, string>>({});
  const [zusammenfassung, setZusammenfassung] = useState<Formularfehler[]>([]);
  const [entwurfId, setEntwurfId] = useState<string | null>(entwurf?.id ?? null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [vorgang, setVorgang] = useState<'absenden' | 'speichern' | null>(null);
  const schritte = useMemo(() => bogenschritte(definition.items), [definition]);
  const [schritt, setSchritt] = useState(0);
  const anfang = useRef<HTMLDivElement>(null);
  const ersterWechsel = useRef(true);
  const fragen = schritte[schritt] ?? [];
  const letzter = schritt === schritte.length - 1;
  const vorlage = bogenVorlage(definition);

  // Nach jedem Wechsel des Schritts steht dessen Anfang im Bild und hat den
  // Fokus - sonst ginge es am Telefon unten weiter, wo der Knopf war.
  useEffect(() => {
    if (ersterWechsel.current) {
      ersterWechsel.current = false;
      return;
    }
    anfang.current?.scrollIntoView?.({ block: 'start' });
    anfang.current?.focus();
  }, [schritt]);

  const setzen = useCallback((itemId: string, antwort: Antwort | undefined) => {
    setAntworten((bisher) => {
      const neu = { ...bisher };
      if (antwort === undefined) delete neu[itemId];
      else neu[itemId] = antwort;
      return neu;
    });
  }, []);

  /** Prüft den Bogen; ohne `nur` den ganzen, sonst die Fragen eines Schritts. */
  function pruefen(nur?: readonly ScoreItem[]): Formularfehler[] {
    const jeFrage = Object.fromEntries(
      antwortFehler(definition, antworten)
        .filter((f) => !nur || nur.some((item) => item.id === f.itemId))
        .map((f) => [f.itemId, f.meldung]),
    );
    const liste = definition.items
      .filter((item) => jeFrage[item.id] !== undefined)
      .map((item) => ({
        feldId: frageFeldId(item.id),
        feld: beschriftung(item),
        meldung: jeFrage[item.id]!,
      }));
    setFehlerJeFrage(jeFrage);
    setZusammenfassung(liste);
    return liste;
  }

  function wechseln(neu: number) {
    setMeldung(null);
    setSchritt(neu);
  }

  function weiter() {
    if (pruefen(fragen).length > 0) return;
    wechseln(schritt + 1);
  }

  const neuLaden = () =>
    queryClient.invalidateQueries({ queryKey: befundbogenSchluessel(zugang.access_id) });

  const speichern = useMutation({
    mutationFn: async (absenden: boolean) => {
      const id = await befundbogenSpeichern({
        zugangId: zugang.access_id,
        entwurfId,
        instrumentId: definition.meta.id,
        version: definition.meta.version,
        antworten,
      });
      setEntwurfId(id);
      if (absenden) await befundbogenAbsenden(zugang.access_id, id);
      return absenden;
    },
    onSuccess: async (abgesendet) => {
      await neuLaden();
      if (abgesendet) void navigate(`${zurueck}${zurueck.includes('?') ? '&' : '?'}bogen=1`);
      else setMeldung('Zwischengespeichert. Sie können später weitermachen.');
    },
  });

  const verwerfen = useMutation({
    mutationFn: () => befundbogenVerwerfen(zugang.access_id, entwurfId!),
    onSuccess: async () => {
      await neuLaden();
      void navigate(zurueck);
    },
  });

  function los(absenden: boolean) {
    setMeldung(null);
    if (absenden) {
      const fehler = pruefen();
      if (fehler.length > 0) {
        // Der erste Schritt mit einem Fehler kommt nach vorn, die Liste zeigt
        // nur, was dort zu sehen ist.
        const ziel = schritte.findIndex((s) =>
          s.some((item) => fehler.some((f) => f.feldId === frageFeldId(item.id))),
        );
        if (ziel >= 0 && ziel !== schritt) {
          pruefen(schritte[ziel]);
          setSchritt(ziel);
        }
        return;
      }
    }
    setVorgang(absenden ? 'absenden' : 'speichern');
    speichern.mutate(absenden, { onSettled: () => setVorgang(null) });
  }

  return (
    <>
      <PageHeader kicker={`Schritt ${schritt + 1} von ${schritte.length}`} title={BOGEN_TITEL} />
      <div className="-mt-4 mb-6">
        <ProgressBar wert={schritt + 1} von={schritte.length} />
      </div>
      {schritt === 0 ? (
        <p className="text-ink mb-6 max-w-prose text-base leading-relaxed">
          Bitte beantworten Sie die Fragen so, wie es Ihnen heute geht. Jede Frage darf offen
          bleiben. Ihre Therapeut:in geht den Bogen mit Ihnen beim ersten Termin durch.
        </p>
      ) : null}
      <form onSubmit={(e) => e.preventDefault()} noValidate>
        <div ref={anfang} tabIndex={-1} className="outline-none">
          <Fehlerzusammenfassung fehler={zusammenfassung} />
          <Section titel={schrittTitel(fragen)}>
            <FragebogenFelder
              definition={{ ...definition, items: fragen }}
              antworten={antworten}
              onChange={setzen}
              fehler={fehlerJeFrage}
            />
          </Section>
        </div>
        {speichern.isError ? (
          <Statusmeldung ton="fehler" className="mt-6">
            {speichern.error.message}
          </Statusmeldung>
        ) : null}
        {meldung ? (
          <Statusmeldung ton="erfolg" className="mt-6">
            {meldung}
          </Statusmeldung>
        ) : null}
        <Formularfuss
          trenner
          {...(letzter
            ? {
                zusatz:
                  'Mit „Absenden“ geht der Bogen an die Praxis und lässt sich hier nicht mehr ändern. Zwischenspeichern können Sie jederzeit.',
              }
            : {})}
        >
          {letzter ? (
            <Button type="button" onClick={() => los(true)} disabled={speichern.isPending}>
              {vorgang === 'absenden' ? 'Wird gesendet …' : 'Absenden'}
            </Button>
          ) : (
            <Button type="button" onClick={weiter} disabled={speichern.isPending}>
              Weiter
            </Button>
          )}
          {schritt > 0 ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => wechseln(schritt - 1)}
              disabled={speichern.isPending}
            >
              Zurück
            </Button>
          ) : null}
          <Button
            type="button"
            variant="quiet"
            onClick={() => los(false)}
            disabled={speichern.isPending}
          >
            {vorgang === 'speichern' ? 'Wird gespeichert …' : 'Zwischenspeichern'}
          </Button>
          {entwurfId ? (
            <Rueckfrage
              ausloeser="Entwurf verwerfen"
              ausloeserVariante="quiet"
              bestaetigen="Ja, verwerfen"
              bestaetigenLaeuft="Wird verworfen …"
              fehler={verwerfen.error?.message}
              onBestaetigen={() => verwerfen.mutateAsync()}
            >
              <p>Ihre gespeicherten Antworten werden gelöscht.</p>
            </Rueckfrage>
          ) : (
            <Button type="button" variant="quiet" onClick={() => void navigate(zurueck)}>
              Abbrechen
            </Button>
          )}
        </Formularfuss>
      </form>
      {vorlage ? <Kleingedrucktes className="mt-8">{vorlage}</Kleingedrucktes> : null}
    </>
  );
}
