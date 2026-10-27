import { useEffect, type ReactNode, type Ref } from 'react';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { useSchriftgroesseAnwenden } from '@/lib/schriftgroesse';
import { ANMELDEN_TITEL } from './tabtitel';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { useRechner } from '@/features/portal/platform/geruestbreite';

/**
 * Eine Seite außerhalb des Anwendungsrahmens (AUTH-12, AUTH-13).
 *
 * Anmeldung, Einladung, Einrichtung, Sperre, Anmelden per Link, der Absturz
 * und die Ladezustände davor stehen ohne Kopfzeile und Navigation da. Bis
 * UXR-002 baute jede ihre Hülle selbst; beim Übergang von der Anmeldung zur
 * Sperrseite sprangen Marke und Titel.
 *
 * Was die Hülle zusichert (Handoff 2026-10-22, Abschnitt 5.2; ANN-684):
 *
 *   * **Marke 40 px oben links**, 20 oben, 24 seitlich, 16 darunter - der
 *     Schutzraum der MOTION-Zeile bei dieser Höhe ist 14,4 px (MARKE-001).
 *     Alles steht linksbündig an ihrer Kante (DR-107), oben statt senkrecht
 *     zentriert: So steht der Titel bei offener Tastatur über dem Feld.
 *   * **Ein `h1`** in `text-plattform-titel` (28, am Rechner 32) und der
 *     Hauptfarbe; die Einladung grüßt größer (`gross`, `text-gruss`). Bei
 *     einem Zustand ein Zeichen im Kreis 64 darüber (`zeichen`). Nur
 *     Ladezustände haben keinen Titel - sie sagen, was geschieht.
 *   * **Ein `main`**, höchstens `max-w-sm` breit; unter 23rem 12 px Rand.
 *   * **Kleingedrucktes am Ende** der Seite über den Baustein
 *     `Kleingedrucktes` (Variante K-A; TOK-04).
 *   * **Die Schrift der Plattform** (DR-102): Die Türen sehen auch
 *     Patient:innen, oft zuerst - deshalb 18 px für alle Texte und die
 *     Schriftgröße, die auf diesem Gerät gewählt ist. Die gemeinsame
 *     Anmeldung hat damit für alle 18 px.
 *
 * Der Rechner zählt nach `useRechner()` (ab 64rem), wie im Gerüst der
 * Plattform.
 *
 * Eigentlich ein Baustein für `src/components/ui`; er steht hier, weil der
 * Bereich des Rahmens ihn zuerst braucht.
 */
export function Vollseite({
  titel,
  gross = false,
  zeichen,
  zeichenAufMarke = false,
  oben,
  einleitung,
  kleingedrucktes,
  tabtitel = ANMELDEN_TITEL,
  titelRef,
  children,
}: {
  /** Der Seitentitel. Ohne ihn - nur für Ladezustände - steht keine Überschrift da. */
  titel?: string;
  /** Der Titel als Gruß (`text-gruss`): nur die Einladung. */
  gross?: boolean;
  /** Ein Zeichen im Raster 24 für einen Zustand; im Kreis 64 über dem Titel. */
  zeichen?: ReactNode;
  /** Der Kreis 72 auf der Markenfläche (`surface-inverse`): nur die Sperre der Plattform. */
  zeichenAufMarke?: boolean;
  /** Über dem Titel, etwa „← Zurück“. */
  oben?: ReactNode;
  /** Ein Satz unter dem Titel. */
  einleitung?: ReactNode;
  /** Der Hinweis am Fuß der Seite. */
  kleingedrucktes?: ReactNode;
  /** Der Titel des Tabs, ein fester aus `tabtitel.ts` - nie mit Daten. */
  tabtitel?: string;
  /**
   * Für den Fokus nach einem Wechsel des Zustands (AUTH-06): Der Titel sagt,
   * was jetzt gilt, und Vorlesesoftware liest von dort weiter.
   */
  titelRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  // Der Tab heißt außerhalb des Rahmens „Anmelden – Own Motion" (BEF-050,
  // RAH-008) - auf der Anmeldemaske wie auf jeder Türseite davor und danach.
  // Nach dem Abmelden löst das den Titel der letzten Seite ab. Einladung und
  // Sperre der Plattform heißen anders (DR-115).
  useEffect(() => {
    document.title = tabtitel;
  }, [tabtitel]);
  useSchriftgroesseAnwenden();
  const rechner = useRechner();
  const titelStufe = gross
    ? rechner
      ? 'text-gruss-rechner'
      : 'text-gruss max-[23rem]:text-plattform-titel'
    : rechner
      ? 'text-plattform-titel-rechner'
      : 'text-plattform-titel';

  return (
    <main className="plattform-schrift mx-auto flex min-h-dvh w-full max-w-sm flex-col px-6 pt-5 pb-10 max-[23rem]:px-3">
      {/* Landeplatz des Startbilds, wenn es über dieser Seite läuft (ANN-243). */}
      <div data-startbild-ziel="vollseite" className="mb-4 flex">
        <Wortmarke hoehe={40} />
      </div>
      {oben}
      {zeichen || titel || einleitung ? (
        <div className="mb-6 flex flex-col items-start gap-3">
          {zeichen ? (
            <span
              aria-hidden="true"
              className={`rounded-pill mb-1 inline-flex items-center justify-center ${
                zeichenAufMarke
                  ? 'bg-surface-inverse text-surface size-18'
                  : 'bg-accent-soft text-accent size-16'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-8"
              >
                {zeichen}
              </svg>
            </span>
          ) : null}
          {titel ? (
            <h1
              ref={titelRef}
              tabIndex={titelRef ? -1 : undefined}
              className={`text-accent [hyphens:manual] focus:outline-none ${titelStufe}`}
            >
              {titel}
            </h1>
          ) : null}
          {einleitung ? <p className="text-ink text-base">{einleitung}</p> : null}
        </div>
      ) : null}

      {children}

      {kleingedrucktes ? (
        <Kleingedrucktes className="mt-auto pt-8">{kleingedrucktes}</Kleingedrucktes>
      ) : null}
    </main>
  );
}
