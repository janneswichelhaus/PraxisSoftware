import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink } from './ButtonLink';
import { Laufrad } from './Laufrad';
import { Personenbild } from './Personenbild';
import { Terminsymbol } from './Terminsymbole';
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
 *
 * Als nächster Termin auf der Seite „Termine“ (Handoff 2026-10-24
 * „Termine“, Abschnitt 3) ist die ganze Karte ein Link (`ziel` statt
 * `aktion`): Der Titel ist der Linktext, sein `::after` deckt die Karte,
 * darunter steht sichtbar „Termin ansehen“ mit Pfeil - für Vorlesesoftware
 * ausgeblendet, den Namen trägt der Titel. Kein Knopf in Papier, denn der
 * Hauptknopf der Seite ist „Termin wünschen“. Der Fokus ist ein Ring von 3 px
 * Tinte außen um die Karte; sie gibt beim Antippen nach wie jede Karte. Unter
 * der Person steht dann der Ort (`person.ort`); unter 23rem fällt das Laufrad
 * weg (Abschnitt 4).
 *
 * Für die Vorschau einer Übungseinheit (Handoff 2026-10-24, Abschnitt 3)
 * trägt die Karte `angaben` - Zeilen mit Zeichen in Salbei, etwa „3 Übungen
 * · etwa 10 Minuten“ und „Sie brauchen: …“ - und statt des Knopfs auf Wunsch
 * eine `leiseAktion` als Textlink, wenn nichts mehr zu tun ist („Noch einmal
 * üben“). Mit `schmalOhneRad` fällt dort unter 23rem das Laufrad weg, innen
 * 16 (Abschnitt 4): Die Angaben brauchen die ganze Breite.
 */
/**
 * Die ganze Karte als Ziel: Ring außen beim Fokus des Titels; beim Drücken
 * 98 % und die Fläche in der helleren Hauptfarbe - bei „Bewegung reduzieren“
 * nur die Fläche (Handoff „Termine“, Abschnitt 7).
 */
const ZIEL =
  'has-[.hero-ziel:focus-visible]:outline-3 has-[.hero-ziel:focus-visible]:outline-offset-3 has-[.hero-ziel:focus-visible]:outline-ink ' +
  'active:bg-accent motion-safe:active:scale-98 transition-[scale,background-color] duration-120 ease-druck';

export function HeroKarte({
  etikett = 'Als Nächstes',
  titel,
  satz,
  person,
  angaben,
  aktion,
  ziel,
  leiseAktion,
  schmalOhneRad = false,
  markenmoment = false,
}: {
  etikett?: ReactNode;
  titel: string;
  satz?: ReactNode;
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
  /** Unter 23rem ohne Laufrad und innen 16 statt 12. */
  schmalOhneRad?: boolean;
  markenmoment?: boolean;
}) {
  const titelId = useId();
  return (
    <section
      aria-labelledby={titelId}
      className={`bg-surface-inverse text-surface rounded-image shadow-plattform relative isolate flex flex-col gap-2 overflow-hidden p-6 [[data-rechner]_&]:p-8 ${
        schmalOhneRad ? 'max-[23rem]:p-4' : 'max-[23rem]:p-3'
      } ${markenmoment ? 'hero-erscheint' : ''} ${ziel ? ZIEL : ''}`}
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
        // ein Name wird nie getrennt (DR-114). Das Bild auf der Farbe der
        // Person, nicht auf Papier - wie auf der Übersicht (ANN-739).
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
          className="relative mt-2 w-full [[data-rechner]_&]:w-auto [[data-rechner]_&]:self-start [[data-rechner]_&]:px-7"
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
