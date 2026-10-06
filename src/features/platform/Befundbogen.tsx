import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { FragebogenFelder } from '@/features/assessments/FragebogenFelder';
import { antwortFehler, type Antwort, type Antworten } from '@/features/assessments/antworten';
import { beschriftung, frageFeldId } from '@/features/assessments/darstellung';
import type { ScoreDefinition } from '@/features/assessments/schema';
import type { Formularfehler } from '@/lib/formularfehler';
import {
  befundbogenAbsenden,
  befundbogenSchluessel,
  befundbogenSpeichern,
  befundbogenVerwerfen,
  ladeBefundbogen,
  type Bogenstand,
  type Plattformzugang,
} from './api';
import { fuerDiePlattform } from './befundbogen';
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
 * beim Termin und korrigiert dort, wenn nötig (ANN-245).
 *
 * Welche Bögen hier stehen, sagt die Definition (`ausgefuellt_von: patient`,
 * aktiv); heute ist das der Anamnesebogen. Ein Entwurf wird auf dem Server
 * gesichert, nie im Browser (ADR-001).
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
      <Link
        to={zurueck}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zur Übersicht
      </Link>
      {stand.isPending ? (
        <LoadingState label="Ihr Befundbogen wird geladen …" />
      ) : stand.data === undefined ? (
        <ErrorState
          title="Ihr Befundbogen konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => stand.refetch()}
        />
      ) : !instrument || zugang.relationship_kind !== 'treatment' ? (
        <>
          <h1 className="text-accent text-h3 font-bold">Befundbogen</h1>
          <p className="text-ink mt-2 max-w-prose text-base leading-relaxed">
            Hier gibt es zurzeit nichts auszufüllen.
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
        <h1 className="text-accent text-h3 font-bold">{definition.meta.name_de}</h1>
        <Statusmeldung ton="erfolg" className="mt-4">
          Ihr Befundbogen liegt der Praxis vor
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

  const setzen = useCallback((itemId: string, antwort: Antwort | undefined) => {
    setAntworten((bisher) => {
      const neu = { ...bisher };
      if (antwort === undefined) delete neu[itemId];
      else neu[itemId] = antwort;
      return neu;
    });
  }, []);

  function pruefen(): Formularfehler[] {
    const jeFrage = Object.fromEntries(
      antwortFehler(definition, antworten).map((f) => [f.itemId, f.meldung]),
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
    if (absenden && pruefen().length > 0) return;
    setVorgang(absenden ? 'absenden' : 'speichern');
    speichern.mutate(absenden, { onSettled: () => setVorgang(null) });
  }

  return (
    <>
      <h1 className="text-accent text-h3 font-bold">{definition.meta.name_de}</h1>
      <p className="text-ink mt-2 max-w-prose text-base leading-relaxed">
        Bitte beantworten Sie die Fragen so, wie es Ihnen heute geht. Jede Frage darf offen bleiben.
        Ihre Therapeut:in geht den Bogen mit Ihnen beim ersten Termin durch.
      </p>
      <form onSubmit={(e) => e.preventDefault()} noValidate className="mt-6 max-w-2xl">
        <FragebogenFelder
          definition={definition}
          antworten={antworten}
          onChange={setzen}
          fehler={fehlerJeFrage}
        />
        <div className="border-line mt-8 flex flex-col gap-4 border-t pt-6">
          <Fehlerzusammenfassung fehler={zusammenfassung} />
          {speichern.isError ? (
            <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
          ) : null}
          {meldung ? <Statusmeldung ton="erfolg">{meldung}</Statusmeldung> : null}
          <p className="text-ink-muted max-w-prose text-sm">
            Mit „Absenden“ geht der Bogen an die Praxis und lässt sich hier nicht mehr ändern.
            Zwischenspeichern können Sie jederzeit.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button type="button" onClick={() => los(true)} disabled={speichern.isPending}>
              {vorgang === 'absenden' ? 'Wird gesendet …' : 'Absenden'}
            </Button>
            <Button
              type="button"
              variant="secondary"
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
          </div>
        </div>
      </form>
    </>
  );
}
