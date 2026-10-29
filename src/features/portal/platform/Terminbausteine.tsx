import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Anrufknoepfe } from '@/components/ui/Anrufknoepfe';
import { Badge, STATUSZEICHEN, type Ton } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Personenbild } from '@/components/ui/Personenbild';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Terminliste } from '@/components/ui/Terminliste';
import { Terminkreis, Terminsymbol } from '@/components/ui/Terminsymbole';
import { telHref } from '@/lib/telefon';
import {
  termineSchluessel,
  wuenscheSchluessel,
  wunschZurueckziehen,
  type Plattformzugang,
  type Termin,
  type Terminwunsch,
} from './api';
import { PLATTFORM_PFAD } from './pfade';
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
 * Die Bausteine der Termine als reine Darstellung: Was geladen, gezeigt und bei einem Tipp
 * ausgelöst wird, entscheiden die Seiten; die Wörter kommen aus `termintexte.ts`.
 */

type Bereich = Plattformzugang['relationship_kind'];

/**
 * Ein Termin als Zeile: Tag, Zeit, Art und Person, darunter das Statuszeichen; die ganze Zeile führt
 * zur Seite des Termins. Bei „Sehr groß“ und unter 23rem steht der Kreis über dem Text und der Pfeil
 * entfällt, damit der Text die ganze Breite hat; bei 200 % bricht das Zeichen zwischen Wörtern.
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
export function Statuszeichen({ wort, ton }: { wort: string; ton: Ton }) {
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
 * Ein Wunsch als Zeile mit dem Kalender auf der Vertiefung, nie wie ein Termin (§8). „Wunsch
 * zurückziehen“ reicht die Seite herein, weil nur sie weiß, ob es gerade geht.
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
 * Wer und wo: die Person mit Name und Rolle, darunter Ort und Anschrift, beim Video ohne Ort. Unter
 * 23rem gestapelt, auch das Zeichen über der Anschrift, sonst brächen Namen im Wort (ANN-770).
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
 * Fragen zu diesem Termin: „Praxis anrufen“ nur mit Nummer, dazu „Der Praxis schreiben“; am
 * vergangenen Termin ist der Anruf der Hauptknopf (ANN-768). In einem Stapel mit `gap` steht der
 * Abschnitt allein in seinem Block, sonst zählte sein Abstand doppelt.
 */
export function FragenZumTermin({
  titel = 'Fragen zu diesem Termin?',
  rufnummer,
  schreiben,
  anrufenAlsHauptknopf = false,
}: {
  titel?: string;
  /** `practice_phone` aus dem Zugang (N2, ANN-691), sonst `null`. */
  rufnummer: string | null;
  /** Neue Nachricht an die Praxis, mit dem Bereich; `null` in der Lesefrist (ANN-313). */
  schreiben: string | null;
  anrufenAlsHauptknopf?: boolean;
}) {
  const hauptknopf = anrufenAlsHauptknopf && rufnummer;
  const anrufzeile = Boolean(rufnummer) && !hauptknopf;
  if (!hauptknopf && !anrufzeile && !schreiben) return null;
  return (
    <Section titel={titel}>
      <div className="flex flex-col gap-4">
        {hauptknopf ? (
          <Anrufknoepfe
            nummern={[{ label: 'Praxis', anzeige: rufnummer, href: telHref(rufnummer) }]}
            hauptknopf
            zweizeilig
          />
        ) : null}
        {anrufzeile || schreiben ? (
          <Terminliste>
            {rufnummer && !hauptknopf ? (
              <Fragezeile
                zeichen="telefon"
                wort="Praxis anrufen"
                zusatz={rufnummer}
                ziel={{ href: telHref(rufnummer) }}
              />
            ) : null}
            {schreiben ? (
              <Fragezeile
                zeichen="nachricht"
                wort="Der Praxis schreiben"
                ziel={{ to: schreiben }}
              />
            ) : null}
          </Terminliste>
        ) : null}
      </div>
    </Section>
  );
}

/**
 * Der Weg zur Praxis, wo eine Seite sonst keinen bietet: in der Lesefrist, deren Satz auf die Praxis
 * verweist, und wenn die Termine nicht laden, etwa für eine kurzfristige Absage (ANN-780). In der
 * Lesefrist nur der Anruf: Fragen nimmt die Praxis dann nicht mehr an (ANN-313).
 */
export function PraxisErreichen({
  zugang,
  mit,
  lesefrist,
  className = '',
}: {
  zugang: Plattformzugang;
  mit: (pfad: string) => string;
  lesefrist: boolean;
  className?: string;
}) {
  if (lesefrist && !zugang.practice_phone) return null;
  return (
    <div className={className}>
      <FragenZumTermin
        titel="Die Praxis erreichen"
        rufnummer={zugang.practice_phone}
        schreiben={lesefrist ? null : mit(`${PLATTFORM_PFAD}/nachrichten/neu`)}
      />
    </div>
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
        {/* Bricht nur an den Leerzeichen zwischen den Gruppen (ANN-769). */}
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

/**
 * „Wunsch zurückziehen“ mit der Rückfrage an Ort und Stelle. Danach laden auch die Termine neu: Ein
 * zurückgezogener Änderungs- oder Absagewunsch nimmt das Statuszeichen am Termin mit. Ohne Netz
 * gesperrt; `ohneNetzId` zeigt auf den Satz, der sagt, warum (ANN-773).
 */
export function Zurueckziehen({
  zugang,
  wunschId,
  verbunden,
  ohneNetzId,
}: {
  zugang: Plattformzugang;
  wunschId: string;
  verbunden: boolean;
  ohneNetzId: string;
}) {
  const queryClient = useQueryClient();
  const zurueckziehen = useMutation({
    mutationFn: () => wunschZurueckziehen(zugang.access_id, wunschId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: wuenscheSchluessel(zugang.access_id) }),
        queryClient.invalidateQueries({ queryKey: termineSchluessel(zugang.access_id) }),
      ]),
  });
  if (!verbunden) {
    return (
      <Button type="button" variant="quiet" disabled aria-describedby={ohneNetzId}>
        Wunsch zurückziehen
      </Button>
    );
  }
  return (
    <Rueckfrage
      ausloeser="Wunsch zurückziehen"
      ausloeserVariante="quiet"
      bestaetigen="Ja, zurückziehen"
      bestaetigenLaeuft="Wird zurückgezogen …"
      fehler={zurueckziehen.error?.message}
      onBestaetigen={() => zurueckziehen.mutateAsync()}
    >
      <p>Die Praxis bearbeitet diesen Wunsch dann nicht weiter.</p>
    </Rueckfrage>
  );
}
