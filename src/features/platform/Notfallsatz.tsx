import { Fragment } from 'react';
import { Textlink } from '@/components/ui/Textlink';
import { NOTFALL, NOTRUFNUMMERN, type Notrufnummer } from './nachrichtentexte';

/**
 * Eine Notrufnummer als Anruf-Link (DESIGN.md, Regel 9; Sichtung
 * 13.10.2026, L2).
 *
 * Im Satz, aber mit einem Tippziel von mindestens 44 px: Der Innenabstand
 * vergrößert die Fläche, der gleich große negative Außenabstand hält die
 * Zeile, wie sie ist. Die Nummer kommt nur aus `NOTRUFNUMMERN` - nie aus dem
 * Inhalt einer Nachricht.
 */
export function Notrufnummer({ nummer }: { nummer: Notrufnummer }) {
  return (
    <Textlink
      href={`tel:${nummer}`}
      aria-label={`${nummer} anrufen`}
      className="-mx-2 -my-2.5 inline-block px-2 py-2.5 font-semibold tabular-nums"
    >
      {nummer}
    </Textlink>
  );
}

function istNotrufnummer(teil: string): teil is Notrufnummer {
  return (NOTRUFNUMMERN as readonly string[]).includes(teil);
}

/**
 * Der Notfallhinweis (`NOTFALL`, Wortlaut aus DSN-001 4.1) mit den beiden
 * Nummern zum Antippen. Der Satz bleibt eine Konstante; zerlegt wird er an
 * Ziffernfolgen, und nur die aus `NOTRUFNUMMERN` werden zum Link.
 */
export function Notfallsatz() {
  return (
    <>
      {NOTFALL.split(/(\d+)/).map((teil, index) =>
        istNotrufnummer(teil) ? (
          <Notrufnummer key={index} nummer={teil} />
        ) : (
          <Fragment key={index}>{teil}</Fragment>
        ),
      )}
    </>
  );
}
