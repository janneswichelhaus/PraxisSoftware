import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Badge } from '@/components/ui/Badge';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { aktiveStandortvorlage } from '@/features/preview/standortvorlage';
import {
  radMitStandort,
  useVorschau,
  type Protokolleintrag,
} from '@/features/preview/vorschauContext';
import { vorschauId } from '@/features/preview/vorschauZustand';
import { SimulationsMeldung } from '@/features/preview/ui';
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

/**
 * Ein Hinweis im Schritt als Zeile auf Fläche, ohne Rahmen (Leitfaden L2:
 * Meldungen sind Zeilen).
 */
function Hinweiskasten({
  ton = 'info',
  children,
}: {
  ton?: 'info' | 'warnung';
  children: ReactNode;
}) {
  const klassen = ton === 'warnung' ? 'bg-warnung-soft text-warnung' : 'bg-accent-soft text-accent';
  return <div className={`rounded-card mb-4 px-4 py-3 text-sm ${klassen}`}>{children}</div>;
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
            ? `${radName} in der Vorschau als „In Reparatur“ markiert – das Rad steht in der Planung nicht mehr zur Verfügung`
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
        <Rueckweg standard="/betrieb/flotte" beschriftung="Zurück zur Radflotte" />
        <PageHeader title="Panne melden" description="Meldung abgeschlossen." />
        <SimulationsMeldung eintrag={ergebnis} />
        <div className="max-w-formular">
          <Formularfuss>
            {/* Seitenwechsel als ButtonLink statt eigener Klassenkette (VOR-12). */}
            <ButtonLink to="/betrieb/flotte">Zurück zur Radflotte</ButtonLink>
            <Button
              variant="secondary"
              onClick={() => {
                setErgebnis(null);
                setAblauf(ablaufStarten(null, vorschau.raeder[0]?.id ?? null));
              }}
            >
              Weitere Panne melden
            </Button>
          </Formularfuss>
        </div>
      </>
    );
  }

  const auswahl = antworten(ablauf.schritt);
  const hauptknopf = hauptaktion(ablauf, setAblauf, weiter, beenden);

  return (
    <>
      <Rueckweg standard="/betrieb/flotte" beschriftung="Zurück zur Radflotte" />
      {/* Eine Frage je Schritt, und die Frage ist der Titel (Welle B): Der
          Vorgang und das Rad stehen als Zeile darüber. Solange das Rad
          gewählt wird, ist keines gewählt - auch wenn die Auswahl eines
          vorbelegt (VOR-18). Bis dahin stand der Ablauf als Karte mit
          eigener Überschrift unter dem Seitentitel. */}
      <PageHeader
        kicker={
          rad && ablauf.schritt !== 'radwahl'
            ? `Panne melden · ${rad.name}`
            : 'Panne melden · Rad noch nicht ausgewählt'
        }
        title={frage(ablauf.schritt, vorlage)}
      />

      <div className="max-w-formular">
        {/* Herkunft als Abzeichen und ein kurzer Satz in einer Zeile (R2-O1);
            die ganze Erklärung steht bei den Einstellungen der Radflotte. */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Badge ton="warnung">{vorlage.herkunft}-Vorlage</Badge>
          <span className="text-ink-muted text-sm">Für Tübingen noch zu prüfen.</span>
        </div>

        <Schrittinhalt
          ablauf={ablauf}
          setAblauf={setAblauf}
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

        {/* Der Hauptknopf des Schritts, dann leise ein Schritt zurück oder
            ganz abbrechen - als Formularfuß, am Telefon untereinander in
            voller Breite (R2-O1; bis dahin ein halber Knopf mitten im
            Schritt und „Abbrechen“ abgesetzt unter einer Linie). */}
        <Formularfuss
          zusatz={
            ablauf.schritt === 'weiterfahrtMoeglich'
              ? 'Die Meldung sperrt das Rad nicht; es bleibt in der Planung.'
              : undefined
          }
        >
          {hauptknopf}
          {kannZurueck(ablauf) ? (
            <Button variant="quiet" onClick={() => setAblauf((aktuell) => zurueck(aktuell))}>
              ← Zurück
            </Button>
          ) : null}
          <ButtonLink to="/betrieb/flotte" variant="quiet">
            Abbrechen
          </ButtonLink>
        </Formularfuss>
      </div>
    </>
  );
}

/**
 * Der Hauptknopf eines Schritts, wenn er einen hat - Schritte mit Antworten
 * („Ja“, „Nein“, „Klein“, „Groß“) haben keinen, dort ist jede Antwort ein
 * Knopf. Getrennt vom Inhalt, damit er im Formularfuß steht.
 */
function hauptaktion(
  ablauf: Ablaufzustand,
  setAblauf: (aktualisierung: (aktuell: Ablaufzustand) => Ablaufzustand) => void,
  weiter: (ziel: SchrittId) => void,
  beenden: (art: Abschlussart) => void,
): ReactNode {
  switch (ablauf.schritt) {
    case 'radwahl':
      return (
        <Button onClick={() => weiter('weiterfahrt')} disabled={!ablauf.radId}>
          Weiter
        </Button>
      );
    case 'weiterfahrtMoeglich':
      return (
        <Button
          onClick={() => beenden('meldungOhneSperre')}
          disabled={ablauf.freitext.trim() === ''}
        >
          Melden
        </Button>
      );
    case 'werkstattReparieren':
      return (
        <Button onClick={() => beenden('lokalRepariert')}>
          Erledigt – Rad als „In Reparatur“ markieren
        </Button>
      );
    case 'depotBringen':
      return (
        <Button onClick={() => beenden('depotAbgestellt')}>Rad als „In Reparatur“ markieren</Button>
      );
    case 'radZuruecklassen':
      return (
        <Button
          onClick={() =>
            setAblauf((aktuell) => gehe({ ...aktuell, herkunft: 'zuruecklassen' }, 'fuehrerschein'))
          }
        >
          Weiter
        </Button>
      );
    case 'zusammenfassung':
      return (
        <Button onClick={() => beenden('transportFortsetzung')}>
          Bestätigen – Rad als „In Reparatur“ markieren
        </Button>
      );
    case 'vertragswerkstattReparieren':
      return (
        <Button onClick={() => beenden('vertragswerkstattRepariert')}>
          Erledigt – Rad als „In Reparatur“ markieren
        </Button>
      );
    case 'vertragswerkstattUebergabe':
      return (
        <Button
          onClick={() =>
            setAblauf((aktuell) => gehe({ ...aktuell, herkunft: 'uebergabe' }, 'fuehrerschein'))
          }
        >
          Weiter
        </Button>
      );
    default:
      return null;
  }
}

// -----------------------------------------------------------------------------
// Inhalt je Schritt
// -----------------------------------------------------------------------------

function Schrittinhalt({
  ablauf,
  setAblauf,
  punkte,
}: {
  ablauf: Ablaufzustand;
  setAblauf: (aktualisierung: (aktuell: Ablaufzustand) => Ablaufzustand) => void;
  punkte: string[];
}) {
  const { zustand: vorschau } = useVorschau();
  const vorlage = aktiveStandortvorlage;
  const ersatzrad = vorschau.raeder.find((rad) => rad.ersatzrad)?.name ?? 'das Ersatzrad';
  const heuteName = wochentagNamen[new Date().getDay()] ?? '';

  switch (ablauf.schritt) {
    case 'radwahl':
      return (
        <Select
          label="Rad"
          value={ablauf.radId ?? ''}
          onChange={(event) => setAblauf((aktuell) => ({ ...aktuell, radId: event.target.value }))}
        >
          {vorschau.raeder.map((rad) => (
            <option key={rad.id} value={rad.id}>
              {radMitStandort(vorschau, rad)}
            </option>
          ))}
        </Select>
      );

    case 'weiterfahrtMoeglich':
      return (
        <TextArea
          rows={3}
          label="Was ist auffällig?"
          placeholder="z. B. Klingel klemmt, Licht flackert"
          value={ablauf.freitext}
          onChange={(event) =>
            setAblauf((aktuell) => ({ ...aktuell, freitext: event.target.value }))
          }
        />
      );

    case 'schadensgroesse':
      return (
        <p className="text-ink-muted mb-4 text-sm">
          Klein: Reifen, Gangschaltung. Groß: Elektronik, Kettenriss, Ausfall beider Bremsen.
        </p>
      );

    case 'werkstattReparieren':
      return (
        <div>
          <Hinweiskasten>Rad bitte vor Ort reparieren lassen.</Hinweiskasten>
          <p className="text-ink text-liste">
            Behandlung, die nicht mehr zu schaffen ist, telefonisch absagen. Eintrag im Kalender und
            kurze Information an Praxismanagement und {vorlage.zustaendigeRolle}.
          </p>
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
        <div>
          <Hinweiskasten>
            {vorlage.depot.bezeichnung}: {vorlage.depot.zugangHinweis}
          </Hinweiskasten>
          <p className="text-ink text-liste mb-2">
            {vorlage.zustaendigeRolle} kurz über den Schaden informieren, damit die Reparatur
            koordiniert werden kann.
          </p>
          <p className="text-ink text-liste">
            Bis auf Weiteres bitte <strong>{ersatzrad}</strong> nutzen – so lange, bis das defekte
            Rad wieder freigegeben ist.
          </p>
        </div>
      );

    case 'radZuruecklassen':
      return (
        <div className="flex flex-col gap-4">
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
          <p className="text-ink text-liste">
            Zusätzlich kurze Nachricht an die {vorlage.zustaendigeRolle} über {vorlage.meldeweg}.
          </p>
          <p className="text-ink text-liste">
            {vorlage.mitnehmen.join(' und ')} vom Rad entfernen und mitnehmen. Rad an einem festen
            Gegenstand anketten.
          </p>
        </div>
      );

    case 'fahrzeugErreichbar':
      return (
        <div className="flex flex-col gap-2">
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
        <ul className="text-ink text-liste list-disc space-y-1 pl-5">
          {punkte.map((punkt) => (
            <li key={punkt}>{punkt}</li>
          ))}
        </ul>
      );

    case 'vertragswerkstattKontakt':
      return (
        <div>
          <p className="text-ink text-liste mb-3">
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
      return <Hinweiskasten>Reparatur durchführen lassen.</Hinweiskasten>;

    case 'vertragswerkstattUebergabe':
      return (
        <div>
          <p className="text-ink text-liste mb-2">{vorlage.zustaendigeRolle} Bescheid geben.</p>
          <p className="text-ink text-liste">
            Am nächsten Werktag <strong>{ersatzrad}</strong> nutzen, so lange, bis das andere Rad
            wieder freigegeben ist.
          </p>
        </div>
      );

    default:
      return null;
  }
}
