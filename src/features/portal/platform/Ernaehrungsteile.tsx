import { useId, type ReactNode } from 'react';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Pfeilzeichen } from '@/components/ui/Tagebuchbausteine';
import { Zwischentitel } from '@/components/ui/Zwischentitel';

/** Ein Abschnitt der Seiten „Ernährung“ und „Tagebuch“: Titel 22/700, rechts daneben auf Wunsch ein Stand. */
export function Abschnitt({
  titel,
  rechts,
  abstand = 'gap-3',
  children,
}: {
  titel: string;
  /** Neben dem Titel, etwa „0,5 von 2,6 l“; passt beides nicht nebeneinander, steht es darunter. */
  rechts?: ReactNode;
  /** Zwischen den Teilen und vom Titel zum ersten (12 oder 16). */
  abstand?: 'gap-3' | 'gap-4';
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col">
      <Zwischentitel ebene={2} stufe="abschnitt" id={id} {...(rechts ? { aktion: rechts } : {})}>
        {titel}
      </Zwischentitel>
      {/* Der Titel bringt 8 nach unten mit. */}
      <div className={`flex flex-col ${abstand} ${abstand === 'gap-4' ? 'mt-2' : 'mt-1'}`}>
        {children}
      </div>
    </section>
  );
}

/**
 * Aufklapper als Zeilen: Kopf 56 hoch in Tinte, Linie darunter, ohne Kasten (Handoff 2026-10-29,
 * 5.6 und 5.7). `linieOben`, wo keine Zeile mit Linie darüber steht.
 */
export function Aufklappzeilen({
  linieOben = false,
  children,
}: {
  linieOben?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`[&>details]:border-line [&>details>summary]:text-ink [&>details]:mt-0 [&>details]:border-t-0 [&>details]:border-b [&>details]:pt-0 [&>details>div]:pb-4 [&>details>summary]:min-h-14 ${
        linieOben ? 'border-line border-t' : ''
      }`}
    >
      {children}
    </div>
  );
}

/** Der Pfeil einer Zeile, die weiterführt; unter 23rem stünde er allein in einer Zeile. */
export function Weiterpfeil() {
  return <Pfeilzeichen richtung="rechts" className="text-ink-muted size-5.5 max-[23rem]:hidden" />;
}

/**
 * Laden, Fehler und Leer einer Unterseite der Ernährung, etwa Plan oder Rezepte: Skelett statt
 * Satz (PLATTFORM.md); scheitert nur das Nachladen, bleibt der Inhalt.
 */
export function Unterseitenzustand<T>({
  abfrage,
  beschriftung,
  fehler,
  leer,
  children,
}: {
  abfrage: { data: T | undefined; isError: boolean; refetch: () => unknown };
  /** Was lädt, für Vorlesesoftware, etwa „Ihr Plan wird geladen“. */
  beschriftung: string;
  fehler: string;
  leer: { wenn: (daten: T) => boolean; titel: string; beschreibung?: string };
  children: (daten: T) => ReactNode;
}) {
  if (abfrage.data === undefined) {
    return abfrage.isError ? (
      <div className="mt-8">
        <ErrorState title={fehler} onErneut={() => abfrage.refetch()} />
      </div>
    ) : (
      <SkelettBereich beschriftung={beschriftung} className="mt-8 flex flex-col gap-3">
        <Skelett form="titel" className="w-36 max-w-full" />
        {['w-44', 'w-36', 'w-40'].map((breite) => (
          <span key={breite} className="flex items-center justify-between gap-3 py-4">
            <Skelett form="zeile" className={`${breite} max-w-3/5`} />
            <Skelett form="zeile" className="w-16" />
          </span>
        ))}
      </SkelettBereich>
    );
  }
  if (leer.wenn(abfrage.data)) {
    return (
      <div className="mt-8">
        <EmptyState markenform title={leer.titel} description={leer.beschreibung} />
      </div>
    );
  }
  return <>{children(abfrage.data)}</>;
}
