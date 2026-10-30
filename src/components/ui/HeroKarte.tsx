import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from './ButtonLink';
import { Laufrad } from './Laufrad';
import { Personenbild } from './Personenbild';
import { Terminsymbol } from './Terminsymbole';
import type { Personenfarbe } from './personenfarben';

/**
 * Die ganze Karte als Ziel: Ring außen beim Fokus des Titels oder Knopfs; beim Drücken 98 % und die
 * hellere Hauptfarbe, bei „Bewegung reduzieren“ nur die Farbe.
 */
const ZIEL =
  'has-[.hero-ziel:focus-visible]:outline-3 has-[.hero-ziel:focus-visible]:outline-offset-3 has-[.hero-ziel:focus-visible]:outline-ink ' +
  'active:bg-accent motion-safe:active:scale-98 transition-[scale,background-color] duration-120 ease-druck';

/**
 * Mit `ganzeKarte` reicht das Ziel des Knopfs über die Karte (`::after`; ANN-817). Nur die Karte gibt
 * nach: Ein skalierter Knopf fasste sein `::after` selbst, und das Loslassen träfe daneben.
 */
const KNOPF_FUER_DIE_KARTE =
  "hero-ziel after:rounded-image after:absolute after:inset-0 after:z-10 after:content-[''] focus-visible:outline-none active:scale-none!";

/**
 * Die eine Hauptsache eines Bildschirms der Plattform, höchstens einmal je Seite (PLATTFORM.md);
 * das Laufrad ist Markenform, keine Information. Rechnermaße unter `data-rechner` (ANN-683); unter
 * 23rem und am Telefon bei „Sehr groß“ innen 12, weil bei 24 Knöpfe mitten im Wort brachen (ANN-816).
 */
export function HeroKarte({
  etikett = 'Als Nächstes',
  titel,
  satz,
  zustand,
  person,
  angaben,
  aktion,
  ziel,
  leiseAktion,
  ganzeKarte = false,
  schmalOhneRad = false,
  markenmoment = false,
}: {
  etikett?: ReactNode;
  titel: string;
  satz?: ReactNode;
  /** Ein Statuszeichen unter dem Satz, etwa ein offener Wunsch zum Termin. */
  zustand?: ReactNode;
  /** Wer kommt, mit Bild: „Anna Beispiel kommt zu Ihnen“; darunter auf Wunsch der Ort. */
  person?:
    { name: string; farbe?: Personenfarbe | null; zeile: string; ort?: string | null } | undefined;
  /** Zeilen mit Zeichen (Raster 24, `currentColor`), etwa Umfang und was man braucht. */
  angaben?: readonly { schluessel: string; zeichen: ReactNode; text: ReactNode }[] | undefined;
  aktion?: { text: string; to: string } | undefined;
  /** Die ganze Karte als Link; `text` steht sichtbar darunter („Termin ansehen“). */
  ziel?: { text: string; to: string } | undefined;
  /** Statt des Knopfs ein Textlink in Papier-Schrift. */
  leiseAktion?: { text: string; to: string } | undefined;
  /** Mit `aktion`: Die ganze Karte führt dorthin, der Knopf bleibt sichtbar. */
  ganzeKarte?: boolean;
  /** Unter 23rem ohne Laufrad und innen 16 statt 12. */
  schmalOhneRad?: boolean;
  markenmoment?: boolean;
}) {
  const titelId = useId();
  const kartenknopf = ganzeKarte && aktion !== undefined;
  return (
    <section
      aria-labelledby={titelId}
      className={`bg-surface-inverse text-surface rounded-image shadow-plattform relative isolate flex flex-col gap-2 overflow-hidden p-6 [[data-rechner]_&]:p-8 ${
        schmalOhneRad
          ? 'max-[23rem]:p-4 max-lg:[[data-schrift=sehr-gross]_&]:p-4'
          : 'max-[23rem]:p-3 max-lg:[[data-schrift=sehr-gross]_&]:p-3'
      } ${markenmoment ? 'hero-erscheint' : ''} ${ziel || kartenknopf ? ZIEL : ''}`}
    >
      {/* Unter allem Inhalt (`-z-10` in der eigenen Schicht der Karte): So
          bleibt der Titel ohne eigene Position, und das `::after` des Links
          deckt die ganze Karte. */}
      <Laufrad
        className={`text-accent pointer-events-none absolute -top-18 -right-18 -z-10 size-55 [[data-rechner]_&]:-top-22.5 [[data-rechner]_&]:-right-22.5 [[data-rechner]_&]:size-75 ${
          schmalOhneRad || ziel ? 'max-[23rem]:hidden' : ''
        } ${markenmoment ? 'laufrad-dreht' : ''}`}
      />
      <p className="text-salbei relative font-semibold">{etikett}</p>
      <h2
        id={titelId}
        className={`text-hero [[data-rechner]_&]:text-hero-rechner max-[23rem]:text-hero-schmal max-w-hero-titel ${ziel ? '' : 'relative'}`}
      >
        {ziel ? (
          <Link
            to={ziel.to}
            className="hero-ziel after:rounded-image text-surface after:absolute after:inset-0 after:z-10 after:content-[''] focus-visible:outline-none"
          >
            {titel}
          </Link>
        ) : (
          titel
        )}
      </h2>
      {satz ? <p className="relative">{satz}</p> : null}
      {zustand ? <p className="relative">{zustand}</p> : null}
      {angaben && angaben.length > 0 ? (
        <ul className="relative flex flex-col gap-2.5">
          {angaben.map((a) => (
            <li key={a.schluessel} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="text-salbei mt-px inline-flex shrink-0 [&_svg]:size-5.5"
              >
                {a.zeichen}
              </span>
              <span className="min-w-0">{a.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {person ? (
        // Unter 23rem das Bild über der Zeile wie an den anderen Karten, ein Name wird nie getrennt;
        // das Bild auf der Farbe der Person wie auf der Übersicht (ANN-771).
        <p className="relative mt-2 flex items-center gap-4 font-semibold hyphens-manual max-[23rem]:flex-col max-[23rem]:items-start max-[23rem]:gap-2">
          <Personenbild name={person.name} farbe={person.farbe} groesse="karte" />
          <span className="flex min-w-0 flex-col">
            <span>{person.zeile}</span>
            {person.ort ? <span className="font-normal">{person.ort}</span> : null}
          </span>
        </p>
      ) : null}
      {aktion ? (
        <ButtonLink
          variant="marke"
          to={aktion.to}
          className={`mt-2 w-full [[data-rechner]_&]:w-auto [[data-rechner]_&]:self-start [[data-rechner]_&]:px-7 ${kartenknopf ? KNOPF_FUER_DIE_KARTE : 'relative'}`}
        >
          {aktion.text}
        </ButtonLink>
      ) : ziel ? (
        <span
          aria-hidden="true"
          className="relative mt-1 inline-flex min-h-11 items-center gap-1.5 self-start font-bold underline underline-offset-3"
        >
          {ziel.text}
          <Terminsymbol zeichen="vor" className="size-5" />
        </span>
      ) : leiseAktion ? (
        <Link
          to={leiseAktion.to}
          className="text-surface relative mt-1 inline-flex min-h-11 items-center self-start font-semibold underline underline-offset-3"
        >
          {leiseAktion.text}
        </Link>
      ) : null}
    </section>
  );
}
