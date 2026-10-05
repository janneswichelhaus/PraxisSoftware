import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { NowMarker } from '@/components/ui/NowMarker';
import { TravelBar } from '@/components/ui/TravelBar';
import { zeitstrahlRaster, zeitstrahlSchiene } from '@/components/ui/timelineStile';
import { mitRueckweg } from '@/lib/rueckweg';
import { formatLocalTime, kalenderZumTermin } from '@/features/appointments/api';
import { Laengenzeichen } from '@/features/appointments/Laengenzeichen';
import { dayPlanStatusLabels, dayPlanStatusTon, offenGrund, type DayPlanEntry } from './api';
import { einordnung, nichtAbgeschlossen, terminName, type Anfahrt } from './tagesstart';

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
  return termin.status === 'confirmed' ? 'kommt' : 'erledigt';
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
      className={`rounded-pill relative flex size-3.5 items-center justify-center border-2 text-[10px] leading-none font-bold transition-colors duration-200 ${farbe}`}
    >
      {stand === 'erledigt' ? '✓' : stand === 'ausgefallen' ? '×' : null}
    </span>
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
 * Wegbalken vom Ende des Termins davor; an Praxis- und Videoterminen und ohne
 * Fahrzeit gibt es keinen.
 *
 * `jetzt` kommt von außen und rückt mit der Seite jede Minute nach.
 */
export function Zeitstrahl({
  plan,
  fokusId,
  jetzt,
  jetztMarke = true,
  zeitzone,
  anfahrten,
  karte,
  haken,
}: {
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
  /** Die Karte des ausgeklappten Termins. */
  karte: ReactNode;
  /**
   * Der Haken einer Zeile (Design-Handoff 2026-10-01, Abschnitt 6a): rechts
   * neben der Zeile, nicht in ihr - ein Knopf darf nicht in einem Link liegen.
   */
  haken?: (termin: DayPlanEntry) => ReactNode;
}) {
  const jetztText = jetztMarke ? formatLocalTime(new Date(jetzt).toISOString(), zeitzone) : '';
  const vorIndex = plan.findIndex((termin) => Date.parse(termin.starts_at) > jetzt);
  // Ohne Marke steht sie hinter dem letzten Termin - und wird dort nicht gezeichnet.
  const markeVor = !jetztMarke || vorIndex < 0 ? plan.length : vorIndex;

  return (
    <section aria-labelledby="zeitstrahl-titel" className="mt-5">
      <h2 id="zeitstrahl-titel" className="sr-only">
        Tagesablauf
      </h2>
      <ol>
        {plan.map((termin, index) => {
          const istFokus = termin.id === fokusId;
          const letzter = index === plan.length - 1 && (!jetztMarke || markeVor !== plan.length);
          const stand = standVon(termin, jetzt);
          const anfahrt = anfahrten.get(termin.id);
          const uebergang =
            !istFokus &&
            stand === 'kommt' &&
            termin.appointment_type === 'home_visit' &&
            termin.kind !== 'internal' &&
            anfahrt?.vorher
              ? { anfahrt, vorher: anfahrt.vorher }
              : null;
          const beginn = Date.parse(termin.starts_at);
          const grund = stand === 'liegengeblieben' ? 'Nicht abgeschlossen' : offenGrund(termin);
          const ziel = mitRueckweg(
            termin.kind === 'training'
              ? `/training/termine/${termin.id}`
              : kalenderZumTermin(termin.id),
            '/',
          );
          // Uhrzeit und Punkt stehen auf der Höhe der Namenszeile - und die
          // rutscht, wenn ein Übergang darüber liegt oder die Karte beginnt.
          const zeitOben = istFokus ? 'pt-3.5' : uebergang ? 'pt-[26px]' : 'pt-1';
          const punktOben = istFokus ? 'mt-[18px]' : uebergang ? 'mt-[31px]' : 'mt-[9px]';

          return (
            <Fragment key={termin.id}>
              {index === markeVor ? <NowMarker zeit={jetztText} /> : null}
              <li className={zeitstrahlRaster} data-termin={termin.id}>
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
                  {uebergang ? (
                    <TravelBar
                      size="klein"
                      von={{
                        zeit: formatLocalTime(uebergang.vorher.ends_at, zeitzone),
                        label: terminName(uebergang.vorher),
                      }}
                      bis={{
                        zeit: formatLocalTime(termin.starts_at, zeitzone),
                        label: terminName(termin),
                      }}
                      fahrtMin={uebergang.anfahrt.minuten}
                    />
                  ) : null}
                  {istFokus ? (
                    karte
                  ) : (
                    // Die ganze Zeile ist das Ziel (Design-Handoff, „Zeile").
                    // Sie liegt auf dem Seitengrund; das Überfahren hebt sie
                    // als weiße Fläche ab.
                    <div className="flex items-center gap-2">
                      <Link
                        to={ziel}
                        // Am Telefon rückt das Abzeichen unter den Namen, statt
                        // ihn in zwei Zeilen zu drücken.
                        className="hover:bg-surface rounded-button -ml-2 flex min-h-11 min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 py-1 transition-colors duration-120"
                      >
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
                          {/* „Steht aus" ist der Regelfall und sagt nichts
                            (UX-005h). */}
                          {termin.status === 'confirmed' ? null : (
                            <Badge ton={dayPlanStatusTon[termin.status]}>
                              {dayPlanStatusLabels[termin.status]}
                            </Badge>
                          )}
                        </span>
                      </Link>
                      {haken?.(termin)}
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
