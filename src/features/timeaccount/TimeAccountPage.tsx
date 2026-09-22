import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Badge } from '@/components/ui/Badge';
import { Card, CardGrid, Disclosure } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
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
 */

export function TimeAccountPage({ user }: { user: CurrentUser }) {
  const { zustand } = useVorschau();
  const identitaet = vorschauidentitaet(zustand, user);
  const [formular, setFormular] = useState(false);
  const [meldung, setMeldung] = useState<Protokolleintrag | null>(null);

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

  const gesamt = saldenNachPerson.reduce((summe, eintrag) => summe + eintrag.saldo, 0);

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

  return (
    <>
      <PageHeader
        title="Zeitkonto"
        description="Geleistete und abgebaute Stunden mit laufendem Saldo."
        actions={<Button onClick={() => setFormular(true)}>Stunden eintragen</Button>}
      />

      <SimulationsMeldung eintrag={meldung} />

      <p className="text-ink-muted mb-4 text-sm">
        Saldo über alle Personen: <strong className="text-ink">{formatStunden(gesamt)}</strong>
      </p>

      {identitaet ? (
        <Abschnitt
          titel="Mein Zeitkonto"
          beschreibung={`Buchungen von ${identitaet.person.name}${identitaet.ueberNamen ? '' : ' (Demoperson zur Rolle)'}.`}
        >
          {(() => {
            const eintrag = saldenNachPerson.find(
              (kandidat) => kandidat.person.id === identitaet.person.id,
            );
            if (!eintrag) return <EmptyState title="Keine Buchungen" />;
            return <Personenkarte {...eintrag} />;
          })()}
        </Abschnitt>
      ) : null}

      <Abschnitt titel="Alle Zeitkonten">
        <CardGrid>
          {saldenNachPerson.map((eintrag) => (
            <Personenkarte key={eintrag.person.id} {...eintrag} />
          ))}
        </CardGrid>
      </Abschnitt>
    </>
  );
}

function Personenkarte({
  person,
  buchungen,
  saldo,
}: {
  person: { id: string; name: string; rolle: string };
  buchungen: Zeitbuchung[];
  saldo: number;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink truncate text-[0.9375rem] font-semibold">{person.name}</p>
          <p className="text-ink-muted mt-0.5 text-sm">{person.rolle}</p>
        </div>
        <Badge ton={saldo >= 0 ? 'positiv' : 'kritisch'}>{formatStunden(saldo)}</Badge>
      </div>
      <p className="text-ink-muted mt-2 text-sm">
        {buchungen.length} Buchung{buchungen.length === 1 ? '' : 'en'}
      </p>
      {buchungen.length > 0 ? (
        <Disclosure summary="Buchungen anzeigen">
          <ul className="divide-line divide-y text-sm">
            {buchungen.map((buchung) => (
              <li key={buchung.id} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="text-ink block">{formatDatum(buchung.datum)}</span>
                  {buchung.grund ? (
                    <span className="text-ink-muted block text-sm">{buchung.grund}</span>
                  ) : null}
                </span>
                <span
                  className={`shrink-0 font-medium ${buchung.art === 'geleistet' ? 'text-positiv' : 'text-ink-muted'}`}
                >
                  {buchung.art === 'geleistet' ? '+' : '−'}
                  {buchung.stunden} h
                </span>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </Card>
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
      <div className="flex max-w-xl flex-col gap-4">
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

        <TextArea
          rows={3}
          label={art === 'geleistet' ? 'Grund' : 'Notiz'}
          hint="Optional."
          placeholder="z. B. Vertretung Hausbesuche"
          value={grund}
          onChange={(event) => setGrund(event.target.value)}
        />

        <div className="border-line flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={absenden} disabled={!gueltig}>
            Buchung in die Vorschau übernehmen
          </Button>
          <Button variant="quiet" onClick={onAbbrechen}>
            Abbrechen
          </Button>
        </div>
      </div>
    </>
  );
}
