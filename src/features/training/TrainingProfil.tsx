import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
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
  // Zählt die Speichervorgänge: Jede Bestätigung ist eine neue Zeile.
  const [gespeichert, setGespeichert] = useState(0);

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
            onClick={() => setBearbeiten(true)}
          >
            Bearbeiten
          </Button>
        ) : null
      }
    >
      <Abfragezustand
        abfrage={sicht}
        laden="Voraussetzungen werden geladen …"
        fehler="Die Voraussetzungen konnten nicht geladen werden."
      >
        {(daten) =>
          !daten ? null : bearbeiten ? (
            <Bearbeiten
              relationshipId={relationshipId}
              sicht={daten}
              onFertig={(ok) => {
                setBearbeiten(false);
                if (ok) setGespeichert((zahl) => zahl + 1);
              }}
            />
          ) : (
            <Anzeige sicht={daten} gespeichert={gespeichert} />
          )
        }
      </Abfragezustand>
    </Section>
  );
}

function Anzeige({ sicht, gespeichert }: { sicht: Profilsicht; gespeichert: number }) {
  const gefuellt = PROFILFELDER.filter(([feld]) => sicht.profile?.[feld]);
  return (
    // Die erste Angabenliste trägt keine Kopflinie: Sie stünde direkt unter
    // dem Rahmen der Karte (wie `Inhaltsflaeche`).
    <div className="flex flex-col gap-4 [&>dl:first-child]:mt-0 [&>dl:first-child]:border-t-0">
      {gespeichert > 0 ? <Rueckmeldung key={gespeichert}>Gespeichert.</Rueckmeldung> : null}
      {/* ANN-264: Das Profil bleibt bedienbar; der Stand der Einwilligung
          steht dabei, damit niemand ihn suchen muss. */}
      {sicht.health_consent ? null : (
        <Statusmeldung ton="warnung">
          Keine Einwilligung zu Gesundheitsangaben vermerkt. Belastungsgrenzen und Vorgeschichte
          erst eintragen, wenn sie vorliegt.
        </Statusmeldung>
      )}
      {gefuellt.length > 0 ? (
        <DetailList>
          {gefuellt.map(([feld, label]) => (
            <DetailRow key={feld} label={label}>
              {sicht.profile![feld]}
            </DetailRow>
          ))}
        </DetailList>
      ) : (
        <p className="text-ink-muted text-sm">Noch nichts eingetragen.</p>
      )}
      {sicht.takeovers.length > 0 ? (
        // Eine Gruppe in derselben Karte, mit Zwischentitel statt eigenem
        // Kasten (Leitfaden L2); je Übernahme Titel, Text und Herkunft.
        <div role="group" aria-label="Aus der Behandlung übernommen">
          <Zwischentitel>Aus der Behandlung übernommen</Zwischentitel>
          <DetailList>
            {sicht.takeovers.map((angabe) => (
              <DetailRow key={angabe.title} label={angabe.title}>
                {angabe.body}
                <span className="text-ink-muted block text-sm whitespace-normal">
                  Angeboten am {formatDate(angabe.offered_on)}, von der Person freigegeben am{' '}
                  {formatDate(angabe.released_on)}
                </span>
              </DetailRow>
            ))}
          </DetailList>
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
      className="max-w-formular flex flex-col gap-4"
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
      <Formularfuss>
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
        <Button type="button" variant="quiet" onClick={() => onFertig(false)}>
          Abbrechen
        </Button>
      </Formularfuss>
    </form>
  );
}
