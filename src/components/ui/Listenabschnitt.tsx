import { Children, type ReactNode } from 'react';
import { EmptyState } from './Feedback';
import { ListRows } from './ListRow';
import { Section } from './Section';

/**
 * Ein Abschnitt, der eine Liste ist: Titel, Zeilen, Leerzustand
 * (Design-Fundament, DESIGN.md „Listen“).
 *
 * Der häufigste Block der Anwendung - „Kommende Termine“, „Offene
 * Aufgaben“, „Übungen im Plan“ - stand bis dahin 55-mal als eigene
 * `ul.divide-y` mit eigener Höhe, eigenem Innenabstand und einem
 * Leerzustand, der mal in einer Karte stand und mal frei. Jetzt:
 *
 *   * der Titel als Abschnittstitel (12 px Versalien), mit `anzahl` in
 *     Klammern („Kommende (3)“), rechts eine `aktion` (Textlink oder
 *     kompakter Knopf);
 *   * die Zeilen (`ListRow`) in einer Karte;
 *   * ohne Zeilen der `leer`-Zustand **in einer Karte**, mit dem nächsten
 *     Schritt - nie ein Satz frei zwischen Karten;
 *   * `mehr` unter der Liste: „Alle anzeigen →“, „Weitere laden“.
 */
export function Listenabschnitt({
  titel,
  anzahl,
  aktion,
  leer,
  mehr,
  ebene = 2,
  children,
}: {
  titel: string;
  anzahl?: number;
  aktion?: ReactNode;
  leer?: { titel: string; beschreibung?: string; aktion?: ReactNode };
  mehr?: ReactNode;
  ebene?: 2 | 3;
  /** Die Zeilen (`ListRow`); eine leere Liste zeigt `leer`. */
  children?: ReactNode;
}) {
  const zeilen = Children.toArray(children);
  return (
    <Section
      titel={anzahl === undefined ? titel : `${titel} (${anzahl})`}
      ebene={ebene}
      {...(aktion === undefined ? {} : { aktion })}
    >
      {zeilen.length > 0 ? (
        <ListRows>{zeilen}</ListRows>
      ) : leer ? (
        <EmptyState
          inKarte
          title={leer.titel}
          description={leer.beschreibung}
          {...(leer.aktion === undefined ? {} : { aktion: leer.aktion })}
        />
      ) : null}
      {mehr ? <div className="mt-2">{mehr}</div> : null}
    </Section>
  );
}
