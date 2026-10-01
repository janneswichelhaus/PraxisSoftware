import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Laengenzeichen } from '@/features/appointments/Laengenzeichen';
import { Textlink } from '@/components/ui/Textlink';
import { mitRueckweg } from '@/lib/rueckweg';
import { formatLocalTimeRange } from '@/features/appointments/api';
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
  'text-accent hover:text-accent-hover inline-flex min-h-11 items-center underline decoration-2 ' +
  'underline-offset-4 transition-colors';

/**
 * Der eine ausgeklappte Termin im Zeitstrahl, so wie man ihn an der
 * Wohnungstür braucht (UX-001, Design-Handoff 2026-10-01).
 *
 * Bewusst eine Karte statt einer Zeile: Anschrift, Zugang und Rufnummer
 * müssen bei 375 px ohne einen Seitenwechsel erreichbar sein. Die Karte ist
 * als Ganzes KEIN Link: Sie enthält mehrere eigenständige Ziele - Akte,
 * Termin, Anruf, Navigation. Verschachtelte Klickflächen sind mit Tastatur
 * und Vorlesesoftware nicht auseinanderzuhalten.
 *
 * Die Uhrzeit des Beginns steht am Zeitstrahl daneben; die Karte nennt die
 * ganze Spanne in der Nebenzeile, weil das Ende am Strahl nicht steht.
 *
 * **Pillen statt Textblock:** Stockwerk, Liege und offene Erstaufnahme stehen
 * als Pillen unter der Anschrift. Zugangshinweis und Besonderheit liegen
 * hinter dem Info-Knopf am Ende der Adresszeile - und hinter der
 * Stockwerk-Pille, die dasselbe aufklappt: Sie sind wichtig, wenn man vor
 * der Tür steht, und sonst Text, den Umstehende mitlesen. Ohne Hinweise gibt
 * es keinen Knopf. Das Stockwerk kommt vorerst vom Anfang des Zugangshinweises
 * (ANN-197, `stockwerk.ts`).
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
  const hatInfo = zugang !== null || besonderheit !== null;
  const liege = termin.treatment_table_required === true;
  const fehlt = termin.kind === 'therapy' && termin.patient_id ? (erstaufnahme ?? []) : [];
  // Der Verweis auf die Hinweise steht nur da, solange es sie im Dokument
  // gibt (wie bei der Suche, UIK-08).
  const info = {
    'aria-expanded': infoOffen,
    ...(infoOffen ? { 'aria-controls': infoId } : {}),
    onClick: () => setInfoOffen((offen) => !offen),
  };

  return (
    <article className="rounded-card border-line bg-surface border px-4 py-3.5">
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
      <p className="text-ink text-h4 mt-1 min-w-0 font-bold wrap-anywhere">
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

      {adresse.length > 0 || hatInfo ? (
        <div className="mt-2.5 flex items-center gap-1.5">
          {adresse.length > 0 ? (
            <address className="text-ink min-w-0 text-base leading-[1.4] wrap-anywhere not-italic">
              {adresse.join(', ')}
            </address>
          ) : null}
          {hatInfo ? (
            // 22 px im Bild, 44 px zum Tippen: Der Knopf ragt über seine Zeile
            // hinaus, ohne sie höher zu machen.
            <button
              type="button"
              aria-label="Zugang und Besonderheiten"
              {...info}
              className="text-accent hover:bg-accent-soft rounded-button -my-2.5 -ml-1 inline-flex size-11 shrink-0 items-center justify-center transition-colors duration-120"
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
      ) : null}

      {stockwerk || liege || fehlt.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {stockwerk ? (
            hatInfo ? (
              <button
                type="button"
                {...info}
                className={`${pille} border-line-strong text-ink hover:bg-accent-soft border transition-colors duration-120`}
              >
                {stockwerk}
              </button>
            ) : (
              <span className={`${pille} border-line-strong text-ink border`}>{stockwerk}</span>
            )
          ) : null}
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
              className={`${pille} bg-warnung-soft text-warnung hover:border-warnung border border-transparent transition-colors duration-120`}
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
          className="bg-canvas rounded-button text-ink mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-2.5 text-sm"
        >
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
        </dl>
      ) : null}

      {hauptaktion || aktionen ? (
        <div className="mt-3.5 flex flex-col gap-2">
          {hauptaktion}
          {aktionen ? <div className="flex flex-wrap gap-2">{aktionen}</div> : null}
        </div>
      ) : null}

      {/* Kontakt ist Aktion, nicht Text (Oberflächen-Checkliste Punkt 8). Die
          Nummern stehen hinter den Handlungen (`IDEA-PRX-040`): wichtig, aber
          selten - gebraucht werden sie, wenn niemand öffnet. Weggeklappt
          werden sie deshalb nicht; im Hausflur mit Handschuhen ist die Nummer
          die einzige Handlung, die den Besuch noch rettet. */}
      <div className="border-line mt-3 flex flex-wrap items-center justify-between gap-x-4 border-t pt-1">
        <div className="flex flex-wrap gap-x-4">
          {nummern.map((nummer) => (
            <a
              key={nummer.label}
              href={nummer.href}
              className="text-accent hover:text-accent-hover inline-flex min-h-11 items-center gap-1.5 text-sm transition-colors"
            >
              <span className="text-ink-muted">{nummer.label}</span>
              <span className="font-semibold tabular-nums underline underline-offset-3">
                {nummer.anzeige}
              </span>
            </a>
          ))}
        </div>
        {/* Der Pfeil zeigt die Richtung, er gehört nicht zum Namen des Links
            (WRT-08): Vorlesesoftware sagt sonst „Pfeil nach rechts". Den
            Abstand davor trägt `gap-1` - ein Leerzeichen am Ende des Textes
            fiele im Flex-Kasten weg. */}
        <Textlink
          alleinstehend
          to={mitRueckweg(
            termin.kind === 'training' ? `/training/termine/${termin.id}` : `/termine/${termin.id}`,
            '/',
          )}
          className="ml-auto gap-1 text-sm font-semibold"
        >
          {termin.kind === 'internal' ? 'Fehlzeit öffnen' : 'Termin öffnen'}
          <span aria-hidden="true">→</span>
        </Textlink>
      </div>
    </article>
  );
}
