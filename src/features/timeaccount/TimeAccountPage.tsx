import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Tile, TileGrid } from '@/components/ui/Tile';
import type { CurrentUser } from '@/features/session/types';
import {
  mitarbeiterName,
  useVorschau,
  type Protokolleintrag,
} from '@/features/preview/vorschauContext';
import { vorschauId } from '@/features/preview/vorschauZustand';
import { vorschauidentitaet } from '@/features/preview/identitaet';
import { Abschnitt, SimulationsMeldung } from '@/features/preview/ui';
import { formatDatum, formatStunden } from '@/features/preview/format';
import type { Buchungsart, Zeitbuchung } from '@/features/preview/types';

/**
 * Zeitkonto.
 *
 * Übernahme der Überstundenerfassung: Buchungen für geleistete und abgebaute
 * Stunden mit Datum, Begründung und laufendem Saldo je Person.
 *
 * Bewusst ein eigenes Konto und keine Ableitung aus dem Kalender: geplante
 * Behandlungsstunden sind keine tatsächlich geleistete Arbeitszeit. Eine
 * Vermischung wäre arbeitsrechtlich falsch und würde Tourendaten zur
 * Leistungskontrolle machen (PROJECT_PRINCIPLES.md 20).
 *
 * Seit Welle B (B7) Liste und Detail: je Person eine Zeile mit ihrem Saldo,
 * die Zeile öffnet ihre Buchungen (`?person=…`, dieselbe Route).
 */

/** Der Suchparameter der geöffneten Person. */
const PERSON_PARAM = 'person';

export function TimeAccountPage({ user }: { user: CurrentUser }) {
  const { zustand } = useVorschau();
  const identitaet = vorschauidentitaet(zustand, user);
  const [formular, setFormular] = useState(false);
  const [meldung, setMeldung] = useState<Protokolleintrag | null>(null);
  const [suche] = useSearchParams();
  const geoeffnet = suche.get(PERSON_PARAM);

  const saldenNachPerson = zustand.mitarbeitende.map((person) => {
    const buchungen = zustand.zeitbuchungen
      .filter((buchung) => buchung.mitarbeiterId === person.id)
      .sort((a, b) => b.datum.localeCompare(a.datum));
    const saldo = buchungen.reduce(
      (summe, buchung) =>
        summe + (buchung.art === 'geleistet' ? buchung.stunden : -buchung.stunden),
      0,
    );
    return { person, buchungen, saldo };
  });

  // Das eigene Konto steht einmal: vorn in der Liste und als „(Sie)“ markiert
  // (VOR-16). Bis dahin stand es oben über die volle Breite und in der Liste
  // ein zweites Mal. Wem es in der Vorschau gehört, sagt der Satz darüber.
  const eigeneId = identitaet?.person.id ?? null;
  const reihenfolge = [...saldenNachPerson].sort(
    (a, b) => Number(b.person.id === eigeneId) - Number(a.person.id === eigeneId),
  );

  if (formular) {
    return (
      <Buchungsformular
        user={user}
        onFertig={(eintrag) => {
          setMeldung(eintrag);
          setFormular(false);
        }}
        onAbbrechen={() => setFormular(false)}
      />
    );
  }

  const auswahl = geoeffnet
    ? saldenNachPerson.find((eintrag) => eintrag.person.id === geoeffnet)
    : undefined;
  if (geoeffnet) {
    return (
      <Personenkonto eintrag={auswahl} eigene={auswahl ? auswahl.person.id === eigeneId : false} />
    );
  }

  return (
    <>
      {/* Ohne Satz unter dem Titel (Regel 6); „Stunden eintragen“ kompakt im
          Kopf (ANN-403). */}
      <PageHeader
        title="Zeitkonto"
        actions={<Button onClick={() => setFormular(true)}>Stunden eintragen</Button>}
      />

      <SimulationsMeldung eintrag={meldung} />

      {/* Kein Saldo über alle Personen: Eine Summe fremder Zeitkonten
          bewertet niemanden und beantwortet keine Frage (UX-005i, §20). */}
      <Abschnitt
        titel="Alle Zeitkonten"
        {...(identitaet
          ? {
              beschreibung: `Ihr Zeitkonto in der Vorschau ist das von ${identitaet.person.name}${identitaet.ueberNamen ? '' : ' (Demoperson zur Rolle)'}, markiert mit „(Sie)“.`,
            }
          : {})}
      >
        <ListRows>
          {reihenfolge.map((eintrag) => (
            <ListRow
              key={eintrag.person.id}
              to={`/betrieb/zeitkonto?${PERSON_PARAM}=${encodeURIComponent(eintrag.person.id)}`}
              // Ohne Rollenzeile: Fürs Zeitkonto zählt die Person, nicht ihre
              // Rolle (UX-005i).
              titel={`${eintrag.person.name}${eintrag.person.id === eigeneId ? ' (Sie)' : ''}`}
              meta={buchungenText(eintrag.buchungen.length)}
              // Der Saldo als Zahl, ohne ✓ oder × (VOR-13): Minusstunden sind
              // keine Verfehlung, und das Zeitkonto bewertet niemanden (§20).
              status={<Badge ton="neutral">{formatStunden(eintrag.saldo)}</Badge>}
            />
          ))}
        </ListRows>
      </Abschnitt>
    </>
  );
}

/** „3 Buchungen“, „1 Buchung“, „Keine Buchungen“. */
function buchungenText(anzahl: number): string {
  if (anzahl === 0) return 'Keine Buchungen';
  return anzahl === 1 ? '1 Buchung' : `${anzahl} Buchungen`;
}

/**
 * Das Zeitkonto einer Person: Saldo und Buchungen (Welle B, B7). Dieselben
 * Angaben, die bis dahin im Aufklapper der Karte standen.
 */
function Personenkonto({
  eintrag,
  eigene,
}: {
  eintrag:
    { person: { id: string; name: string }; buchungen: Zeitbuchung[]; saldo: number } | undefined;
  eigene: boolean;
}) {
  return (
    <>
      <Rueckweg standard="/betrieb/zeitkonto" beschriftung="Zurück zu den Zeitkonten" />
      {eintrag ? (
        <>
          <PageHeader
            kicker="Zeitkonto"
            title={`${eintrag.person.name}${eigene ? ' (Sie)' : ''}`}
          />
          {/* Der Saldo als Zahl, ohne Wertung (VOR-13, §20). */}
          <TileGrid spalte="kachel">
            <Tile label="Saldo">{formatStunden(eintrag.saldo)}</Tile>
          </TileGrid>
          <div className="mt-8">
            <Listenabschnitt
              titel="Buchungen"
              anzahl={eintrag.buchungen.length}
              leer={{ titel: 'Keine Buchungen' }}
            >
              {eintrag.buchungen.map((buchung) => (
                <ListRow
                  key={buchung.id}
                  titel={formatDatum(buchung.datum)}
                  meta={buchung.grund || undefined}
                  betrag={`${buchung.art === 'geleistet' ? '+' : '−'}${buchung.stunden} h`}
                />
              ))}
            </Listenabschnitt>
          </div>
        </>
      ) : (
        <>
          <PageHeader title="Zeitkonto" />
          <EmptyState
            inKarte
            title="Diese Person gibt es in der Vorschau nicht."
            description="Der Vorschaustand wird bei jedem Neuladen zurückgesetzt. Bitte die Person in der Liste neu wählen."
          />
        </>
      )}
    </>
  );
}

function Buchungsformular({
  user,
  onFertig,
  onAbbrechen,
}: {
  user: CurrentUser;
  onFertig: (eintrag: Protokolleintrag) => void;
  onAbbrechen: () => void;
}) {
  const { zustand, simuliere } = useVorschau();
  const identitaet = vorschauidentitaet(zustand, user);

  const [mitarbeiterId, setMitarbeiterId] = useState(identitaet?.person.id ?? '');
  const [art, setArt] = useState<Buchungsart>('geleistet');
  const [datum, setDatum] = useState(zustand.stichtag);
  const [stunden, setStunden] = useState('');
  const [grund, setGrund] = useState('');

  const stundenZahl = Number(stunden.replace(',', '.'));
  const gueltig = mitarbeiterId !== '' && datum !== '' && stundenZahl > 0;

  function absenden() {
    const eintrag = simuliere(
      {
        bereich: 'Zeitkonto',
        vorgang: `${art === 'geleistet' ? 'Geleistete' : 'Abgebaute'} Stunden erfasst: ${mitarbeiterName(zustand, mitarbeiterId)}, ${stundenZahl} h`,
        folgen: [
          `Saldo in der Vorschau um ${art === 'geleistet' ? '+' : '−'}${stundenZahl} h verändert`,
        ],
        nichtGeschehen: [
          'Nichts gespeichert und keine Lohnabrechnung angestoßen',
          'Keine Verbindung zum Dienstplan oder zu Terminen hergestellt',
        ],
      },
      (stand) => ({
        ...stand,
        zeitbuchungen: [
          {
            id: vorschauId('zeit'),
            mitarbeiterId,
            art,
            datum,
            stunden: stundenZahl,
            grund,
          },
          ...stand.zeitbuchungen,
        ],
      }),
    );
    onFertig(eintrag);
  }

  return (
    <>
      <PageHeader title="Stunden eintragen" />
      <div className="max-w-formular flex flex-col gap-4">
        <Select
          label="Person"
          value={mitarbeiterId}
          onChange={(event) => setMitarbeiterId(event.target.value)}
        >
          <option value="">– auswählen –</option>
          {zustand.mitarbeitende.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>

        <Select
          label="Art der Buchung"
          value={art}
          onChange={(event) => setArt(event.target.value as Buchungsart)}
        >
          <option value="geleistet">Geleistet (Saldo steigt)</option>
          <option value="abgebaut">Abgebaut (Saldo sinkt)</option>
        </Select>

        <Field
          label="Datum"
          type="date"
          value={datum}
          onChange={(event) => setDatum(event.target.value)}
        />

        <Field
          label="Stunden"
          inputMode="decimal"
          placeholder="z. B. 2,5"
          value={stunden}
          onChange={(event) => setStunden(event.target.value)}
        />

        {/* Ein Feld, ein Name - gleich welche Art (VOR-25). */}
        <TextArea
          rows={3}
          label="Grund"
          hint="Optional."
          placeholder="z. B. Vertretung Hausbesuche"
          value={grund}
          onChange={(event) => setGrund(event.target.value)}
        />
      </div>
      <div className="max-w-formular">
        <Formularfuss>
          <Button onClick={absenden} disabled={!gueltig}>
            Buchung in die Vorschau übernehmen
          </Button>
          <Button variant="quiet" onClick={onAbbrechen}>
            Abbrechen
          </Button>
        </Formularfuss>
      </div>
    </>
  );
}
