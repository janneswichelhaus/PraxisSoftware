import type { ReactNode } from 'react';

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
  description?: string | undefined;
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
            deshalb Hauptfarbe statt Tinte. */}
        <h1
          className={
            kompakt
              ? 'text-accent text-h4 font-bold'
              : 'text-accent text-h2 tracking-display font-extrabold'
          }
        >
          {title}
        </h1>
        {description ? (
          <p className={`text-ink-muted max-w-prose text-sm ${kompakt ? '' : 'mt-1'}`}>
            {description}
          </p>
        ) : null}
      </div>
      {actions}
    </header>
  );
}
