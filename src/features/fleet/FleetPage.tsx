import { useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { DataList, DataRow } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { SearchField } from '@/components/ui/SearchField';
import { isOwner, type CurrentUser } from '@/features/session/types';
import { aktiveStandortvorlage } from '@/features/preview/standortvorlage';
import { montagDerWoche, plusTage } from '@/features/preview/demodaten';
import {
  depotName,
  hatUrlaub,
  mitarbeiterName,
  uebergebeneMeldung,
  useVorschau,
  type Protokolleintrag,
  type Vorschauzustand,
} from '@/features/preview/vorschauContext';
import { vorschauId } from '@/features/preview/vorschauZustand';
import { Abschnitt, Klappbereich, SimulationsMeldung } from '@/features/preview/ui';
import { formatZeitpunkt } from '@/features/preview/format';
import {
  radstatusLabels,
  wochentage,
  wochentagLabels,
  type Rad,
  type Radstatus,
  type Wochentag,
} from '@/features/preview/types';

/**
 * Radflotte.
 *
 * Übernahme der Radflotte aus der Team-App: Liste mit Suche, Status- und
 * Tagesfilter, Wochenübersicht über alle Räder, Schlüsselstand je Rad,
 * Verläufe für Schlüssel, Pannen und Check-Up sowie die Einstiege in
 * Pannenassistent, Schlüsselentnahme und Check-Up.
 *
 * Zwei bewusste Abweichungen gegenüber der Vorlage:
 *
 *   * Der Zugriff auf geschützte Angaben (Schlüsselcode, Einstellungen) hängt
 *     an der Rolle des angemeldeten Kontos, nicht an einer im Quelltext
 *     hinterlegten PIN. Eine PIN im Browser ist keine Zugriffskontrolle.
 *   * Es gibt keine zweite Mitarbeiterverwaltung für die Auswahl der
 *     Stammnutzer:innen. Die Personen kommen aus dem gemeinsamen
 *     Mitarbeiterstamm.
 */

type Statusfilter = 'alle' | Radstatus;
type Tagesfilter = '' | Wochentag;

/**
 * Tagesbelegung als Fläche (VOR-13): belegt ist der Normalfall und neutral,
 * frei ist hervorgehoben. Warn- und Erfolgsfarben bleiben echten Zuständen
 * vorbehalten; das Wort in der Zelle trägt die Bedeutung, die Fläche ergänzt.
 */
function belegungsflaeche(belegt: boolean): string {
  return belegt ? 'bg-surface-sunken text-ink-muted' : 'bg-accent-soft text-accent';
}

/** Kalendertage der laufenden Woche, nach Wochentag. */
function wochentagsdaten(stichtag: string): Record<Wochentag, string> {
  const montag = montagDerWoche(stichtag);
  return wochentage.reduce(
    (sammlung, tag, index) => ({ ...sammlung, [tag]: plusTage(montag, index) }),
    {} as Record<Wochentag, string>,
  );
}

/**
 * Tatsächliche Belegung eines Rads an einem Wochentag.
 *
 * Der Wochenplan sagt, wer das Rad üblicherweise fährt. Ist diese Person
 * genehmigt abwesend, ist das Rad an dem Tag trotzdem frei - genau das macht
 * eine genehmigte Abwesenheit für die Planung nützlich.
 */
function belegung(
  zustand: Vorschauzustand,
  rad: Rad,
  tag: Wochentag,
  daten: Record<Wochentag, string>,
): { belegt: boolean; wegenUrlaub: boolean } {
  const geplant = rad.wochenplan[tag] === 'belegt';
  if (!geplant) return { belegt: false, wegenUrlaub: false };
  const abwesend = hatUrlaub(zustand, rad.stammnutzerId, daten[tag]);
  return { belegt: !abwesend, wegenUrlaub: abwesend };
}

function passtZurSuche(rad: Rad, stammnutzer: string, suche: string): boolean {
  const nadel = suche.trim().toLowerCase();
  if (!nadel) return true;
  return `${rad.name} ${stammnutzer} ${rad.notiz}`.toLowerCase().includes(nadel);
}

export function FleetPage({ user }: { user: CurrentUser }) {
  const { zustand, protokoll, simuliere } = useVorschau();
  // Der Verlaufszustand ist ungeprüft; `uebergebeneMeldung` prüft ihn.
  const verlaufszustand: unknown = useLocation().state;
  const [suchparameter, setSuchparameter] = useSearchParams();
  // Eine Aktion auf einer Unterseite - Rad speichern oder entfernen - kommt
  // mit ihrer Zustandsmeldung hierher zurück (VOR-01). Gemerkt beim ersten
  // Zeichnen, damit ein Filter sie nicht mit dem Verlaufszustand verliert.
  const [meldung, setMeldung] = useState<Protokolleintrag | null>(() =>
    uebergebeneMeldung(verlaufszustand, protokoll),
  );

  const suche = suchparameter.get('q') ?? '';
  const status = (suchparameter.get('status') ?? 'alle') as Statusfilter;
  const tag = (suchparameter.get('tag') ?? '') as Tagesfilter;
  const darfEinstellungen = isOwner(user.roles);

  function setzeParameter(naechste: { q?: string; status?: Statusfilter; tag?: Tagesfilter }) {
    const parameter = new URLSearchParams();
    const q = naechste.q ?? suche;
    const s = naechste.status ?? status;
    const t = naechste.tag ?? tag;
    if (q.trim()) parameter.set('q', q);
    if (s !== 'alle') parameter.set('status', s);
    if (t) parameter.set('tag', t);
    setSuchparameter(parameter, { replace: true });
  }

  const wochendaten = useMemo(() => wochentagsdaten(zustand.stichtag), [zustand.stichtag]);

  const sichtbar = useMemo(
    () =>
      zustand.raeder.filter((rad) => {
        if (status !== 'alle' && rad.status !== status) return false;
        if (tag && belegung(zustand, rad, tag, wochendaten).belegt) return false;
        return passtZurSuche(rad, mitarbeiterName(zustand, rad.stammnutzerId), suche);
      }),
    [zustand, status, tag, suche, wochendaten],
  );

  const zaehler = {
    verfuegbar: zustand.raeder.filter((rad) => rad.status === 'verfuegbar').length,
    einsatz: zustand.raeder.filter((rad) => rad.status === 'einsatz').length,
    reparatur: zustand.raeder.filter((rad) => rad.status === 'reparatur').length,
  };

  function schluesselZurueck(rad: Rad) {
    const eintrag = simuliere(
      {
        bereich: 'Radflotte',
        vorgang: `Schlüssel zurückgelegt: ${rad.name}`,
        folgen: ['Schlüsselstand auf „im Tresor“ gesetzt', 'Schlüsselverlauf ergänzt'],
        nichtGeschehen: ['Kein Vorgang gespeichert, keine Benachrichtigung versendet'],
      },
      (stand) => ({
        ...stand,
        raeder: stand.raeder.map((eintragRad) =>
          eintragRad.id === rad.id
            ? {
                ...eintragRad,
                schluesselInhaber: null,
                schluesselSeit: null,
                schluesselverlauf: [
                  ...eintragRad.schluesselverlauf,
                  {
                    id: vorschauId('schluessel'),
                    inhaber: eintragRad.schluesselInhaber ?? 'Unbekannt',
                    entnommen: eintragRad.schluesselSeit ?? new Date().toISOString(),
                    zurueckgelegt: new Date().toISOString(),
                  },
                ],
              }
            : eintragRad,
        ),
      }),
    );
    setMeldung(eintrag);
  }

  function freigeben(rad: Rad) {
    const eintrag = simuliere(
      {
        bereich: 'Radflotte',
        vorgang: `Rad freigegeben: ${rad.name}`,
        folgen: [
          'Status auf „Verfügbar“ gesetzt',
          'Das Rad steht in der Vorschau wieder für die Planung zur Verfügung',
        ],
        nichtGeschehen: [
          'Keine Rückmeldung an die Werkstatt',
          'Keine Ersatzradzuordnung aufgehoben',
        ],
      },
      (stand) => ({
        ...stand,
        raeder: stand.raeder.map((eintragRad) =>
          eintragRad.id === rad.id ? { ...eintragRad, status: 'verfuegbar' } : eintragRad,
        ),
      }),
    );
    setMeldung(eintrag);
  }

  return (
    <>
      {/* Ohne Satz unter dem Titel (Regel 6); „Rad hinzufügen“ kompakt im
          Kopf (ANN-403). */}
      <PageHeader
        title="Radflotte"
        actions={<ButtonLink to="/betrieb/flotte/rad/neu">Rad hinzufügen</ButtonLink>}
      />

      <SimulationsMeldung eintrag={meldung} />

      {/* Seitenwechsel als ButtonLink statt eigener Klassenketten (VOR-12,
          TOK-11): Schrift und Hauptfarbe wie jeder Knopf. Die Panne trägt
          keine Sonderfarbe mehr - ihr Rand lag bei 2,1:1. Kompakt, 44 px wie
          bisher: In voller Größe bräuchten die drei am Telefon eine Zeile
          mehr vor dem ersten Rad. */}
      <div className="mb-6 flex flex-wrap gap-2">
        <ButtonLink to="/betrieb/flotte/panne" variant="secondary" groesse="kompakt">
          Panne melden
        </ButtonLink>
        <ButtonLink to="/betrieb/flotte/schluessel" variant="secondary" groesse="kompakt">
          Schlüssel entnehmen
        </ButtonLink>
        <ButtonLink to="/betrieb/flotte/checkup" variant="secondary" groesse="kompakt">
          Fahrrad-Check-Up
        </ButtonLink>
      </div>

      {/* Suche offen, Status und freier Tag am Telefon hinter „Filter“
          (Filterleiste, ANN-405); die Bausteine mit 48 px (TOK-13, UIK-19).
          Darunter der Bestand als Ergebniszeile. */}
      <Filterleiste
        suche={
          <SearchField
            placeholder="Rad, Stammnutzer:in, Notiz"
            value={suche}
            onChange={(wert) => setzeParameter({ q: wert })}
          />
        }
        gesetzt={(status === 'alle' ? 0 : 1) + (tag ? 1 : 0)}
        onZuruecksetzen={() => setzeParameter({ status: 'alle', tag: '' })}
        beschriftung="Radflotte filtern"
        ergebnis={`${zaehler.verfuegbar} verfügbar · ${zaehler.einsatz} im Einsatz · ${zaehler.reparatur} in Reparatur · ${zustand.raeder.length} Räder insgesamt`}
      >
        <Select
          label="Status"
          value={status}
          onChange={(event) => setzeParameter({ status: event.target.value as Statusfilter })}
        >
          <option value="alle">Alle Status</option>
          <option value="verfuegbar">Verfügbar</option>
          <option value="einsatz">Im Einsatz</option>
          <option value="reparatur">In Reparatur</option>
        </Select>
        <Select
          label="Freier Tag"
          value={tag}
          onChange={(event) => setzeParameter({ tag: event.target.value as Tagesfilter })}
        >
          <option value="">Alle Tage</option>
          {wochentage.map((wochentag) => (
            <option key={wochentag} value={wochentag}>
              Nur frei: {wochentagLabels[wochentag]}
            </option>
          ))}
        </Select>
      </Filterleiste>

      <Wochenuebersicht />

      {darfEinstellungen ? <Einstellungen /> : null}

      {zustand.depots.map((depot) => {
        const raederImDepot = sichtbar.filter((rad) => rad.depotId === depot.id);
        if (raederImDepot.length === 0) return null;
        return (
          <Abschnitt
            key={depot.id}
            titel={depot.name}
            beschreibung={`${depot.hinweis} · ${raederImDepot.length} ${raederImDepot.length === 1 ? 'Rad' : 'Räder'}`}
          >
            <ListRows>
              {raederImDepot.map((rad) => (
                <Radzeile
                  key={rad.id}
                  rad={rad}
                  abschnitt={depot.name}
                  zeitzone={user.organizationTimeZone}
                  darfSchluesselcode={darfEinstellungen}
                  onSchluesselZurueck={() => schluesselZurueck(rad)}
                  onFreigeben={() => freigeben(rad)}
                />
              ))}
            </ListRows>
          </Abschnitt>
        );
      })}

      {sichtbar.length === 0 ? (
        <div className="mt-8">
          <EmptyState inKarte title="Keine Treffer" description="Suche oder Filter anpassen." />
        </div>
      ) : null}
    </>
  );
}

// -----------------------------------------------------------------------------
// Radzeile
// -----------------------------------------------------------------------------

/**
 * Ein Rad als Zeile der Liste (Welle B, B7): Name, Stammnutzer:in,
 * Schlüsselstand, Akku und - für die Praxisinhaber:in - der Schlüsselcode;
 * rechts die Arbeit an der Zeile (Leitfaden L3): Schlüssel zurücklegen oder
 * entnehmen, ein Rad in Reparatur freigeben. Die Zeile selbst öffnet das Rad
 * mit Verläufen, Panne und Check-Up.
 *
 * Bis dahin stand jedes Rad als Karte mit vier Knöpfen und drei Aufklappern
 * da, die Flotte am Telefon über 4 000 px. Fachlich ändert sich nichts.
 */
function Radzeile({
  rad,
  abschnitt,
  zeitzone,
  darfSchluesselcode,
  onSchluesselZurueck,
  onFreigeben,
}: {
  rad: Rad;
  /** Die Überschrift des Abschnitts, in dem die Zeile steht. */
  abschnitt: string;
  zeitzone: string | null;
  darfSchluesselcode: boolean;
  onSchluesselZurueck: () => void;
  onFreigeben: () => void;
}) {
  const { zustand } = useVorschau();
  const falschesDepot = rad.depotId !== rad.stammdepotId;
  // Das Depot steht nur dran, wenn es nicht schon die Abschnittsüberschrift
  // sagt (UX-005i).
  const depot = depotName(zustand, rad, 'aktuell');
  const stammnutzer = rad.stammnutzerId ? mitarbeiterName(zustand, rad.stammnutzerId) : '';
  const aktuellerNutzer = rad.aktuellerNutzerId
    ? mitarbeiterName(zustand, rad.aktuellerNutzerId)
    : '';
  const vertretung = Boolean(aktuellerNutzer && stammnutzer && aktuellerNutzer !== stammnutzer);
  const ausstattung = [
    rad.akku || null,
    darfSchluesselcode && rad.schluesselcode ? 'code' : null,
  ].filter(Boolean);

  return (
    <ListRow
      to={`/betrieb/flotte/rad/${rad.id}`}
      titel={rad.name}
      meta={
        <>
          {/* Nur die Abweichung trägt ein Abzeichen: Verfügbar und im Einsatz
              sind Normalbetrieb (VOR-13, UX-005i). Unter dem Namen statt
              rechts daneben - dort steht die Arbeit an der Zeile. */}
          {rad.status === 'reparatur' ? (
            <span className="my-1 block">
              <Badge ton="kritisch">{radstatusLabels[rad.status]}</Badge>
            </span>
          ) : null}
          {depot !== abschnitt ? <span className="block">{depot}</span> : null}
          <span className="block">
            {rad.ersatzrad ? (
              <span>Ersatzrad</span>
            ) : (
              <>
                <span>Stammnutzer:in</span> {stammnutzer || '–'}
              </>
            )}
            {vertretung || (rad.ersatzrad && aktuellerNutzer)
              ? ` · gefahren von ${aktuellerNutzer}`
              : ''}
          </span>
          {/* Schlüsselstand neutral (VOR-13): Ein ausgegebener Schlüssel ist
              Alltag, keine Warnung. */}
          <span className="block">
            {rad.schluesselInhaber
              ? `Schlüssel bei ${rad.schluesselInhaber}`
              : 'Schlüssel im Tresor'}
            {rad.schluesselSeit ? (
              <>
                {' · '}
                <span>seit {formatZeitpunkt(rad.schluesselSeit, zeitzone)}</span>
              </>
            ) : null}
          </span>
          {/* Ohne Angabe keine Zeile (UX-005i). */}
          {ausstattung.length > 0 ? (
            <span className="block">
              {rad.akku}
              {rad.akku && darfSchluesselcode && rad.schluesselcode ? ' · ' : ''}
              {darfSchluesselcode && rad.schluesselcode ? (
                <>
                  Schlüsselcode <span>{rad.schluesselcode}</span>
                </>
              ) : null}
            </span>
          ) : null}
          {rad.notiz ? <span className="block">{rad.notiz}</span> : null}
          {falschesDepot ? (
            <span className="text-warnung block font-medium">
              <span aria-hidden="true">! </span>
              Steht nicht im Stammdepot. Gehört zu {depotName(zustand, rad, 'stamm')}.
            </span>
          ) : null}
        </>
      }
      aktion={
        <>
          {rad.status === 'reparatur' ? (
            <Button variant="secondary" onClick={onFreigeben}>
              Freigeben
            </Button>
          ) : null}
          {rad.schluesselInhaber ? (
            // Sichtbar „Zurücklegen“, damit dem Namen am Telefon Platz bleibt;
            // der Name des Knopfs sagt, was zurückgelegt wird.
            <Button
              variant="secondary"
              aria-label="Schlüssel zurücklegen"
              onClick={onSchluesselZurueck}
            >
              Zurücklegen
            </Button>
          ) : rad.status === 'reparatur' ? null : (
            <ButtonLink to={`/betrieb/flotte/schluessel?rad=${rad.id}`} variant="secondary">
              Entnehmen
            </ButtonLink>
          )}
        </>
      }
    />
  );
}

// -----------------------------------------------------------------------------
// Wochenübersicht und Einstellungen
// -----------------------------------------------------------------------------

/**
 * Wochenübersicht über alle Räder.
 *
 * Zeigt bewusst immer alle Räder, unabhängig von Suche und Filter: Die Frage
 * „welches Rad ist am Donnerstag frei" lässt sich sonst nicht beantworten,
 * ohne vorher die Filter zurückzusetzen.
 */
function Wochenuebersicht() {
  const { zustand } = useVorschau();
  const wochendaten = wochentagsdaten(zustand.stichtag);

  return (
    <Klappbereich
      titel="Wochenübersicht – wer nutzt wann welches Rad"
      beschreibung={
        'Zeigt alle Räder, unabhängig von Suche und Filter. „frei*“ heißt: frei, weil die ' +
        'Stammnutzer:in abwesend ist.'
      }
    >
      {/* Per Tastatur erreichbar und benannt (VOR-02, UIK-24): Am Telefon ist
          die Tabelle breiter als der Bildschirm, und ohne Fokus ließe sich der
          rechte Teil nur mit dem Finger verschieben. */}
      <div
        className="-mx-4 overflow-x-auto px-4"
        tabIndex={0}
        role="region"
        aria-label="Wochenübersicht Räder"
      >
        <table className="w-full min-w-[34rem] border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="text-ink-muted bg-surface sticky left-0 text-left font-medium"
              >
                Rad
              </th>
              {wochentage.map((tag) => (
                <th key={tag} scope="col" className="text-ink-muted font-medium">
                  {wochentagLabels[tag]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zustand.raeder.map((rad) => (
              <tr key={rad.id}>
                <th
                  scope="row"
                  className="text-ink bg-surface sticky left-0 pr-2 text-left font-medium whitespace-nowrap"
                >
                  {rad.name}
                </th>
                {wochentage.map((tag) => {
                  const stand = belegung(zustand, rad, tag, wochendaten);
                  return (
                    <td key={tag} className="text-center">
                      <span
                        className={`rounded-pill inline-flex min-w-12 justify-center px-2 py-1 text-xs ${belegungsflaeche(
                          stand.belegt,
                        )}`}
                      >
                        {stand.belegt ? 'belegt' : stand.wegenUrlaub ? 'frei*' : 'frei'}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Klappbereich>
  );
}

/**
 * Standortabhängige Angaben und Check-Up-Fragen.
 *
 * In der Vorlage waren diese Werte direkt änderbar. Hier werden sie zunächst
 * nur angezeigt: Sie stammen aus der Standortvorlage und sind für Tübingen
 * ungeprüft. Eine Bearbeitung, die echte Betriebsanweisungen erzeugt, braucht
 * erst die fachliche Freigabe.
 */
function Einstellungen() {
  const { zustand } = useVorschau();
  const vorlage = aktiveStandortvorlage;

  return (
    <Klappbereich
      titel="Kontakte, Standortvorlage und Check-Up-Fragen"
      beschreibung={vorlage.pruefhinweis}
    >
      <DataList>
        <DataRow label="Werkstatt">{vorlage.werkstatt.name}</DataRow>
        <DataRow label="Telefon">{vorlage.werkstatt.telefon}</DataRow>
        <DataRow label="Mobil">{vorlage.werkstatt.mobil}</DataRow>
        <DataRow label="Ruhetag">{vorlage.werkstatt.ruhetag}</DataRow>
        <DataRow label="Depot">{vorlage.depot.bezeichnung}</DataRow>
        <DataRow label="Depotzugang">{vorlage.depot.zugangHinweis}</DataRow>
        <DataRow label="Zuständig bei Panne">{vorlage.zustaendigeRolle}</DataRow>
        <DataRow label="Meldeweg">{vorlage.meldeweg}</DataRow>
      </DataList>

      <p className="text-ink mt-4 text-sm font-medium">Check-Up-Fragen</p>
      <ol className="text-ink-muted mt-1 list-decimal space-y-0.5 pl-5 text-sm">
        {zustand.checkupfragen.map((frage) => (
          <li key={frage}>{frage}</li>
        ))}
      </ol>

      <p className="text-ink-muted mt-4 text-sm">
        Diese Angaben sind Platzhalter aus der Kölner Vorlage. Sie sind hier bewusst nicht
        bearbeitbar: Eine änderbare Betriebsanweisung setzt voraus, dass die Tübinger Angaben
        fachlich freigegeben sind. Zugangscodes werden grundsätzlich nicht in der Anwendung
        hinterlegt.
      </p>
    </Klappbereich>
  );
}
