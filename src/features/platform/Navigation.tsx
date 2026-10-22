import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menueknopf } from '@/components/ui/Menueknopf';
import { Wortmarke } from '@/components/ui/Wortmarke';
import type { Plattformzugang } from './api';
import { geruestSpalte, reiterstufe } from './geruestbreite';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { useWahl, wahlAdresse, wahlName } from './wahl';

/**
 * Kopf und Navigation der Plattform (Handoff 2026-10-22, Abschnitte 3 und 4;
 * DSN-001 Abschnitt 3).
 *
 * Vier Ziele - Übersicht, Termine, Übungen bzw. Training, Nachrichten - und
 * „Ich“. Ein Reiter erscheint erst mit dem Loop, der ihn füllt (ANN-112). Wo
 * sie stehen, hängt an der Breite (ANN-679):
 *
 *   * **Telefon:** die Reiterleiste unten, in einer Reihe, solange die vier
 *     Wörter passen (Stufe 1), sonst in zwei (Stufe 2) - gemessen, nicht aus
 *     der Schrift-Einstellung gelesen.
 *   * **Unter 23rem** (200 % am Telefon): keine Leiste, im Kopf der Knopf
 *     „Menü“ (Stufe 3).
 *   * **Rechner** ab 1024 px: die Ziele im Kopf, keine Leiste (DR-113).
 *
 * Ein Reiter trägt nur den gewählten Bereich weiter, nie eine Bestätigung
 * wie `gesendet=1` (DR-160).
 */

interface Ziel {
  to: string;
  wort: string;
  zeichen: ReactNode;
  aktuell: boolean;
}

function useZiele(bereiche: Plattformzugang[]): Ziel[] {
  const { pathname, search } = useLocation();
  // DSN-001 Abschnitt 5: im Training heißt der Reiter „Training", weil dort
  // Einheiten und Plan zusammenkommen.
  const training = useWahl(bereiche)?.relationship_kind === 'training';
  const bereich = bereichParameter(new URLSearchParams(search));
  const anhang = bereich ? `?${bereich}` : '';
  return [
    {
      to: `${PLATTFORM_PFAD}${anhang}`,
      wort: 'Übersicht',
      zeichen: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
      aktuell: pathname === PLATTFORM_PFAD,
    },
    {
      to: `${PLATTFORM_PFAD}/termine${anhang}`,
      wort: 'Termine',
      zeichen: (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </>
      ),
      aktuell: pathname.startsWith(`${PLATTFORM_PFAD}/termine`),
    },
    {
      to: `${PLATTFORM_PFAD}/uebungen${anhang}`,
      wort: training ? 'Training' : 'Übungen',
      zeichen: <path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" />,
      aktuell: pathname.startsWith(`${PLATTFORM_PFAD}/uebungen`),
    },
    {
      to: `${PLATTFORM_PFAD}/nachrichten${anhang}`,
      wort: 'Nachrichten',
      zeichen: <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z" />,
      aktuell: pathname.startsWith(`${PLATTFORM_PFAD}/nachrichten`),
    },
  ];
}

/** Ein Zeichen im Raster 24 mit Strich 2 (Handoff Abschnitt 3); nur Schmuck. */
function Zeichen({ className, children }: { className: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const PERSON = (
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </>
);

/**
 * Druck an jedem Ziel der Navigation (DR-117, Handoff Abschnitt 7): die
 * vertiefte Fläche und 98 % in 120 ms; bei „Bewegung reduzieren“ nur die
 * Fläche.
 */
const DRUCK =
  'active:bg-surface-sunken motion-safe:active:scale-98 transition-[color,background-color,border-color,scale] duration-120 ease-druck';

/** Seiten, die je Bereich etwas anderes zeigen - dort steht der Schalter (D6). */
const MIT_SCHALTER = new Set([
  PLATTFORM_PFAD,
  `${PLATTFORM_PFAD}/termine`,
  `${PLATTFORM_PFAD}/rechnungen`,
]);

/**
 * Der Kopf der Plattform (Handoff Abschnitt 3): mindestens 72 hoch, links die
 * Wortmarke zur Übersicht, rechts „Ich“ mit dem Zeichen der Person - die
 * Initialen kommen mit dem Namen (N1, DR-119). Unter 23rem steht dort der
 * Knopf „Menü“, am Rechner dazwischen die Navigation. Am Telefon ohne Linie
 * unten; am Rechner trennt eine Linie die Navigation vom Inhalt.
 */
export function Kopf({ bereiche, rechner }: { bereiche: Plattformzugang[]; rechner: boolean }) {
  const { pathname, search } = useLocation();
  const gewaehlt = useWahl(bereiche);
  const ziele = useZiele(bereiche);
  const ich = pathname === `${PLATTFORM_PFAD}/ich`;
  return (
    <header className={`nicht-drucken bg-surface ${rechner ? 'border-line border-b' : ''}`.trim()}>
      <div
        className={`${geruestSpalte(rechner)} relative flex min-h-18 flex-wrap items-center justify-between gap-x-10 gap-y-2 ${
          rechner
            ? 'py-3'
            : 'py-2 max-[23rem]:min-h-15 max-[23rem]:gap-x-1 max-[23rem]:py-1.5 max-[23rem]:pr-2'
        }`}
      >
        <Link
          to={PLATTFORM_PFAD}
          aria-label="Übersicht"
          className="rounded-button inline-flex min-h-12 items-center"
        >
          <Wortmarke hoehe={28} />
        </Link>
        {rechner ? <Rechnernavigation ziele={ziele} /> : null}
        <Link
          to={`${PLATTFORM_PFAD}/ich`}
          aria-current={ich ? 'page' : undefined}
          className={`text-ink hover:text-accent aria-[current=page]:text-accent aria-[current=page]:border-accent inline-flex min-h-12 items-center gap-2.5 border-b-2 border-transparent px-1 font-semibold whitespace-nowrap ${
            rechner ? '' : 'max-[23rem]:hidden'
          }`.trim()}
        >
          <span
            aria-hidden="true"
            className="bg-accent-soft text-accent rounded-pill inline-flex size-10 shrink-0 items-center justify-center"
          >
            <Zeichen className="size-5.5">{PERSON}</Zeichen>
          </span>
          Ich
        </Link>
        {/* Ein Seitenwechsel schließt das Menü: Es beginnt mit jeder Adresse neu. */}
        {rechner ? null : <Menue key={`${pathname}${search}`} ziele={ziele} ich={ich} />}
      </div>
      {/* D6: der Schalter nur bei zwei lesbaren Zugängen - eigene Bereiche
          und Vertretungen (POR-006). */}
      {bereiche.length > 1 && MIT_SCHALTER.has(pathname) ? (
        <nav aria-label="Bereich" className={`${geruestSpalte(rechner)} pb-3`}>
          <ul
            className={`bg-surface-sunken rounded-button flex flex-wrap gap-1 p-1 ${
              rechner ? 'max-w-formular' : ''
            }`.trim()}
          >
            {bereiche.map((z) => (
              // POR-020: Bei 200 % am Telefon stehen die Bereiche untereinander,
              // statt mitten im Wort zu trennen.
              <li key={z.access_id} className="min-w-0 flex-1 max-[23rem]:basis-full">
                <Link
                  to={wahlAdresse(z)}
                  replace
                  aria-current={gewaehlt?.access_id === z.access_id ? 'page' : undefined}
                  className="text-ink-muted aria-[current=page]:bg-surface aria-[current=page]:text-ink rounded-button flex min-h-11 items-center justify-center px-3 text-center text-base font-medium"
                >
                  {wahlName(z)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

/**
 * Die Navigation am Rechner (Handoff Abschnitt 4): die vier Ziele als Links
 * im Kopf, 48 hoch, aktiv auf `accent-soft` in `accent` 700.
 */
function Rechnernavigation({ ziele }: { ziele: Ziel[] }) {
  return (
    <nav aria-label="Plattform" className="grow">
      <ul className="flex flex-wrap gap-2">
        {ziele.map((z) => (
          <li key={z.wort}>
            <Link
              to={z.to}
              aria-current={z.aktuell ? 'page' : undefined}
              className={`text-ink hover:text-accent aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent rounded-button inline-flex min-h-12 items-center px-4 font-medium whitespace-nowrap aria-[current=page]:font-bold ${DRUCK}`}
            >
              {z.wort}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Stufe 3 der Navigation (Handoff Abschnitt 3, ANN-682): Unter 23rem
 * Fensterbreite - 200 % Zoom am Telefon - ist für die Leiste kein Platz. Im
 * Kopf steht dann der Zweitknopf „Menü“; er öffnet unter dem Kopf über die
 * ganze Breite die vier Ziele und, nach einer Linie, „Ich“. Esc und ein Tipp
 * daneben schließen es, der Fokus geht zurück auf „Menü“.
 *
 * Die Grenze ist eine Media Query in rem: Sie bezieht sich auf die
 * Standardschrift des Browsers und greift deshalb beim Zoom, nicht bei der
 * Schrift-Einstellung „Sehr groß“ - dort stehen zwei Reihen (Stufe 2).
 */
function Menue({ ziele, ich }: { ziele: Ziel[]; ich: boolean }) {
  const [offen, setOffen] = useState(false);
  const knopf = useRef<HTMLButtonElement>(null);
  const id = useId();

  function schliessen() {
    setOffen(false);
    knopf.current?.focus();
  }

  return (
    <div
      className="hidden max-[23rem]:block"
      onKeyDown={(ereignis) => {
        if (ereignis.key !== 'Escape' || !offen) return;
        ereignis.stopPropagation();
        schliessen();
      }}
    >
      <Menueknopf ref={knopf} offen={offen} steuert={id} onClick={() => setOffen(!offen)} />
      {/* Ein Tipp daneben schließt das Menü und öffnet nichts darunter. */}
      {offen ? (
        <div
          aria-hidden="true"
          data-testid="menue-daneben"
          className="fixed inset-0 z-30"
          onClick={schliessen}
        />
      ) : null}
      <nav
        id={id}
        aria-label="Plattform"
        hidden={!offen}
        className="menue-geht-auf bg-surface border-line absolute inset-x-0 top-full z-40 border-y"
      >
        <ul className="py-1">
          {ziele.map((z) => (
            <li key={z.wort}>
              <Menuezeile to={z.to} aktuell={z.aktuell} zeichen={z.zeichen} wort={z.wort} />
            </li>
          ))}
          <li className="border-line mt-1 border-t pt-1">
            <Menuezeile to={`${PLATTFORM_PFAD}/ich`} aktuell={ich} zeichen={PERSON} wort="Ich" />
          </li>
        </ul>
      </nav>
    </div>
  );
}

/** Eine Zeile im Menü: 56 hoch, Zeichen 24 und Wort; aktiv Strich 3 links. */
function Menuezeile({
  to,
  aktuell,
  zeichen,
  wort,
}: {
  to: string;
  aktuell: boolean;
  zeichen: ReactNode;
  wort: string;
}) {
  return (
    <Link
      to={to}
      aria-current={aktuell ? 'page' : undefined}
      className={`text-ink aria-[current=page]:text-accent aria-[current=page]:border-accent flex min-h-14 items-center gap-3 border-l-3 border-transparent px-3 font-medium aria-[current=page]:font-bold ${DRUCK}`}
    >
      <Zeichen className="size-6 shrink-0">{zeichen}</Zeichen>
      {wort}
    </Link>
  );
}

/**
 * Misst, welche Stufe die Leiste braucht (ANN-679): `ResizeObserver` an der
 * Leiste und an einer unsichtbaren Messreihe mit denselben Wörtern. Ändert
 * sich die Schrift - „Groß“, „Sehr groß“, die Schrift des Systems, eine
 * Übersetzung -, ändert sich die Messreihe, und die Stufe folgt. Ohne
 * Messung (jsdom) bleibt es bei einer Reihe.
 */
function useReiterstufe(
  leiste: RefObject<HTMLElement | null>,
  messreihe: RefObject<HTMLElement | null>,
): 1 | 2 {
  const [stufe, setStufe] = useState<1 | 2>(1);
  useLayoutEffect(() => {
    const flaeche = leiste.current;
    const woerter = messreihe.current;
    if (!flaeche || !woerter) return;
    const messen = () =>
      setStufe(
        reiterstufe(woerter.getBoundingClientRect().width, flaeche.getBoundingClientRect().width),
      );
    messen();
    if (typeof ResizeObserver === 'undefined') return;
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(flaeche);
    beobachter.observe(woerter);
    return () => beobachter.disconnect();
  }, [leiste, messreihe]);
  return stufe;
}

/** Stufe 1: Zeichen 24 über dem Wort, mindestens 68 hoch, aktiv mit Strich 3 oben. */
const REITER_EINE_REIHE = `text-ink-muted aria-[current=page]:text-accent aria-[current=page]:border-accent -mt-px flex min-h-17 grow flex-col items-center justify-center gap-0.5 border-t-3 border-transparent px-0.5 pt-1.5 pb-2 font-medium whitespace-nowrap aria-[current=page]:font-bold ${DRUCK}`;

/** Stufe 2: Zeichen 28 neben dem Wort, mindestens 56 hoch, aktiv auf `accent-soft`. */
const REITER_ZWEI_REIHEN = `text-ink-muted aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent rounded-button flex min-h-14 grow items-center gap-2 p-1.5 font-medium whitespace-nowrap aria-[current=page]:font-bold ${DRUCK}`;

/**
 * Die Reiterleiste unten (DSN-001 Abschnitt 3, Handoff Abschnitt 3), am
 * Telefon in Stufe 1 oder 2. Sie steht am Ende der Seite und bleibt beim
 * Rollen unten (`sticky`): So verdeckt sie auch in zwei Reihen nie das
 * Letzte der Seite. Unter 23rem tritt sie dem Menü im Kopf, bei offener
 * Bildschirmtastatur dem Feld zurück (`reiterleiste`, DR-120, ANN-681).
 */
export function Reiterleiste({ bereiche }: { bereiche: Plattformzugang[] }) {
  const ziele = useZiele(bereiche);
  const leiste = useRef<HTMLUListElement>(null);
  const messreihe = useRef<HTMLUListElement>(null);
  const stufe = useReiterstufe(leiste, messreihe);
  return (
    <nav
      aria-label="Plattform"
      data-stufe={stufe}
      className="reiterleiste border-line bg-surface/95 sticky bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur max-[23rem]:hidden"
    >
      <ul
        ref={leiste}
        className={
          stufe === 1
            ? 'max-w-formular mx-auto flex px-1'
            : 'max-w-formular mx-auto grid grid-cols-2 gap-1 px-1 pt-1.5 pb-2'
        }
      >
        {ziele.map((z) => (
          <li key={z.wort} className={stufe === 1 ? 'flex flex-auto' : 'flex min-w-0'}>
            <Link
              to={z.to}
              aria-current={z.aktuell ? 'page' : undefined}
              className={stufe === 1 ? REITER_EINE_REIHE : REITER_ZWEI_REIHEN}
            >
              <Zeichen className={stufe === 1 ? 'size-6' : 'size-7 shrink-0'}>{z.zeichen}</Zeichen>
              {z.wort}
            </Link>
          </li>
        ))}
      </ul>
      {/* Die Messreihe: dieselben Wörter in 700, je 4 px Luft daneben - so
          stoßen sie in einer Reihe nie aneinander (DR-112). Unsichtbar und
          ohne Höhe; Vorlesesoftware liest sie nicht. */}
      <div aria-hidden="true" className="invisible h-0 overflow-hidden">
        <ul ref={messreihe} className="flex w-max px-1">
          {ziele.map((z) => (
            <li key={z.wort} className="px-1 font-bold whitespace-nowrap">
              {z.wort}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
