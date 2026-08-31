import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
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
  useVorschau,
  type Protokolleintrag,
  type Vorschauzustand,
} from '@/features/preview/vorschauContext';
import { vorschauId } from '@/features/preview/vorschauZustand';
import { Abschnitt, Klappbereich, SimulationsMeldung, VorschauBanner } from '@/features/preview/ui';
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
 *     Stammnutzer. Die Personen kommen aus dem gemeinsamen Mitarbeiterstamm.
 */

type Statusfilter = 'alle' | Radstatus;
type Tagesfilter = '' | Wochentag;

const statusTon: Record<Radstatus, Ton> = {
  verfuegbar: 'positiv',
  einsatz: 'warnung',
  reparatur: 'kritisch',
};

const selectKlasse =
  'min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink';

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
  const { zustand, simuliere } = useVorschau();
  const [suchparameter, setSuchparameter] = useSearchParams();
  const [meldung, setMeldung] = useState<Protokolleintrag | null>(null);

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
        folgen: ['Schlüsselstand auf „im Tresor" gesetzt', 'Schlüsselverlauf ergänzt'],
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
          'Status auf „Verfügbar" gesetzt',
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
        actions={
          <Link
            to="/betrieb/flotte/rad/neu"
            className="bg-accent hover:bg-accent-hover inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-[0.9375rem] font-medium text-white transition-colors"
          >
            Rad hinzufügen
          </Link>
        }
      />

      <VorschauBanner bereich="Radflotte" />
      <SimulationsMeldung eintrag={meldung} />

      <div className="mb-5 flex flex-wrap gap-3">
        <Link
          to="/betrieb/flotte/panne"
          className="border-danger/40 text-danger hover:bg-danger-soft inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors"
        >
          Panne melden
        </Link>
        <Link
          to="/betrieb/flotte/schluessel"
          className="border-line-strong bg-surface text-ink hover:bg-surface-sunken inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors"
        >
          Schlüssel entnehmen
        </Link>
        <Link
          to="/betrieb/flotte/checkup"
          className="border-line-strong bg-surface text-ink hover:bg-surface-sunken inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors"
        >
          Fahrrad-Check-Up
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="max-w-sm flex-1 basis-56">
          <Field
            label="Suche"
            type="search"
            placeholder="Rad, Stammnutzer, Notiz"
            value={suche}
            onChange={(event) => setzeParameter({ q: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="flotte-status" className="text-ink text-sm font-medium">
            Status
          </label>
          <select
            id="flotte-status"
            className={selectKlasse}
            value={status}
            onChange={(event) => setzeParameter({ status: event.target.value as Statusfilter })}
          >
            <option value="alle">Alle Status</option>
            <option value="verfuegbar">Verfügbar</option>
            <option value="einsatz">Im Einsatz</option>
            <option value="reparatur">In Reparatur</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="flotte-tag" className="text-ink text-sm font-medium">
            Freier Tag
          </label>
          <select
            id="flotte-tag"
            className={selectKlasse}
            value={tag}
            onChange={(event) => setzeParameter({ tag: event.target.value as Tagesfilter })}
          >
            <option value="">Alle Tage</option>
            {wochentage.map((wochentag) => (
              <option key={wochentag} value={wochentag}>
                Nur frei: {wochentagLabels[wochentag]}
              </option>
            ))}
          </select>
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
            beschreibung={`${depot.hinweis} · ${raederImDepot.length} Rad${raederImDepot.length === 1 ? '' : 'räder'}`}
          >
            <CardGrid>
              {raederImDepot.map((rad) => (
                <Radkarte
                  key={rad.id}
                  rad={rad}
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
  darfSchluesselcode,
  onSchluesselZurueck,
  onFreigeben,
}: {
  rad: Rad;
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
          <p className="text-ink truncate text-[0.9375rem] font-semibold">{rad.name}</p>
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
        <DataRow label="Stammnutzer">
          {rad.ersatzrad ? 'Ersatzfahrrad' : stammnutzer || '–'}
        </DataRow>
        {vertretung || (rad.ersatzrad && aktuellerNutzer) ? (
          <DataRow label="Aktuell gefahren von">{aktuellerNutzer}</DataRow>
        ) : null}
        <DataRow label="Akku">{rad.akku || '–'}</DataRow>
        {darfSchluesselcode && rad.schluesselcode ? (
          <DataRow label="Schlüsselcode">{rad.schluesselcode}</DataRow>
        ) : null}
      </DataList>

      {rad.notiz ? (
        <p className="text-ink-muted bg-surface-sunken mt-2 rounded-lg px-3 py-2 text-sm">
          {rad.notiz}
        </p>
      ) : null}

      <div
        className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
          rad.schluesselInhaber ? 'bg-warnung-soft text-warnung' : 'bg-positiv-soft text-positiv'
        }`}
      >
        <span>
          {rad.schluesselInhaber ? `Schlüssel bei ${rad.schluesselInhaber}` : 'Schlüssel im Tresor'}
          {rad.schluesselSeit ? (
            <span className="block text-xs opacity-80">
              seit {formatZeitpunkt(rad.schluesselSeit)}
            </span>
          ) : null}
        </span>
        {rad.schluesselInhaber ? (
          <Button variant="secondary" onClick={onSchluesselZurueck}>
            Zurückgelegt
          </Button>
        ) : (
          <Link
            to={`/betrieb/flotte/schluessel?rad=${rad.id}`}
            className="border-line-strong bg-surface text-ink hover:bg-surface-sunken inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors"
          >
            Entnehmen
          </Link>
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
              className={`rounded px-1 py-1 ${stand.belegt ? 'bg-warnung-soft text-warnung' : 'bg-positiv-soft text-positiv'}`}
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
        <p className="text-ink-subtle mt-1 text-xs">
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
                  {vorgang.inhaber} — {formatZeitpunkt(vorgang.entnommen)}
                  {vorgang.zurueckgelegt
                    ? ` bis ${formatZeitpunkt(vorgang.zurueckgelegt)}`
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
                  <span className="text-ink-subtle block text-xs">
                    {formatZeitpunkt(meldung.zeitpunkt)}
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
                    <span className="text-ink-subtle block text-xs">
                      {formatZeitpunkt(checkup.zeitpunkt)} · {checkup.geprueftVon}
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
                      <span className="text-ink-subtle block text-xs">
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

      <div className="border-line mt-3 flex flex-wrap gap-3 border-t pt-3 text-sm">
        {rad.status === 'reparatur' ? (
          <button
            type="button"
            onClick={onFreigeben}
            className="text-positiv min-h-9 font-medium hover:underline"
          >
            Freigeben
          </button>
        ) : null}
        <Link
          to={`/betrieb/flotte/rad/${rad.id}`}
          className="text-accent hover:text-accent-hover min-h-9 font-medium"
        >
          Bearbeiten
        </Link>
        <Link
          to={`/betrieb/flotte/panne?rad=${rad.id}`}
          className="text-ink-muted hover:text-ink min-h-9 font-medium"
        >
          Panne
        </Link>
        <Link
          to={`/betrieb/flotte/checkup?rad=${rad.id}`}
          className="text-ink-muted hover:text-ink min-h-9 font-medium"
        >
          Check-Up
        </Link>
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
        'Zeigt alle Räder, unabhängig von Suche und Filter. „frei*" heißt: frei, weil der ' +
        'Stammnutzer abwesend ist.'
      }
    >
      <div className="-mx-4 overflow-x-auto px-4">
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
                        className={`inline-flex min-w-12 justify-center rounded px-2 py-1 text-xs ${
                          stand.belegt
                            ? 'bg-warnung-soft text-warnung'
                            : 'bg-positiv-soft text-positiv'
                        }`}
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

      <p className="text-ink-subtle mt-4 text-sm">
        Diese Angaben sind Platzhalter aus der Kölner Vorlage. Sie sind hier bewusst nicht
        bearbeitbar: Eine änderbare Betriebsanweisung setzt voraus, dass die Tübinger Angaben
        fachlich freigegeben sind. Zugangscodes werden grundsätzlich nicht in der Anwendung
        hinterlegt.
      </p>
    </Klappbereich>
  );
}
