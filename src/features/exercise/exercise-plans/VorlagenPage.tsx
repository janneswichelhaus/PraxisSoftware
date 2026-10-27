import { useContext, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { ErrorState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  BIBLIOTHEK_SCHLUESSEL,
  fetchBibliothek,
  type Bibliothek,
} from '@/features/exercise/exercises/api';
import { canReadExerciseLibrary, type CurrentUser } from '@/features/core/session/types';
import { formatDate } from '@/lib/datum';
import {
  PRAXISVORLAGEN_SCHLUESSEL,
  deletePraxisvorlage,
  fetchPraxisvorlagen,
  savePraxisvorlage,
  type Praxisvorlage,
} from './api';
import { dosierungKurz } from './dosierung';
import { VorlagenKontext, alsVorlage, vorlagenListe, type Vorlage } from './vorlagen';

/**
 * Die Vorlagen (UEB-014, ANN-560) unter `/uebungen/vorlagen` - Seitentyp
 * „Liste“: oben die der Praxis, darunter die mitgelieferten auf Abruf. Ein
 * Tipp zeigt die Übungen einer Vorlage mit Dosierung; wer sie angelegt hat
 * und owner benennen sie um oder löschen sie. Neu entsteht eine Vorlage am
 * Plan („Als Vorlage speichern“), zugewiesen wird im Plan („Aus Vorlage“).
 *
 * Nach Name, nach nichts sonst (ADR-006 Punkt 10). Verbindlich prüft der
 * Server.
 */
export function VorlagenPage({ user }: { user: CurrentUser }) {
  const darf = canReadExerciseLibrary(user.roles);
  const mitgeliefert = useContext(VorlagenKontext);
  const vorlagen = useQuery({
    queryKey: PRAXISVORLAGEN_SCHLUESSEL,
    queryFn: fetchPraxisvorlagen,
    enabled: darf,
    retry: false,
  });
  const bibliothek = useQuery({
    queryKey: BIBLIOTHEK_SCHLUESSEL,
    queryFn: fetchBibliothek,
    enabled: darf,
    retry: false,
  });
  const [offen, setOffen] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ text: string; nr: number } | null>(null);
  const melden = (text: string) => setMeldung((b) => ({ text, nr: (b?.nr ?? 0) + 1 }));

  if (!darf) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description="Die Vorlagen stehen den Rollen offen, die Übungen anleiten."
      />
    );
  }

  return (
    <>
      <Rueckweg standard="/uebungen" className="mb-3 max-sm:hidden" />
      <PageHeader title="Vorlagen" />
      {meldung ? (
        <Rueckmeldung key={meldung.nr} className="mb-4">
          {meldung.text}
        </Rueckmeldung>
      ) : null}
      <Abfragezustand
        abfrage={vorlagen}
        laden="Vorlagen werden geladen …"
        fehler="Die Vorlagen der Praxis konnten nicht geladen werden."
        inKarte
      >
        {(daten) => {
          const offene = daten.templates.find((t) => t.id === offen);
          return (
            <>
              <Listenabschnitt
                titel="Vorlagen der Praxis"
                {...(daten.templates.length > 0 ? { anzahl: daten.templates.length } : {})}
                leer={{
                  titel: 'Noch keine eigene Vorlage',
                  beschreibung: 'Am Plan: „Als Vorlage speichern“.',
                }}
              >
                {daten.templates.map((vorlage) => (
                  <ListRow
                    key={vorlage.id}
                    titel={vorlage.name}
                    meta={[
                      anzahlUebungen(vorlage.items.length),
                      vorlage.goal,
                      vorlage.created_by_name ? `von ${vorlage.created_by_name}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    onClick={() => setOffen(vorlage.id)}
                  />
                ))}
              </Listenabschnitt>
              {offene ? (
                <Vorlagenfenster
                  vorlage={offene}
                  bibliothek={bibliothek.data}
                  onSchliessen={() => setOffen(null)}
                  onGeloescht={(name) => {
                    setOffen(null);
                    melden(`Vorlage „${name}“ gelöscht.`);
                  }}
                  onGespeichert={(name) => melden(`Vorlage „${name}“ gespeichert.`)}
                />
              ) : null}
            </>
          );
        }}
      </Abfragezustand>
      {mitgeliefert.length > 0 ? (
        <div className="mt-8">
          <Disclosure summary="Mitgelieferte Vorlagen" anzahl={mitgeliefert.length} kopf="label">
            <ListRows>
              {vorlagenListe<Vorlage>(mitgeliefert).map((vorlage) => (
                <ListRow
                  key={vorlage.schluessel}
                  titel={vorlage.name}
                  meta={`${anzahlUebungen(vorlage.uebungen.length)} · ${vorlage.ziel}`}
                />
              ))}
            </ListRows>
          </Disclosure>
        </div>
      ) : null}
    </>
  );
}

function anzahlUebungen(n: number): string {
  return n === 1 ? '1 Übung' : `${n} Übungen`;
}

/** Name der Übung in der Bibliothek; ohne Bibliothek ein Platzhalter. */
function uebungsname(bibliothek: Bibliothek | undefined, varianteId: string): string {
  for (const uebung of bibliothek?.exercises ?? []) {
    const variante = uebung.variants.find((v) => v.id === varianteId);
    if (variante) {
      const name = variante.name === uebung.name ? uebung.name : variante.name;
      return uebung.archived || variante.archived ? `${name} (archiviert)` : name;
    }
  }
  return 'Übung';
}

function Vorlagenfenster({
  vorlage,
  bibliothek,
  onSchliessen,
  onGeloescht,
  onGespeichert,
}: {
  vorlage: Praxisvorlage;
  bibliothek: Bibliothek | undefined;
  onSchliessen: () => void;
  onGeloescht: (name: string) => void;
  onGespeichert: (name: string) => void;
}) {
  const queryClient = useQueryClient();
  const [bearbeiten, setBearbeiten] = useState(false);
  const loeschen = useMutation({
    mutationFn: () => deletePraxisvorlage(vorlage.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PRAXISVORLAGEN_SCHLUESSEL });
      onGeloescht(vorlage.name);
    },
  });
  const zeilen = alsVorlage(vorlage).uebungen;

  if (bearbeiten) {
    return (
      <Umbenennen
        vorlage={vorlage}
        onSchliessen={() => setBearbeiten(false)}
        onGespeichert={(name) => {
          setBearbeiten(false);
          onGespeichert(name);
        }}
      />
    );
  }

  return (
    <Dialogfenster titel={vorlage.name} onSchliessen={onSchliessen} breit>
      {/* Ziel und Stand in einer Metazeile über den Übungen. */}
      <p className="text-ink-muted mb-3 text-sm">
        {[
          vorlage.goal,
          `Stand ${formatDate(vorlage.updated_on)}`,
          vorlage.created_by_name ? `angelegt von ${vorlage.created_by_name}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <ListRows>
        {zeilen.map((zeile, index) => (
          <ListRow
            key={zeile.schluessel}
            titel={`${index + 1}. ${uebungsname(bibliothek, zeile.schluessel)}`}
            meta={zeile.dosis ? dosierungKurz(zeile.dosis) : null}
          />
        ))}
      </ListRows>
      {vorlage.can_edit ? (
        <div className="mt-6 flex flex-wrap items-start gap-3">
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => setBearbeiten(true)}
          >
            Name und Ziel
          </Button>
          <Rueckfrage
            ausloeser="Vorlage löschen"
            ausloeserVariante="quiet"
            ausloeserGroesse="kompakt"
            bestaetigen="Ja, löschen"
            bestaetigenLaeuft="Wird gelöscht …"
            fehler={loeschen.isError ? loeschen.error.message : undefined}
            laeuft={loeschen.isPending}
            onBestaetigen={() => loeschen.mutateAsync()}
            onAbbrechen={() => loeschen.reset()}
          >
            Die Vorlage wird gelöscht. Pläne, die aus ihr entstanden sind, bleiben.
          </Rueckfrage>
        </div>
      ) : null}
    </Dialogfenster>
  );
}

function Umbenennen({
  vorlage,
  onSchliessen,
  onGespeichert,
}: {
  vorlage: Praxisvorlage;
  onSchliessen: () => void;
  onGespeichert: (name: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(vorlage.name);
  const [ziel, setZiel] = useState(vorlage.goal ?? '');
  const [fehler, setFehler] = useState<string | undefined>();
  const speichern = useMutation({
    mutationFn: () => savePraxisvorlage({ id: vorlage.id, name, ziel }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PRAXISVORLAGEN_SCHLUESSEL });
      onGespeichert(name.trim());
    },
  });
  return (
    <Dialogfenster titel="Name und Ziel" onSchliessen={onSchliessen}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) {
            setFehler('Bitte einen Namen angeben.');
            return;
          }
          setFehler(undefined);
          if (!speichern.isPending) speichern.mutate();
        }}
      >
        <Field
          label="Name *"
          maxLength={80}
          value={name}
          error={fehler}
          onChange={(event) => setName(event.target.value)}
        />
        <Field
          label="Ziel"
          maxLength={200}
          value={ziel}
          onChange={(event) => setZiel(event.target.value)}
        />
        {speichern.isError ? (
          <Statusmeldung ton="fehler">{speichern.error.message}</Statusmeldung>
        ) : null}
        <Formularfuss>
          <Button type="submit" disabled={speichern.isPending}>
            {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
          <Button type="button" variant="quiet" onClick={onSchliessen}>
            Abbrechen
          </Button>
        </Formularfuss>
      </form>
    </Dialogfenster>
  );
}
