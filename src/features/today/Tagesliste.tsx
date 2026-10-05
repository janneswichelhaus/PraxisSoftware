import { Fragment, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Laengenzeichen } from '@/features/appointments/Laengenzeichen';
import { mitRueckweg } from '@/lib/rueckweg';
import { formatLocalTimeRange, kalenderZumTermin } from '@/features/appointments/api';
import { openItemsText, type IntakeItem } from '@/features/open-points/intake-api';
import {
  adressZeilen,
  dayPlanStatusLabels,
  dayPlanStatusTon,
  offenGrund,
  rufnummern,
  type DayPlanEntry,
} from './api';
import { zugangMitStockwerk } from './stockwerk';
import { einordnung, terminName } from './tagesstart';

/** Eine Pille der Karte: 36 px hoch, 14 px in 600 (Design-Handoff 2026-10-01). */
const pille =
  'rounded-pill inline-flex min-h-9 items-center gap-1 px-3 text-sm font-semibold whitespace-nowrap';

/** Der Name als Link: 20 px in 700, Unterstrich 2 px mit 4 px Abstand, Tippziel 44 px. */
const namenslink =
  'text-accent hover:text-accent-hover relative z-10 inline-flex min-h-11 items-center underline ' +
  'decoration-2 underline-offset-4 transition-colors';

/**
 * Was über der Fläche der Karte liegt und selbst ein Ziel ist (UBK-004): Es
 * hebt sich über den Link der ganzen Karte, sonst fiele jeder Tipp darauf
 * auf den Termin.
 */
const darueber = 'relative z-10';

/**
 * Der eine ausgeklappte Termin im Zeitstrahl, so wie man ihn an der
 * Wohnungstür braucht (UX-001, Design-Handoff 2026-10-01).
 *
 * Bewusst eine Karte statt einer Zeile: Anschrift, Zugang und Rufnummer
 * müssen bei 375 px ohne einen Seitenwechsel erreichbar sein.
 *
 * **Die ganze Karte öffnet den Termin** (UBK-004, Auftrag Jannes 2026-10-05):
 * Bis dahin stand dafür eine Fußzeile „Termin öffnen →“. Jetzt spannt ein
 * Link seine Fläche über die Karte (`after:inset-0`); die eigenständigen
 * Ziele - Akte, Info, Erstaufnahme, Anruf, Navigation, Doku, Haken - liegen
 * darüber (`darueber`). Verschachtelt sind die Ziele nicht: Im Dokument ist
 * der Termin ein Link neben den anderen, mit eigenem Namen für Tastatur und
 * Vorlesesoftware.
 *
 * Die Uhrzeit des Beginns steht am Zeitstrahl daneben; die Karte nennt die
 * ganze Spanne in der Nebenzeile, weil das Ende am Strahl nicht steht.
 *
 * **Pillen statt Textblock:** Liege und offene Erstaufnahme stehen als Pillen
 * unter der Anschrift. Etage, Zugangshinweis, Besonderheit und Rufnummern
 * liegen hinter dem Info-Knopf „i“ - seit UBK-004 in der Namenszeile, bis
 * dahin am Ende der Adresszeile (Jannes 2026-10-03, AKTE-008; 2026-10-05):
 * Sie sind wichtig, wenn man vor der Tür steht, und sonst Text,
 * den Umstehende mitlesen. Ohne eine dieser Angaben gibt es keinen Knopf.
 * Die Etage kommt vorerst vom Anfang des Zugangshinweises (ANN-197,
 * `stockwerk.ts`) - ein eigenes Feld `home_visit_floor` gibt es noch nicht.
 *
 * Freitexte - Name, Anschrift, Zugangshinweis, Besonderheit - brechen auch
 * mitten im Wort um (UEB-16, wie BEF-005): Ein Hinweis ohne Trennstelle
 * sprengte sonst bei 390 px die Karte und die Seite liefe waagerecht.
 */
export function Tageskarte({
  termin,
  kicker,
  relativ,
  position,
  erstaufnahme,
  hauptaktion,
  aktionen,
}: {
  termin: DayPlanEntry;
  /** Die Zeile über dem Namen: „Erster Weg · ≈ 12 min", „Jetzt · bis 10:10". */
  kicker: string;
  /** Rechts neben dem Kicker, solange kein Zustand dort steht: „in 25 Minuten". */
  relativ?: string | null;
  /** „Termin 2 von 6", wenn die Grundlage es hergibt (PRX-008). */
  position?: string | null;
  /** Was zur Erstaufnahme noch fehlt (PRX-013); leer oder `undefined`: nichts. */
  erstaufnahme?: readonly IntakeItem[] | undefined;
  /** Die eine Handlung in voller Breite: Navigation oder Abschluss. */
  hauptaktion?: ReactNode;
  /** Die übrigen Handlungen, kompakt nebeneinander. */
  aktionen?: ReactNode;
}) {
  const [infoOffen, setInfoOffen] = useState(false);
  const infoId = useId();
  const zone = termin.organization_time_zone;
  const adresse = adressZeilen(termin);
  const nummern = rufnummern(termin);
  const grund = offenGrund(termin);
  const art = einordnung(termin);
  const { stockwerk, rest: zugang } = zugangMitStockwerk(termin.home_visit_access_note);
  const besonderheit = termin.special_note?.trim() || null;
  const hatInfo =
    stockwerk !== null || zugang !== null || besonderheit !== null || nummern.length > 0;
  // Die Liege fährt nur zum Hausbesuch mit (BEF-051, ANN-116 Fassung 2).
  const liege =
    termin.treatment_table_required === true && termin.appointment_type === 'home_visit';
  const fehlt = termin.kind === 'therapy' && termin.patient_id ? (erstaufnahme ?? []) : [];
  const terminZiel = mitRueckweg(
    termin.kind === 'training' ? `/training/termine/${termin.id}` : kalenderZumTermin(termin.id),
    '/',
  );
  // Der Verweis auf die Hinweise steht nur da, solange es sie im Dokument
  // gibt (wie bei der Suche, UIK-08).
  const info = {
    'aria-expanded': infoOffen,
    ...(infoOffen ? { 'aria-controls': infoId } : {}),
    onClick: () => setInfoOffen((offen) => !offen),
  };

  return (
    <article className="rounded-card border-line bg-surface hover:border-line-strong relative border px-4 py-3.5 transition-colors duration-120">
      {/* Der Termin als Fläche der ganzen Karte (UBK-004). Sein Name steht
          nur für Vorlesesoftware da; das Auge sieht die Karte, die Tastatur
          einen Rahmen um sie. */}
      <Link
        to={terminZiel}
        className="after:rounded-card focus-visible:after:outline-accent after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2"
      >
        <span className="sr-only">
          {termin.kind === 'internal' ? 'Fehlzeit öffnen' : 'Termin öffnen'}
        </span>
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-accent tracking-label text-xs font-semibold uppercase">{kicker}</h3>
        {/* „Steht aus" ist der Regelfall und sagt nichts; nur ein abweichender
            Zustand trägt ein Abzeichen (UX-005h). */}
        {termin.status !== 'confirmed' ? (
          <Badge ton={dayPlanStatusTon[termin.status]}>{dayPlanStatusLabels[termin.status]}</Badge>
        ) : relativ ? (
          // Am Telefon ist die Karte zu schmal dafür: Die Angabe bräche in eine
          // eigene Zeile um und schöbe den Hauptknopf vom ersten Bildschirm.
          // Dort sagen es Jetzt-Marke und Wegbalken.
          <p className="text-ink-muted text-sm max-sm:hidden">{relativ}</p>
        ) : null}
      </div>

      {/* Der Name führt in die Akte, und zwar mit dem Weg zurück in den Tag
          wie jedes andere Ziel der Karte (UEB-13). Er ist als Link zu
          erkennen, auch ohne Maus, und 44 px hoch (RSP-06, UIK-15). */}
      <div className="mt-1 flex items-center gap-1.5">
        <p className="text-ink text-h4 min-w-0 font-bold wrap-anywhere">
          {termin.kind === 'training' ? (
            // TRN-006: der Name aus dem Training; er führt zur Kund:in.
            termin.training_relationship_id ? (
              <Link
                to={mitRueckweg(`/training/${termin.training_relationship_id}`, '/')}
                className={namenslink}
              >
                {terminName(termin)}
              </Link>
            ) : (
              terminName(termin)
            )
          ) : termin.kind === 'internal' || !termin.patient_id ? (
            terminName(termin)
          ) : (
            <Link to={mitRueckweg(`/patienten/${termin.patient_id}`, '/')} className={namenslink}>
              {terminName(termin)}
            </Link>
          )}
        </p>
        {hatInfo ? (
          // 22 px im Bild, 44 px zum Tippen: Der Knopf ragt über seine Zeile
          // hinaus, ohne sie höher zu machen.
          <button
            type="button"
            aria-label="Etage, Zugang und Kontakt"
            {...info}
            className="text-accent hover:bg-accent-soft rounded-button relative z-10 -my-2.5 inline-flex size-11 shrink-0 items-center justify-center transition-colors duration-120"
          >
            <span
              aria-hidden="true"
              className={`rounded-pill border-accent inline-flex size-[22px] items-center justify-center border-[1.5px] text-xs leading-none font-bold ${
                infoOffen ? 'bg-accent-soft' : ''
              }`}
            >
              i
            </span>
          </button>
        ) : null}
      </div>

      <p className="text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
        <span>
          {[art, formatLocalTimeRange(termin.starts_at, termin.ends_at, zone), position]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {/* §8.1: abweichende Länge gekennzeichnet (CAL-020). */}
        <Laengenzeichen termin={termin} />
      </p>

      {grund ? (
        <p className="text-warnung mt-2 text-sm font-medium">
          <span aria-hidden="true">! </span>
          {grund}
        </p>
      ) : null}

      {adresse.length > 0 ? (
        <address className="text-ink mt-2.5 min-w-0 text-base leading-[1.4] wrap-anywhere not-italic">
          {adresse.join(', ')}
        </address>
      ) : null}

      {liege || fehlt.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {/* UX-003a: Die Liege gehört zur Person, nicht zum Termin (ANN-116). */}
          {liege ? (
            <span className={`${pille} bg-accent-soft text-accent`}>
              <span aria-hidden="true">✓</span>
              Liege
            </span>
          ) : null}
          {/* PRX-013: Die Pille sagt, dass etwas fehlt; was fehlt, steht in der
              Akte - und für Vorlesesoftware gleich dabei. */}
          {fehlt.length > 0 && termin.patient_id ? (
            <Link
              to={mitRueckweg(`/patienten/${termin.patient_id}`, '/')}
              className={`${pille} ${darueber} bg-warnung-soft text-warnung hover:border-warnung border border-transparent transition-colors duration-120`}
            >
              <span aria-hidden="true">!</span>
              Erstaufnahme offen
              <span className="sr-only">: {openItemsText(fehlt)}</span>
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* „Zugangshinweis" wie im Feld der Stammdaten (WRT-17): „Zugang"
          allein ist in dieser Anwendung die Berechtigung zum Anmelden. */}
      {hatInfo && infoOffen ? (
        <dl
          id={infoId}
          className="bg-canvas rounded-button text-ink relative z-10 mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 px-3 py-2.5 text-sm"
        >
          {stockwerk ? (
            <>
              <dt className="text-ink-muted font-semibold">Etage</dt>
              <dd className="min-w-0 font-semibold wrap-anywhere">{stockwerk}</dd>
            </>
          ) : null}
          {zugang ? (
            <>
              <dt className="text-ink-muted font-semibold">Zugangshinweis</dt>
              <dd className="min-w-0 wrap-anywhere">{zugang}</dd>
            </>
          ) : null}
          {besonderheit ? (
            <>
              <dt className="text-ink-muted font-semibold">Besonderheit</dt>
              <dd className="min-w-0 wrap-anywhere">{besonderheit}</dd>
            </>
          ) : null}
          {/* Kontakt ist Aktion, nicht Text (Oberflächen-Checkliste Punkt 8):
              Textlinks mit 44 px Tippziel. Bis AKTE-008 standen die Nummern
              offen unter den Handlungen; jetzt hier (Jannes 2026-10-03). */}
          {nummern.map((nummer) => (
            <Fragment key={nummer.label}>
              <dt className="text-ink-muted font-semibold">{nummer.label}</dt>
              <dd className="min-w-0">
                <a
                  href={nummer.href}
                  className="text-accent hover:text-accent-hover inline-flex min-h-11 items-center font-semibold tabular-nums underline underline-offset-3 transition-colors"
                >
                  {nummer.anzeige}
                </a>
              </dd>
            </Fragment>
          ))}
        </dl>
      ) : null}

      {hauptaktion || aktionen ? (
        <div className={`${darueber} mt-3.5 flex flex-col gap-2`}>
          {hauptaktion}
          {aktionen ? <div className="flex flex-wrap gap-2">{aktionen}</div> : null}
        </div>
      ) : null}
    </article>
  );
}
