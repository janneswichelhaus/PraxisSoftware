import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';

/**
 * Eine Angabe zum Abschreiben mit „Kopieren“ daneben, etwa IBAN und Verwendungszweck einer
 * Rechnung. Die Rückmeldung steht im Knopf und wird angesagt; ohne Zwischenablage (alte Browser,
 * kein HTTPS) sagt sie, dass man abschreiben muss. Der Wert bleibt immer lesbar daneben.
 */
export function Kopierzeile({
  etikett,
  wert,
  anzeige,
}: {
  etikett: string;
  /** Was in die Zwischenablage geht, etwa die IBAN ohne Leerzeichen. */
  wert: string;
  /** Was zu lesen ist, etwa die IBAN in Vierergruppen; ohne Angabe der Wert. */
  anzeige?: ReactNode;
}) {
  const [stand, setStand] = useState<'ja' | 'nein' | null>(null);
  useEffect(() => {
    if (stand !== 'ja') return;
    const uhr = window.setTimeout(() => setStand(null), 4000);
    return () => window.clearTimeout(uhr);
  }, [stand]);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(wert);
      setStand('ja');
    } catch {
      setStand('nein');
    }
  }

  return (
    <div className="border-line flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t py-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-ink-muted text-sm">{etikett}</p>
        <p className="text-ink text-base font-semibold wrap-anywhere tabular-nums">
          {anzeige ?? wert}
        </p>
        {stand === 'nein' ? (
          <p className="text-ink-muted text-sm">Kopieren geht hier nicht. Bitte abschreiben.</p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="secondary"
        groesse="kompakt"
        className="nicht-drucken"
        onClick={() => void kopieren()}
      >
        <span aria-live="polite">{stand === 'ja' ? '✓ Kopiert' : 'Kopieren'}</span>
        <span className="sr-only">: {etikett}</span>
      </Button>
    </div>
  );
}
