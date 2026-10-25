import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Anrufknoepfe } from '@/components/ui/Anrufknoepfe';
import { Badge, STATUSZEICHEN, type Ton } from '@/components/ui/Badge';
import { Personenbild } from '@/components/ui/Personenbild';
import { Section } from '@/components/ui/Section';
import { Terminliste } from '@/components/ui/Terminliste';
import { Terminkreis, Terminsymbol } from '@/components/ui/Terminsymbole';
import { telHref } from '@/lib/telefon';
import type { Plattformzugang, Termin, Terminwunsch } from './api';
import {
  artUndPerson,
  artzeichen,
  gedaempft as istGedaempft,
  gesendetAm,
  rolle,
  tagInWorten,
  terminZustand,
  terminzeileName,
  vonBis,
  wunschInWorten,
  wunschTitel,
} from './termintexte';
import { terminBeschreibung } from './terminbeschreibung';

/**
 * Die Bausteine der Termine (Handoff 2026-10-24 „Termine“, Abschnitt 3;
 * Schritt 3a): Zeile eines Termins, Zeile eines Wunschs, „Wer und wo“ und
 * „Fragen zu diesem Termin?“; die Liste darum ist `Terminliste`. Reine
 * Darstellung - was die Seite lädt, wann sie etwas zeigt und was ein Tipp
 * auslöst, entscheiden die Seiten (3b Liste, 3c Seite des Termins). Die
 * Wörter kommen aus `termintexte.ts`; ein Wort bricht nie in sich (BEF-220).
 */

type Bereich = Plattformzugang['relationship_kind'];

/**
 * Ein Termin als Zeile (Handoff, Abschnitt 3): vorn der Kreis der Art, dann
 * drei kurze Zeilen - Tag in Worten, Zeit, Art und Person -, darunter das
 * Statuszeichen; hinten der Pfeil. Die ganze Zeile führt zur Seite des
 * Termins, mindestens 80 hoch. Vergangenes und Abgesagtes steht gedämpft.
 * Bei „Sehr groß“ und unter 23rem steht der Kreis über dem Text, der Pfeil
 * entfällt - so bleibt „Änderung angefragt“ in einer Zeile.
 */
export function Terminzeile({
  termin,
  bereich,
  to,
  jetzt = new Date(),
}: {
  termin: Termin;
  bereich: Bereich;
  /** Die Seite des Termins, mit dem Bereich in der Adresse (D6). */
  to: string;
  jetzt?: Date;
}) {
  const gedaempft = istGedaempft(termin, jetzt);
  const zustand = terminZustand(termin);
  return (
    <li>
      <Link
        to={to}
        aria-label={terminzeileName(termin, bereich, jetzt)}
        className="text-ink hover:bg-surface-sunken active:bg-surface-sunken ease-druck focus-visible:outline-ink flex min-h-20 items-center gap-3 px-3 py-3.5 transition-[background-color,scale] duration-120 focus-visible:outline-3 focus-visible:-outline-offset-3 motion-safe:active:scale-98 max-[23rem]:flex-col max-[23rem]:items-start max-[23rem]:p-3 [[data-schrift=sehr-gross]_&]:flex-col [[data-schrift=sehr-gross]_&]:items-start [[data-schrift=sehr-gross]_&]:p-3"
      >
        <span className="self-start">
          <Terminkreis
            zeichen={artzeichen(termin.appointment_type, bereich)}
            gedaempft={gedaempft}
          />
        </span>
        <span className="flex min-w-0 grow flex-col hyphens-manual">
          <span className={`leading-snug font-semibold ${gedaempft ? 'text-ink-muted' : ''}`}>
            {tagInWorten(termin.starts_at, jetzt)}
          </span>
          <span>{vonBis(termin)}</span>
          <span className="text-ink-muted">{artUndPerson(termin, bereich)}</span>
          {zustand ? (
            <span className="mt-1.5">
              <Statuszeichen {...zustand} />
            </span>
          ) : null}
        </span>
        <Terminsymbol
          zeichen="pfeil"
          className="text-ink-muted size-5 max-[23rem]:hidden [[data-schrift=sehr-gross]_&]:hidden"
        />
      </Link>
    </li>
  );
}

/** Zeichen und Wort; ein offener Wunsch wartet auf die Praxis („…“). */
function Statuszeichen({ wort, ton }: { wort: string; ton: Ton }) {
  return ton === 'akzent' ? (
    <Badge ton={ton} eigenesZeichen={STATUSZEICHEN.wartet}>
      {wort}
    </Badge>
  ) : (
    <Badge ton={ton}>{wort}</Badge>
  );
}

const WUNSCHZUSTAND: Record<Terminwunsch['status'], { wort: string; ton: Ton }> = {
  open: { wort: 'angefragt', ton: 'akzent' },
  done: { wort: 'erledigt', ton: 'positiv' },
  declined: { wort: 'nicht möglich', ton: 'warnung' },
  withdrawn: { wort: 'zurückgezogen', ton: 'neutral' },
};

/**
 * Ein Wunsch als Zeile (Handoff, Abschnitt 3): vorn der Kalender auf der
 * Vertiefung (unter 23rem entfällt er), dann was gewünscht ist mit dem
 * Statuszeichen daneben, wann, die Nachricht, die Antwort der Praxis und
 * wann er gesendet wurde. Ein Wunsch sieht nie aus wie ein Termin (§8).
 * „Wunsch zurückziehen“ reicht die Seite herein (`zurueckziehen`), denn nur
 * sie weiß, ob es geht (Einsicht, ohne Netz).
 */
export function Wunschzeile({
  wunsch,
  termine,
  zurueckziehen,
  jetzt = new Date(),
}: {
  wunsch: Terminwunsch;
  /** Die Termine des Bereichs - für das Datum eines Änderungs- oder Absagewunschs. */
  termine: readonly Termin[];
  zurueckziehen?: ReactNode;
  jetzt?: Date;
}) {
  const zustand = WUNSCHZUSTAND[wunsch.status];
  const wann = wunschInWorten(wunsch);
  return (
    <li className="flex gap-3 px-4 py-3.5">
      <span className="max-[23rem]:hidden">
        <Terminkreis zeichen="kalender" />
      </span>
      <div className="flex min-w-0 grow flex-col">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 hyphens-manual">
          <span className="font-semibold">{wunschTitel(wunsch, termine, jetzt)}</span>
          <Statuszeichen {...zustand} />
        </p>
        {wann ? <p className="hyphens-manual">{wann}</p> : null}
        {wunsch.note ? <p className="text-ink-muted">„{wunsch.note}“</p> : null}
        {wunsch.answer ? (
          <p>
            <span className="font-semibold">Antwort der Praxis:</span> {wunsch.answer}
          </p>
        ) : null}
        <p className="text-ink-muted hyphens-manual">{gesendetAm(wunsch, jetzt)}</p>
        {zurueckziehen ? <div className="mt-1">{zurueckziehen}</div> : null}
      </div>
    </li>
  );
}

/**
 * Wer und wo (Handoff, Abschnitt 3): eine Karte mit Rahmen - vorn die
 * Person mit Initialen, daneben Name und Rolle; nach einer Linie das Zeichen
 * „Ort“ und die Anschrift bzw. der Standort. Beim Video entfällt der Ort.
 * Unter 23rem gestapelt, auch das Zeichen über der Anschrift: Neben der
 * Spalte blieben bei 200 % rund 100 px, und „Hauptstandort“ bräche im Wort
 * (ANN-738). Name, Rolle und Anschrift werden nie getrennt (DR-114).
 */
export function WerUndWo({
  termin,
  vertretung,
  jetzt = new Date(),
}: {
  termin: Termin;
  /** Der Name der vertretenen Person (`represented_name`), sonst `null`. */
  vertretung: string | null;
  jetzt?: Date;
}) {
  const wer = termin.staff_name;
  const wieDieRolle = rolle(termin, vertretung, jetzt);
  const { ort } = terminBeschreibung(termin);
  const mitOrt = termin.appointment_type !== 'video' && ort;
  if (!wer && !mitOrt) return null;
  return (
    <section
      aria-label="Wer und wo"
      className="border-line bg-surface rounded-card flex flex-col border"
    >
      {wer ? (
        <div className="flex items-center gap-4 px-4 py-3.5 max-[23rem]:flex-col max-[23rem]:items-start max-[23rem]:gap-2 max-[23rem]:p-3">
          <Personenbild name={wer} farbe={null} groesse="karte" />
          <p className="flex min-w-0 flex-col hyphens-manual">
            <span className="font-semibold">{wer}</span>
            {wieDieRolle ? <span className="text-ink-muted">{wieDieRolle}</span> : null}
          </p>
        </div>
      ) : null}
      {mitOrt ? (
        <div
          className={`flex items-center gap-4 px-4 py-3.5 max-[23rem]:flex-col max-[23rem]:items-start max-[23rem]:gap-2 max-[23rem]:p-3 ${
            wer ? 'border-line border-t' : ''
          }`}
        >
          <span className="text-ink-muted inline-flex w-14 shrink-0 justify-center max-[23rem]:w-auto">
            <Terminsymbol zeichen="ort" className="size-6.5" />
          </span>
          <p className="min-w-0 hyphens-manual">{ort}</p>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Fragen zu diesem Termin? (Handoff, Abschnitt 3): eine Liste mit „Praxis
 * anrufen“ (mit der Nummer, nur wenn die Praxis eine hat) und „Der Praxis
 * schreiben“. Am vergangenen Termin ist „Praxis anrufen“ der Hauptknopf
 * über der Liste, die Nummer in einer zweiten Zeile (DR-133, BEF-221;
 * `Anrufknoepfe` zweizeilig, ANN-736). Die Nummer steht, wie sie gespeichert
 * ist, und bricht bei 200 % nur zwischen ihren Gruppen (ANN-737). Der
 * Abschnitt ist ein `Section`; in einem Stapel mit `gap` steht er allein in
 * seinem Block, sonst zählte sein Abstand zum Vorgänger doppelt.
 */
export function FragenZumTermin({
  rufnummer,
  schreiben,
  anrufenAlsHauptknopf = false,
}: {
  /** `practice_phone` aus dem Zugang (N2, ANN-691), sonst `null`. */
  rufnummer: string | null;
  /** Neue Nachricht an die Praxis, mit dem Bereich in der Adresse. */
  schreiben: string;
  anrufenAlsHauptknopf?: boolean;
}) {
  const hauptknopf = anrufenAlsHauptknopf && rufnummer;
  return (
    <Section titel="Fragen zu diesem Termin?">
      <div className="flex flex-col gap-4">
        {hauptknopf ? (
          <Anrufknoepfe
            nummern={[{ label: 'Praxis', anzeige: rufnummer, href: telHref(rufnummer) }]}
            hauptknopf
            zweizeilig
          />
        ) : null}
        <Terminliste>
          {rufnummer && !hauptknopf ? (
            <Fragezeile
              zeichen="telefon"
              wort="Praxis anrufen"
              zusatz={rufnummer}
              ziel={{ href: telHref(rufnummer) }}
            />
          ) : null}
          <Fragezeile zeichen="nachricht" wort="Der Praxis schreiben" ziel={{ to: schreiben }} />
        </Terminliste>
      </div>
    </Section>
  );
}

/**
 * Eine Zeile der Fragen: 64 hoch, Zeichen in der Hauptfarbe, Pfeil in Leise;
 * beim Drücken Fläche und 98 % wie jede Zeile. Unter 23rem steht das Zeichen
 * über dem Text, innen 12, ohne Pfeil.
 */
function Fragezeile({
  zeichen,
  wort,
  zusatz,
  ziel,
}: {
  zeichen: 'telefon' | 'nachricht';
  wort: string;
  zusatz?: string;
  ziel: { href: string } | { to: string };
}) {
  const klassen =
    'text-ink hover:bg-surface-sunken active:bg-surface-sunken ease-druck focus-visible:outline-ink flex min-h-16 items-center gap-4 px-4 py-2.5 transition-[background-color,scale] duration-120 focus-visible:outline-3 focus-visible:-outline-offset-3 motion-safe:active:scale-98 max-[23rem]:flex-col max-[23rem]:items-start max-[23rem]:gap-2 max-[23rem]:px-3';
  const inhalt = (
    <>
      <Terminsymbol zeichen={zeichen} className="text-accent size-6" />
      <span className="flex min-w-0 grow flex-col hyphens-manual">
        <span className="font-semibold">{wort}</span>
        {/* Bricht nur an den Leerzeichen zwischen den Gruppen (ANN-737). */}
        {zusatz ? (
          <span className="text-ink-muted wrap-break-word tabular-nums">{zusatz}</span>
        ) : null}
      </span>
      <Terminsymbol zeichen="pfeil" className="text-ink-muted size-6 max-[23rem]:hidden" />
    </>
  );
  return (
    <li>
      {'href' in ziel ? (
        <a href={ziel.href} className={klassen}>
          {inhalt}
        </a>
      ) : (
        <Link to={ziel.to} className={klassen}>
          {inhalt}
        </Link>
      )}
    </li>
  );
}
