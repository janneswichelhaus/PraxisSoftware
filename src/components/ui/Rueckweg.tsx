import { Link, useSearchParams } from 'react-router-dom';
import { leseRueckweg, rueckwegBeschriftung } from '@/lib/rueckweg';

/**
 * Der Weg zurück, oben links auf jeder Detailseite (UX-012).
 *
 * Dieselbe Zeile stand vorher in sieben Dateien einzeln — jedes Mal mit einem
 * fest verdrahteten Ziel. Hier ist beides an einer Stelle: die Gestaltung und
 * die Regel, woher das Ziel kommt.
 *
 * **Der Rückweg aus der Adresszeile gewinnt.** Wer aus dem Kalender kommt,
 * kommt dorthin zurück — mit Ansicht, Datum und Filtern, weil die ganze
 * Adresse mitgereist ist. Nur wenn keiner mitgeschickt wurde (ein geteilter
 * Link, ein Lesezeichen), gilt das Ziel, das die Seite selbst für sinnvoll
 * hält.
 */
export function Rueckweg({
  standard,
  beschriftung,
  className = '',
}: {
  /** Ziel, wenn die Adresszeile keinen gültigen Rückweg trägt. */
  standard: string;
  /** Beschriftung für den Standardfall; sonst aus dem Pfad abgeleitet. */
  beschriftung?: string;
  className?: string;
}) {
  const [suche] = useSearchParams();
  const ziel = leseRueckweg(suche, standard);
  const text =
    ziel === standard && beschriftung ? beschriftung : rueckwegBeschriftung(ziel);

  return (
    <Link
      to={ziel}
      className={`text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm ${className}`}
    >
      ← {text}
    </Link>
  );
}
