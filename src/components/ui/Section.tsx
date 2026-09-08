import type { ReactNode } from 'react';

/**
 * Abschnitt mit Überschrift innerhalb einer Seite (UI-000).
 *
 * Bisher stand dieselbe `<section>` mit derselben Überschriftenklasse in sechs
 * Dateien, mal `Section`, mal `Abschnitt` genannt, und mit `h2` an Stellen, an
 * denen die Seite schon eine `h2` hatte. Hier ist beides an einer Stelle: die
 * Gestaltung und die Ebene der Überschrift.
 *
 * `ebene` steuert nur, welches Element entsteht — das Aussehen bleibt gleich.
 * Eine Seite mit `PageHeader` (h1) nutzt `h2`; ein Abschnitt innerhalb eines
 * Abschnitts nutzt `h3`. Übersprungene Ebenen sind für Vorlesesoftware eine
 * fehlende Stufe in der Gliederung.
 */
export function Section({
  titel,
  hinweis,
  ebene = 2,
  aktion,
  children,
}: {
  titel: string;
  /** Erklärender Satz unter der Überschrift. */
  hinweis?: ReactNode;
  ebene?: 2 | 3;
  /** Schaltfläche oder Link rechts neben der Überschrift. */
  aktion?: ReactNode;
  children: ReactNode;
}) {
  const Ueberschrift = ebene === 3 ? 'h3' : 'h2';
  return (
    <section className="mt-8 first:mt-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Ueberschrift className="text-ink-muted text-sm font-semibold tracking-wide uppercase">
          {titel}
        </Ueberschrift>
        {aktion}
      </div>
      {hinweis ? <p className="text-ink-muted mt-1 max-w-prose text-sm">{hinweis}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Der übliche Inhalt eines Formularabschnitts: Felder untereinander.
 *
 * Steht getrennt von `Section`, weil ein Abschnitt auch eine Liste, eine
 * Tabelle oder eine Definitionsliste enthalten kann.
 */
export function Feldgruppe({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}
