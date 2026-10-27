import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState } from '@/components/ui/Feedback';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { StatusMark } from '@/components/ui/StatusMark';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  aendern,
  beginne,
  kannZurueck,
  schrittText,
  weiter,
  zurueck,
  type Abfolge,
} from '@/components/ui/abfolge';
import { useTextverlustschutz } from '@/app/Textverlustschutz';
import { leseRueckweg } from '@/lib/rueckweg';
import type { CurrentUser } from '@/features/core/session/types';
import {
  FLOTTE_SCHLUESSEL,
  fetchFleet,
  flotteSchluessel,
  handOverKey,
  takeKey,
  type Bike,
  type Fleet,
  type FleetStaff,
} from './api';
import {
  SCHRITTE,
  beginn,
  empfaenger,
  meldung,
  personName,
  personNachRadwahl,
  radZeile,
  raederZurWahl,
  schrittnummer,
  vonText,
  vorgang,
  type Seite,
} from './schluesselablauf';
import { todayInTimeZone, wochenBeginn } from '@/lib/datum';

const ZUR_FLOTTE = '/betrieb/flotte';

/**
 * Schlüssel übergeben (FLT-EPIC-001; geführt seit Überholung 6, G4): aus dem
 * Tresor an eine Person oder von Hand zu Hand. Den eigenen Schlüssel nimmt man
 * meist mit einem Tipp an der Zeile der Radflotte; dieser Ablauf ist für
 * alles andere - jemand nimmt den Schlüssel für eine Kollegin mit, er geht
 * von Anna an Tim, oder das eigene Konto hat keinen Mitarbeiterdatensatz.
 *
 * Im Fenster des geführten Ablaufs: „Welches Rad?“ als Zeilen (mit `?rad=`
 * entfällt die Seite), „An wen?“ als Zeilen aus dem Mitarbeiterstamm, dann der
 * Abschluss mit „Ändern“ und einem Hauptknopf. Ein Tipp auf eine Zeile wählt
 * und führt weiter; vorgewählt ist nichts (VOR-18). Welche Räder und Personen
 * zur Wahl stehen und welcher Vorgang läuft, steht in `schluesselablauf.ts`;
 * ob er gilt, entscheidet der Server.
 */
export function KeyPage({ user }: { user: CurrentUser }) {
  const montag = wochenBeginn(todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin'));
  const abfrage = useQuery({
    queryKey: flotteSchluessel(montag),
    queryFn: () => fetchFleet(montag),
    retry: false,
  });
  const [parameter] = useSearchParams();
  const vorgabe = parameter.get('rad');
  const ziel = leseRueckweg(parameter, ZUR_FLOTTE);

  return (
    <>
      <Rueckweg standard={ZUR_FLOTTE} beschriftung="Zurück zur Radflotte" />
      <PageHeader title="Schlüssel übergeben" />
      <Abfragezustand
        abfrage={abfrage}
        laden="Radflotte wird geladen …"
        fehler="Die Radflotte konnte nicht geladen werden."
        inKarte
      >
        {(flotte) =>
          raederZurWahl(flotte).length === 0 ? (
            <EmptyState
              inKarte
              title={flotte.bikes.length === 0 ? 'Noch kein Rad angelegt' : 'Kein Rad frei'}
              description={flotte.bikes.length === 0 ? undefined : 'Alle Räder sind in Reparatur.'}
              aktion={
                <ButtonLink to={ZUR_FLOTTE} variant="secondary">
                  Zur Radflotte
                </ButtonLink>
              }
            />
          ) : (
            // Ein anderes Rad aus der Adresse, ein neuer Ablauf.
            <Schluesselfenster key={vorgabe ?? ''} flotte={flotte} vorgabe={vorgabe} ziel={ziel} />
          )
        }
      </Abfragezustand>
    </>
  );
}

function Schluesselfenster({
  flotte,
  vorgabe,
  ziel,
}: {
  flotte: Fleet;
  vorgabe: string | null;
  /** Wohin ✕ führt: dorthin, woher der Ablauf geöffnet wurde. */
  ziel: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const ich = flotte.my_staff_member_id;
  const [start] = useState(() => beginn(flotte, vorgabe));
  const [abfolge, setAbfolge] = useState<Abfolge<Seite>>(() => beginne(start.seite));
  const [radId, setRadId] = useState<string | null>(start.radId);
  const [personId, setPersonId] = useState<string | null>(null);

  const raeder = raederZurWahl(flotte);
  const rad = raeder.find((eintrag) => eintrag.id === radId) ?? null;
  const personen = rad ? empfaenger(flotte, rad) : [];
  const person = personen.find((eintrag) => eintrag.id === personId) ?? null;
  // Fehlt, was eine Seite voraussetzt - etwa weil das Rad inzwischen gesperrt
  // ist -, steht die Frage davor.
  const seite: Seite = !rad
    ? 'rad'
    : abfolge.seite === 'abschluss' && !person
      ? 'person'
      : abfolge.seite;

  const eintragen = useMutation({
    mutationFn: async ({ bike, an }: { bike: Bike; an: FleetStaff }) => {
      const schritt = vorgang(bike, an, ich);
      if (schritt.art === 'eintragen') await takeKey(bike.id, schritt.holderStaffId);
      else await handOverKey(bike.id, schritt.holderStaffId);
      return meldung(bike, an, ich);
    },
    onSuccess: async (satz) => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      zurFlotte(satz);
    },
  });

  // Nichts Eingetipptes: Gewählt ist nur, was zwei Tipps wieder herstellen.
  // Der Schutz sorgt allein dafür, dass die Zurückgeste einen Schritt
  // zurückgeht, statt den Ablauf zu verlassen (BEF-175).
  const gewaehlt = kannZurueck(abfolge);
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: false,
    schrittZurueck: gewaehlt && !eintragen.isPending ? () => zurueckGehen() : undefined,
  });

  /** Zurück zur Radflotte, mit dem Satz wie bisher. */
  function zurFlotte(satz: string) {
    freigeben();
    void navigate(ZUR_FLOTTE, { state: { meldung: satz } });
  }

  function zurueckGehen() {
    eintragen.reset();
    setAbfolge((aktuell) => zurueck(aktuell) ?? aktuell);
  }

  function radGewaehlt(neu: Bike) {
    const bleibt = personNachRadwahl(neu, personId);
    eintragen.reset();
    setRadId(neu.id);
    setPersonId(bleibt);
    // Aus dem Abschluss geändert und die Person passt noch: gleich zurück dorthin.
    setAbfolge((aktuell) => weiter(aktuell, 'person', bleibt !== null));
  }

  function personGewaehlt(neu: FleetStaff) {
    eintragen.reset();
    setPersonId(neu.id);
    setAbfolge((aktuell) => weiter(aktuell, 'abschluss', true));
  }

  const nummer = schrittnummer(seite);
  const kopf = {
    objekt: rad ? `Schlüssel übergeben · ${rad.name}` : 'Schlüssel übergeben',
    schliessen: 'Übergabe abbrechen',
    // Gewählt ist nur, was zwei Tipps wieder herstellen - ✕ fragt nicht.
    onSchliessen: () => {
      freigeben();
      void navigate(ziel);
    },
    seite,
    stand: { text: schrittText(nummer, SCHRITTE), wert: nummer, von: SCHRITTE },
    onZurueck: gewaehlt && !eintragen.isPending ? zurueckGehen : undefined,
    schutz,
  };

  // Auf den Seiten mit Zeilen setzt der Ablauf kein Fokusziel auf eine
  // Antwort: Ein gehaltenes Enter liefe sonst durch die Seiten. Das Fenster
  // nimmt dann sein erstes Bedienelement.
  if (seite === 'rad') {
    return (
      <GefuehrterAblauf {...kopf} titel="Welches Rad?">
        <ListRows rahmen={false} beschriftung="Räder">
          {raeder.map((eintrag) => (
            <ListRow
              key={eintrag.id}
              titel={eintrag.name}
              meta={radZeile(eintrag, flotte)}
              status={
                eintrag.id === radId ? <StatusMark ton="positiv">Gewählt</StatusMark> : undefined
              }
              onClick={() => radGewaehlt(eintrag)}
            />
          ))}
        </ListRows>
      </GefuehrterAblauf>
    );
  }

  if (seite === 'person' || !rad || !person) {
    return (
      <GefuehrterAblauf {...kopf} titel="An wen?">
        {personen.length === 0 ? (
          <EmptyState
            title="Niemand sonst im Mitarbeiterstamm."
            description="Der Schlüssel liegt schon bei der einzigen Person."
          />
        ) : (
          <ListRows rahmen={false} beschriftung="Personen">
            {personen.map((eintrag) => (
              <ListRow
                key={eintrag.id}
                titel={personName(eintrag, ich)}
                status={
                  eintrag.id === personId ? (
                    <StatusMark ton="positiv">Gewählt</StatusMark>
                  ) : undefined
                }
                onClick={() => personGewaehlt(eintrag)}
              />
            ))}
          </ListRows>
        )}
      </GefuehrterAblauf>
    );
  }

  const schritt = vorgang(rad, person, ich);
  return (
    <GefuehrterAblauf
      {...kopf}
      titel="Alles richtig?"
      abschluss
      fuss={
        <div className="flex flex-col gap-2">
          {eintragen.isError ? (
            <Statusmeldung ton="fehler">{eintragen.error.message}</Statusmeldung>
          ) : null}
          <Button
            // Ein langer Name darf umbrechen, statt im Rand zu stehen.
            className="h-auto min-h-12 w-full py-2"
            disabled={eintragen.isPending}
            onClick={() => eintragen.mutate({ bike: rad, an: person })}
          >
            {eintragen.isPending ? schritt.laeuft : schritt.knopf}
          </Button>
        </div>
      }
    >
      <ListRows rahmen={false} beschriftung="Übergabe">
        <ListRow
          fokusbeginn
          titel="Rad"
          meta={rad.name}
          aktion={
            <Button
              variant="secondary"
              groesse="kompakt"
              aria-label="Rad ändern"
              onClick={() => setAbfolge((aktuell) => aendern(aktuell, 'rad'))}
            >
              Ändern
            </Button>
          }
        />
        {/* Woher er kommt, folgt aus dem Rad - ein anderes Rad ändert es. */}
        <ListRow titel="Von" meta={vonText(rad, ich)} />
        <ListRow
          titel="An"
          meta={personName(person, ich)}
          aktion={
            <Button
              variant="secondary"
              groesse="kompakt"
              aria-label="Person ändern"
              onClick={() => setAbfolge((aktuell) => aendern(aktuell, 'person'))}
            >
              Ändern
            </Button>
          }
        />
      </ListRows>
    </GefuehrterAblauf>
  );
}
