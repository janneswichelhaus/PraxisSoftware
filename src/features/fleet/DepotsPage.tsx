import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { todayInTimeZone } from '@/features/appointments/api';
import type { CurrentUser } from '@/features/session/types';
import {
  FLOTTE_SCHLUESSEL,
  deleteDepot,
  fetchFleet,
  flotteSchluessel,
  saveDepot,
  type Depot,
  type Fleet,
} from './api';
import { montagDerWoche } from './format';

const ZUR_FLOTTE = '/betrieb/flotte';

/**
 * Die Depots der Radflotte (FLT-EPIC-001, Praxisinhaber:in): anlegen,
 * umbenennen, entfernen. Ein Depot, zu dem noch ein Rad gehört oder in dem
 * eines steht, bleibt (der Server weist ab, die Seite bietet es nicht an).
 * Kein Zugangscode (ANN-549).
 */
export function DepotsPage({ user }: { user: CurrentUser }) {
  const montag = montagDerWoche(todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin'));
  const abfrage = useQuery({
    queryKey: flotteSchluessel(montag),
    queryFn: () => fetchFleet(montag),
    retry: false,
  });
  const [meldung, setMeldung] = useState<{ text: string; nr: number } | null>(null);
  const melde = (text: string) => setMeldung((vorher) => ({ text, nr: (vorher?.nr ?? 0) + 1 }));

  return (
    <>
      <Rueckweg standard={ZUR_FLOTTE} beschriftung="Zurück zur Radflotte" />
      <PageHeader title="Depots" />
      {meldung ? (
        <Rueckmeldung key={meldung.nr} className="mb-6">
          {meldung.text}
        </Rueckmeldung>
      ) : null}
      <Abfragezustand
        abfrage={abfrage}
        laden="Depots werden geladen …"
        fehler="Die Depots konnten nicht geladen werden."
        inKarte
      >
        {(flotte) =>
          flotte.can_manage ? (
            <Depots flotte={flotte} onMeldung={melde} />
          ) : (
            <EmptyState
              inKarte
              title="Depots verwaltet die Praxisinhaber:in."
              aktion={
                <ButtonLink to={ZUR_FLOTTE} variant="secondary">
                  Zur Radflotte
                </ButtonLink>
              }
            />
          )
        }
      </Abfragezustand>
    </>
  );
}

function Depots({ flotte, onMeldung }: { flotte: Fleet; onMeldung: (text: string) => void }) {
  const [offen, setOffen] = useState<string | null>(null);
  const raeder = (depot: Depot) =>
    flotte.bikes.filter(
      (rad) => rad.home_depot_id === depot.id || rad.current_depot_id === depot.id,
    ).length;

  return (
    <>
      <Listenabschnitt
        titel="Depots"
        anzahl={flotte.depots.length}
        leer={{ titel: 'Noch kein Depot', beschreibung: 'Jedes Rad gehört zu einem Depot.' }}
      >
        {flotte.depots.map((depot) => {
          const anzahl = raeder(depot);
          return (
            <ListRow
              key={depot.id}
              titel={depot.name}
              meta={[depot.note, anzahl === 1 ? '1 Rad' : `${anzahl} Räder`]
                .filter(Boolean)
                .join(' · ')}
              aktion={
                offen === depot.id ? null : (
                  <Button
                    variant="secondary"
                    aria-label={`${depot.name} ändern`}
                    onClick={() => setOffen(depot.id)}
                  >
                    Ändern
                  </Button>
                )
              }
              darunter={
                offen === depot.id ? (
                  <div className="pb-4">
                    <Depotformular
                      depot={depot}
                      entfernbar={anzahl === 0}
                      onFertig={(text) => {
                        setOffen(null);
                        if (text) onMeldung(text);
                      }}
                    />
                  </div>
                ) : undefined
              }
            />
          );
        })}
      </Listenabschnitt>

      <Section titel="Depot anlegen">
        <div className="max-w-formular">
          <Depotformular
            depot={null}
            entfernbar={false}
            onFertig={(text) => text && onMeldung(text)}
          />
        </div>
      </Section>
    </>
  );
}

function Depotformular({
  depot,
  entfernbar,
  onFertig,
}: {
  depot: Depot | null;
  entfernbar: boolean;
  /** Mit Satz nach einem Vorgang, ohne beim Abbrechen. */
  onFertig: (meldung: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(depot?.name ?? '');
  const [notiz, setNotiz] = useState(depot?.note ?? '');
  const [fehler, setFehler] = useState<string | undefined>(undefined);

  const speichern = useMutation({
    mutationFn: () => saveDepot({ id: depot?.id ?? null, name: name.trim(), note: notiz.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      if (!depot) {
        setName('');
        setNotiz('');
      }
      onFertig(depot ? 'Depot gespeichert.' : 'Depot angelegt.');
    },
  });

  const entfernen = useMutation({
    mutationFn: () => deleteDepot(depot?.id ?? ''),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      onFertig('Depot entfernt.');
    },
  });

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (speichern.isPending) return;
    const wert = name.trim();
    if (!wert || wert.length > 80) {
      setFehler(wert ? 'Höchstens 80 Zeichen.' : 'Bitte einen Namen angeben.');
      return;
    }
    setFehler(undefined);
    speichern.mutate();
  }

  return (
    <form onSubmit={absenden} noValidate>
      <Feldgruppe>
        <Field
          label="Name"
          placeholder="z. B. Raddepot Nord"
          value={name}
          error={fehler}
          onChange={(event) => setName(event.target.value)}
        />
        <Field
          label="Notiz"
          placeholder="z. B. Hof hinter der Praxis"
          hint="Kein Zugangscode."
          value={notiz}
          onChange={(event) => setNotiz(event.target.value)}
        />
      </Feldgruppe>
      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : depot ? 'Speichern' : 'Depot anlegen'}
        </Button>
        {depot ? (
          <Button type="button" variant="quiet" onClick={() => onFertig(null)}>
            Abbrechen
          </Button>
        ) : null}
        {depot && entfernbar ? (
          <Rueckfrage
            ausloeser="Entfernen"
            ausloeserVariante="quiet"
            unterDerReihe
            bezeichnung={`${depot.name} entfernen – Rückfrage`}
            bestaetigen="Ja, Depot entfernen"
            bestaetigenLaeuft="Wird entfernt …"
            fehler={entfernen.isError ? entfernen.error.message : undefined}
            onBestaetigen={() => entfernen.mutateAsync()}
            onAbbrechen={() => entfernen.reset()}
          >
            <p>{depot.name} wird aus der Radflotte entfernt.</p>
          </Rueckfrage>
        ) : null}
      </div>
    </form>
  );
}
