import { Wortmarke } from '@/components/ui/Wortmarke';
import { dosierungZeile, haeufigkeit, steigerungsregel, type Dosis } from './dosierung';

/**
 * Der zugewiesene Plan als Blatt (UEB-008, ANN-303) - zum Ausdrucken oder als
 * PDF über den Druckdialog des Browsers, dieselbe Technik wie Rechnung und
 * Terminzettel. Das Blatt hat den vollen Nutzen ohne Plattform: Wer kein
 * Konto hat, bekommt seinen Plan auf Papier (ADR-023 Punkt 7).
 *
 * **Reine Darstellung, kein Datenzugriff.** Die Praxis (`PlanblattSeite`) und
 * die Plattform (UEB-009) reichen den Plan aus ihrer eigenen Quelle herein;
 * das Blatt zeigt nur den **Schnappschuss** der Zuweisung in Alltagssprache
 * (ANN-300, IDEA-QSN-002) - nie die fachlichen Bezeichnungen, nie die
 * Bibliothek von heute. Kein Kopf in einem `header`: Er soll gedruckt werden
 * (`src/index.css`, UXR-001).
 *
 * Gestalt nach dem Handoff 2026-10-24, Abschnitt 5.7: Kopf mit Wortmarke,
 * „Ihr Übungsplan“ und Stand; Planname, Laufzeit und Häufigkeit, auf der
 * Plattform die Übungstage; je Übung ein Block mit Linie oben - Nummer im
 * Kreis, Name, Dosierung in einer Zeile, Regel zur Steigerung, nummerierte
 * Schritte, „Sie brauchen:“, „Hinweis:“; Fuß mit der Praxis. Drei Maße:
 * Telefon (Schrift 18), Rechner (`gross`) und Druck (A4, Schrift 16 = 12 pt,
 * Kleines 14, Linien ab 1, nur Tinte und Grau). Eine Zeichnung gibt es nicht
 * (ANN-539). Eine Übung bricht nicht über zwei Seiten.
 */

export interface BlattPosition extends Dosis {
  position: number;
  variant_lay_name: string;
  instruction: string | null;
  equipment: string[];
  note: string | null;
}

export interface BlattPlan {
  title: string;
  service_area: 'therapy' | 'training';
  sessions_per_week: number | null;
  runs_from: string | null;
  runs_until: string | null;
  items: BlattPosition[];
}

/** Die Anleitung in Schritten - je Zeile einer (Katalog), sonst ein Absatz. */
function schritte(text: string | null): string[] {
  return (text ?? '')
    .split('\n')
    .map((zeile) => zeile.trim())
    .filter(Boolean);
}

/** „ · “ mit geschütztem Leerzeichen davor: Der Punkt beginnt nie eine Zeile. */
const TRENNER = '\u00a0· ';

const WOCHENTAGE = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
];

export function Planblatt({
  plan,
  praxis,
  fuer,
  stand = null,
  uebungstage = [],
  gross = false,
}: {
  plan: BlattPlan;
  praxis: string | null;
  /** Der Name der Person - auf dem Blatt der Praxis, nicht auf der Plattform. */
  fuer?: string;
  /**
   * Der Stand: der Tag der Zuweisung in der Zeitzone der Praxis - auf beiden
   * Ausdrucken derselben Fassung derselbe (ANN-731).
   */
  stand?: string | null;
  /** Nur auf der Plattform: die Übungstage der Person; die Praxis kennt sie nicht (ANN-307). */
  uebungstage?: readonly number[];
  /** Die Maße des Rechners; der Druck hat seine eigenen. */
  gross?: boolean;
}) {
  const tage = [...uebungstage].sort((a, b) => a - b).flatMap((t) => WOCHENTAGE[t - 1] ?? []);
  const laufzeit = [
    zeitraum(plan),
    plan.sessions_per_week ? haeufigkeit(plan.sessions_per_week) : null,
  ]
    .filter(Boolean)
    .join(TRENNER);
  const fett = gross ? 'font-bold' : 'font-semibold print:font-bold';

  return (
    <article
      aria-label="Planblatt"
      className={`text-ink flex max-w-[210mm] flex-col text-lg print:gap-6 print:text-[16px] print:leading-[1.55] ${gross ? 'gap-6' : 'gap-5'}`}
    >
      <div
        className={`print:border-b-ink flex flex-wrap justify-between gap-y-2 print:items-center print:gap-6 print:border-b-[1.5px] print:pb-4 ${
          gross
            ? 'border-b-ink items-center gap-6 border-b-[1.5px] pb-4'
            : 'border-b-line-strong items-start gap-3 border-b pb-3'
        }`}
      >
        {/* Die farbige Datei, im Druck dunkel genug (Handoff 5.7); dort 40 hoch. */}
        <Wortmarke hoehe={gross ? 36 : 28} className="print:hidden" />
        <Wortmarke hoehe={40} className="hidden print:block" />
        {/* Ist neben der Marke kein Platz (200 %), rückt die Angabe darunter. */}
        <p className="flex min-w-0 flex-1 basis-40 flex-col items-end text-right">
          <span className="font-bold">
            {plan.service_area === 'therapy' ? 'Ihr Übungsplan' : 'Ihr Trainingsplan'}
            {fuer ? ` für ${fuer}` : ''}
          </span>
          {stand ? (
            <span className="text-ink-muted text-base print:text-[14px]">
              Stand {tagLang(stand, true)}
            </span>
          ) : null}
        </p>
      </div>
      <div className={`flex flex-col print:gap-1.5 ${gross ? 'gap-1.5' : 'gap-1'}`}>
        <h2
          className={`trennen-schmal font-extrabold print:text-[28px] print:leading-[1.15] print:tracking-[-0.02em] ${
            gross ? 'text-plattform-titel' : 'text-abschnitt'
          }`}
        >
          {plan.title}
        </h2>
        {laufzeit ? <p>{laufzeit}</p> : null}
        {tage.length > 0 ? <p>Ihre Übungstage: {tage.join(', ')}</p> : null}
      </div>
      <ol className={`flex flex-col print:gap-6 ${gross ? 'gap-6' : 'gap-5'}`}>
        {plan.items.map((p) => {
          const anleitung = schritte(p.instruction);
          const regel = steigerungsregel(p);
          return (
            <li
              key={p.position}
              className={`print:border-t-line-strong flex break-inside-avoid flex-col gap-2 border-t print:pt-5 ${
                gross ? 'border-t-line-strong pt-5' : 'border-t-line pt-4'
              }`}
            >
              <h3
                className={`trennen-schmal flex items-center font-bold print:gap-3 print:text-[20px] print:leading-[1.3] ${
                  gross ? 'text-abschnitt gap-3' : 'gap-2.5 leading-[1.4]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`border-ink rounded-pill inline-flex shrink-0 items-center justify-center self-start border-[1.5px] text-lg print:size-8 print:text-[16px] ${
                    gross ? 'size-9' : 'size-7'
                  }`}
                >
                  {p.position}
                </span>
                <span className="sr-only">{p.position}. </span>
                {p.variant_lay_name}
              </h3>
              <p className={fett}>{dosierungZeile(p)}</p>
              {regel ? <p>{regel}</p> : null}
              {anleitung.length > 1 ? (
                <ol className="flex list-decimal flex-col gap-1 pl-6">
                  {anleitung.map((schritt, index) => (
                    <li key={index}>{schritt}</li>
                  ))}
                </ol>
              ) : anleitung.length === 1 ? (
                <p>{anleitung[0]}</p>
              ) : null}
              {p.equipment.length > 0 ? (
                <p>
                  <span className={fett}>Sie brauchen:</span> {p.equipment.join(', ')}
                </p>
              ) : null}
              {p.note ? (
                <p>
                  <span className={fett}>Hinweis:</span> {p.note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div
        className={`print:border-t-ink flex flex-col gap-0.5 print:border-t-[1.5px] print:pt-4 ${
          gross ? 'border-t-ink border-t-[1.5px] pt-4' : 'border-t-line-strong border-t pt-3'
        }`}
      >
        <p className="text-ink-muted print:text-ink">
          Fragen zu den Übungen? Sprechen Sie uns beim nächsten Termin an.
        </p>
        {praxis ? <p className="text-ink-muted text-base print:text-[14px]">{praxis}</p> : null}
      </div>
    </article>
  );
}

/**
 * „17. September“ oder „17. September 2026“ - ein Kalendertag ohne
 * Zeitzonenrechnung; das Datum bricht nicht in sich.
 */
function tagLang(tag: string, mitJahr: boolean): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'long',
    ...(mitJahr ? { year: 'numeric' } : {}),
  })
    .format(new Date(`${tag}T12:00:00`))
    .replaceAll(' ', '\u00a0');
}

/** „Gültig vom 17. September bis 29. Oktober 2026“ - das Jahr am Ende, bei zweien beide. */
function zeitraum(plan: Pick<BlattPlan, 'runs_from' | 'runs_until'>): string | null {
  const { runs_from: von, runs_until: bis } = plan;
  if (von && bis) {
    return `Gültig vom ${tagLang(von, von.slice(0, 4) !== bis.slice(0, 4))} bis ${tagLang(bis, true)}`;
  }
  return von ? `Gültig ab ${tagLang(von, true)}` : null;
}
