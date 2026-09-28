import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Rueckweg } from '@/components/ui/Rueckweg';
import type { CurrentUser } from '@/features/session/types';
import {
  depotName,
  radMitStandort,
  useVorschau,
  type Protokolleintrag,
} from '@/features/preview/vorschauContext';
import { vorschauId } from '@/features/preview/vorschauZustand';
import { SimulationsMeldung } from '@/features/preview/ui';

/**
 * Schlüsselentnahme.
 *
 * Zwei Schritte wie in der Vorlage: erst das Rad, dann die Person. Der Name
 * ist mit dem angemeldeten Konto vorbelegt - in der Vorlage war er reiner
 * Freitext, was den Schlüsselstand von einer korrekten Selbstauskunft abhängig
 * machte. Änderbar bleibt er trotzdem: jemand kann den Schlüssel für eine
 * Kollegin mitnehmen.
 *
 * **Kein Rad vorgewählt (VOR-18).** Bis dahin stand das erste Rad der Liste in
 * der Auswahl - im Demostand eines mit vergebenem Schlüssel -, und der tägliche
 * Weg begann mit einer Warnung und einem Knopf, der nicht ging. Räder mit
 * vergebenem Schlüssel stehen am Ende und sagen es vorn im Text; nach einer
 * Entnahme ist die Auswahl wieder leer. Ein Rad aus der Adresszeile
 * (`?rad=`, von der Radkarte) bleibt vorgewählt.
 */
export function KeyPage({ user }: { user: CurrentUser }) {
  const { zustand, simuliere } = useVorschau();
  const [suchparameter] = useSearchParams();
  const [radId, setRadId] = useState(() => suchparameter.get('rad') ?? '');
  const [name, setName] = useState(user.profile.display_name);
  const [meldung, setMeldung] = useState<Protokolleintrag | null>(null);

  const rad = zustand.raeder.find((eintrag) => eintrag.id === radId);
  const bereitsEntnommen = Boolean(rad?.schluesselInhaber);
  // Stabil sortiert: Räder mit Schlüssel im Tresor zuerst, sonst wie in der Flotte.
  const auswahl = [...zustand.raeder].sort(
    (a, b) => Number(Boolean(a.schluesselInhaber)) - Number(Boolean(b.schluesselInhaber)),
  );

  function bestaetigen() {
    if (!rad) return;
    const eintrag = simuliere(
      {
        bereich: 'Radflotte',
        vorgang: `Schlüssel entnommen: ${rad.name}`,
        folgen: [
          `Schlüsselstand auf „bei ${name.trim()}“ gesetzt`,
          'Schlüsselverlauf des Rads ergänzt',
        ],
        nichtGeschehen: [
          'Kein Vorgang gespeichert und keine Benachrichtigung versendet',
          'Kein Zugang zu einem echten Schlüsseltresor erteilt',
        ],
      },
      (stand) => ({
        ...stand,
        raeder: stand.raeder.map((eintragRad) =>
          eintragRad.id === rad.id
            ? {
                ...eintragRad,
                schluesselInhaber: name.trim(),
                schluesselSeit: new Date().toISOString(),
                schluesselverlauf: [
                  ...eintragRad.schluesselverlauf,
                  {
                    id: vorschauId('schluessel'),
                    inhaber: name.trim(),
                    entnommen: new Date().toISOString(),
                    zurueckgelegt: null,
                  },
                ],
              }
            : eintragRad,
        ),
      }),
    );
    setMeldung(eintrag);
    setRadId('');
  }

  return (
    <>
      <Rueckweg standard="/betrieb/flotte" beschriftung="Zurück zur Radflotte" />
      <PageHeader
        title="Schlüssel entnehmen"
        description="Schlüssel für ein Rad aus dem Tresor nehmen."
      />

      <SimulationsMeldung eintrag={meldung} />

      <div className="flex max-w-md flex-col gap-4">
        <Select label="Rad" value={radId} onChange={(event) => setRadId(event.target.value)}>
          <option value="">Bitte wählen …</option>
          {auswahl.map((eintrag) => (
            <option key={eintrag.id} value={eintrag.id}>
              {eintrag.schluesselInhaber
                ? `${eintrag.name} (vergeben an ${eintrag.schluesselInhaber}) · ${depotName(zustand, eintrag, 'aktuell')}`
                : radMitStandort(zustand, eintrag)}
            </option>
          ))}
        </Select>

        {bereitsEntnommen ? (
          <p className="rounded-card border-warnung/30 bg-warnung-soft text-warnung border px-4 py-3 text-sm">
            Der Schlüssel ist bereits bei {rad?.schluesselInhaber}. Bitte erst zurücklegen lassen
            oder ein anderes Rad wählen.
          </p>
        ) : null}

        <Field
          label="Name"
          hint="Mit dem angemeldeten Konto vorbelegt. Änderbar, falls jemand den Schlüssel für eine andere Person mitnimmt."
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={bestaetigen} disabled={!rad || bereitsEntnommen || name.trim() === ''}>
            Entnahme bestätigen
          </Button>
          <Link
            to="/betrieb/flotte"
            className="text-ink-muted hover:text-ink text-liste inline-flex min-h-11 items-center"
          >
            Zurück zur Radflotte
          </Link>
        </div>
      </div>
    </>
  );
}
