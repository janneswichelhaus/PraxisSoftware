import { absenderAnschrift, absenderKontakt, type PraxisAbsender } from './absender';

/**
 * Der Absender der Praxis über einem Blatt an Patient:innen (UX-009a, BEF-052).
 *
 * Ohne Wortmarke: `marke/README.md` sieht sie auf Papier nur für Rechnung und
 * Fax vor. Name in Fett, darunter Anschrift und Kontakt - auch in Schwarz auf
 * Papier, weil Grau in der Kopie aufbricht (ABR-28).
 */
export function AbsenderBlock({
  absender,
  className = '',
}: {
  absender: PraxisAbsender;
  className?: string;
}) {
  const anschrift = absenderAnschrift(absender);
  const kontakt = absenderKontakt(absender);
  return (
    <address className={`text-ink-muted print:text-ink text-sm not-italic ${className}`}>
      <span className="text-ink block font-semibold">{absender.name}</span>
      {anschrift ? <span className="block">{anschrift}</span> : null}
      {kontakt ? <span className="block">{kontakt}</span> : null}
    </address>
  );
}
