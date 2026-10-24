import { Abschlussseite } from '@/components/ui/Abschlussseite';
import { HakenSymbol } from '@/components/ui/HakenSymbol';
import { Durchfuehrungsfuss, TelefonSymbol } from './Durchfuehrungsfuss';
import { tagOhneJahr } from './zeit';

/**
 * Die Seite nach „Einheit beenden“ (Handoff 2026-10-24, Abschnitte 3 und
 * 5.5): wo die Einheit liegt, wer sie sieht, und der nächste Übungstag -
 * ohne Lob, ohne Zahl, ohne Serie (DSN-001 4.1).
 *
 * **Eigene Seite statt Rückmeldung am Reiter** (ANN-706, Jannes 24.10.2026).
 * Zwei Fassungen wie `Beendetziel`: `uebertragen` (Tiefgrün mit Haken) und
 * `geraet` (vertieft mit Telefon) - auf dem Gerät gespeichert ist nicht bei
 * der Praxis (ADR-001), und die Seite sagt es. Ob die Verbindungszeile
 * darüber steht, entscheidet die Seite, die sie zeigt.
 */
export function Endseite({
  fassung,
  tag,
  wer,
  naechsterTag,
  zurUebersicht,
  zuDenUebungen,
}: {
  fassung: 'uebertragen' | 'geraet';
  /** Der Tag der Einheit, `YYYY-MM-DD`. */
  tag: string;
  /** Wer die Einheit sieht: „Anna Beispiel“, ohne Namen „Ihre Therapeut:in“. */
  wer: string;
  /** Der nächste Übungstag, `YYYY-MM-DD`; ohne Angabe keine Zeile. */
  naechsterTag?: string | null | undefined;
  zurUebersicht: string;
  zuDenUebungen: string;
}) {
  const uebertragen = fassung === 'uebertragen';
  return (
    <Abschlussseite
      ton={uebertragen ? 'marke' : 'vertieft'}
      zeichen={
        uebertragen ? <HakenSymbol className="size-11" /> : <TelefonSymbol className="size-11" />
      }
      titel={uebertragen ? 'Gespeichert' : 'Auf diesem Gerät gespeichert'}
      zeile={
        naechsterTag ? (
          <p className="flex items-start gap-3">
            <KalenderSymbol />
            Nächster Übungstag: {tagOhneJahr(`${naechsterTag}T12:00:00`)}
          </p>
        ) : null
      }
      fuss={
        <Durchfuehrungsfuss
          aktion={{ text: 'Zur Übersicht', to: zurUebersicht }}
          zweit={{ text: 'Zu den Übungen', to: zuDenUebungen }}
        />
      }
    >
      {uebertragen ? (
        <>
          <p>Ihre Einheit vom {tagOhneJahr(`${tag}T12:00:00`)} ist bei der Praxis.</p>
          <p className="text-ink-muted">{wer} sieht sie beim nächsten Termin.</p>
        </>
      ) : (
        <>
          <p>
            Ihre Einheit ist noch nicht bei der Praxis. Sie wird übertragen, sobald Verbindung
            besteht.
          </p>
          <p className="text-ink-muted">Bis dahin liegt sie nur auf diesem Telefon.</p>
        </>
      )}
    </Abschlussseite>
  );
}

/** Der Kalender, 22 px in der Hauptfarbe - für Vorlesesoftware ausgeblendet. */
function KalenderSymbol() {
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
      className="text-accent mt-0.5 size-5.5 shrink-0"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
