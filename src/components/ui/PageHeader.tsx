import { useId, useState, type ReactNode } from 'react';

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
  kompakt = false,
}: {
  /**
   * Der Seitentitel. `ReactNode`, weil ein Titel den Gegenstand der Seite
   * benennt und der manchmal anklickbar sein soll: Am Termin führt der Name
   * der Patient:in von hier direkt in ihre Akte (UX-012). Fließtext bleibt der
   * Regelfall.
   */
  title: ReactNode;
  /**
   * Die Zeile unter dem Titel. Als Text wird sie ab einer Länge eingeklappt
   * (BEF-076); als Element steht sie, wie sie kommt — die Terminseite trägt
   * dort Datum, Zeit und die Zeichen des Termins (UX-005a), keinen Fließtext.
   */
  description?: ReactNode;
  actions?: ReactNode;
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
}) {
  return (
    <header
      className={`flex flex-wrap items-end justify-between gap-3 ${kompakt ? 'mb-4' : 'mb-6'}`}
    >
      <div className={kompakt ? 'flex min-w-0 flex-wrap items-baseline gap-x-3' : ''}>
        {/* Seitentitel als `--type-h2` in der Hauptfarbe (DS-001). Der Titel
            ist die einzige Stelle, an der die Marke im Inhalt vorkommt —
            deshalb Hauptfarbe statt Tinte. Unter 640 px 26 statt 32 px
            (Design-Handoff 2026-10-01): Am Telefon passt der Titel damit
            in eine Zeile. */}
        <h1
          className={
            kompakt
              ? 'text-accent text-h4 font-bold'
              : 'text-accent text-h2-mobil sm:text-h2 tracking-display font-extrabold'
          }
        >
          {title}
        </h1>
        {typeof description === 'string' && description ? (
          kompakt || description.length <= KURZ ? (
            <p className={`text-ink-muted max-w-prose text-sm ${kompakt ? '' : 'mt-1'}`}>
              {description}
            </p>
          ) : (
            <Erklaerung text={description} />
          )
        ) : description && typeof description !== 'string' ? (
          <div className={`text-ink-muted max-w-prose text-sm ${kompakt ? '' : 'mt-1'}`}>
            {description}
          </div>
        ) : null}
      </div>
      {actions}
    </header>
  );
}

/**
 * Ab dieser Länge steht die Erklärung unter dem Titel eingeklappt (BEF-076).
 * Etwa eine Zeile am Handy; kürzere Sätze stehen ganz da.
 */
const KURZ = 90;

/**
 * Eine lange Erklärung zeigt ihre erste Zeile und „Mehr" (BEF-076).
 *
 * Jannes: „Es ist immer extrem viel Text zu sehen." Die Erklärungen bleiben,
 * wer sie braucht, klappt sie auf - der Rest der Seite rückt nach oben. Der
 * ganze Text steht auch eingeklappt im Dokument, Vorlesewerkzeuge lesen ihn
 * vollständig.
 */
function Erklaerung({ text }: { text: string }) {
  const [offen, setOffen] = useState(false);
  const id = useId();
  return (
    <div className="mt-1 flex max-w-prose items-start gap-2">
      <p id={id} className={`text-ink-muted min-w-0 text-sm ${offen ? '' : 'line-clamp-1'}`}>
        {text}
      </p>
      <button
        type="button"
        aria-expanded={offen}
        aria-controls={id}
        onClick={() => setOffen((bisher) => !bisher)}
        className="text-accent -my-3 min-h-11 shrink-0 text-sm font-semibold underline underline-offset-2"
      >
        {offen ? 'Weniger' : 'Mehr'}
      </button>
    </div>
  );
}
