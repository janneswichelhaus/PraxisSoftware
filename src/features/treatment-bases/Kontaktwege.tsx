import type { Prescriber } from './api';

/**
 * Telefon, Fax und E-Mail einer Verordner:in als Wege, nicht als Felder
 * (BEF-060, Entscheidung Jannes 2026-10-09).
 *
 * Bis UX-EPIC-007 standen die Kontaktdaten nur im Bearbeitungsformular: Wer
 * eine Folgeverordnung anfordern wollte, schrieb die Nummer aus einem offenen
 * Formular ab. Telefon und E-Mail sind Links (`tel:`, `mailto:`), das Fax ist
 * Text - ein Fax verschickt die Anwendung nicht.
 *
 * Es sind Angaben zur Praxis der Verordner:in, keine Patientendaten; sie
 * stehen dort, wo sie gebraucht werden, und werden nicht weitergegeben.
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

  return (
    <p className={`flex flex-wrap items-center gap-x-4 text-sm ${className}`}>
      {phone ? (
        <a
          href={`tel:${telefonziel(phone)}`}
          className="text-accent inline-flex min-h-11 items-center hover:underline"
        >
          Tel. {phone}
        </a>
      ) : null}
      {fax ? (
        <span className="text-ink-muted inline-flex min-h-11 items-center">Fax {fax}</span>
      ) : null}
      {email ? (
        <a
          href={`mailto:${email}`}
          className="text-accent inline-flex min-h-11 items-center wrap-anywhere hover:underline"
        >
          {email}
        </a>
      ) : null}
    </p>
  );
}

/** „07071 12 34-5“ → „0707112345“; ein führendes Plus bleibt. */
function telefonziel(nummer: string): string {
  const plus = nummer.trim().startsWith('+') ? '+' : '';
  return `${plus}${nummer.replace(/\D/g, '')}`;
}
