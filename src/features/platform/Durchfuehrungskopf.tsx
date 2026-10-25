import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { OhneNetzSymbol } from '@/components/ui/OhneNetzSymbol';

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
      {/* Am Telefon zwei Reihen: die Knöpfe, darunter Balken und Stand. Am
          Rechner eine Reihe mit dem Balken in der Mitte (Handoff 5.8): Die
          Reihe der Knöpfe löst sich dort auf (`contents`), die Reihenfolge
          legt `order` fest. */}
      <div className="[[data-rechner]_&]:max-w-durchfuehrung mx-auto w-full [[data-rechner]_&]:flex [[data-rechner]_&]:min-h-16 [[data-rechner]_&]:items-center [[data-rechner]_&]:gap-6 [[data-rechner]_&]:p-2">
        {/* Wird es eng (200 %), rückt „Später weiter“ in eine eigene Reihe,
            statt beide Wörter mitten im Wort zu brechen. */}
        <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 p-2 [[data-rechner]_&]:contents">
          {onZurueck ? (
            <Button
              type="button"
              variant="quiet"
              className="gap-1 pl-2 [[data-rechner]_&]:order-1"
              onClick={onZurueck}
            >
              <ZurueckSymbol />
              Zurück
            </Button>
          ) : null}
          {'pfad' in spaeter ? (
            <ButtonLink
              variant="quiet"
              to={spaeter.pfad}
              className="ml-auto [[data-rechner]_&]:order-3"
            >
              Später weiter
            </ButtonLink>
          ) : (
            <Button
              type="button"
              variant="quiet"
              className="ml-auto [[data-rechner]_&]:order-3"
              onClick={spaeter.onSpaeter}
            >
              Später weiter
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pb-3 max-[23rem]:flex-col-reverse max-[23rem]:items-start max-[23rem]:px-3 [[data-rechner]_&]:order-2 [[data-rechner]_&]:flex-1 [[data-rechner]_&]:p-0">
          <span aria-hidden="true" className="flex min-w-24 flex-1 gap-1 max-[23rem]:w-full">
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
          // Am Rechner in der Spalte des Kopfs (bis 960), nicht am Fensterrand.
          <div className="bg-surface-sunken px-5 py-2.5 max-[23rem]:px-3">
            <p className="text-ink [[data-rechner]_&]:max-w-durchfuehrung mx-auto flex items-start gap-3">
              <OhneNetzSymbol />
              Ohne Verbindung – Ihre Haken liegen auf diesem Gerät.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Der Winkel nach links, 24 px im Raster 24 - auch am Planblatt. */
export function ZurueckSymbol() {
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
