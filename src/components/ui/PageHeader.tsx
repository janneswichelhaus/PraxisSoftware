import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { KnopfGroesse } from './knopfGroesse';
import { titelklassen, type Titelstufe } from './titelstufe';

/**
 * Kopf einer Seite: Titel, erklärender Satz, Aktionen.
 *
 * Der Satz unter dem Titel ist Fließtext und begrenzt sich selbst auf ein
 * lesbares Maß. Seit UI-001 nutzt das Gerüst die volle Fensterbreite; ohne die
 * Begrenzung liefe dieser Satz auf einem breiten Bildschirm über die ganze
 * Seite.
 */
export function PageHeader({
  title,
  description,
  actions,
  kicker,
  kompakt = false,
  stufe,
}: {
  /**
   * Der Seitentitel. `ReactNode`, weil ein Titel den Gegenstand der Seite
   * benennt und der manchmal anklickbar sein soll: Am Termin führt der Name
   * der Patient:in von hier direkt in ihre Akte (UX-012). Fließtext bleibt der
   * Regelfall.
   */
  title: ReactNode;
  /**
   * Die Zeile unter dem Titel, auf ganzer Breite. Als Text steht sie in
   * einer Zeile, der Rest hinter „Mehr“ (BEF-076, Design-Review T1); als
   * Element steht sie, wie sie kommt — die Terminseite trägt dort Datum, Zeit
   * und die Zeichen des Termins (UX-005a), keinen Fließtext.
   */
  description?: ReactNode;
  /**
   * Aktionen rechts neben dem Titel, höchstens eine primär. Knöpfe und
   * Knopf-Links darin sind ohne eigene Angabe **kompakt** (44 px, ANN-403):
   * In voller Größe brach „Anlegen“ am Telefon unter den Titel und schob die
   * Liste nach unten (DESIGN.md, Regel „Kopf“). Sie stehen in der Zeile des
   * Titels, nicht neben dessen Beschreibung (Design-Review T1).
   */
  actions?: ReactNode;
  /**
   * Eine Zeile über dem Titel, die sagt, was für ein Gegenstand die Seite ist
   * („Termin", „Fehlzeit"), wenn der Titel nur seinen Namen trägt
   * (Design-Handoff 2026-10-01, Abschnitt 6): 12 px Versalien wie ein
   * Abschnittstitel. Nicht Teil der Überschrift.
   */
  kicker?: string;
  /**
   * Flacher Kopf für Arbeitsseiten, auf denen das erste Eingabefeld ohne
   * Scrollen erreichbar sein muss — allen voran die Dokumentation
   * (`IDEA-PRX-038`).
   *
   * Titel und Zeile darunter rücken auf eine Zeile, der Titel geht von
   * `--type-h2` auf `--type-h4`. Auf einem 375 × 667-Telefon sind das rund
   * 40 Punkte weniger vor dem Textfeld.
   *
   * **Die Beschreibung entfällt dabei nicht.** Auf den Dokumentationsseiten
   * trägt sie Name, Datum und Uhrzeit — die einzige Kontrolle dagegen, in
   * der falschen Akte zu schreiben. Gespart wird Höhe, nicht Identität.
   */
  kompakt?: boolean;
  /**
   * Eine Stufe der Plattform für einen Titel aus Text (`titelstufe.ts`): der
   * Gruß der Übersicht in 34, am Rechner 40, unter 23rem 28 und ein langer
   * Name in 22 (Handoff 2026-10-22, 5.1; ANN-696). Ein Zeilenumbruch im Text
   * bleibt einer. Den Abstand nach unten setzt dann die Seite.
   */
  stufe?: Titelstufe | undefined;
}) {
  const kopf = (
    <div className={kompakt ? 'flex min-w-0 flex-wrap items-baseline gap-x-3' : 'min-w-0'}>
      {kicker ? (
        <p className="text-ink-muted tracking-label mb-1 text-xs font-semibold uppercase [.plattform-schrift_&]:tracking-normal [.plattform-schrift_&]:normal-case">
          {kicker}
        </p>
      ) : null}
      {/* Seitentitel als `--type-h2` in der Hauptfarbe (DS-001). Der Titel
          ist die einzige Stelle, an der die Marke im Inhalt vorkommt —
          deshalb Hauptfarbe statt Tinte. Unter 640 px 26 statt 32 px
          (Design-Handoff 2026-10-01): Am Telefon passt der Titel damit
          in eine Zeile. Auf der Plattform der Seitentitel ihrer Skala in
          rem, 28 und am Rechner 32 - er wächst mit „Groß“ und „Sehr groß“
          (ANN-683). */}
      <h1
        className={
          stufe && typeof title === 'string'
            ? titelklassen(stufe, title)
            : kompakt
              ? 'text-accent text-h4 font-bold'
              : 'text-accent text-h2-mobil sm:text-h2 tracking-display [.plattform-schrift_&]:text-plattform-titel [.plattform-schrift[data-rechner]_&]:text-plattform-titel-rechner font-extrabold'
        }
      >
        {title}
      </h1>
      {/* Flach steht die Zeile neben dem Titel (IDEA-PRX-038). */}
      {kompakt && description ? <div className="text-ink-muted text-sm">{description}</div> : null}
    </div>
  );

  return (
    <header className={stufe ? undefined : kompakt ? 'mb-4' : 'mb-6'}>
      {/* Titel und Aktionen in einer Zeile (Design-Review T1): Die Aktion
          steht neben dem Titel, nicht unter Titel und Beschreibung - das war
          das Anti-Muster „Anlegen unter dem Titel“ (DESIGN.md). Der Titel
          nimmt den Rest der Zeile und bricht zwischen Wörtern um; erst wenn
          sein längstes Wort neben den Aktionen keinen Platz hat, rücken sie
          darunter (`basis-36` samt Mindestbreite des längsten Worts). Steht
          die Aktion allein in der Zeile, darf sie schmaler werden als ihr
          Text breit ist - bei 200 % Vergrößerung bricht dann die Beschriftung
          um, statt die Seite waagerecht scrollen zu lassen (POR-020). */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {actions ? <div className="flex-1 basis-36">{kopf}</div> : kopf}
        {actions ? (
          <div className="ml-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2">
            <KnopfGroesse value="kompakt">{actions}</KnopfGroesse>
          </div>
        ) : null}
      </div>
      {/* Die Beschreibung darunter auf ganzer Breite, höchstens eine Zeile
          (DESIGN.md Regel 6); was länger ist, steht hinter „Mehr“. */}
      {kompakt || !description ? null : typeof description === 'string' ? (
        <Beschreibung text={description} />
      ) : (
        <div className="text-ink-muted mt-1 max-w-prose text-sm">{description}</div>
      )}
    </header>
  );
}

/**
 * Ab dieser Länge steht die Beschreibung immer eingeklappt (BEF-076): mehr
 * als eine Zeile ist sie auch am Rechner (`max-w-prose`). Kürzere klappen
 * ein, sobald sie gemessen nicht in eine Zeile passen - am Telefon also schon
 * ab rund 50 Zeichen (Design-Review T1).
 */
const KURZ = 90;

/**
 * Die Beschreibung unter dem Titel: eine Zeile, der Rest hinter „Mehr“
 * (BEF-076, DESIGN.md Regel 6).
 *
 * Jannes: „Es ist immer extrem viel Text zu sehen.“ Die Zeile bleibt; wer
 * mehr braucht, klappt sie auf - der Rest der Seite rückt nach oben. Ob sie
 * in eine Zeile passt, entscheidet die Breite, nicht die Zeichenzahl: Bis zum
 * Design-Review standen Sätze unter 90 Zeichen am Telefon zweizeilig da. Der
 * ganze Text steht auch eingeklappt im Dokument, Vorlesewerkzeuge lesen ihn
 * vollständig.
 */
function Beschreibung({ text }: { text: string }) {
  const [offen, setOffen] = useState(false);
  const [abgeschnitten, setAbgeschnitten] = useState(text.length > KURZ);
  const zeile = useRef<HTMLParagraphElement>(null);
  const id = useId();

  // Gemessen nur eingeklappt: Aufgeklappt passt alles, und „Weniger“ muss
  // trotzdem bleiben. Neu bei jeder Breitenänderung (Drehen, Seitenleiste).
  useLayoutEffect(() => {
    const element = zeile.current;
    if (!element || offen) return;
    const messen = () =>
      setAbgeschnitten(text.length > KURZ || element.scrollHeight > element.clientHeight + 1);
    messen();
    const beobachter =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(messen);
    beobachter?.observe(element);
    return () => beobachter?.disconnect();
  }, [text, offen]);

  return (
    <div className="mt-1 flex max-w-prose items-baseline gap-2">
      <p
        ref={zeile}
        id={id}
        className={`text-ink-muted min-w-0 text-sm ${offen ? '' : 'line-clamp-1'}`}
      >
        {text}
      </p>
      {abgeschnitten ? (
        <button
          type="button"
          aria-expanded={offen}
          aria-controls={id}
          onClick={() => setOffen((bisher) => !bisher)}
          className="text-accent -my-3 min-h-11 shrink-0 text-sm font-semibold underline underline-offset-2"
        >
          {offen ? 'Weniger' : 'Mehr'}
        </button>
      ) : null}
    </div>
  );
}
