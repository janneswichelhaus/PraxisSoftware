import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';

/** Wo die Haken der Einheit liegen: noch keiner, alle bei der Praxis, oder noch auf dem Gerät. */
export type Uebertragungsstand = 'ohne' | 'uebertragen' | 'geraet';

/** Der eine Hauptknopf des Fußes: ein Knopf, ein Link oder das Absenden eines Formulars. */
export type Hauptaktion =
  | { text: string; onClick: () => void; disabled?: boolean }
  | { text: string; to: string }
  | { text: string; form: string; disabled?: boolean };

/** So lange wartet der Fuß, bevor er „auf diesem Gerät“ sagt. */
export const STAND_VERZOEGERUNG_MS = 1000;

/**
 * Der Fuß der Durchführung (Handoff 2026-10-24, Abschnitt 3): genau ein
 * Hauptknopf, 56 hoch, im Daumenbereich - „Nächste Übung“, „Zum Abschluss“,
 * „Einheit beenden“ -, darüber, sobald gehakt ist, wo die Haken liegen.
 *
 * **Der Übertragungsstand** (ANN-710, ADR-024 Punkt 8): „Übertragen an die
 * Praxis“ oder „Auf diesem Gerät, noch nicht übertragen“, bis nichts mehr
 * wartet - niemand soll glauben, etwas sei bei der Praxis, das nur auf dem
 * Telefon liegt. Vor dem ersten Haken steht nichts da. Zu „auf diesem Gerät“
 * wechselt die Zeile erst nach einer Sekunde Warten: Beim normalen
 * Übertragen wartet jeder Haken kurz, und die Zeile soll nicht flackern.
 *
 * Am Rechner (`data-rechner`) steht der Stand links und der Knopf rechts,
 * höchstens 360 breit; ist der Platz für beide zu knapp, rückt der Knopf
 * darunter. Fest unten stehen oder unter 23rem am Ende des Inhalts regelt
 * die Seite.
 */
export function Durchfuehrungsfuss({
  aktion,
  stand = 'ohne',
  gesperrt = false,
  zweit,
}: {
  aktion: Hauptaktion;
  stand?: Uebertragungsstand;
  /** Die Anwendung ist gesperrt (`LokaleUebungen`): übertragen wird erst nach dem Entsperren. */
  gesperrt?: boolean;
  /** Ein leiser zweiter Weg unter dem Hauptknopf, etwa „Zu den Übungen“. */
  zweit?: { text: string; to: string } | { text: string; onClick: () => void } | undefined;
}) {
  const angezeigt = useRuhigerStand(stand);
  const knopf =
    'w-full [[data-rechner]_&]:ml-auto [[data-rechner]_&]:w-hauptknopf [[data-rechner]_&]:shrink-0';
  return (
    <div className="bg-surface border-line border-t px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] max-[23rem]:px-3">
      <div className="[[data-rechner]_&]:max-w-spalte mx-auto flex w-full flex-col [[data-rechner]_&]:flex-row [[data-rechner]_&]:flex-wrap [[data-rechner]_&]:items-center [[data-rechner]_&]:gap-x-6 [[data-rechner]_&]:gap-y-3">
        {/* Immer im Baum, nur der Inhalt wechselt: Vorlesesoftware sagt
            eine Live-Region, die erst mit ihrem Text entsteht, unzuverlässig an.
            Den Abstand zum Knopf trägt der Satz, nicht die leere Region. */}
        <div role="status" className="[[data-rechner]_&]:min-w-60 [[data-rechner]_&]:flex-1">
          {angezeigt === 'uebertragen' ? (
            <p className="mb-3 flex items-start gap-3 [[data-rechner]_&]:mb-0">
              <UebertragenSymbol />
              Übertragen an die Praxis
            </p>
          ) : angezeigt === 'geraet' ? (
            <p className="mb-3 flex items-start gap-3 [[data-rechner]_&]:mb-0">
              <TelefonSymbol />
              <span>
                Auf diesem Gerät, noch nicht übertragen
                {gesperrt
                  ? '. Übertragen wird, sobald Verbindung besteht und Sie die Anwendung entsperrt haben.'
                  : null}
              </span>
            </p>
          ) : null}
        </div>
        {'to' in aktion ? (
          <ButtonLink to={aktion.to} groesse="gross" className={knopf}>
            {aktion.text}
          </ButtonLink>
        ) : 'form' in aktion ? (
          <Button
            type="submit"
            form={aktion.form}
            groesse="gross"
            className={knopf}
            disabled={aktion.disabled}
          >
            {aktion.text}
          </Button>
        ) : (
          <Button
            type="button"
            groesse="gross"
            className={knopf}
            onClick={aktion.onClick}
            disabled={aktion.disabled}
          >
            {aktion.text}
          </Button>
        )}
      </div>
      {zweit ? (
        <div className="[[data-rechner]_&]:max-w-spalte mx-auto mt-2 flex w-full justify-center [[data-rechner]_&]:justify-end">
          {'to' in zweit ? (
            <ButtonLink variant="quiet" to={zweit.to}>
              {zweit.text}
            </ButtonLink>
          ) : (
            <Button type="button" variant="quiet" onClick={zweit.onClick}>
              {zweit.text}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Der Stand, wie die Zeile ihn sagt (ANN-710): „übertragen“ und „noch
 * nichts“ sofort, „auf dem Gerät“ erst, wenn es eine Sekunde lang so bleibt -
 * bis dahin der Stand davor.
 */
function useRuhigerStand(stand: Uebertragungsstand): Uebertragungsstand {
  const [vorher, setVorher] = useState(stand);
  const [ruhig, setRuhig] = useState<Uebertragungsstand>(stand === 'geraet' ? 'ohne' : stand);
  const [bestaetigt, setBestaetigt] = useState(false);
  // Den Stand beim Zeichnen nachführen, nicht in einem Effekt (React,
  // „Informationen aus früheren Zeichnungen speichern“).
  if (stand !== vorher) {
    setVorher(stand);
    setBestaetigt(false);
    if (stand !== 'geraet') setRuhig(stand);
  }
  useEffect(() => {
    if (stand !== 'geraet') return;
    const uhr = window.setTimeout(() => setBestaetigt(true), STAND_VERZOEGERUNG_MS);
    return () => window.clearTimeout(uhr);
  }, [stand]);
  if (stand !== 'geraet') return stand;
  return bestaetigt ? 'geraet' : ruhig;
}

/** Ein Haken im Kreis, Leise: bei der Praxis angekommen. */
function UebertragenSymbol() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="text-ink-muted mt-0.5 size-5.5 shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}

/** Das Telefon in Tinte: noch auf diesem Gerät. */
export function TelefonSymbol({ className = 'mt-0.5 size-5.5 shrink-0' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`text-ink ${className}`}
    >
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M11 18h2" />
    </svg>
  );
}
