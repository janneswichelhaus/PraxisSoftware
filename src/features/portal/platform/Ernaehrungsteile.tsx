import { useId, type ReactNode } from 'react';
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
