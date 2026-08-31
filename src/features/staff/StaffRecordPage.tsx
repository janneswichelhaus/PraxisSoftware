import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { DataList, DataRow } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/Feedback';
import { useVorschau, type Protokolleintrag } from '@/features/preview/vorschauContext';
import { OffeneEntscheidung, SimulationsMeldung, VorschauBanner } from '@/features/preview/ui';
import { formatDatum } from '@/features/preview/format';
import type { Mitarbeitende, Personalkategorie } from '@/features/preview/types';

/**
 * Personalakte.
 *
 * Die geschützte Sicht auf dieselbe Person, die das Teamverzeichnis öffentlich
 * zeigt - ein Mitarbeiterstamm, zwei Sichten. Hier stehen die Angaben, die
 * nicht ins Verzeichnis gehören: Geburtsdatum, Eintritt, Urlaubsanspruch,
 * Notfallkontakt und interne Notizen.
 *
 * In der Vorlage lag all das in einer einzigen, per PIN geschützten Liste. Die
 * Trennung hier ist bewusst: der Notfallkontakt einer Kollegin ist kein
 * Teamkontakt.
 */

const kategorien: Personalkategorie[] = ['Leitung', 'Physiotherapie', 'Office'];

export function StaffRecordPage() {
  const { personId } = useParams();
  const { zustand } = useVorschau();

  if (personId) {
    const person = zustand.mitarbeitende.find((eintrag) => eintrag.id === personId);
    if (!person) {
      return (
        <>
          <PageHeader title="Personalakte" />
          <ErrorState title="Diese Person gibt es in der Vorschau nicht." />
        </>
      );
    }
    return <Personalformular person={person} />;
  }

  return (
    <>
      <PageHeader
        title="Personal"
        description="Geschützte Beschäftigtenangaben. Nicht Teil des Teamverzeichnisses."
      />

      <VorschauBanner
        bereich="Personalakte"
        beschreibung="Synthetische Personen. Es gibt noch keine Anbindung an den echten Mitarbeiterstamm und keine echte Berechtigungsprüfung auf diesen Daten."
      />

      <ul className="divide-line border-line divide-y border-y">
        {zustand.mitarbeitende.map((person) => (
          <li key={person.id}>
            <Link
              to={`/betrieb/personal/${person.id}`}
              className="hover:bg-surface-sunken flex min-h-16 items-center justify-between gap-4 py-3 transition-colors"
            >
              <span className="min-w-0">
                <span className="text-ink block truncate text-[0.9375rem] font-medium">
                  {person.name}
                </span>
                <span className="text-ink-muted mt-0.5 block text-sm">
                  {person.rolle} · im Team seit {formatDatum(person.imTeamSeit)}
                </span>
              </span>
              <Badge>{person.kategorie}</Badge>
            </Link>
          </li>
        ))}
      </ul>

      <OffeneEntscheidung titel="Aus einem Personalstammsatz wird kein Benutzerkonto">
        Ein angelegter Beschäftigtendatensatz erzeugt ausdrücklich keinen Zugang zur Plattform.
        Konten werden getrennt und ausdrücklich eingerichtet (PROJECT_PRINCIPLES.md 4.6). Wie
        Beschäftigtendaten aufbewahrt und gelöscht werden, ist Teil des Retention-Konzepts nach
        ADR-008 und noch nicht umgesetzt.
      </OffeneEntscheidung>
    </>
  );
}

function Personalformular({ person }: { person: Mitarbeitende }) {
  const { simuliere } = useVorschau();
  const [entwurf, setEntwurf] = useState<Mitarbeitende>(person);
  const [meldung, setMeldung] = useState<Protokolleintrag | null>(null);

  function aendere<K extends keyof Mitarbeitende>(feld: K, wert: Mitarbeitende[K]) {
    setEntwurf((aktuell) => ({ ...aktuell, [feld]: wert }));
  }

  function uebernehmen() {
    const eintrag = simuliere(
      {
        bereich: 'Personal',
        vorgang: `Personalangaben geändert: ${entwurf.name}`,
        folgen: [
          'Angaben im Vorschaustand übernommen',
          'Geänderter Urlaubsanspruch wirkt in der Vorschau auf die Resturlaubsberechnung',
        ],
        nichtGeschehen: [
          'Nichts gespeichert, kein Benutzerkonto angelegt oder geändert',
          'Keine Benachrichtigung an die betroffene Person',
        ],
      },
      (stand) => ({
        ...stand,
        mitarbeitende: stand.mitarbeitende.map((eintragPerson) =>
          eintragPerson.id === entwurf.id ? entwurf : eintragPerson,
        ),
      }),
    );
    setMeldung(eintrag);
  }

  return (
    <>
      <PageHeader title={person.name} description="Personalakte" />

      <VorschauBanner bereich="Personalakte" />
      <SimulationsMeldung eintrag={meldung} />

      <div className="mb-6">
        <p className="text-ink text-sm font-medium">Auch im Teamverzeichnis sichtbar</p>
        <DataList>
          <DataRow label="Name">{entwurf.name}</DataRow>
          <DataRow label="Aufgabe">{entwurf.rolle}</DataRow>
          <DataRow label="Telefon">{entwurf.telefon}</DataRow>
          <DataRow label="E-Mail">{entwurf.email}</DataRow>
        </DataList>
      </div>

      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-ink text-sm font-medium">Nur in der Personalakte</p>

        <Field
          label="Name"
          value={entwurf.name}
          onChange={(event) => aendere('name', event.target.value)}
        />
        <Field
          label="Rolle / Position"
          placeholder="z. B. Physiotherapeutin, Praxismanagement"
          value={entwurf.rolle}
          onChange={(event) => aendere('rolle', event.target.value)}
        />
        <Select
          label="Kategorie"
          hint="Gruppierung in Verzeichnis und Listen."
          value={entwurf.kategorie}
          onChange={(event) => aendere('kategorie', event.target.value as Personalkategorie)}
        >
          {kategorien.map((kategorie) => (
            <option key={kategorie} value={kategorie}>
              {kategorie}
            </option>
          ))}
        </Select>
        <Select
          label="Erfahrungsstufe"
          hint="Optional, für die Therapieplanung."
          value={entwurf.stufe}
          onChange={(event) => aendere('stufe', event.target.value as Mitarbeitende['stufe'])}
        >
          <option value="">– keine Angabe –</option>
          <option value="Senior">Senior</option>
          <option value="Junior">Junior</option>
        </Select>
        <Field
          label="Telefon"
          value={entwurf.telefon}
          onChange={(event) => aendere('telefon', event.target.value)}
        />
        <Field
          label="E-Mail"
          type="email"
          value={entwurf.email}
          onChange={(event) => aendere('email', event.target.value)}
        />
        <Field
          label="Geburtstag"
          type="date"
          value={entwurf.geburtstag}
          onChange={(event) => aendere('geburtstag', event.target.value)}
        />
        <Field
          label="Im Team seit"
          type="date"
          value={entwurf.imTeamSeit}
          onChange={(event) => aendere('imTeamSeit', event.target.value)}
        />
        <Field
          label="Urlaubstage pro Jahr"
          type="number"
          inputMode="numeric"
          value={String(entwurf.urlaubsanspruch)}
          onChange={(event) => aendere('urlaubsanspruch', Number(event.target.value) || 0)}
        />
        <Field
          label="Resturlaub aus dem Vorjahr"
          type="number"
          inputMode="numeric"
          value={String(entwurf.resturlaubVorjahr)}
          onChange={(event) => aendere('resturlaubVorjahr', Number(event.target.value) || 0)}
        />
        <Field
          label="Notfallkontakt – Name"
          value={entwurf.notfallkontaktName}
          onChange={(event) => aendere('notfallkontaktName', event.target.value)}
        />
        <Field
          label="Notfallkontakt – Telefon"
          value={entwurf.notfallkontaktTelefon}
          onChange={(event) => aendere('notfallkontaktTelefon', event.target.value)}
        />
        <Textarea
          label="Notiz"
          placeholder="z. B. Erreichbarkeit, Zuständigkeit"
          value={entwurf.notiz}
          onChange={(event) => aendere('notiz', event.target.value)}
        />

        <div className="border-line flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={uebernehmen}>In die Vorschau übernehmen</Button>
          <Link
            to="/betrieb/personal"
            className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center text-[0.9375rem]"
          >
            Zurück zur Liste
          </Link>
        </div>
      </div>
    </>
  );
}
