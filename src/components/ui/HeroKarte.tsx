import { useId, type ReactNode } from 'react';
import { ButtonLink } from './ButtonLink';
import { Laufrad } from './Laufrad';
import { Personenbild } from './Personenbild';
import type { Personenfarbe } from './personenfarben';

/**
 * Die eine Hauptsache eines Bildschirms der Plattform (Handoff 2026-10-22,
 * Abschnitt 3): Etikett, Titel, ein Satz, auf Wunsch die Person, ein Knopf.
 * Tiefgrün mit Papier-Schrift - die Markenfläche des Bildschirms, höchstens
 * einmal je Seite (`docs/design/PLATTFORM.md`). Das Laufrad rechts oben ist
 * Markenform, keine Information.
 *
 * Eine `section` mit dem Titel als `h2`; das `h1` der Seite (Gruß oder
 * Seitentitel) steht darüber. `markenmoment` lässt die Karte beim ersten
 * Erscheinen der Übersicht einlaufen und das Rad eine Achtel drehen
 * (Abschnitt 7); bei „Bewegung reduzieren“ steht beides sofort.
 */
export function HeroKarte({
  etikett = 'Als Nächstes',
  titel,
  satz,
  person,
  aktion,
  markenmoment = false,
}: {
  etikett?: string;
  titel: string;
  satz?: ReactNode;
  /** Wer kommt, mit Bild: „Anna Beispiel kommt zu Ihnen“. */
  person?: { name: string; farbe?: Personenfarbe | null; zeile: string };
  aktion: { text: string; to: string };
  markenmoment?: boolean;
}) {
  const titelId = useId();
  return (
    <section
      aria-labelledby={titelId}
      className={`bg-surface-inverse text-surface rounded-image shadow-plattform relative flex flex-col gap-2 overflow-hidden p-6 lg:p-8 ${
        markenmoment ? 'hero-erscheint' : ''
      }`}
    >
      <Laufrad
        className={`text-accent pointer-events-none absolute -top-18 -right-18 size-55 lg:-top-22.5 lg:-right-22.5 lg:size-75 ${
          markenmoment ? 'laufrad-dreht' : ''
        }`}
      />
      <p className="text-salbei relative font-semibold">{etikett}</p>
      <h2
        id={titelId}
        className="text-hero lg:text-hero-rechner max-[23rem]:text-hero-schmal relative max-w-[11em]"
      >
        {titel}
      </h2>
      {satz ? <p className="relative">{satz}</p> : null}
      {person ? (
        <p className="relative mt-2 flex items-center gap-4 font-semibold">
          <Personenbild name={person.name} farbe={person.farbe} groesse="karte" />
          <span className="min-w-0">{person.zeile}</span>
        </p>
      ) : null}
      <ButtonLink
        variant="marke"
        to={aktion.to}
        className="relative mt-4 w-full lg:w-auto lg:self-start lg:px-7"
      >
        {aktion.text}
      </ButtonLink>
    </section>
  );
}
