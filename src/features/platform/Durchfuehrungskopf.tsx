import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';

/**
 * Der Kopf der Durchführung (Handoff 2026-10-24, Abschnitt 3; Muster wie der
 * geführte Ablauf mit „Später“): links „Zurück“ zur vorigen Übung, rechts
 * „Später weiter“, darunter ein Balken je Übung und „Übung 2 von 3“ als
 * Text. Die Durchführung steht im Vollbild ohne Reiterleiste; der Kopf ist
 * ihr einziger Weg hinaus.
 *
 * **„Später weiter“ statt „Abbrechen“** (ANN-705, Jannes 24.10.2026): Die
 * Haken bleiben auf dem Gerät und beim Server, die Einheit des Tages geht
 * später mit „Weiter üben“ weiter - „Abbrechen“ klang nach Verwerfen. Der
 * Ausweg steht in jedem Schritt da (DSN-001 Abschnitt 7 Nr. 7).
 *
 * Ohne Netz sagt eine Zeile darunter, wo die Haken liegen. Sie steht immer im
 * Baum, nur ihr Inhalt wechselt: Eine Live-Region, die erst mit ihrem Text
 * entsteht, sagt Vorlesesoftware unzuverlässig an (wie `Verbindungszeile`).
 * Fest oben stehen oder unter 23rem mitrollen regelt die Seite.
 */
export function Durchfuehrungskopf({
  uebung,
  von,
  abschluss = false,
  onZurueck,
  spaeter,
  ohneNetz = false,
}: {
  /** Die Übung, an der die Person steht, ab 1. */
  uebung: number;
  /** Wie viele Übungen der Plan hat. */
  von: number;
  /** Auf „Einheit beenden“: alle Balken voll, „Abschluss“ statt der Übung. */
  abschluss?: boolean;
  /** „Zurück“ zur vorigen Übung; ohne Angabe (bei Übung 1) kein Knopf. */
  onZurueck?: (() => void) | undefined;
  /** „Später weiter“: in der Plattform ein Link zur Herkunft, in der lokalen Ansicht ein Knopf. */
  spaeter: { pfad: string } | { onSpaeter: () => void };
  ohneNetz?: boolean;
}) {
  const erreicht = abschluss ? von : uebung;
  return (
    <div className="bg-surface border-line border-b">
      <div className="mx-auto w-full [[data-rechner]_&]:max-w-240">
        {/* Wird es eng (200 %), rückt „Später weiter“ in eine eigene Reihe,
            statt beide Wörter mitten im Wort zu brechen. */}
        <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 p-2">
          {onZurueck ? (
            <Button type="button" variant="quiet" className="gap-1.5 pl-2" onClick={onZurueck}>
              <ZurueckSymbol />
              Zurück
            </Button>
          ) : null}
          {'pfad' in spaeter ? (
            <ButtonLink variant="quiet" to={spaeter.pfad} className="ml-auto">
              Später weiter
            </ButtonLink>
          ) : (
            <Button type="button" variant="quiet" className="ml-auto" onClick={spaeter.onSpaeter}>
              Später weiter
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pb-3 max-[23rem]:flex-col-reverse max-[23rem]:items-start max-[23rem]:px-3">
          <span aria-hidden="true" className="flex min-w-24 flex-1 gap-1.5 max-[23rem]:w-full">
            {Array.from({ length: von }, (_, i) => (
              <span
                key={i}
                data-balken={i < erreicht ? 'erreicht' : 'offen'}
                className={`rounded-pill h-1 flex-1 ${i < erreicht ? 'bg-accent' : 'bg-spur'}`}
              />
            ))}
          </span>
          <p className="text-ink-muted shrink-0">
            {abschluss ? 'Abschluss' : `Übung ${uebung} von ${von}`}
          </p>
        </div>
      </div>
      <div role="status">
        {ohneNetz ? (
          <p className="bg-surface-sunken text-ink flex items-start gap-3 px-5 py-2.5 max-[23rem]:px-3">
            <OhneNetzSymbol />
            Ohne Verbindung – Ihre Haken liegen auf diesem Gerät.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Der Winkel nach links, 24 px im Raster 24. */
function ZurueckSymbol() {
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
      className="size-6 shrink-0"
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

/** Das durchgestrichene WLAN-Zeichen, 22 px wie in der `Verbindungszeile`. */
function OhneNetzSymbol() {
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
      className="mt-0.5 size-5.5 shrink-0"
    >
      <path d="M2 8.8a15 15 0 0 1 4.2-2.6M10 5.2A15 15 0 0 1 22 8.8M5 12.5a10 10 0 0 1 3-1.9M15.4 10.9A10 10 0 0 1 19 12.5M8.5 16.1a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" />
    </svg>
  );
}
