import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import type { CurrentUser } from '@/features/session/types';
import { depotName, useVorschau, type Protokolleintrag } from '@/features/preview/vorschauContext';
import { vorschauId } from '@/features/preview/vorschauZustand';
import { SignaturFeld } from '@/features/preview/SignaturFeld';
import { SimulationsMeldung, VorschauBanner } from '@/features/preview/ui';
import type { Checkupbefund, Checkupbewertung } from '@/features/preview/types';

/**
 * Fahrrad-Check-Up.
 *
 * Übernommen aus der Vorlage: Radauswahl, Prüfpunkte mit drei Bewertungen,
 * Notiz je Punkt, Gesamtnotiz, Fotos, Bestätigungstext und Unterschrift.
 *
 * Die Vorlage verschickte bei Problemen eine E-Mail. Das passiert hier
 * ausdrücklich nicht - der Versandweg ist eine offene Entscheidung, und ein
 * vorgetäuschter Versand wäre schlimmer als gar keiner.
 */

const bewertungen: { wert: Checkupbewertung; label: string }[] = [
  { wert: 'ok', label: 'In Ordnung' },
  { wert: 'beobachten', label: 'Beobachten' },
  { wert: 'problem', label: 'Problem' },
];

export function CheckupPage({ user }: { user: CurrentUser }) {
  const { zustand, simuliere } = useVorschau();
  const [suchparameter] = useSearchParams();

  const [radId, setRadId] = useState(() => suchparameter.get('rad') ?? zustand.raeder[0]?.id ?? '');
  const [schritt, setSchritt] = useState<'auswahl' | 'formular'>(
    suchparameter.get('rad') ? 'formular' : 'auswahl',
  );
  const [name, setName] = useState(user.profile.display_name);
  const [befunde, setBefunde] = useState<Checkupbefund[]>(() =>
    zustand.checkupfragen.map((frage) => ({ frage, bewertung: 'ok', notiz: '' })),
  );
  const [notiz, setNotiz] = useState('');
  const [fotos, setFotos] = useState(0);
  const [unterschrieben, setUnterschrieben] = useState(false);
  const [meldung, setMeldung] = useState<Protokolleintrag | null>(null);

  const rad = zustand.raeder.find((eintrag) => eintrag.id === radId);
  const probleme = befunde.filter((befund) => befund.bewertung === 'problem');
  const beobachten = befunde.filter((befund) => befund.bewertung === 'beobachten');

  function setzeBefund(index: number, aenderung: Partial<Checkupbefund>) {
    setBefunde((aktuell) =>
      aktuell.map((befund, position) =>
        position === index ? { ...befund, ...aenderung } : befund,
      ),
    );
  }

  function speichern() {
    if (!rad) return;
    const folgen = [
      `Check-Up im Verlauf von ${rad.name} ergänzt`,
      probleme.length > 0
        ? `${probleme.length} Problem${probleme.length === 1 ? '' : 'e'} festgehalten: ${probleme.map((befund) => befund.frage).join(', ')}`
        : 'Keine Probleme festgehalten',
    ];
    if (beobachten.length > 0) {
      folgen.push(`Zu beobachten: ${beobachten.map((befund) => befund.frage).join(', ')}`);
    }

    const eintrag = simuliere(
      {
        bereich: 'Radflotte',
        vorgang: `Check-Up erfasst: ${rad.name}`,
        folgen,
        nichtGeschehen: [
          'Keine E-Mail an Werkstatt oder Praxis versendet – der Meldeweg ist noch nicht entschieden',
          'Fotos und Unterschrift verlassen diese Sitzung nicht und werden nicht gespeichert',
          probleme.length > 0
            ? 'Das Rad wurde NICHT automatisch gesperrt – dafür ist der Pannenassistent zuständig'
            : 'Kein Radstatus verändert',
        ],
      },
      (stand) => ({
        ...stand,
        raeder: stand.raeder.map((eintragRad) =>
          eintragRad.id === rad.id
            ? {
                ...eintragRad,
                checkups: [
                  ...eintragRad.checkups,
                  {
                    id: vorschauId('checkup'),
                    zeitpunkt: new Date().toISOString(),
                    geprueftVon: name.trim(),
                    befunde,
                    notiz,
                    fotos,
                    unterschrift: unterschrieben,
                  },
                ],
              }
            : eintragRad,
        ),
      }),
    );
    setMeldung(eintrag);
    setSchritt('auswahl');
  }

  return (
    <>
      <PageHeader
        title="Fahrrad-Check-Up"
        description="Sicherheitsprüfung mit Bestätigung durch die prüfende Person."
      />

      <VorschauBanner bereich="Check-Up" />
      <SimulationsMeldung eintrag={meldung} />

      {schritt === 'auswahl' ? (
        <div className="flex max-w-md flex-col gap-4">
          <p className="text-ink-muted text-sm">
            Die Nummer eines Rads steht am Sattelrohr, direkt unter dem Sattel.
          </p>
          <Select label="Rad" value={radId} onChange={(event) => setRadId(event.target.value)}>
            {zustand.raeder.map((eintrag) => (
              <option key={eintrag.id} value={eintrag.id}>
                {eintrag.name} ({depotName(zustand, eintrag, 'aktuell')})
              </option>
            ))}
          </Select>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setSchritt('formular')} disabled={!rad}>
              Weiter
            </Button>
            <Link
              to="/betrieb/flotte"
              className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center text-[0.9375rem]"
            >
              Zurück zur Radflotte
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex max-w-xl flex-col gap-5">
          <p className="text-ink text-[0.9375rem] font-medium">{rad?.name}</p>

          <Field
            label="Prüfende Person"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          <fieldset className="border-line rounded-card border p-4">
            <legend className="text-ink px-1 text-sm font-medium">Prüfpunkte</legend>
            <ul className="divide-line divide-y">
              {befunde.map((befund, index) => (
                <li key={befund.frage} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-ink text-[0.9375rem]">{befund.frage}</p>
                  <div
                    role="radiogroup"
                    aria-label={befund.frage}
                    className="mt-2 flex flex-wrap gap-2"
                  >
                    {bewertungen.map((option) => (
                      <label
                        key={option.wert}
                        className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-sm ${
                          befund.bewertung === option.wert
                            ? 'border-accent bg-accent-soft text-accent font-medium'
                            : 'border-line-strong bg-surface text-ink-muted'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`befund-${index}`}
                          className="sr-only"
                          checked={befund.bewertung === option.wert}
                          onChange={() => setzeBefund(index, { bewertung: option.wert })}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                  {befund.bewertung !== 'ok' ? (
                    <div className="mt-2">
                      <Field
                        label={`Notiz zu ${befund.frage}`}
                        placeholder="Was ist aufgefallen?"
                        value={befund.notiz}
                        onChange={(event) => setzeBefund(index, { notiz: event.target.value })}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </fieldset>

          <Textarea
            label="Notiz"
            placeholder="Weitere Auffälligkeiten"
            value={notiz}
            onChange={(event) => setNotiz(event.target.value)}
          />

          <div>
            <p className="text-ink text-sm font-medium">Fotos</p>
            <p className="text-ink-subtle mb-2 text-sm">
              In der Vorschau wird nur die Anzahl mitgeführt. Es wird nichts hochgeladen.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => setFotos((anzahl) => anzahl + 1)}>
                Foto hinzufügen
              </Button>
              {fotos > 0 ? (
                <>
                  <span className="text-ink-muted text-sm">
                    {fotos} Foto{fotos === 1 ? '' : 's'} vorgemerkt
                  </span>
                  <Button variant="quiet" onClick={() => setFotos(0)}>
                    Zurücksetzen
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <SignaturFeld
            beschriftung="Bestätigung"
            erklaerung="Ich bestätige, dass ich das gesamte Fahrrad gründlich auf Sicherheit geprüft habe."
            unterschrieben={unterschrieben}
            onChange={setUnterschrieben}
          />

          <div className="border-line flex flex-wrap items-center gap-3 border-t pt-4">
            <Button onClick={speichern} disabled={name.trim() === '' || !unterschrieben}>
              Check-Up in die Vorschau übernehmen
            </Button>
            <Button variant="quiet" onClick={() => setSchritt('auswahl')}>
              Zurück
            </Button>
          </div>
          {!unterschrieben ? (
            <p className="text-ink-subtle text-sm">
              Die Bestätigung fehlt noch. Sie können unterschreiben oder Ihren Namen tippen.
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
