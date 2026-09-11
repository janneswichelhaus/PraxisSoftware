import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Badge } from '@/components/ui/Badge';
import { aktiveStandortvorlage } from '@/features/preview/standortvorlage';
import { depotName, useVorschau, type Protokolleintrag } from '@/features/preview/vorschauContext';
import { vorschauId } from '@/features/preview/vorschauZustand';
import { SimulationsMeldung, VorschauBanner } from '@/features/preview/ui';
import {
  ablaufStarten,
  abschluss,
  antworten,
  frage,
  gehe,
  kannZurueck,
  zurueck,
  zusammenfassungspunkte,
  type Ablaufzustand,
  type Abschlussart,
  type SchrittId,
} from './pannenablauf';

/**
 * Pannenassistent.
 *
 * Die Schrittfolge stammt unverändert aus der Team-App-Vorlage
 * (`pannenablauf.ts`). Standortabhängige Angaben - Werkstatt, Ruhetag, Depot,
 * Transportoptionen, Zuständigkeiten - kommen aus der Standortvorlage und
 * sind hier nirgends fest verdrahtet.
 *
 * Der Ablauf verändert in der Vorschau den Radstatus und schreibt einen
 * Eintrag in den Pannenverlauf. Er versendet nichts: keine E-Mail, keine
 * Push-Nachricht, keine Meldung an eine Werkstatt.
 */

const wochentagNamen = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];

function Hinweiskasten({
  ton = 'info',
  children,
}: {
  ton?: 'info' | 'warnung';
  children: ReactNode;
}) {
  const klassen =
    ton === 'warnung'
      ? 'border-warnung/30 bg-warnung-soft text-warnung'
      : 'border-accent/25 bg-accent-soft text-accent';
  return <div className={`rounded-card mb-4 border px-4 py-3 text-sm ${klassen}`}>{children}</div>;
}

export function BreakdownPage() {
  const { zustand: vorschau, simuliere } = useVorschau();
  const [suchparameter] = useSearchParams();
  const vorlage = aktiveStandortvorlage;

  const vorgabeRad = suchparameter.get('rad');
  const [ablauf, setAblauf] = useState<Ablaufzustand>(() =>
    ablaufStarten(vorgabeRad, vorschau.raeder[0]?.id ?? null),
  );
  const [ergebnis, setErgebnis] = useState<Protokolleintrag | null>(null);

  const rad = vorschau.raeder.find((eintrag) => eintrag.id === ablauf.radId);
  const ersatzrad = vorschau.raeder.find((eintrag) => eintrag.ersatzrad)?.name ?? 'das Ersatzrad';
  const kontext = { vorlage, ersatzrad, zustand: ablauf };

  function weiter(ziel: SchrittId) {
    setAblauf((aktuell) => gehe(aktuell, ziel));
  }

  function beenden(art: Abschlussart) {
    const ergebnisAbschluss = abschluss(art, kontext);
    const radName = rad?.name ?? 'das Rad';
    const eintrag = simuliere(
      {
        bereich: 'Radflotte',
        vorgang: `Panne gemeldet: ${radName}`,
        folgen: [
          `Pannenverlauf ergänzt: ${ergebnisAbschluss.text}`,
          ergebnisAbschluss.sperrt
            ? `${radName} in der Vorschau als „In Reparatur" markiert – das Rad steht in der Planung nicht mehr zur Verfügung`
            : `${radName} bleibt nutzbar – die Meldung sperrt es nicht`,
        ],
        nichtGeschehen: [
          'Keine Benachrichtigung an Werkstatt, Teamleitung oder Praxismanagement versendet',
          'Keine Termine abgesagt oder verschoben',
          'Keine Ersatzradzuordnung geändert',
        ],
      },
      (stand) => ({
        ...stand,
        raeder: stand.raeder.map((eintragRad) =>
          eintragRad.id === ablauf.radId
            ? {
                ...eintragRad,
                status: ergebnisAbschluss.sperrt ? 'reparatur' : eintragRad.status,
                pannenverlauf: [
                  ...eintragRad.pannenverlauf,
                  {
                    id: vorschauId('panne'),
                    zeitpunkt: new Date().toISOString(),
                    text: ergebnisAbschluss.text,
                    gesperrt: ergebnisAbschluss.sperrt,
                  },
                ],
              }
            : eintragRad,
        ),
      }),
    );
    setErgebnis(eintrag);
  }

  if (ergebnis) {
    return (
      <>
        <PageHeader title="Panne melden" description="Meldung abgeschlossen." />
        <SimulationsMeldung eintrag={ergebnis} />
        <div className="flex flex-wrap gap-3">
          <Link
            to="/betrieb/flotte"
            className="bg-accent hover:bg-accent-hover rounded-button inline-flex min-h-11 items-center justify-center px-4 text-[0.9375rem] font-medium text-white transition-colors"
          >
            Zurück zur Radflotte
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              setErgebnis(null);
              setAblauf(ablaufStarten(null, vorschau.raeder[0]?.id ?? null));
            }}
          >
            Weitere Panne melden
          </Button>
        </div>
      </>
    );
  }

  const auswahl = antworten(ablauf.schritt);

  return (
    <>
      <PageHeader title="Panne melden" description={rad ? rad.name : 'Rad noch nicht ausgewählt'} />

      <VorschauBanner
        bereich="Pannenassistent"
        beschreibung="Der Ablauf ändert nur den Vorschaustand. Es wird niemand benachrichtigt."
      />

      <div className="rounded-card border-line bg-surface max-w-xl border p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge ton="warnung">{vorlage.herkunft}-Vorlage</Badge>
          <span className="text-ink-subtle text-sm">{vorlage.pruefhinweis}</span>
        </div>

        <h2 className="text-ink mb-4 text-[1.0625rem] font-semibold">
          {frage(ablauf.schritt, vorlage)}
        </h2>

        <Schrittinhalt
          ablauf={ablauf}
          setAblauf={setAblauf}
          weiter={weiter}
          beenden={beenden}
          punkte={zusammenfassungspunkte(kontext)}
        />

        {auswahl.length > 0 ? (
          <div className="flex flex-col gap-2">
            {auswahl.map((antwort) => (
              <Button
                key={antwort.label}
                variant="secondary"
                className="justify-start"
                onClick={() => weiter(antwort.ziel)}
              >
                {antwort.label}
              </Button>
            ))}
            {/* Antworten, die direkt zu einem Abschluss oder in einen anderen
                Zweig führen, stehen bewusst neben der Tabelle. */}
            {ablauf.schritt === 'werkstattVorOrt' ? (
              <Button
                variant="secondary"
                className="justify-start"
                onClick={() => beenden('lokalNichtMoeglich')}
              >
                Nein
              </Button>
            ) : null}
            {ablauf.schritt === 'fuehrerschein' ? (
              <Button
                variant="secondary"
                className="justify-start"
                onClick={() => {
                  setAblauf((aktuell) =>
                    gehe({ ...aktuell, transport: 'fahrdienst' }, 'zusammenfassung'),
                  );
                }}
              >
                Nein
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="border-line mt-6 flex flex-wrap gap-3 border-t pt-4">
          <Link
            to="/betrieb/flotte"
            className="text-ink-muted hover:text-ink inline-flex min-h-11 items-center text-[0.9375rem]"
          >
            Abbrechen
          </Link>
          {kannZurueck(ablauf) ? (
            <Button variant="quiet" onClick={() => setAblauf((aktuell) => zurueck(aktuell))}>
              ← Zurück
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// Inhalt je Schritt
// -----------------------------------------------------------------------------

function Schrittinhalt({
  ablauf,
  setAblauf,
  weiter,
  beenden,
  punkte,
}: {
  ablauf: Ablaufzustand;
  setAblauf: (aktualisierung: (aktuell: Ablaufzustand) => Ablaufzustand) => void;
  weiter: (ziel: SchrittId) => void;
  beenden: (art: Abschlussart) => void;
  punkte: string[];
}) {
  const { zustand: vorschau } = useVorschau();
  const vorlage = aktiveStandortvorlage;
  const ersatzrad = vorschau.raeder.find((rad) => rad.ersatzrad)?.name ?? 'das Ersatzrad';
  const heuteName = wochentagNamen[new Date().getDay()] ?? '';

  switch (ablauf.schritt) {
    case 'radwahl':
      return (
        <div className="mb-4 flex flex-col gap-4">
          <Select
            label="Rad"
            value={ablauf.radId ?? ''}
            onChange={(event) =>
              setAblauf((aktuell) => ({ ...aktuell, radId: event.target.value }))
            }
          >
            {vorschau.raeder.map((rad) => (
              <option key={rad.id} value={rad.id}>
                {rad.name} ({depotName(vorschau, rad, 'aktuell')})
              </option>
            ))}
          </Select>
          <div>
            <Button onClick={() => weiter('weiterfahrt')} disabled={!ablauf.radId}>
              Weiter
            </Button>
          </div>
        </div>
      );

    case 'weiterfahrtMoeglich':
      return (
        <div className="mb-4 flex flex-col gap-4">
          <TextArea
            rows={3}
            label="Was ist auffällig?"
            placeholder="z. B. Klingel klemmt, Licht flackert"
            value={ablauf.freitext}
            onChange={(event) =>
              setAblauf((aktuell) => ({ ...aktuell, freitext: event.target.value }))
            }
          />
          <div>
            <Button
              onClick={() => beenden('meldungOhneSperre')}
              disabled={ablauf.freitext.trim() === ''}
            >
              Melden
            </Button>
          </div>
          <p className="text-ink-muted text-sm">
            Diese Meldung sperrt das Rad nicht. Es bleibt in der Planung verfügbar.
          </p>
        </div>
      );

    case 'schadensgroesse':
      return (
        <p className="text-ink-muted mb-4 text-sm">
          Klein: Reifen, Gangschaltung. Groß: Elektronik, Kettenriss, Ausfall beider Bremsen.
        </p>
      );

    case 'werkstattReparieren':
      return (
        <div className="mb-4">
          <Hinweiskasten>Rad bitte vor Ort reparieren lassen.</Hinweiskasten>
          <p className="text-ink mb-4 text-[0.9375rem]">
            Behandlung, die nicht mehr zu schaffen ist, telefonisch absagen. Eintrag im Kalender und
            kurze Information an Praxismanagement und {vorlage.zustaendigeRolle}.
          </p>
          <Button onClick={() => beenden('lokalRepariert')}>
            Erledigt – Rad als „In Reparatur" markieren
          </Button>
        </div>
      );

    case 'ruhetag':
      return (
        <p className="text-ink-muted mb-4 text-sm">
          {vorlage.werkstatt.name} hat {vorlage.werkstatt.ruhetag}s geschlossen.
          {heuteName ? ` Heute ist ${heuteName}.` : ''}
        </p>
      );

    case 'depotBringen':
      return (
        <div className="mb-4">
          <Hinweiskasten>
            {vorlage.depot.bezeichnung}: {vorlage.depot.zugangHinweis}
          </Hinweiskasten>
          <p className="text-ink mb-2 text-[0.9375rem]">
            {vorlage.zustaendigeRolle} kurz über den Schaden informieren, damit die Reparatur
            koordiniert werden kann.
          </p>
          <p className="text-ink mb-4 text-[0.9375rem]">
            Bis auf Weiteres bitte <strong>{ersatzrad}</strong> nutzen – so lange, bis das defekte
            Rad wieder freigegeben ist.
          </p>
          <Button onClick={() => beenden('depotAbgestellt')}>
            Rad als „In Reparatur" markieren
          </Button>
        </div>
      );

    case 'radZuruecklassen':
      return (
        <div className="mb-4 flex flex-col gap-4">
          <Field
            label="Standort / Adresse"
            placeholder="Wo genau steht das Rad?"
            value={ablauf.standort}
            onChange={(event) =>
              setAblauf((aktuell) => ({ ...aktuell, standort: event.target.value }))
            }
          />
          <Hinweiskasten>
            Standort telefonisch an {vorlage.werkstatt.name} durchgeben.
            <br />
            Telefon: {vorlage.werkstatt.telefon} · Mobil: {vorlage.werkstatt.mobil}
          </Hinweiskasten>
          <p className="text-ink text-[0.9375rem]">
            Zusätzlich kurze Nachricht an die {vorlage.zustaendigeRolle} über {vorlage.meldeweg}.
          </p>
          <p className="text-ink text-[0.9375rem]">
            {vorlage.mitnehmen.join(' und ')} vom Rad entfernen und mitnehmen. Rad an einem festen
            Gegenstand anketten.
          </p>
          <div>
            <Button
              onClick={() =>
                setAblauf((aktuell) =>
                  gehe({ ...aktuell, herkunft: 'zuruecklassen' }, 'fuehrerschein'),
                )
              }
            >
              Weiter
            </Button>
          </div>
        </div>
      );

    case 'fahrzeugErreichbar':
      return (
        <div className="mb-4 flex flex-col gap-2">
          <Button
            variant="secondary"
            className="justify-start"
            onClick={() =>
              setAblauf((aktuell) =>
                gehe({ ...aktuell, transport: 'carsharing' }, 'zusammenfassung'),
              )
            }
          >
            Ja
          </Button>
          <Button
            variant="secondary"
            className="justify-start"
            onClick={() =>
              setAblauf((aktuell) =>
                gehe({ ...aktuell, transport: 'fahrdienst' }, 'zusammenfassung'),
              )
            }
          >
            Nein
          </Button>
        </div>
      );

    case 'zusammenfassung':
      return (
        <div className="mb-4">
          <ul className="text-ink mb-4 list-disc space-y-1 pl-5 text-[0.9375rem]">
            {punkte.map((punkt) => (
              <li key={punkt}>{punkt}</li>
            ))}
          </ul>
          <Button onClick={() => beenden('transportFortsetzung')}>
            Bestätigen – Rad als „In Reparatur" markieren
          </Button>
        </div>
      );

    case 'vertragswerkstattKontakt':
      return (
        <div className="mb-4">
          <p className="text-ink mb-3 text-[0.9375rem]">
            Kontakt zu {vorlage.werkstatt.name} aufnehmen: Bescheid geben, dass Sie aus der Praxis
            kommen und in etwa 15 Minuten mit einem Schaden vorbeikommen.
          </p>
          <Hinweiskasten>
            {vorlage.werkstatt.name}
            <br />
            Telefon: {vorlage.werkstatt.telefon} · Mobil: {vorlage.werkstatt.mobil}
          </Hinweiskasten>
        </div>
      );

    case 'vertragswerkstattReparieren':
      return (
        <div className="mb-4">
          <Hinweiskasten>Reparatur durchführen lassen.</Hinweiskasten>
          <Button onClick={() => beenden('vertragswerkstattRepariert')}>
            Erledigt – Rad als „In Reparatur" markieren
          </Button>
        </div>
      );

    case 'vertragswerkstattUebergabe':
      return (
        <div className="mb-4">
          <p className="text-ink mb-2 text-[0.9375rem]">
            {vorlage.zustaendigeRolle} Bescheid geben.
          </p>
          <p className="text-ink mb-4 text-[0.9375rem]">
            Am nächsten Werktag <strong>{ersatzrad}</strong> nutzen, so lange, bis das andere Rad
            wieder freigegeben ist.
          </p>
          <Button
            onClick={() =>
              setAblauf((aktuell) => gehe({ ...aktuell, herkunft: 'uebergabe' }, 'fuehrerschein'))
            }
          >
            Weiter
          </Button>
        </div>
      );

    default:
      return null;
  }
}
