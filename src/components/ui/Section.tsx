import type { ReactNode } from 'react';
import { Inhaltsflaeche } from './Card';

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
 *
 * `rahmen` stellt den Inhalt auf Papier (UI-002c). Die Überschrift bleibt
 * außerhalb: Sie ist die Beschriftung des Rahmens, nicht sein erster Eintrag.
 * Gedacht für **Auskunft** — Termine, Verordnungen, Stammdaten, Tagesliste.
 * Formulare bekommen keinen: Ihre Felder sind ohnehin weiß, und ein zweiter
 * weißer Kasten darum trägt nichts bei.
 */
export function Section({
  titel,
  hinweis,
  ebene = 2,
  aktion,
  rahmen = false,
  children,
}: {
  titel: string;
  /** Erklärender Satz unter der Überschrift. */
  hinweis?: ReactNode;
  ebene?: 2 | 3;
  /** Schaltfläche oder Link rechts neben der Überschrift. */
  aktion?: ReactNode;
  /** Stellt den Inhalt in einen weißen Rahmen (UI-002c). */
  rahmen?: boolean;
  children: ReactNode;
}) {
  const Ueberschrift = ebene === 3 ? 'h3' : 'h2';
  return (
    // Auf der Plattform 40 zwischen Abschnitten, am Rechner 48 (Handoff
    // 2026-10-22, Abschnitt 4; ANN-683).
    <section className="mt-8 first:mt-0 [.plattform-schrift_&]:not-first:mt-10 [.plattform-schrift[data-rechner]_&]:not-first:mt-12">
      {/* Kopfzeile mindestens 32 px (Design-Handoff 2026-10-01, Abschnitt 3):
          genug für die Überschrift und einen Textlink daneben, ohne dass ein
          leerer Kopf die Liste nach unten schiebt. Das Tippziel eines
          Textlinks bleibt 44 px (`Textlink alleinstehend`). */}
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        {/* Abschnittstitel als `--type-label`: 12 px in 600, Versalien mit
            0.14em Laufweite (DS-001). Auf der Plattform `text-abschnitt`
            22/700 in Tinte, ohne Versalien (PLATTFORM.md, ANN-683). */}
        <Ueberschrift className="text-ink-muted tracking-label [.plattform-schrift_&]:text-abschnitt [.plattform-schrift_&]:text-ink text-xs font-semibold uppercase [.plattform-schrift_&]:font-bold [.plattform-schrift_&]:tracking-(--text-abschnitt--letter-spacing) [.plattform-schrift_&]:normal-case">
          {titel}
        </Ueberschrift>
        {aktion}
      </div>
      {hinweis ? <p className="text-ink-muted mt-1 max-w-prose text-sm">{hinweis}</p> : null}
      {rahmen ? (
        <Inhaltsflaeche className="mt-3">{children}</Inhaltsflaeche>
      ) : (
        <div className="mt-3">{children}</div>
      )}
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
