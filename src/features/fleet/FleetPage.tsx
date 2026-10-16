import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { EmptyState } from '@/components/ui/Feedback';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { SearchField } from '@/components/ui/SearchField';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { todayInTimeZone } from '@/features/appointments/api';
import { leseMeldung } from '@/features/appointments/terminformular';
import type { CurrentUser } from '@/features/session/types';
import {
  FLOTTE_SCHLUESSEL,
  fetchFleet,
  flotteSchluessel,
  returnKey,
  takeKey,
  type Bike,
  type Fleet,
} from './api';
import {
  WOCHENTAGE,
  formatZeitpunkt,
  istWochentag,
  montagDerWoche,
  tageDerWoche,
  wochentageKurz,
  type Wochentag,
} from './format';
import {
  ausserhalbDesStammdepots,
  belegung,
  depotName,
  istMeinRad,
  radzustand,
  radzustandLabels,
  type Radzustand,
} from './rad';
import { aktiveStandortvorlage } from './standortvorlage';

/**
 * Radflotte (FLT-EPIC-001): die Räder der Praxis nach Standort, mit Suche,
 * Zustand und „frei am“, dem Schlüssel an jeder Zeile und den Wegen zu Panne,
 * Check-Up und Schlüssel (DESIGN.md „Liste“).
 *
 * **Ihr Rad zuerst.** Das Stammrad der angemeldeten Person - oder das, dessen
 * Schlüssel sie hat - steht über den Depots. Den Schlüssel nimmt ein Tipp an
 * der Zeile (Budget R1 der Spec, vorher zwei Tipps und ein Seitenwechsel);
 * für jemand anderen geht es über „Schlüssel eintragen“.
 *
 * **Die Woche an der Zeile.** Die Tabelle „Wochenübersicht“ der Vorschau
 * stand am Telefon breiter als der Bildschirm (DESIGN.md Regel 3). Dieselbe
 * Auskunft steht jetzt an jedem Rad - die Tage der Stammnutzer:in und, wenn
 * sie diese Woche ganztägig abwesend ist, „frei, weil abwesend“ - und der
 * Filter „Frei am“ beantwortet „welches Rad ist am Donnerstag frei“.
 *
 * Wer was darf, entscheidet der Server (ANN-550); die Seite fragt nur
 * `can_manage`, um „Rad hinzufügen“ nicht anzubieten, wo es abgewiesen würde.
 */

type Zustandsfilter = 'alle' | Radzustand;

const ZUSTANDSFILTER: readonly { wert: Zustandsfilter; text: string }[] = [
  { wert: 'alle', text: 'Alle Räder' },
  { wert: 'verfuegbar', text: radzustandLabels.verfuegbar },
  { wert: 'einsatz', text: radzustandLabels.einsatz },
  { wert: 'reparatur', text: radzustandLabels.reparatur },
];

function istZustandsfilter(wert: string | null): wert is Zustandsfilter {
  return ZUSTANDSFILTER.some((eintrag) => eintrag.wert === wert);
}

function passtZurSuche(rad: Bike, suche: string): boolean {
  const nadel = suche.trim().toLowerCase();
  if (!nadel) return true;
  return [rad.name, rad.regular_rider?.name, rad.key?.holder_name, rad.note, rad.special_location]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(nadel);
}

export function FleetPage({ user }: { user: CurrentUser }) {
  const zone = user.organizationTimeZone;
  const montag = montagDerWoche(todayInTimeZone(zone ?? 'Europe/Berlin'));
  const abfrage = useQuery({
    queryKey: flotteSchluessel(montag),
    queryFn: () => fetchFleet(montag),
    retry: false,
  });

  // Eine Aktion auf einer Unterseite - Rad gespeichert, Panne gemeldet - kommt
  // mit ihrem Satz hierher zurück; gelesen beim ersten Zeichnen, damit ein
  // Filter ihn nicht mit dem Verlaufszustand verliert.
  const verlaufszustand: unknown = useLocation().state;
  const [meldung, setMeldung] = useState<{ text: string; nr: number } | null>(() => {
    const text = leseMeldung(verlaufszustand);
    return text ? { text, nr: 1 } : null;
  });

  const [parameter, setParameter] = useSearchParams();
  const suche = parameter.get('q') ?? '';
  const zustandRoh = parameter.get('zustand');
  const zustand: Zustandsfilter = istZustandsfilter(zustandRoh) ? zustandRoh : 'alle';
  const freiRoh = Number(parameter.get('frei'));
  const frei: Wochentag | null = istWochentag(freiRoh) ? freiRoh : null;

  function setze(naechste: { q?: string; zustand?: Zustandsfilter; frei?: Wochentag | null }) {
    const neu = new URLSearchParams(parameter);
    const q = naechste.q ?? suche;
    const z = naechste.zustand ?? zustand;
    const f = naechste.frei === undefined ? frei : naechste.frei;
    if (q.trim()) neu.set('q', q);
    else neu.delete('q');
    if (z !== 'alle') neu.set('zustand', z);
    else neu.delete('zustand');
    if (f) neu.set('frei', String(f));
    else neu.delete('frei');
    setParameter(neu, { replace: true });
  }

  return (
    <>
      {/* Ohne Satz unter dem Titel (Regel 6); „Rad hinzufügen“ kompakt im
          Kopf, nur wo der Server es annimmt (ANN-403, ANN-550). */}
      <PageHeader
        title="Radflotte"
        actions={
          abfrage.data?.can_manage ? (
            <ButtonLink to="/betrieb/flotte/rad/neu">Rad hinzufügen</ButtonLink>
          ) : null
        }
      />

      {meldung ? (
        <Rueckmeldung key={meldung.nr} className="mb-6">
          {meldung.text}
        </Rueckmeldung>
      ) : null}

      {/* Die drei Wege, die ohne ein bestimmtes Rad beginnen; das Rad wählt
          die Seite danach, das eigene vorbelegt. Kompakt, 44 px. */}
      <div className="mb-6 flex flex-wrap gap-2">
        <ButtonLink to="/betrieb/flotte/panne" variant="secondary" groesse="kompakt">
          Panne melden
        </ButtonLink>
        <ButtonLink to="/betrieb/flotte/checkup" variant="secondary" groesse="kompakt">
          Check-Up
        </ButtonLink>
        <ButtonLink to="/betrieb/flotte/schluessel" variant="secondary" groesse="kompakt">
          Schlüssel eintragen
        </ButtonLink>
      </div>

      <Abfragezustand
        abfrage={abfrage}
        laden="Radflotte wird geladen …"
        fehler="Die Radflotte konnte nicht geladen werden."
        inKarte
      >
        {(flotte) => (
          <Flotte
            flotte={flotte}
            zone={zone}
            montag={montag}
            suche={suche}
            zustand={zustand}
            frei={frei}
            onFilter={setze}
            onMeldung={(text) => setMeldung((vorher) => ({ text, nr: (vorher?.nr ?? 0) + 1 }))}
          />
        )}
      </Abfragezustand>
    </>
  );
}

function Flotte({
  flotte,
  zone,
  montag,
  suche,
  zustand,
  frei,
  onFilter,
  onMeldung,
}: {
  flotte: Fleet;
  zone: string | null;
  montag: string;
  suche: string;
  zustand: Zustandsfilter;
  frei: Wochentag | null;
  onFilter: (naechste: { q?: string; zustand?: Zustandsfilter; frei?: Wochentag | null }) => void;
  onMeldung: (text: string) => void;
}) {
  const queryClient = useQueryClient();
  const tage = useMemo(() => tageDerWoche(montag), [montag]);
  const ich = flotte.my_staff_member_id;

  const schluessel = useMutation({
    mutationFn: async ({ rad, art }: { rad: Bike; art: 'nehmen' | 'zuruecklegen' }) => {
      if (art === 'nehmen') await takeKey(rad.id, null);
      else await returnKey(rad.id);
      return { rad, art };
    },
    onSuccess: async ({ rad, art }) => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      onMeldung(
        art === 'nehmen'
          ? `Schlüssel von ${rad.name} bei Ihnen eingetragen.`
          : `Schlüssel von ${rad.name} zurückgelegt.`,
      );
    },
  });

  const sichtbar = flotte.bikes.filter((rad) => {
    if (zustand !== 'alle' && radzustand(rad) !== zustand) return false;
    if (frei) {
      if (rad.block) return false;
      if (belegung(rad, frei, tage[frei], flotte.unavailable).belegt) return false;
    }
    return passtZurSuche(rad, suche);
  });

  const zaehler = {
    verfuegbar: flotte.bikes.filter((rad) => radzustand(rad) === 'verfuegbar').length,
    einsatz: flotte.bikes.filter((rad) => radzustand(rad) === 'einsatz').length,
    reparatur: flotte.bikes.filter((rad) => radzustand(rad) === 'reparatur').length,
  };

  // Ihr Rad zuerst, dann je Depot, dann die Räder an einem anderen Ort.
  const meine = sichtbar.filter((rad) => istMeinRad(rad, ich));
  const uebrige = sichtbar.filter((rad) => !istMeinRad(rad, ich));
  const abschnitte = [
    ...flotte.depots.map((depot) => ({
      titel: depot.name,
      raeder: uebrige.filter((rad) => rad.current_depot_id === depot.id),
    })),
    { titel: 'Anderer Ort', raeder: uebrige.filter((rad) => rad.current_depot_id === null) },
  ].filter((abschnitt) => abschnitt.raeder.length > 0);

  function zeile(rad: Bike, abschnitt: string | null) {
    return (
      <Radzeile
        key={rad.id}
        rad={rad}
        flotte={flotte}
        abschnitt={abschnitt}
        zone={zone}
        tage={tage}
        laeuft={schluessel.isPending && schluessel.variables.rad.id === rad.id}
        onSchluessel={(art) => {
          schluessel.reset();
          schluessel.mutate({ rad, art });
        }}
      />
    );
  }

  return (
    <>
      {/* Suche offen, Zustand und „Frei am“ am Telefon hinter „Filter“
          (Filterleiste, ANN-405); darunter der Bestand als Ergebniszeile. */}
      <Filterleiste
        suche={
          <SearchField
            placeholder="Rad, Person, Notiz"
            value={suche}
            onChange={(wert) => onFilter({ q: wert })}
          />
        }
        gesetzt={(zustand === 'alle' ? 0 : 1) + (frei ? 1 : 0)}
        onZuruecksetzen={() => onFilter({ zustand: 'alle', frei: null })}
        beschriftung="Radflotte filtern"
        ergebnis={`${zaehler.verfuegbar} verfügbar · ${zaehler.einsatz} im Einsatz · ${zaehler.reparatur} in Reparatur · ${flotte.bikes.length} ${flotte.bikes.length === 1 ? 'Rad' : 'Räder'}`}
      >
        <Select
          label="Zustand"
          value={zustand}
          onChange={(event) =>
            onFilter({
              zustand: istZustandsfilter(event.target.value) ? event.target.value : 'alle',
            })
          }
        >
          {ZUSTANDSFILTER.map((eintrag) => (
            <option key={eintrag.wert} value={eintrag.wert}>
              {eintrag.text}
            </option>
          ))}
        </Select>
        <Select
          label="Frei am"
          value={frei ? String(frei) : ''}
          onChange={(event) => {
            const tag = Number(event.target.value);
            onFilter({ frei: istWochentag(tag) ? tag : null });
          }}
        >
          <option value="">Jeder Tag</option>
          {WOCHENTAGE.map((tag) => (
            <option key={tag.nr} value={tag.nr}>
              {tag.lang}
            </option>
          ))}
        </Select>
      </Filterleiste>

      {schluessel.isError ? (
        <Statusmeldung ton="fehler" className="mb-4">
          {schluessel.error.message}
        </Statusmeldung>
      ) : null}

      {flotte.bikes.length === 0 ? (
        <EmptyState
          inKarte
          title="Noch kein Rad angelegt"
          description={flotte.can_manage ? undefined : 'Räder legt die Praxisinhaber:in an.'}
          aktion={
            flotte.can_manage ? (
              <ButtonLink to="/betrieb/flotte/rad/neu" variant="secondary">
                Rad hinzufügen
              </ButtonLink>
            ) : undefined
          }
        />
      ) : sichtbar.length === 0 ? (
        <EmptyState inKarte title="Keine Treffer" description="Suche oder Filter anpassen." />
      ) : (
        <>
          {meine.length > 0 ? (
            <Listenabschnitt titel={meine.length === 1 ? 'Ihr Rad' : 'Ihre Räder'}>
              {meine.map((rad) => zeile(rad, null))}
            </Listenabschnitt>
          ) : null}
          {abschnitte.map((abschnitt) => (
            <Listenabschnitt
              key={abschnitt.titel}
              titel={abschnitt.titel}
              anzahl={abschnitt.raeder.length}
            >
              {abschnitt.raeder.map((rad) => zeile(rad, abschnitt.titel))}
            </Listenabschnitt>
          ))}
        </>
      )}

      {flotte.can_manage ? <Einstellungen /> : null}
    </>
  );
}

// -----------------------------------------------------------------------------
// Ein Rad als Zeile
// -----------------------------------------------------------------------------

/**
 * Ein Rad als Zeile (Leitfaden L3): Name, Abweichungen als Zeichen und Wort,
 * Standort nur, wenn ihn nicht schon der Abschnitt sagt, Stammnutzer:in mit
 * ihren Tagen, der Schlüssel; rechts die Arbeit an der Zeile - Schlüssel
 * nehmen oder zurücklegen. Die Zeile selbst öffnet das Rad.
 */
function Radzeile({
  rad,
  flotte,
  abschnitt,
  zone,
  tage,
  laeuft,
  onSchluessel,
}: {
  rad: Bike;
  flotte: Fleet;
  /** Die Überschrift des Abschnitts; `null` unter „Ihr Rad“. */
  abschnitt: string | null;
  zone: string | null;
  tage: Record<Wochentag, string>;
  laeuft: boolean;
  onSchluessel: (art: 'nehmen' | 'zuruecklegen') => void;
}) {
  const ort = rad.current_depot_id
    ? depotName(flotte.depots, rad.current_depot_id)
    : (rad.special_location ?? 'Anderer Ort');
  const freiWeilAbwesend = WOCHENTAGE.filter(
    (tag) => belegung(rad, tag.nr, tage[tag.nr], flotte.unavailable).wegenAbwesenheit,
  );
  const ich = flotte.my_staff_member_id;

  return (
    <ListRow
      to={`/betrieb/flotte/rad/${rad.id}`}
      titel={rad.name}
      meta={
        <>
          {/* Nur die Ausnahme trägt ein Abzeichen (Regel 5). */}
          {rad.block ? (
            <span className="my-1 block">
              <Badge ton="kritisch">{radzustandLabels.reparatur}</Badge>
            </span>
          ) : null}
          {ort !== abschnitt ? <span className="block">{ort}</span> : null}
          <span className="block">
            {rad.is_spare
              ? 'Ersatzrad'
              : rad.regular_rider
                ? `${rad.regular_rider.name}${rad.planned_weekdays.length > 0 ? ` · ${wochentageKurz(rad.planned_weekdays)}` : ''}`
                : 'Ohne Stammnutzer:in'}
          </span>
          {freiWeilAbwesend.length > 0 ? (
            <span className="block">
              Diese Woche frei: {freiWeilAbwesend.map((tag) => tag.kurz).join(', ')} (abwesend)
            </span>
          ) : null}
          {/* Ein ausgegebener Schlüssel ist Alltag, keine Warnung (VOR-13). */}
          <span className="block">
            {rad.key
              ? `Schlüssel bei ${rad.key.holder_staff_id === ich ? 'Ihnen' : (rad.key.holder_name ?? 'jemandem')} · seit ${formatZeitpunkt(rad.key.taken_at, zone)}`
              : 'Schlüssel im Tresor'}
          </span>
          {!rad.block && rad.open_problems > 0 ? (
            <span className="text-warnung block font-medium">
              <span aria-hidden="true">! </span>
              {rad.open_problems === 1
                ? 'Ein Problem offen'
                : `${rad.open_problems} Probleme offen`}
            </span>
          ) : rad.open_spots > 0 ? (
            <span className="block">
              {rad.open_spots === 1 ? 'Eine Stelle offen' : `${rad.open_spots} Stellen offen`}
            </span>
          ) : null}
          {rad.note ? <span className="block">{rad.note}</span> : null}
          {ausserhalbDesStammdepots(rad) ? (
            <span className="text-warnung block font-medium">
              <span aria-hidden="true">! </span>
              Gehört zu {depotName(flotte.depots, rad.home_depot_id)}.
            </span>
          ) : null}
        </>
      }
      aktion={
        rad.key ? (
          // Sichtbar „Zurücklegen“, damit dem Namen Platz bleibt; der Name
          // des Knopfs sagt, wovon.
          <Button
            variant="secondary"
            aria-label={`Schlüssel von ${rad.name} zurücklegen`}
            disabled={laeuft}
            onClick={() => onSchluessel('zuruecklegen')}
          >
            Zurücklegen
          </Button>
        ) : rad.block ? null : ich ? (
          <Button
            variant="secondary"
            aria-label={`Schlüssel von ${rad.name} nehmen`}
            disabled={laeuft}
            onClick={() => onSchluessel('nehmen')}
          >
            Schlüssel nehmen
          </Button>
        ) : (
          // Ohne eigenen Mitarbeiterdatensatz trägt der Schlüssel einen
          // anderen Namen - die Seite fragt danach.
          <ButtonLink to={`/betrieb/flotte/schluessel?rad=${rad.id}`} variant="secondary">
            Eintragen
          </ButtonLink>
        )
      }
    />
  );
}

// -----------------------------------------------------------------------------
// Einstellungen (Praxisinhaber:in)
// -----------------------------------------------------------------------------

/**
 * Depots und die Standortvorlage des Pannenablaufs. Die Vorlage bleibt nur
 * zu lesen: Sie stammt aus Köln und ist für Tübingen ungeprüft (ANN-554,
 * §15.2); eine änderbare Betriebsanweisung setzt die geprüften Tübinger
 * Angaben voraus. Zugangscodes stehen nie in der Anwendung.
 */
function Einstellungen() {
  const vorlage = aktiveStandortvorlage;
  return (
    <Section titel="Einstellungen">
      <div className="flex flex-col gap-2">
        <Textlink to="/betrieb/flotte/depots" alleinstehend>
          Depots verwalten
        </Textlink>
        <Disclosure summary="Standortvorlage des Pannenablaufs">
          <p className="text-ink-muted mb-3 text-sm">{vorlage.pruefhinweis}</p>
          <DetailList>
            <DetailRow label="Werkstatt">{vorlage.werkstatt.name}</DetailRow>
            <DetailRow label="Telefon">{vorlage.werkstatt.telefon}</DetailRow>
            <DetailRow label="Ruhetag">{vorlage.werkstatt.ruhetag}</DetailRow>
            <DetailRow label="Depot">{vorlage.depot.bezeichnung}</DetailRow>
            <DetailRow label="Depotzugang">{vorlage.depot.zugangHinweis}</DetailRow>
            <DetailRow label="Zuständig bei Panne">{vorlage.zustaendigeRolle}</DetailRow>
            <DetailRow label="Meldeweg">{vorlage.meldeweg}</DetailRow>
          </DetailList>
        </Disclosure>
      </div>
    </Section>
  );
}
