import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import type { CurrentUser } from '@/features/session/types';
import { depotName, useVorschau, type Protokolleintrag } from '@/features/preview/vorschauContext';
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
 */
export function KeyPage({ user }: { user: CurrentUser }) {
  const { zustand, simuliere } = useVorschau();
  const [suchparameter] = useSearchParams();
  const [radId, setRadId] = useState(() => suchparameter.get('rad') ?? zustand.raeder[0]?.id ?? '');
  const [name, setName] = useState(user.profile.display_name);
  const [meldung, setMeldung] = useState<Protokolleintrag | null>(null);

  const rad = zustand.raeder.find((eintrag) => eintrag.id === radId);
  const bereitsEntnommen = Boolean(rad?.schluesselInhaber);

  function bestaetigen() {
    if (!rad) return;
    const eintrag = simuliere(
      {
        bereich: 'Radflotte',
        vorgang: `Schlüssel entnommen: ${rad.name}`,
        folgen: [
          `Schlüsselstand auf „bei ${name.trim()}" gesetzt`,
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
  }

  return (
    <>
      <PageHeader title="Schlüssel entnehmen" description="Wer hat gerade welchen Schlüssel." />

      <SimulationsMeldung eintrag={meldung} />

      <div className="flex max-w-md flex-col gap-4">
        <Select label="Rad" value={radId} onChange={(event) => setRadId(event.target.value)}>
          {zustand.raeder.map((eintrag) => (
            <option key={eintrag.id} value={eintrag.id}>
              {eintrag.name} ({depotName(zustand, eintrag, 'aktuell')})
              {eintrag.schluesselInhaber ? ' – Schlüssel entnommen' : ''}
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
            className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center text-[0.9375rem]"
          >
            Zurück zur Radflotte
          </Link>
        </div>
      </div>
    </>
  );
}
