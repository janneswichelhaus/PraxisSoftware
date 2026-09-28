import type { ReactNode } from 'react';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { MARKE_RECHNUNGSHOEHE } from '@/components/ui/markeRegeln';
import type { Rechnungsdokument } from './api';

/**
 * Kopf und Anschriftfeld der Blätter: Rechnung, Stornodokument,
 * Zahlungserinnerung (UXR-010).
 *
 * Bis UXR-010 stand derselbe Kopf dreimal da. Jetzt liegt hier die eine
 * Stelle, an der festgelegt ist, **wo auf dem Papier** die Anschrift steht.
 *
 * **Fensterumschlag, DIN 5008 Form B, Fenster links (ABR-22, ANN-131).** Die Anschrift
 * folgte bisher dem Fluss: Sie begann 12 mm vom linken Rand (der Seitenrand
 * aus `@page`), das Fenster eines DL-Umschlags aber erst bei 20 mm - die
 * ersten Buchstaben lagen verdeckt. Im Druck gilt deshalb:
 *
 *   * Das Anschriftfeld beginnt 20 mm vom linken und 45 mm vom oberen
 *     Blattrand und ist 85 × 45 mm groß. Mit dem Seitenrand von 12 mm heißt
 *     das: 8 mm Einzug, 33 mm Kopf darüber.
 *   * Der Kopf ist mindestens 33 mm hoch, damit das Feld auch bei kurzem
 *     Absender an seinem Platz steht. Wird er länger, rückt das Feld nach -
 *     abgeschnitten wird nichts.
 *   * Die Angaben rechts (Nummer, Datum, behandelte Person) beginnen bei
 *     125 mm und brechen nicht mehr unter die Anschrift um. Dort schienen
 *     Name und Geburtsdatum sonst durchs Fenster.
 *
 * Am Bildschirm bleibt alles, wie es war. Die Festlegung ist eine Annahme
 * (Form B, Fenster links, ANN-131) und lässt sich hier
 * zurücknehmen, ohne dass eine Rechnung sich ändert - das Blatt wird aus dem
 * Snapshot neu gezeichnet (ADR-009 Punkt 11).
 */
export function Briefkopf({
  absender,
  empfaenger,
  angaben,
}: {
  absender: Rechnungsdokument['issuer'];
  empfaenger: Rechnungsdokument['recipient'];
  /** Die Angaben rechts neben der Anschrift, meist `Angaben`. */
  angaben: ReactNode;
}) {
  const strasse = `${absender.street} ${absender.house_number ?? ''}`.trim();

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 print:min-h-[33mm] print:flex-nowrap">
        {/* Die schwarze Fassung, nicht die farbige umgefärbt:
            `marke/README.md` nennt Rechnung und Fax als genau ihren Fall. */}
        <Wortmarke hoehe={MARKE_RECHNUNGSHOEHE} fassung="schwarz" />
        <address className="text-ink-muted print:text-ink text-right text-sm not-italic">
          <span className="text-ink block font-medium">{absender.legal_name}</span>
          <span className="block">{strasse}</span>
          <span className="block">
            {absender.postal_code} {absender.city}
          </span>
          {absender.phone ? <span className="block">{absender.phone}</span> : null}
          {absender.email ? <span className="block">{absender.email}</span> : null}
        </address>
      </div>

      <div className="mt-10 flex flex-wrap justify-between gap-8 print:mt-0 print:flex-nowrap print:gap-0">
        <div className="min-w-[70mm] print:ml-[8mm] print:min-h-[45mm] print:w-[85mm] print:min-w-0 print:shrink-0">
          {/* Die Absenderzeile über dem Anschriftenfeld: klein, einzeilig,
              im Fenster sichtbar. Schwarz auf Papier: Grau bricht beim Fax
              und in der Kopie auf (ABR-28). */}
          <p className="text-ink-muted print:text-ink border-line border-b pb-1 text-[0.6875rem]">
            {absender.legal_name} · {strasse} · {absender.postal_code} {absender.city}
          </p>
          <address className="mt-3 leading-relaxed not-italic">
            <span className="block">{empfaenger.name}</span>
            {empfaenger.street ? (
              <span className="block">
                {`${empfaenger.street} ${empfaenger.house_number ?? ''}`.trim()}
              </span>
            ) : null}
            {empfaenger.postal_code || empfaenger.city ? (
              <span className="block">
                {empfaenger.postal_code} {empfaenger.city}
              </span>
            ) : null}
          </address>
          {empfaenger.reference ? (
            <p className="text-ink-muted print:text-ink mt-2 text-sm">
              Aktenzeichen: {empfaenger.reference}
            </p>
          ) : null}
        </div>

        <div className="print:ml-auto print:w-[73mm] print:shrink-0">{angaben}</div>
      </div>
    </>
  );
}

/** Die Angaben rechts neben der Anschrift, als Definitionsliste. */
export function Angaben({ children }: { children: ReactNode }) {
  return <dl className="text-sm">{children}</dl>;
}

/**
 * Eine Angabe: Beschriftung und Wert.
 *
 * Die Beschriftung behält ihre Breite (ABR-B05): Ohne `shrink-0` schrumpfte
 * sie bei einem langen Namen, und der Wert begann weiter links als die Werte
 * darüber und darunter. Grau bleibt nur die Beschriftung; der Wert steht auf
 * Papier schwarz (ABR-28).
 */
export function Angabe({
  bezeichnung,
  zahl = false,
  hervorgehoben = false,
  children,
}: {
  bezeichnung: string;
  /** Ziffern gleicher Breite - Nummern und Daten. */
  zahl?: boolean;
  hervorgehoben?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mt-1 flex gap-3 first:mt-0">
      <dt className="text-ink-muted w-40 shrink-0 print:w-[32mm]">{bezeichnung}</dt>
      <dd
        className={[
          'min-w-0',
          zahl ? 'tabular-nums' : '',
          hervorgehoben ? 'text-ink font-medium' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </dd>
    </div>
  );
}
