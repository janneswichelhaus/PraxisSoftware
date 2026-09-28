import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { textlinkKlassen } from './buttonStile';

interface Gemeinsam extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'> {
  /**
   * Der Link steht für sich - unter einer Karte, neben einem Knopf - und
   * bekommt ein Tippziel von 44 px Höhe. Ohne Angabe steht er im Satz.
   */
  alleinstehend?: boolean;
  children: ReactNode;
}

/** Ein Ziel innerhalb der Anwendung: Router-Link, optional ohne neuen Verlaufseintrag. */
interface InnerhalbDerAnwendung extends Gemeinsam {
  to: string;
  replace?: boolean;
}

/** Ein Ziel außerhalb des Routers: `tel:`, `mailto:`, eine Datei. */
interface Ausserhalb extends Gemeinsam {
  href: string;
}

/**
 * Der Textlink des Systems (TOK-12, UIK-15).
 *
 * In der Hauptfarbe und unterstrichen, wie der Handoff Links setzt - im Satz
 * wie allein. Die Unterstreichung ist kein Schmuck: Ein Link, den nur seine
 * Farbe von grauem Text abhebt, ist für viele nicht als Link zu erkennen
 * (WCAG 1.4.1). `alleinstehend` ergänzt das Tippziel von 44 px.
 *
 * Nicht für Seitenwechsel, die wie ein Knopf aussehen sollen - das ist
 * `ButtonLink` -, und nicht für den Rückweg oben links: Den trägt sein Pfeil
 * (`Rueckweg`).
 *
 * `to` führt innerhalb der Anwendung (Router-Link), `href` nach draußen, etwa
 * auf `tel:` oder `mailto:`. Die Klassen allein liefert `textlinkKlassen` aus
 * `buttonStile.ts`, für Stellen, an denen ein eigenes Element nötig ist.
 */
export function Textlink(props: InnerhalbDerAnwendung | Ausserhalb) {
  if ('to' in props) {
    const { alleinstehend = false, className = '', children, to, replace, ...anker } = props;
    return (
      <Link
        to={to}
        className={textlinkKlassen(alleinstehend, className)}
        {...(replace === undefined ? {} : { replace })}
        {...anker}
      >
        {children}
      </Link>
    );
  }

  const { alleinstehend = false, className = '', children, href, ...anker } = props;
  return (
    <a href={href} className={textlinkKlassen(alleinstehend, className)} {...anker}>
      {children}
    </a>
  );
}
