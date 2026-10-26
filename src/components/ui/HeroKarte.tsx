import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from './ButtonLink';
import { Laufrad } from './Laufrad';
import { Personenbild } from './Personenbild';
import type { Personenfarbe } from './personenfarben';

/**
 * Die eine Hauptsache eines Bildschirms der Plattform, höchstens einmal je Seite (PLATTFORM.md);
 * das Laufrad ist Markenform, keine Information. Rechnermaße unter `data-rechner` (ANN-683); unter
 * 23rem innen 12, weil bei 24 der Knopf „Fragebogen beginnen“ mitten im Wort brach.
 */
export function HeroKarte({
  etikett = 'Als Nächstes',
  titel,
  satz,
  person,
  angaben,
  aktion,
  leiseAktion,
  schmalOhneRad = false,
  markenmoment = false,
}: {
  etikett?: ReactNode;
  titel: string;
  satz?: ReactNode;
  /** Wer kommt, mit Bild: „Anna Beispiel kommt zu Ihnen“. */
  person?: { name: string; farbe?: Personenfarbe | null; zeile: string } | undefined;
  /** Zeilen mit Zeichen (Raster 24, `currentColor`), etwa Umfang und was man braucht. */
  angaben?: readonly { schluessel: string; zeichen: ReactNode; text: ReactNode }[] | undefined;
  aktion?: { text: string; to: string } | undefined;
  /** Statt des Knopfs ein Textlink in Papier-Schrift. */
  leiseAktion?: { text: string; to: string } | undefined;
  /** Unter 23rem ohne Laufrad und innen 16 statt 12. */
  schmalOhneRad?: boolean;
  markenmoment?: boolean;
}) {
  const titelId = useId();
  return (
    <section
      aria-labelledby={titelId}
      className={`bg-surface-inverse text-surface rounded-image shadow-plattform relative flex flex-col gap-2 overflow-hidden p-6 [[data-rechner]_&]:p-8 ${
        schmalOhneRad ? 'max-[23rem]:p-4' : 'max-[23rem]:p-3'
      } ${markenmoment ? 'hero-erscheint' : ''}`}
    >
      <Laufrad
        className={`text-accent pointer-events-none absolute -top-18 -right-18 size-55 [[data-rechner]_&]:-top-22.5 [[data-rechner]_&]:-right-22.5 [[data-rechner]_&]:size-75 ${
          schmalOhneRad ? 'max-[23rem]:hidden' : ''
        } ${markenmoment ? 'laufrad-dreht' : ''}`}
      />
      <p className="text-salbei relative font-semibold">{etikett}</p>
      <h2
        id={titelId}
        className="text-hero [[data-rechner]_&]:text-hero-rechner max-[23rem]:text-hero-schmal max-w-hero-titel relative"
      >
        {titel}
      </h2>
      {satz ? <p className="relative">{satz}</p> : null}
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
        // Unter 23rem das Bild über der Zeile (wie Aufgaben- und Besuchskarte);
        // ein Name wird nie getrennt (DR-114).
        <p className="relative mt-2 flex items-center gap-4 font-semibold hyphens-manual max-[23rem]:flex-col max-[23rem]:items-start max-[23rem]:gap-2">
          <Personenbild name={person.name} farbe={person.farbe} groesse="karte" />
          <span className="min-w-0">{person.zeile}</span>
        </p>
      ) : null}
      {aktion ? (
        <ButtonLink
          variant="marke"
          to={aktion.to}
          className="relative mt-2 w-full [[data-rechner]_&]:w-auto [[data-rechner]_&]:self-start [[data-rechner]_&]:px-7"
        >
          {aktion.text}
        </ButtonLink>
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
