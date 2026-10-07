import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { formatDate } from '@/lib/datum';
import {
  fetchProfil,
  PROFILFELDER,
  PROFILTEXT_HOECHSTENS,
  profilSchluessel,
  saveProfil,
  type Profilsicht,
  type Profilwerte,
} from './profil-api';

/**
 * Voraussetzungen (KND-005, IDEA-LZK-004): was ein Plan braucht, um
 * durchführbar zu sein. Daneben, was die Person beim Abschluss aus der
 * Behandlung freigegeben hat – als Kopie mit Herkunft, unveränderlich
 * (ADR-021 Punkt 7).
 *
 * Nur owner und Trainingsbetreuung (ANN-287); das Büro sieht den Abschnitt
 * nicht. Verbindlich prüft der Server, und er protokolliert jedes Lesen.
 */
export function TrainingProfil({
  relationshipId,
  darfSchreiben,
}: {
  relationshipId: string;
  darfSchreiben: boolean;
}) {
  const sicht = useQuery({
    queryKey: profilSchluessel(relationshipId),
    queryFn: () => fetchProfil(relationshipId),
    retry: false,
    // Jedes Laden ist ein protokolliertes Lesen: nicht bei jedem Fokuswechsel.
    refetchOnWindowFocus: false,
  });
  const [bearbeiten, setBearbeiten] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);

  return (
    <Section
      titel="Voraussetzungen"
      rahmen
      aktion={
        darfSchreiben && sicht.data && !bearbeiten ? (
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => {
              setGespeichert(false);
              setBearbeiten(true);
            }}
          >
            Bearbeiten
          </Button>
        ) : null
      }
    >
      {sicht.isPending ? (
        <LoadingState label="Voraussetzungen werden geladen …" />
      ) : sicht.isError ? (
        <ErrorState
          title="Die Voraussetzungen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => void sicht.refetch()}
        />
      ) : !sicht.data ? null : bearbeiten ? (
        <Bearbeiten
          relationshipId={relationshipId}
          sicht={sicht.data}
          onFertig={(ok) => {
            setBearbeiten(false);
            setGespeichert(ok);
          }}
        />
      ) : (
        <Anzeige sicht={sicht.data} gespeichert={gespeichert} />
      )}
    </Section>
  );
}

function Anzeige({ sicht, gespeichert }: { sicht: Profilsicht; gespeichert: boolean }) {
  const gefuellt = PROFILFELDER.filter(([feld]) => sicht.profile?.[feld]);
  return (
    <div className="flex flex-col gap-4">
      {gespeichert ? <Statusmeldung ton="erfolg">Gespeichert.</Statusmeldung> : null}
      {/* ANN-264: Das Profil bleibt bedienbar; der Stand der Einwilligung
          steht dabei, damit niemand ihn suchen muss. */}
      {sicht.health_consent ? null : (
        <p className="text-warnung text-sm">
          Keine Einwilligung zu Gesundheitsangaben vermerkt. Belastungsgrenzen und Vorgeschichte
          erst eintragen, wenn sie vorliegt.
        </p>
      )}
      {gefuellt.length > 0 ? (
        <DetailList>
          {gefuellt.map(([feld, label]) => (
            <DetailRow key={feld} label={label}>
              <span className="whitespace-pre-line">{sicht.profile![feld]}</span>
            </DetailRow>
          ))}
        </DetailList>
      ) : (
        <p className="text-ink-muted text-sm">Noch nichts eingetragen.</p>
      )}
      {sicht.takeovers.length > 0 ? (
        <div role="group" aria-label="Aus der Behandlung übernommen">
          <p className="text-ink text-liste font-medium">Aus der Behandlung übernommen</p>
          <ul className="divide-line mt-1 divide-y">
            {sicht.takeovers.map((angabe) => (
              <li key={angabe.title} className="flex flex-col gap-0.5 py-2">
                <p className="text-ink text-sm font-medium">{angabe.title}</p>
                <p className="text-ink text-sm whitespace-pre-line">{angabe.body}</p>
                <p className="text-ink-muted text-sm">
                  Angeboten am {formatDate(angabe.offered_on)}, von der Person freigegeben am{' '}
                  {formatDate(angabe.released_at.slice(0, 10))}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Bearbeiten({
  relationshipId,
  sicht,
  onFertig,
}: {
  relationshipId: string;
  sicht: Profilsicht;
  onFertig: (gespeichert: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [werte, setWerte] = useState<Profilwerte>(
    () =>
      Object.fromEntries(
        PROFILFELDER.map(([feld]) => [feld, sicht.profile?.[feld] ?? '']),
      ) as Profilwerte,
  );
  const speichern = useMutation({
    mutationFn: () =>
      saveProfil(
        relationshipId,
        Object.fromEntries(PROFILFELDER.map(([feld]) => [feld, werte[feld].trim()])) as Profilwerte,
        sicht.profile?.updated_at ?? null,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profilSchluessel(relationshipId) });
      onFertig(true);
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      aria-label="Voraussetzungen bearbeiten"
      onSubmit={(event) => {
        event.preventDefault();
        speichern.mutate();
      }}
    >
      {PROFILFELDER.map(([feld, label, hinweis]) => (
        <TextArea
          key={feld}
          label={label}
          hint={hinweis}
          rows={2}
          maxLength={PROFILTEXT_HOECHSTENS}
          value={werte[feld]}
          onChange={(event) => setWerte({ ...werte, [feld]: event.target.value })}
        />
      ))}
      {speichern.isError ? (
        <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
        <Button type="button" variant="quiet" onClick={() => onFertig(false)}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
