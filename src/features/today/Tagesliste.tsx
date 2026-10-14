import { Fragment, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { Textlink } from '@/components/ui/Textlink';
import { Laengenzeichen } from '@/features/appointments/Laengenzeichen';
import { LetzterEintragVorDerTuer } from '@/features/appointments/Kurzblick';
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

/**
 * Eine Pille, die ein Link ist: 36 px im Bild, 44 px zum Tippen (DESIGN.md
 * Grundsatz 3; Design-Review R2, H1). Das Ziel ragt 4 px über und unter die
 * Pille, ohne die Zeile höher zu machen.
 */
const pillenlink = 'group rounded-pill -my-1 inline-flex min-h-11 items-center';

/**
 * Der Name als Link: 20 px in 700, Unterstrich 2 px mit 4 px Abstand.
 *
 * Das Tippziel ist 44 px hoch, reicht aber vom Namen **nach unten** über die
 * Zeile mit der Uhrzeit (Text, kein Ziel) statt 10 px nach oben: Darüber
 * liegt das Ziel von „Termin →". Mittig ausgerichtet überlappten beide bei
 * 375 px um 10 px, und ein Tipp auf den unteren Rand von „Termin →" traf das
 * „i" (Design-Review R2, neu1). Der Rand unten nimmt die 19 px aus dem Fluss.
 */
const namenslink =
  'text-accent hover:text-accent-hover inline-flex min-h-11 items-start pb-[19px] -mb-[19px] ' +
  'underline decoration-2 underline-offset-4 transition-colors';

/**
 * Der eine ausgeklappte Termin im Zeitstrahl, so wie man ihn an der
 * Wohnungstür braucht (UX-001, Design-Handoff 2026-10-01).
 *
 * Bewusst eine Karte statt einer Zeile: Anschrift, Zugang und Rufnummer
 * müssen bei 375 px ohne einen Seitenwechsel erreichbar sein.
 *
 * **Der Termin ist ein kleiner Link „Termin →“ in der Kopfzeile** (Praxis-
 * Review R2, P1). Von UBK-004 bis dahin spannte ein Link seine Fläche über
 * die ganze Karte (`after:inset-0`): Ein Fehltipp neben Doku, Hörer oder
 * Haken landete im Kalender - unterwegs, mit einer Hand. Jetzt ist nur, was
 * wie ein Ziel aussieht, auch eines; die Knöpfe stehen 12 px auseinander.
 *
 * Die Uhrzeit des Beginns steht am Zeitstrahl daneben; die Karte nennt die
 * ganze Spanne in der Nebenzeile, weil das Ende am Strahl nicht steht.
 *
 * **Pillen statt Textblock:** Liege und offene Erstaufnahme stehen als Pillen
 * unter den Knöpfen (seit Auftrag C1; bis dahin unter der Anschrift, wo sie
 * den Hauptknopf am Telefon unter die Tableiste schoben). Etage,
 * Zugangshinweis, Besonderheit und Rufnummern liegen hinter dem Info-Knopf
 * „i“ - seit UBK-004 in der Namenszeile, bis
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
  hinweis,
  abschlussgespraech,
  vorDerTuer = false,
  onZuklappen,
}: {
  termin: DayPlanEntry;
  /**
   * Die Zeile über dem Namen: „Erster Weg · ≈ 12 min", „Jetzt · bis 10:10".
   * Ein Element, wenn ein Teil davon am Telefon weichen darf.
   */
  kicker: ReactNode;
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
  /** Eine Warnung zum Weg, etwa die veraltete Anschrift am Termin (ANN-236). */
  hinweis?: string | null;
  /** KND-001: einer der letzten Termine - Zeit für das Abschlussgespräch (ANN-286). */
  abschlussgespraech?: boolean;
  /**
   * Darf die Person den letzten Eintrag lesen (`canReadTreatmentNote`)? Dann
   * steht er hinter dem „i“ neben Zugang und Material (K3, ANN-501).
   */
  vorDerTuer?: boolean;
  /**
   * Eine aufgeklappte Zeile des Zeitstrahls (Auftrag C1) klappt hier wieder
   * zu - rechts in der Kopfzeile, neben einem Abzeichen.
   */
  onZuklappen?: () => void;
}) {
  const [infoOffen, setInfoOffen] = useState(false);
  const infoId = useId();
  const zone = termin.organization_time_zone;
  const adresse = adressZeilen(termin);
  const nummern = rufnummern(termin);
  const grund = offenGrund(termin) ?? hinweis ?? null;
  const art = einordnung(termin);
  const { stockwerk, rest: zugang } = zugangMitStockwerk(termin.home_visit_access_note);
  const besonderheit = termin.special_note?.trim() || null;
  // Material und letzter Eintrag vor der Tür (K3, ANN-501): Das Material
  // kommt aus dem Tagesplan, der Eintrag wird erst beim Öffnen gelesen.
  const material = termin.take_along_items ?? [];
  const mitEintrag = vorDerTuer && termin.kind === 'therapy' && termin.patient_id !== null;
  const hatInfo =
    stockwerk !== null ||
    zugang !== null ||
    besonderheit !== null ||
    nummern.length > 0 ||
    material.length > 0 ||
    mitEintrag;
  // Die Liege fährt nur zum Hausbesuch mit (BEF-051, ANN-116 Fassung 2).
  const liege =
    termin.treatment_table_required === true && termin.appointment_type === 'home_visit';
  const fehlt = termin.kind === 'therapy' && termin.patient_id ? (erstaufnahme ?? []) : [];
  const abschluss = abschlussgespraech === true && termin.kind === 'therapy' && !!termin.patient_id;
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
    <article className="rounded-card border-line bg-surface border px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-accent tracking-label text-xs font-semibold uppercase">{kicker}</h3>
        {/* „Steht aus" ist der Regelfall und sagt nichts; nur ein abweichender
            Zustand trägt ein Abzeichen (UX-005h). Bricht die Zeile um, bleibt
            dieser Teil rechts - das Zuklappen steht immer am selben Ort. */}
        <span className="ml-auto flex items-center gap-3 empty:hidden">
          {termin.status !== 'confirmed' ? (
            <Badge ton={dayPlanStatusTon[termin.status]}>
              {dayPlanStatusLabels[termin.status]}
            </Badge>
          ) : relativ ? (
            // Am Telefon ist die Karte zu schmal dafür: Die Angabe bräche in eine
            // eigene Zeile um und schöbe den Hauptknopf vom ersten Bildschirm.
            // Dort sagen es Jetzt-Marke und Wegbalken.
            <p className="text-ink-muted text-sm max-sm:hidden">{relativ}</p>
          ) : null}
          {/* Der Weg in den Termin (Absage, Verlegen, wieder öffnen) - klein,
              aber 44 px hoch; der Name der Karte führt in die Akte. Das
              Tippziel ragt 14 px über und unter die Zeile, ohne sie höher zu
              machen: Am Telefon bleibt der Hauptknopf über der Tableiste.
              Unten endet es, wo die Zeile des Namens beginnt. */}
          <Textlink alleinstehend to={terminZiel} className="-my-3.5 gap-1 text-sm font-semibold">
            {termin.kind === 'internal' ? 'Fehlzeit' : 'Termin'}{' '}
            <span className="sr-only">öffnen</span>
            <span aria-hidden="true">→</span>
          </Textlink>
          {onZuklappen ? (
            <Symbolknopf
              beschriftung={`Zuklappen: ${terminName(termin)}`}
              data-zuklappen=""
              aria-expanded
              onClick={onZuklappen}
              className="-my-2.5 -mr-2"
            >
              <span className="size-2 translate-y-0.5 rotate-45 border-t-2 border-l-2 border-current" />
            </Symbolknopf>
          ) : null}
        </span>
      </div>

      {/* Der Name führt in die Akte, und zwar mit dem Weg zurück in den Tag
          wie jedes andere Ziel der Karte (UEB-13). Er ist als Link zu
          erkennen, auch ohne Maus, und 44 px hoch (RSP-06, UIK-15). Die
          Zeile beginnt erst, wo das Ziel von „Termin →" endet (14 px unter
          dem Kicker); Name und „i" ragen dafür nach unten (R2, neu1). */}
      <div className="mt-3.5 flex items-center gap-1.5">
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
          // 22 px im Bild, 44 px zum Tippen: Der Knopf ragt wie der Name nach
          // unten über seine Zeile hinaus, ohne sie höher zu machen; das
          // Zeichen rückt um dieselben 10 px hoch auf die Mitte des Namens.
          <Symbolknopf beschriftung="Vor der Tür" {...info} className="-mb-[19px] shrink-0">
            <span
              className={`rounded-pill border-accent inline-flex size-[22px] -translate-y-2.5 items-center justify-center border-[1.5px] text-xs leading-none font-bold ${
                infoOffen ? 'bg-accent-soft' : ''
              }`}
            >
              i
            </span>
          </Symbolknopf>
        ) : null}
      </div>

      {/* Über dieser Zeile liegen die unteren 11 px der Ziele von Name und
          „i". Sie ist nur Text und lässt den Tipp zu ihnen durch, bleibt
          aber über ihnen gezeichnet (kein Überdecken beim Überfahren). */}
      <p className="text-ink-muted pointer-events-none mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
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

      {/* „Zugangshinweis" wie im Feld der Stammdaten (WRT-17): „Zugang"
          allein ist in dieser Anwendung die Berechtigung zum Anmelden. */}
      {hatInfo && infoOffen ? (
        <dl
          id={infoId}
          className="bg-canvas rounded-button text-ink mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 px-3 py-2.5 text-sm"
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
          {/* PRX-007: von Hand an der Person gepflegt (ANN-138) - hinter dem
              „i“, nicht offen neben dem Namen. */}
          {material.length > 0 ? (
            <>
              <dt className="text-ink-muted font-semibold">Material</dt>
              <dd className="min-w-0 wrap-anywhere">{material.join(', ')}</dd>
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
          {mitEintrag ? (
            <>
              {/* Über die ganze Breite: Der Wortlaut ist länger als eine
                  Angabe (ADR-006, ungekürzt). */}
              <dt className="text-ink-muted col-span-2 mt-1 font-semibold">Letzter Eintrag</dt>
              <dd className="col-span-2 min-w-0">
                <LetzterEintragVorDerTuer appointmentId={termin.id} />
                <span className="text-ink-muted mt-1 block text-xs">Lesen wird protokolliert.</span>
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {/* 12 px zwischen den Knöpfen (P1): Mit 8 px traf ein Daumen am
          Lastenrad den Nachbarn - und der Haken schließt ab. */}
      {hauptaktion || aktionen ? (
        <div className="mt-3.5 flex flex-col gap-3">
          {hauptaktion}
          {aktionen ? <div className="flex flex-wrap gap-3">{aktionen}</div> : null}
        </div>
      ) : null}
      {/* Unter den Knöpfen (Auftrag C1): Der Hauptknopf bleibt am Telefon
          über der Tableiste, die Pillen stehen gleich darunter. */}
      {liege || fehlt.length > 0 || abschluss ? (
        // 8 px zwischen umgebrochenen Pillen: Die Ziele der Links ragen je
        // 4 px darüber hinaus und stoßen dann aneinander, ohne zu überlappen.
        <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-2">
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
            <Link to={mitRueckweg(`/patienten/${termin.patient_id}`, '/')} className={pillenlink}>
              <span
                className={`${pille} bg-warnung-soft text-warnung group-hover:border-warnung border border-transparent transition-colors duration-120`}
              >
                <span aria-hidden="true">!</span>
                Erstaufnahme offen
                <span className="sr-only">: {openItemsText(fehlt)}</span>
                <span aria-hidden="true">→</span>
              </span>
            </Link>
          ) : null}
          {/* KND-001: In den letzten Terminen erinnert die Karte an das
              Abschlussgespräch (4.10, ANN-286). Angeboten wird mündlich; das
              Angebot hält die Akte fest. */}
          {abschluss && termin.patient_id ? (
            <Link to={mitRueckweg(`/patienten/${termin.patient_id}`, '/')} className={pillenlink}>
              <span
                className={`${pille} bg-accent-soft text-accent group-hover:border-accent border border-transparent transition-colors duration-120`}
              >
                Abschlussgespräch
                <span className="sr-only">: Wie geht es nach der Behandlung weiter?</span>
                <span aria-hidden="true">→</span>
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
