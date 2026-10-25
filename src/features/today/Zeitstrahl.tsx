import { Fragment, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Aufklappzeichen } from '@/components/ui/Card';
import { NowMarker } from '@/components/ui/NowMarker';
import { TravelBar } from '@/components/ui/TravelBar';
import { zeitstrahlRaster, zeitstrahlSchiene } from '@/components/ui/timelineStile';
import { mitRueckweg } from '@/lib/rueckweg';
import { hakenFehlt } from '@/features/appointments/haken';
import { dayPlanStatusLabels, dayPlanStatusTon, offenGrund } from './api';
import {
  VERALTET_TEXT,
  einordnung,
  nichtAbgeschlossen,
  terminName,
  wegZumBesuch,
  type Anfahrt,
} from './tagesstart';
import { formatLocalTime } from '@/lib/datum';
import { kalenderZumTermin } from '@/lib/termin';
import { Laengenzeichen } from '@/components/ui/Laengenzeichen';
import type { DayPlanEntry } from '@/lib/tagesplan';

/**
 * Wie ein Termin im Strahl steht: vor sich, hinter sich, ausgefallen - oder
 * vorbei, aber nicht abgehakt (ANN-117 Fassung 2).
 */
type Stand = 'kommt' | 'erledigt' | 'ausgefallen' | 'liegengeblieben';

/**
 * Eine Fehlzeit wird weder abgeschlossen noch dokumentiert; hinter sich hat man
 * sie, wenn ihr Ende erreicht ist (UEB-02). Ein Besuch, dessen Ende erreicht
 * ist, ohne dass ihn jemand abgehakt hat, kommt nicht mehr - er ist
 * liegengeblieben und sagt es in der Zeile.
 */
function standVon(termin: DayPlanEntry, jetzt: number): Stand {
  if (termin.status === 'cancelled' || termin.status === 'no_show') return 'ausgefallen';
  if (termin.kind === 'internal') return Date.parse(termin.ends_at) <= jetzt ? 'erledigt' : 'kommt';
  if (nichtAbgeschlossen(termin, jetzt)) return 'liegengeblieben';
  return hakenFehlt(termin.status, termin.checked_at) ? 'kommt' : 'erledigt';
}

/**
 * Wo der Termin stattfindet, in einer Zeile: Ort statt Art (Design-Handoff
 * 2026-10-01). Der Hausbesuch trägt kein Wort (ANN-192), nur Straße und
 * Hausnummer; die geschätzte Anfahrt steht dahinter, solange er aussteht.
 */
function ortText(termin: DayPlanEntry, anfahrt: Anfahrt | undefined, stand: Stand): string {
  const strasse = [termin.visit_street, termin.visit_house_number].filter(Boolean).join(' ');
  return [
    einordnung(termin),
    strasse,
    // Die Liege nur am Hausbesuch (BEF-051) und nur, solange er aussteht
    // (Jannes, 2026-10-11): Was mit muss, steht an der Zeile.
    stand === 'kommt' &&
    termin.appointment_type === 'home_visit' &&
    termin.treatment_table_required === true
      ? '✓ Liege'
      : null,
    stand === 'kommt' && anfahrt ? `Anfahrt ≈ ${anfahrt.minuten} min` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Wie weit vor dem Beginn sich der Punkt des nächsten Termins füllt. */
const BALD_MS = 30 * 60 * 1000;

/**
 * Der Punkt auf der Schiene: gefüllt mit Zeichen für das, was hinter einem
 * liegt, hohl in der Hauptfarbe für den nächsten Termin - gefüllt, sobald er
 * in weniger als 30 Minuten beginnt -, hohl und leise für alles Spätere. Der
 * Punkt ist Schmuck; den Zustand sagt das Abzeichen in der Zeile daneben.
 */
function Punkt({
  stand,
  istFokus,
  gefuellt,
}: {
  stand: Stand;
  istFokus: boolean;
  gefuellt: boolean;
}) {
  const hinter = stand === 'erledigt' || stand === 'ausgefallen';
  const farbe = hinter
    ? 'border-accent bg-accent text-surface'
    : stand === 'liegengeblieben'
      ? 'border-warnung bg-surface'
      : istFokus
        ? `border-accent ${gefuellt ? 'bg-accent' : 'bg-surface'}`
        : 'border-line-strong bg-surface-sunken';
  return (
    <span
      data-punkt={
        hinter || stand === 'liegengeblieben' ? stand : istFokus ? 'naechster' : 'spaeter'
      }
      className={`rounded-pill relative flex size-3.5 items-center justify-center border-2 transition-colors duration-200 ${farbe}`}
    >
      {stand === 'erledigt' || stand === 'ausgefallen' ? <PunktZeichen art={stand} /> : null}
    </span>
  );
}

/**
 * Haken oder Kreuz im Punkt, gezeichnet statt gesetzt (Runde 2, Handoff
 * Schrift und Knöpfe Abschnitt 3; Hinweis Jannes 2026-10-06): Das
 * Schriftzeichen in 10 px saß rund 0,3 px zu hoch, weil Schriften Haken und
 * Kreuz nicht auf ihre Mitte setzen. 8 × 8 Einheiten, geometrisch mittig im
 * 14-px-Punkt, in der Textfarbe des Punkts. Schmuck wie der Punkt selbst.
 */
function PunktZeichen({ art }: { art: 'erledigt' | 'ausgefallen' }) {
  return (
    <svg
      data-zeichen={art === 'erledigt' ? 'haken' : 'kreuz'}
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={art === 'erledigt' ? 'M1.2 4.2 3.1 6 6.8 2' : 'M1.8 1.8 6.2 6.2M6.2 1.8 1.8 6.2'} />
    </svg>
  );
}

/**
 * Der Tag als Zeitstrahl (Design-Handoff 2026-10-01, Abschnitte 5 und 5a).
 *
 * Alles, was heute im eigenen Plan steht, in Uhrzeitfolge an einer Schiene:
 * Besuche, Trainingstermine und Fehlzeiten. **Ein** Termin ist ausgeklappt -
 * der nächste, den es anzufahren oder abzuschließen gilt (`fokusDesTages`);
 * die Seite reicht seine Karte herein. Alle anderen sind eine Zeile, die als
 * Ganzes in den Termin führt. Der Strahl ersetzt die Aufklapper „Weitere
 * offene heute" und „Erledigt heute": Was erledigt ist, bleibt an seiner
 * Stelle stehen und trägt ein Abzeichen.
 *
 * Die Jetzt-Marke steht vor dem ersten Termin, der noch nicht begonnen hat.
 * Über jedem späteren Hausbesuch mit bekannter Fahrzeit liegt ein schmaler
 * Wegbalken vom Ende des Termins davor (`wegZumBesuch`); an Praxis- und
 * Videoterminen und ohne Fahrzeit gibt es keinen. Eine ausgeklappte Karte
 * trägt ihn selbst, unter ihrem Kicker (B6) - die Seite reicht ihn ihr.
 *
 * `jetzt` kommt von außen und rückt mit der Seite jede Minute nach.
 */
export function Zeitstrahl({
  titel = 'Tagesablauf',
  titelSichtbar = false,
  erstaufnahmeOffen,
  plan,
  fokusId,
  jetzt,
  jetztMarke = true,
  zeitzone,
  anfahrten,
  veraltet,
  karte,
  aktionen,
  ausfall,
  aufklappen,
  fruehereZusammenfassen = false,
}: {
  /** Die Überschrift für Vorlesesoftware; die Morgen-Vorschau hat ihre eigene. */
  titel?: string;
  /** Steht ein zweiter Tag auf der Seite (Morgen-Vorschau), trägt der Strahl seinen Titel sichtbar. */
  titelSichtbar?: boolean;
  /**
   * Fehlt zur Person noch etwas aus der Erstaufnahme (PRX-013)? Steht als
   * Warnung an der Zeile, wie an der Karte.
   */
  erstaufnahmeOffen?: (termin: DayPlanEntry) => boolean;
  /** Die Tagesliste, nach Uhrzeit sortiert. */
  plan: readonly DayPlanEntry[];
  /** Der ausgeklappte Termin, oder `null`. */
  fokusId: string | null;
  jetzt: number;
  /**
   * Die Jetzt-Marke - nur am heutigen Tag. An einem anderen Tag der Übersicht
   * (ANN-234) gibt es kein Jetzt auf der Schiene.
   */
  jetztMarke?: boolean;
  zeitzone: string;
  anfahrten: ReadonlyMap<string, Anfahrt>;
  /** Termine mit veralteter Anschrift: keine Fahrzeit, ein Wort dazu (ANN-236). */
  veraltet?: ReadonlySet<string>;
  /** Die Karte des ausgeklappten Termins. */
  karte: ReactNode;
  /**
   * Die Knöpfe einer Zeile - „Doku" und der Haken (Design-Handoff 2026-10-01,
   * Abschnitt 6a; Leitfaden schlank und klar, L3): rechts neben der Zeile,
   * nicht in ihr - ein Knopf darf nicht in einem Link liegen.
   */
  aktionen?: (termin: DayPlanEntry) => ReactNode;
  /**
   * „Ausfall“ an der Zeile (B12) - vor „Doku“ und dem Haken. Weil drei
   * Knöpfe neben Name und Ort am Telefon keinen Platz lassen, rücken die
   * Knöpfe einer solchen Zeile dort unter Name und Ort, 12 px abgesetzt; das
   * Feld, das „Ausfall“ öffnet, steht darunter über die ganze Breite.
   */
  ausfall?: (termin: DayPlanEntry) => ReactNode;
  /**
   * Zeilen, die in der Übersicht aufklappen, statt in den Kalender zu
   * springen (Auftrag C1, Analyse „Alltag unterwegs“ Rang 8): Die Zeile wird
   * ein Knopf, aufgeklappt steht an ihrer Stelle die Karte des Termins mit
   * Navigation, Anruf und Doku. Ohne Angabe bleibt jede Zeile ein Link - so
   * in der Morgen-Vorschau.
   */
  aufklappen?: {
    offenId: string | null;
    aufklappbar: (termin: DayPlanEntry) => boolean;
    umschalten: (id: string) => void;
    karte: (termin: DayPlanEntry) => ReactNode;
  };
  /**
   * Am Telefon stehen die erledigten oder ausgefallenen Termine vor
   * dem ausgeklappten als eine Zeile „Erledigt (n)“ (Auftrag C1): Die Karte
   * des nächsten Wegs bleibt mit ihrem Hauptknopf über der Tableiste, auch
   * am dritten Besuch des Tages. Ein Tipp zeigt sie; ab 640 px stehen sie
   * immer da. Liegengebliebenes bleibt sichtbar - es verlangt etwas.
   */
  fruehereZusammenfassen?: boolean;
}) {
  const jetztText = jetztMarke ? formatLocalTime(new Date(jetzt).toISOString(), zeitzone) : '';
  const vorIndex = plan.findIndex((termin) => Date.parse(termin.starts_at) > jetzt);
  // Ohne Marke steht sie hinter dem letzten Termin - und wird dort nicht gezeichnet.
  const markeVor = !jetztMarke || vorIndex < 0 ? plan.length : vorIndex;
  const titelId = useId();
  const [fruehereOffen, setFruehereOffen] = useState(false);
  const fokusIndex = fokusId === null ? -1 : plan.findIndex((termin) => termin.id === fokusId);
  const vorbei = fruehereZusammenfassen
    ? plan.slice(0, Math.max(0, fokusIndex)).filter((termin) => {
        const stand = standVon(termin, jetzt);
        return stand === 'erledigt' || stand === 'ausgefallen';
      })
    : [];
  const zusammengefasst = new Set(vorbei.map((termin) => termin.id));
  const alleErledigt = vorbei.every((termin) => standVon(termin, jetzt) === 'erledigt');

  return (
    <section aria-labelledby={titelId}>
      <h2
        id={titelId}
        className={
          titelSichtbar
            ? 'text-accent tracking-label mb-3 flex min-h-8 items-center text-xs font-semibold uppercase'
            : 'sr-only'
        }
      >
        {titel}
      </h2>
      <ol>
        {plan.map((termin, index) => {
          const istFokus = termin.id === fokusId;
          const aufklappbar = !istFokus && (aufklappen?.aufklappbar(termin) ?? false);
          const offen = aufklappbar && aufklappen?.offenId === termin.id;
          // Fokus und aufgeklappte Zeile stehen als Karte da.
          const alsKarte = istFokus || offen;
          const letzter = index === plan.length - 1 && (!jetztMarke || markeVor !== plan.length);
          const stand = standVon(termin, jetzt);
          const anfahrt = anfahrten.get(termin.id);
          // Über der Zeile; eine Karte trägt den Balken selbst (B6).
          const uebergang =
            !alsKarte && stand === 'kommt' ? wegZumBesuch(termin, anfahrt, zeitzone, jetzt) : null;
          const beginn = Date.parse(termin.starts_at);
          const grund =
            stand === 'liegengeblieben'
              ? termin.status === 'documented'
                ? 'Haken fehlt'
                : 'Nicht abgeschlossen'
              : (offenGrund(termin) ??
                (stand === 'kommt' && veraltet?.has(termin.id) ? VERALTET_TEXT : null) ??
                (stand === 'kommt' && erstaufnahmeOffen?.(termin) ? 'Erstaufnahme offen' : null));
          const ziel = mitRueckweg(
            termin.kind === 'training'
              ? `/training/termine/${termin.id}`
              : kalenderZumTermin(termin.id),
            '/',
          );
          // Uhrzeit und Punkt stehen auf der Höhe der Namenszeile - und die
          // rutscht, wenn ein Übergang darüber liegt oder die Karte beginnt.
          const zeitOben = alsKarte ? 'pt-3.5' : uebergang ? 'pt-[26px]' : 'pt-1';
          const punktOben = alsKarte ? 'mt-[18px]' : uebergang ? 'mt-[31px]' : 'mt-[9px]';
          // Die Zeile selbst: Name, Ort, Grund und Abzeichen.
          const zeilenInhalt = (
            <>
              <span className="min-w-0 flex-1 basis-40">
                <span
                  className={`block text-base wrap-anywhere ${
                    stand === 'kommt' || stand === 'liegengeblieben'
                      ? 'text-ink font-semibold'
                      : 'text-ink-muted font-medium'
                  }`}
                >
                  {terminName(termin)}
                </span>
                <span className="text-ink-muted block text-sm wrap-anywhere">
                  {ortText(termin, anfahrt, stand)}
                </span>
                {grund ? (
                  <span className="text-warnung block text-sm font-medium">
                    <span aria-hidden="true">! </span>
                    {grund}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-2 empty:hidden">
                {/* §8.1: abweichende Länge gekennzeichnet (CAL-020). */}
                <Laengenzeichen termin={termin} />
                {/* „Steht aus" ist der Regelfall und sagt nichts (UX-005h). */}
                {termin.status === 'confirmed' ? null : (
                  <Badge ton={dayPlanStatusTon[termin.status]}>
                    {dayPlanStatusLabels[termin.status]}
                  </Badge>
                )}
              </span>
            </>
          );
          // Die ganze Zeile ist das Ziel (Design-Handoff, „Zeile"). Sie liegt
          // auf dem Seitengrund; das Überfahren hebt sie als weiße Fläche ab.
          // Am Telefon rückt das Abzeichen unter den Namen, statt ihn in zwei
          // Zeilen zu drücken.
          const zeilenKlassen =
            'hover:bg-surface rounded-button -ml-2 flex min-h-11 min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 py-1 text-left transition-colors duration-120';
          const ausfallKnopf = alsKarte ? null : (ausfall?.(termin) ?? null);
          const zeilenZiel = ausfallKnopf ? `${zeilenKlassen} max-sm:basis-full` : zeilenKlassen;

          return (
            <Fragment key={termin.id}>
              {zusammengefasst.has(termin.id) && vorbei[0]?.id === termin.id ? (
                <li className={`${zeitstrahlRaster} sm:hidden`}>
                  <span />
                  <span aria-hidden="true" className="relative flex justify-center">
                    <span className={zeitstrahlSchiene} />
                  </span>
                  <div className="-ml-2 pb-1.5">
                    <Button
                      type="button"
                      variant="quiet"
                      groesse="kompakt"
                      aria-expanded={fruehereOffen}
                      onClick={() => setFruehereOffen((bisher) => !bisher)}
                      className="px-2"
                    >
                      <Aufklappzeichen offen={fruehereOffen} />
                      {alleErledigt ? 'Erledigt' : 'Vorbei'} ({vorbei.length})
                    </Button>
                  </div>
                </li>
              ) : null}
              {index === markeVor ? <NowMarker zeit={jetztText} /> : null}
              <li
                className={`${zeitstrahlRaster} ${
                  zusammengefasst.has(termin.id) && !fruehereOffen ? 'max-sm:hidden' : ''
                }`.trim()}
                data-termin={termin.id}
              >
                <span
                  className={`text-liste font-semibold tabular-nums ${zeitOben} ${
                    stand === 'kommt' || stand === 'liegengeblieben' ? 'text-ink' : 'text-ink-muted'
                  }`}
                >
                  {formatLocalTime(termin.starts_at, zeitzone)}
                </span>
                <span aria-hidden="true" className="relative flex justify-center">
                  <span className={zeitstrahlSchiene} />
                  <span className={punktOben}>
                    <Punkt stand={stand} istFokus={istFokus} gefuellt={beginn - jetzt <= BALD_MS} />
                  </span>
                </span>
                <div className={`min-w-0 ${letzter ? '' : 'pb-[18px]'}`.trim()}>
                  {uebergang ? <TravelBar size="klein" {...uebergang} /> : null}
                  {istFokus ? (
                    karte
                  ) : offen ? (
                    aufklappen?.karte(termin)
                  ) : (
                    // 12 px zwischen Zeile, „Doku“ und Haken (Praxis-Review R2,
                    // P1): Der Haken schließt ab, ein Fehltipp darf ihn nicht
                    // treffen. Mit „Ausfall“ rücken die Knöpfe am Telefon unter
                    // Name und Ort, rechtsbündig wie in jeder Zeile (B12).
                    <div
                      className={`flex items-center gap-3 ${
                        ausfallKnopf ? 'flex-wrap justify-end' : ''
                      }`.trim()}
                    >
                      {aufklappbar ? (
                        <button
                          type="button"
                          data-zeile=""
                          aria-expanded={false}
                          onClick={() => aufklappen?.umschalten(termin.id)}
                          className={zeilenZiel}
                        >
                          {zeilenInhalt}
                        </button>
                      ) : (
                        <Link to={ziel} className={zeilenZiel}>
                          {zeilenInhalt}
                        </Link>
                      )}
                      {ausfallKnopf}
                      {aktionen?.(termin)}
                    </div>
                  )}
                </div>
              </li>
            </Fragment>
          );
        })}
        {jetztMarke && markeVor === plan.length ? <NowMarker zeit={jetztText} letzter /> : null}
      </ol>
    </section>
  );
}
