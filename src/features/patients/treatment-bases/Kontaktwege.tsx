import { Textlink } from '@/components/ui/Textlink';
import type { Prescriber } from './api';

/**
 * Telefon und E-Mail der Verordner:in als Links, damit niemand eine Nummer aus dem Formular
 * abschreibt; das Fax bleibt Text, ein Fax verschickt die Anwendung nicht (ANN-759).
 */
export function Kontaktwege({
  verordner,
  className = '',
}: {
  verordner: Pick<Prescriber, 'phone' | 'fax' | 'email'>;
  className?: string;
}) {
  const { phone, fax, email } = verordner;
  if (!phone && !fax && !email) return null;

  // Als `Textlink`: unterstrichen, 44 px Tippziel (Regel 9; Sichtung
  // 13.10.2026, A2 - dieselbe Karte).
  return (
    <p className={`flex flex-wrap items-center gap-x-4 text-sm ${className}`}>
      {phone ? (
        <Textlink href={`tel:${telefonziel(phone)}`} alleinstehend>
          Tel. {phone}
        </Textlink>
      ) : null}
      {fax ? (
        <span className="text-ink-muted inline-flex min-h-11 items-center">Fax {fax}</span>
      ) : null}
      {email ? (
        <Textlink href={`mailto:${email}`} alleinstehend className="wrap-anywhere">
          {email}
        </Textlink>
      ) : null}
    </p>
  );
}

/** „07071 12 34-5“ → „0707112345“; ein führendes Plus bleibt. */
function telefonziel(nummer: string): string {
  const plus = nummer.trim().startsWith('+') ? '+' : '';
  return `${plus}${nummer.replace(/\D/g, '')}`;
}
