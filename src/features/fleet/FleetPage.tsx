import { useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Badge, type Ton } from '@/components/ui/Badge';
import { Card, CardGrid, DataList, DataRow, Disclosure } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
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
 * Ton des Radstatus (VOR-13).
 *
 * „Im Einsatz" ist der Normalbetrieb und trägt deshalb keinen Warnton - bis
 * VOR-13 stand er mit „!" da, und jede Karte meldete eine Warnung, die keine
 * war. Gewarnt wird nur bei einer echten Abweichung (Rad nicht im Stammdepot).
 */
const statusTon: Record<Radstatus, Ton> = {
  verfuegbar: 'positiv',
  einsatz: 'neutral',
  reparatur: 'kritisch',
};

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
      <PageHeader
        title="Radflotte"
        description="Lastenräder für Hausbesuche: Zuordnung, Verfügbarkeit, Schlüssel und Wartung."
        actions={<ButtonLink to="/betrieb/flotte/rad/neu">Rad hinzufügen</ButtonLink>}
      />

      <SimulationsMeldung eintrag={meldung} />

      {/* Seitenwechsel als ButtonLink statt eigener Klassenketten (VOR-12,
          TOK-11): Schrift und Hauptfarbe wie jeder Knopf. Die Panne trägt
          keine Sonderfarbe mehr - ihr Rand lag bei 2,1:1. Kompakt, 44 px wie
          bisher: In voller Größe bräuchten die drei am Telefon eine Zeile
          mehr vor dem ersten Rad. */}
      <div className="mb-5 flex flex-wrap gap-3">
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

      {/* Filter über die Bausteine (TOK-13, UIK-19): 48 px wie das Suchfeld.
          Am Telefon stehen die zwei Auswahlen nebeneinander unter der Suche. */}
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="max-w-sm min-w-0 flex-1 basis-56">
          <Field
            label="Suche"
            type="search"
            placeholder="Rad, Stammnutzer:in, Notiz"
            value={suche}
            onChange={(event) => setzeParameter({ q: event.target.value })}
          />
        </div>
        <div className="min-w-0 flex-1 basis-36 sm:w-40 sm:flex-none">
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
        </div>
        <div className="min-w-0 flex-1 basis-36 sm:w-40 sm:flex-none">
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
        </div>
      </div>

      <p className="text-ink-muted mb-4 text-sm">
        {zaehler.verfuegbar} verfügbar · {zaehler.einsatz} im Einsatz · {zaehler.reparatur} in
        Reparatur · {zustand.raeder.length} Räder insgesamt
      </p>

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
            <CardGrid>
              {raederImDepot.map((rad) => (
                <Radkarte
                  key={rad.id}
                  rad={rad}
                  zeitzone={user.organizationTimeZone}
                  darfSchluesselcode={darfEinstellungen}
                  onSchluesselZurueck={() => schluesselZurueck(rad)}
                  onFreigeben={() => freigeben(rad)}
                />
              ))}
            </CardGrid>
          </Abschnitt>
        );
      })}

      {sichtbar.length === 0 ? (
        <EmptyState title="Keine Treffer" description="Suche oder Filter anpassen." />
      ) : null}
    </>
  );
}

// -----------------------------------------------------------------------------
// Radkarte
// -----------------------------------------------------------------------------

function Radkarte({
  rad,
  zeitzone,
  darfSchluesselcode,
  onSchluesselZurueck,
  onFreigeben,
}: {
  rad: Rad;
  zeitzone: string | null;
  darfSchluesselcode: boolean;
  onSchluesselZurueck: () => void;
  onFreigeben: () => void;
}) {
  const { zustand } = useVorschau();
  const wochendaten = wochentagsdaten(zustand.stichtag);
  const falschesDepot = rad.depotId !== rad.stammdepotId;
  const stammnutzer = rad.stammnutzerId ? mitarbeiterName(zustand, rad.stammnutzerId) : '';
  const aktuellerNutzer = rad.aktuellerNutzerId
    ? mitarbeiterName(zustand, rad.aktuellerNutzerId)
    : '';
  const vertretung = Boolean(aktuellerNutzer && stammnutzer && aktuellerNutzer !== stammnutzer);

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink text-liste truncate font-semibold">{rad.name}</p>
          <p className="text-ink-muted mt-0.5 truncate text-sm">
            {depotName(zustand, rad, 'aktuell')}
          </p>
        </div>
        <Badge ton={statusTon[rad.status]}>{radstatusLabels[rad.status]}</Badge>
      </div>

      {falschesDepot ? (
        <p className="rounded-card border-warnung/30 bg-warnung-soft text-warnung mt-2 border px-3 py-2 text-sm">
          Steht nicht im Stammdepot. Gehört zu {depotName(zustand, rad, 'stamm')}.
        </p>
      ) : null}

      <DataList>
        <DataRow label="Stammnutzer:in">{rad.ersatzrad ? 'Ersatzrad' : stammnutzer || '–'}</DataRow>
        {vertretung || (rad.ersatzrad && aktuellerNutzer) ? (
          <DataRow label="Aktuell gefahren von">{aktuellerNutzer}</DataRow>
        ) : null}
        <DataRow label="Akku">{rad.akku || '–'}</DataRow>
        {darfSchluesselcode && rad.schluesselcode ? (
          <DataRow label="Schlüsselcode">{rad.schluesselcode}</DataRow>
        ) : null}
      </DataList>

      {rad.notiz ? (
        <p className="text-ink-muted bg-surface-sunken rounded-card mt-2 px-3 py-2 text-sm">
          {rad.notiz}
        </p>
      ) : null}

      {/* Schlüsselstand neutral (VOR-13): Ein ausgegebener Schlüssel ist Alltag,
          keine Warnung. Knopf und Link darin gleich groß (VOR-12). */}
      <div className="rounded-card bg-surface-sunken text-ink mt-3 flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
        <span>
          {rad.schluesselInhaber ? `Schlüssel bei ${rad.schluesselInhaber}` : 'Schlüssel im Tresor'}
          {rad.schluesselSeit ? (
            <span className="text-ink-muted block text-xs">
              seit {formatZeitpunkt(rad.schluesselSeit, zeitzone)}
            </span>
          ) : null}
        </span>
        {rad.schluesselInhaber ? (
          <Button variant="secondary" groesse="kompakt" onClick={onSchluesselZurueck}>
            Schlüssel zurücklegen
          </Button>
        ) : (
          <ButtonLink
            to={`/betrieb/flotte/schluessel?rad=${rad.id}`}
            variant="secondary"
            groesse="kompakt"
          >
            Entnehmen
          </ButtonLink>
        )}
      </div>

      <div className="text-ink-muted mt-3 grid grid-cols-7 gap-1 text-center text-xs">
        {wochentage.map((tag) => {
          const stand = belegung(zustand, rad, tag, wochendaten);
          return (
            <div
              key={tag}
              title={
                stand.wegenUrlaub
                  ? `${wochentagLabels[tag]}: frei, ${stammnutzer} ist abwesend`
                  : `${wochentagLabels[tag]}: ${stand.belegt ? 'belegt' : 'frei'}`
              }
              className={`rounded-button px-1 py-1 ${belegungsflaeche(stand.belegt)}`}
            >
              <span className="block font-medium">{wochentagLabels[tag]}</span>
              <span className="block text-[0.6875rem]">
                {stand.belegt ? 'belegt' : stand.wegenUrlaub ? 'frei*' : 'frei'}
              </span>
            </div>
          );
        })}
      </div>
      {wochentage.some((tag) => belegung(zustand, rad, tag, wochendaten).wegenUrlaub) ? (
        <p className="text-ink-muted mt-1 text-xs">
          * frei, weil {stammnutzer} an diesem Tag genehmigt abwesend ist.
        </p>
      ) : null}

      {rad.schluesselverlauf.length > 0 ? (
        <Disclosure summary={`Schlüsselverlauf (${rad.schluesselverlauf.length})`}>
          <ul className="text-ink-muted space-y-1 text-sm">
            {rad.schluesselverlauf
              .slice(-3)
              .reverse()
              .map((vorgang) => (
                <li key={vorgang.id}>
                  {vorgang.inhaber} – {formatZeitpunkt(vorgang.entnommen, zeitzone)}
                  {vorgang.zurueckgelegt
                    ? ` bis ${formatZeitpunkt(vorgang.zurueckgelegt, zeitzone)}`
                    : ' (noch entnommen)'}
                </li>
              ))}
          </ul>
        </Disclosure>
      ) : null}

      {rad.pannenverlauf.length > 0 ? (
        <Disclosure summary={`Pannenverlauf (${rad.pannenverlauf.length})`}>
          <ul className="text-ink-muted space-y-2 text-sm">
            {rad.pannenverlauf
              .slice(-3)
              .reverse()
              .map((meldung) => (
                <li key={meldung.id}>
                  <span className="text-ink-muted block text-xs">
                    {formatZeitpunkt(meldung.zeitpunkt, zeitzone)}
                    {meldung.gesperrt ? ' · Rad gesperrt' : ' · ohne Sperre'}
                  </span>
                  {meldung.text}
                </li>
              ))}
          </ul>
        </Disclosure>
      ) : null}

      {rad.checkups.length > 0 ? (
        <Disclosure summary={`Check-Up-Verlauf (${rad.checkups.length})`}>
          <ul className="space-y-2 text-sm">
            {rad.checkups
              .slice(-3)
              .reverse()
              .map((checkup) => {
                const probleme = checkup.befunde.filter((befund) => befund.bewertung === 'problem');
                const beobachten = checkup.befunde.filter(
                  (befund) => befund.bewertung === 'beobachten',
                );
                return (
                  <li key={checkup.id}>
                    <span className="text-ink-muted block text-xs">
                      {formatZeitpunkt(checkup.zeitpunkt, zeitzone)} · {checkup.geprueftVon}
                    </span>
                    {probleme.length > 0 ? (
                      <span className="text-danger block">
                        Problem: {probleme.map((befund) => befund.frage).join(', ')}
                      </span>
                    ) : null}
                    {beobachten.length > 0 ? (
                      <span className="text-warnung block">
                        Beobachten: {beobachten.map((befund) => befund.frage).join(', ')}
                      </span>
                    ) : null}
                    {probleme.length === 0 && beobachten.length === 0 ? (
                      <span className="text-positiv block">Alles in Ordnung</span>
                    ) : null}
                    {checkup.notiz ? (
                      <span className="text-ink-muted block">Notiz: {checkup.notiz}</span>
                    ) : null}
                    {checkup.fotos > 0 ? (
                      <span className="text-ink-muted block text-xs">
                        {checkup.fotos} Foto{checkup.fotos === 1 ? '' : 's'} angehängt (bleibt in
                        dieser Sitzung)
                      </span>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </Disclosure>
      ) : null}

      {/* Kartenaktionen mit 44 px (VOR-11, RSP-14): bis dahin 36 px hohe
          Textlinks, „Panne" nur 38 px breit. Freigeben ändert den Status und
          steht deshalb mit Rahmen neben den ruhigen Links. */}
      <div className="border-line mt-3 flex flex-wrap gap-2 border-t pt-3">
        {rad.status === 'reparatur' ? (
          <Button variant="secondary" groesse="kompakt" onClick={onFreigeben}>
            Freigeben
          </Button>
        ) : null}
        <ButtonLink to={`/betrieb/flotte/rad/${rad.id}`} variant="quiet" groesse="kompakt">
          Bearbeiten
        </ButtonLink>
        <ButtonLink to={`/betrieb/flotte/panne?rad=${rad.id}`} variant="quiet" groesse="kompakt">
          Panne
        </ButtonLink>
        <ButtonLink to={`/betrieb/flotte/checkup?rad=${rad.id}`} variant="quiet" groesse="kompakt">
          Check-Up
        </ButtonLink>
      </div>
    </Card>
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
