import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { ErrorState } from '@/components/ui/Feedback';
import { isOwner, type CurrentUser } from '@/features/session/types';
import { useVorschau } from '@/features/preview/vorschauContext';
import { vorschauId } from '@/features/preview/vorschauZustand';
import {
  radstatusLabels,
  wochentage,
  wochentagLabels,
  type Belegung,
  type Rad,
  type Radstatus,
} from '@/features/preview/types';

/**
 * Rad anlegen und bearbeiten.
 *
 * Felder und Reihenfolge folgen der Team-App-Vorlage. Zwei Unterschiede:
 * Stammnutzer und aktuelle:r Nutzer:in sind Auswahllisten aus dem
 * gemeinsamen Mitarbeiterstamm statt Freitext - Tippfehler ordnen sonst ein
 * Rad einer nicht existierenden Person zu. Und der Schlüsselcode ist an die
 * administrative Praxisrolle gebunden statt an eine PIN im Browser.
 */

const AKKUTYPEN = ['Akku Typ A', 'Akku Typ B'];

function leeresRad(depotId: string): Rad {
  return {
    id: vorschauId('rad'),
    name: '',
    stammdepotId: depotId,
    depotId,
    sonderstandort: '',
    ersatzrad: false,
    stammnutzerId: null,
    status: 'verfuegbar',
    aktuellerNutzerId: null,
    akku: '',
    schluesselcode: '',
    wochenplan: {
      mo: 'frei',
      di: 'frei',
      mi: 'frei',
      do: 'frei',
      fr: 'frei',
      sa: 'frei',
      so: 'frei',
    },
    notiz: '',
    schluesselInhaber: null,
    schluesselSeit: null,
    schluesselverlauf: [],
    pannenverlauf: [],
    checkups: [],
  };
}

export function BikeEditPage({ user }: { user: CurrentUser }) {
  const { radId } = useParams();
  const navigate = useNavigate();
  const { zustand, simuliere } = useVorschau();
  const neuAnlegen = radId === 'neu';
  const vorhanden = zustand.raeder.find((rad) => rad.id === radId);

  const [entwurf, setEntwurf] = useState<Rad>(
    () => vorhanden ?? leeresRad(zustand.depots[0]?.id ?? 'd1'),
  );

  if (!neuAnlegen && !vorhanden) {
    return (
      <>
        <PageHeader title="Rad bearbeiten" />
        <ErrorState
          title="Dieses Rad gibt es in der Vorschau nicht."
          description="Der Vorschaustand wird bei jedem Neuladen zurückgesetzt."
        />
      </>
    );
  }

  function aendere<K extends keyof Rad>(feld: K, wert: Rad[K]) {
    setEntwurf((aktuell) => ({ ...aktuell, [feld]: wert }));
  }

  function speichern() {
    simuliere(
      {
        bereich: 'Radflotte',
        vorgang: neuAnlegen
          ? `Rad angelegt: ${entwurf.name || 'ohne Namen'}`
          : `Rad geändert: ${entwurf.name}`,
        folgen: [
          'Angaben im Vorschaustand dieser Sitzung übernommen',
          entwurf.status === 'reparatur'
            ? 'Das Rad steht in der Vorschau nicht für die Planung zur Verfügung'
            : 'Das Rad steht in der Vorschau für die Planung zur Verfügung',
        ],
        nichtGeschehen: [
          'Nichts gespeichert – ein Neuladen stellt die Ausgangsdaten wieder her',
          'Keine Benachrichtigung an das Team',
        ],
      },
      (stand) => ({
        ...stand,
        raeder: neuAnlegen
          ? [...stand.raeder, entwurf]
          : stand.raeder.map((rad) => (rad.id === entwurf.id ? entwurf : rad)),
      }),
    );
    void navigate('/betrieb/flotte');
  }

  function loeschen() {
    simuliere(
      {
        bereich: 'Radflotte',
        vorgang: `Rad entfernt: ${entwurf.name}`,
        folgen: ['Aus der Vorschauliste entfernt'],
        nichtGeschehen: [
          'Nichts gelöscht – in einer echten Anbindung wäre das ein prüfpflichtiger Vorgang',
        ],
      },
      (stand) => ({ ...stand, raeder: stand.raeder.filter((rad) => rad.id !== entwurf.id) }),
    );
    void navigate('/betrieb/flotte');
  }

  const sonderstandort = entwurf.depotId === 'd3';

  return (
    <>
      <PageHeader
        title={neuAnlegen ? 'Rad hinzufügen' : 'Rad bearbeiten'}
        description={neuAnlegen ? undefined : entwurf.name}
      />

      <div className="flex max-w-xl flex-col gap-4">
        <Field
          label="Name / Kennzeichnung"
          placeholder="z. B. Lastenrad 9"
          value={entwurf.name}
          onChange={(event) => aendere('name', event.target.value)}
        />

        <Select
          label="Stammdepot"
          hint="Wo das Rad eigentlich hingehört."
          value={entwurf.stammdepotId}
          onChange={(event) => aendere('stammdepotId', event.target.value)}
        >
          {zustand.depots.map((depot) => (
            <option key={depot.id} value={depot.id}>
              {depot.name}
            </option>
          ))}
        </Select>

        <Select
          label="Aktueller Standort"
          hint="Wo das Rad gerade wirklich steht."
          value={entwurf.depotId}
          onChange={(event) => aendere('depotId', event.target.value)}
        >
          {zustand.depots.map((depot) => (
            <option key={depot.id} value={depot.id}>
              {depot.name}
            </option>
          ))}
        </Select>

        {sonderstandort ? (
          <Field
            label="Bezeichnung des Sonderstandorts"
            placeholder="z. B. Privatgarage Teamleitung"
            value={entwurf.sonderstandort}
            onChange={(event) => aendere('sonderstandort', event.target.value)}
          />
        ) : null}

        <label className="flex items-center gap-3 text-[0.9375rem]">
          <input
            type="checkbox"
            checked={entwurf.ersatzrad}
            onChange={(event) => aendere('ersatzrad', event.target.checked)}
            className="size-5"
          />
          Dies ist das Ersatzfahrrad (kein fester Stammnutzer)
        </label>

        {!entwurf.ersatzrad ? (
          <Select
            label="Stammnutzer"
            hint="Aus dem gemeinsamen Mitarbeiterstamm – keine zweite Personenliste."
            value={entwurf.stammnutzerId ?? ''}
            onChange={(event) => aendere('stammnutzerId', event.target.value || null)}
          >
            <option value="">– kein Stammnutzer –</option>
            {zustand.mitarbeitende.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        ) : null}

        <Select
          label="Status"
          value={entwurf.status}
          onChange={(event) => aendere('status', event.target.value as Radstatus)}
        >
          {(Object.keys(radstatusLabels) as Radstatus[]).map((status) => (
            <option key={status} value={status}>
              {radstatusLabels[status]}
            </option>
          ))}
        </Select>

        <Select
          label="Aktuell gefahren von"
          hint="Nur ausfüllen, wenn jemand anderes als der Stammnutzer fährt."
          value={entwurf.aktuellerNutzerId ?? ''}
          onChange={(event) => aendere('aktuellerNutzerId', event.target.value || null)}
        >
          <option value="">– Stammnutzer fährt –</option>
          {zustand.mitarbeitende.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>

        <Select
          label="Akku-Typ"
          value={entwurf.akku}
          onChange={(event) => aendere('akku', event.target.value)}
        >
          <option value="">– auswählen –</option>
          {AKKUTYPEN.map((typ) => (
            <option key={typ} value={typ}>
              {typ}
            </option>
          ))}
        </Select>

        {isOwner(user.roles) ? (
          <Field
            label="Schlüsselcode"
            hint="Für die Nachbestellung eines Ersatzschlüssels. Nur für die administrative Praxisrolle sichtbar."
            value={entwurf.schluesselcode}
            onChange={(event) => aendere('schluesselcode', event.target.value)}
          />
        ) : null}

        <fieldset className="border-line rounded-card border p-4">
          <legend className="text-ink px-1 text-sm font-medium">Wochenplan</legend>
          <p className="text-ink-subtle mb-3 text-sm">
            Wer nutzt das Rad an welchem Tag. „Frei" heißt: für andere planbar.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {wochentage.map((tag) => (
              <Select
                key={tag}
                label={wochentagLabels[tag]}
                value={entwurf.wochenplan[tag]}
                onChange={(event) =>
                  aendere('wochenplan', {
                    ...entwurf.wochenplan,
                    [tag]: event.target.value as Belegung,
                  })
                }
              >
                <option value="frei">Frei</option>
                <option value="belegt">Belegt</option>
              </Select>
            ))}
          </div>
        </fieldset>

        <TextArea
          rows={3}
          label="Notiz"
          placeholder="z. B. Reparaturdetails, Ort des Schlüssels"
          value={entwurf.notiz}
          onChange={(event) => aendere('notiz', event.target.value)}
        />

        <div className="border-line mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          {!neuAnlegen ? (
            <Button variant="secondary" onClick={loeschen}>
              Rad entfernen
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-3">
            <Link
              to="/betrieb/flotte"
              className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center text-[0.9375rem]"
            >
              Abbrechen
            </Link>
            <Button onClick={speichern} disabled={entwurf.name.trim() === ''}>
              In die Vorschau übernehmen
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
