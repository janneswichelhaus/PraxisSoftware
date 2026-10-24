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
 *
 * Unter 23rem (200 %) innen 12 wie die Seite (Handoff, Abschnitt 4): Bei 24
 * brach der Knopf „Fragebogen beginnen“ mitten im Wort.
 *
 * Die Rechnermaße (innen 32, Titel 32, Rad 300) gelten unter `data-rechner`
 * wie Seitentitel und Abschnitte (ANN-683), nicht ab 1024 px Fenster: Die
 * Einsicht der Praxis zeigt die Plattform in einem Telefon.
 *
 * Ohne `aktion` kein Knopf: in der Einsicht der Praxis, wo die Seite dahinter
 * nur schreibt (E-001).
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
  person?: { name: string; farbe?: Personenfarbe | null; zeile: string } | undefined;
  aktion?: { text: string; to: string } | undefined;
  markenmoment?: boolean;
}) {
  const titelId = useId();
  return (
    <section
      aria-labelledby={titelId}
      className={`bg-surface-inverse text-surface rounded-image shadow-plattform relative flex flex-col gap-2 overflow-hidden p-6 max-[23rem]:p-3 [[data-rechner]_&]:p-8 ${
        markenmoment ? 'hero-erscheint' : ''
      }`}
    >
      <Laufrad
        className={`text-accent pointer-events-none absolute -top-18 -right-18 size-55 [[data-rechner]_&]:-top-22.5 [[data-rechner]_&]:-right-22.5 [[data-rechner]_&]:size-75 ${
          markenmoment ? 'laufrad-dreht' : ''
        }`}
      />
      <p className="text-salbei relative font-semibold">{etikett}</p>
      <h2
        id={titelId}
        className="text-hero [[data-rechner]_&]:text-hero-rechner max-[23rem]:text-hero-schmal max-w-hero-titel relative"
      >
        {titel}
      </h2>
      {satz ? <p className="relative">{satz}</p> : null}
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
      ) : null}
    </section>
  );
}
