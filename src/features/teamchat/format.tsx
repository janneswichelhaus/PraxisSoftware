import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { auszeichnung, bloecke } from './formatierung';

/**
 * Formatierung im Teamchat (TEAM-002, ANN-649) - wie Slack als Zeichen im
 * Text: `*fett*`, `_kursiv_`, `~durchgestrichen~`, `` `Code` ``, ein Block
 * zwischen ```` ``` ````, `> Zitat`, Listen mit `-` oder `1.`, Links und
 * Erwähnungen.
 *
 * Gespeichert wird nur der Text; dargestellt wird er hier, **ausschließlich
 * als React-Elemente** - kein HTML aus dem Text, kein `dangerouslySetInnerHTML`.
 * Links nur mit `http(s)`; einer auf diese Anwendung bleibt in ihr (ohne
 * neue Seite), jeder andere öffnet eine neue Seite ohne Herkunftsangabe
 * (`noreferrer`) - keine Adresse der Anwendung, kein Gesprächsbezug geht an
 * Dritte. Kein Vorschaubild, kein Abruf der verlinkten Seite.
 */

export interface Formatierung {
  /** Namen, die als Erwähnung hervorgehoben werden („@Name“), dazu „@alle“. */
  namen?: readonly string[];
  /** Der eigene Name: die eigene Erwähnung steht stärker. */
  eigenerName?: string | null;
  /** Ursprung der Anwendung - Links darauf bleiben in ihr. */
  ursprung?: string;
}

const LINK = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"„“»]/;

function eigenerUrsprung(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/** Ein Abschnitt Fließtext mit Auszeichnung, Links und Erwähnungen. */
function zeile(text: string, f: Formatierung, schluessel: string): ReactNode[] {
  const teile: ReactNode[] = [];
  let rest = text;
  let n = 0;
  const namen = [...(f.namen ?? []), 'alle'].sort((a, b) => b.length - a.length);

  while (rest.length > 0) {
    // Der früheste Treffer gewinnt; Code zuerst, darin gilt nichts anderes.
    const kandidaten: { an: number; laenge: number; knoten: ReactNode }[] = [];

    const code = /`([^`\n]+)`/.exec(rest);
    if (code) {
      kandidaten.push({
        an: code.index,
        laenge: code[0].length,
        knoten: (
          <code
            key={`${schluessel}c${n}`}
            className="bg-surface-sunken px-1 font-mono text-[0.9em]"
          >
            {code[1]}
          </code>
        ),
      });
    }

    const link = LINK.exec(rest);
    if (link) {
      const adresse = link[0];
      const ursprung = f.ursprung ?? eigenerUrsprung();
      const intern = ursprung !== '' && adresse.startsWith(`${ursprung}/`);
      kandidaten.push({
        an: link.index,
        laenge: adresse.length,
        knoten: intern ? (
          <Link
            key={`${schluessel}l${n}`}
            to={adresse.slice(ursprung.length)}
            className="text-accent break-all underline"
          >
            {adresse.slice(ursprung.length)}
          </Link>
        ) : (
          <a
            key={`${schluessel}l${n}`}
            href={adresse}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="text-accent break-all underline"
          >
            {adresse}
          </a>
        ),
      });
    }

    for (const name of namen) {
      const an = rest.indexOf(`@${name}`);
      if (an < 0) continue;
      const nach = rest.charAt(an + name.length + 1);
      if (nach && /[\p{L}\p{N}]/u.test(nach)) continue;
      const eigen = name === f.eigenerName || name === 'alle';
      kandidaten.push({
        an,
        laenge: name.length + 1,
        knoten: (
          <span
            key={`${schluessel}m${n}`}
            className={`px-0.5 font-semibold ${eigen ? 'bg-accent-soft text-accent' : 'text-accent'}`}
          >
            @{name}
          </span>
        ),
      });
      break;
    }

    for (const [zeichen, element] of [
      ['*', 'strong'],
      ['_', 'em'],
      ['~', 's'],
    ] as const) {
      const treffer = auszeichnung(rest, zeichen);
      if (!treffer) continue;
      const Tag = element;
      kandidaten.push({
        an: treffer.an,
        laenge: treffer.innen.length + 2,
        knoten: (
          <Tag key={`${schluessel}${element}${n}`}>
            {zeile(treffer.innen, f, `${schluessel}${element}${n}-`)}
          </Tag>
        ),
      });
    }

    if (kandidaten.length === 0) {
      teile.push(rest);
      break;
    }
    kandidaten.sort((a, b) => a.an - b.an || b.laenge - a.laenge);
    const erster = kandidaten[0]!;
    if (erster.an > 0) teile.push(rest.slice(0, erster.an));
    teile.push(erster.knoten);
    rest = rest.slice(erster.an + erster.laenge);
    n += 1;
  }
  return teile;
}

function mitUmbruechen(zeilen: readonly string[], f: Formatierung, schluessel: string): ReactNode {
  return zeilen.map((z, i) => (
    <Fragment key={`${schluessel}-${i}`}>
      {i > 0 ? <br /> : null}
      {zeile(z, f, `${schluessel}-${i}-`)}
    </Fragment>
  ));
}

/** Der Text einer Nachricht, formatiert. */
export function FormatierterText({ text, ...f }: { text: string } & Formatierung) {
  return (
    <div className="text-liste text-ink flex flex-col gap-1.5 break-words">
      {bloecke(text).map((block, i) => {
        switch (block.art) {
          case 'code':
            return (
              <pre
                key={i}
                className="bg-surface-sunken rounded-field overflow-x-auto px-3 py-2 font-mono text-sm whitespace-pre"
              >
                {block.text}
              </pre>
            );
          case 'zitat':
            return (
              <blockquote key={i} className="border-line-strong text-ink-muted border-l-4 pl-3">
                {mitUmbruechen(block.zeilen, f, `z${i}`)}
              </blockquote>
            );
          case 'liste': {
            const Liste = block.nummeriert ? 'ol' : 'ul';
            return (
              <Liste
                key={i}
                className={`flex flex-col gap-0.5 pl-6 ${block.nummeriert ? 'list-decimal' : 'list-disc'}`}
              >
                {block.punkte.map((p, j) => (
                  <li key={j}>{zeile(p, f, `p${i}-${j}-`)}</li>
                ))}
              </Liste>
            );
          }
          default:
            return (
              <p key={i} className="whitespace-pre-wrap">
                {mitUmbruechen(block.zeilen, f, `a${i}`)}
              </p>
            );
        }
      })}
    </div>
  );
}
