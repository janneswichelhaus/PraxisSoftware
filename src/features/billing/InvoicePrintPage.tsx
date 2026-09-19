import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { MARKE_RECHNUNGSHOEHE } from '@/components/ui/markeRegeln';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { KeineStammdaten, fetchRechnung, steuerLabels, type Rechnungsansicht } from './api';

/**
 * Die Rechnung als Blatt zum Verschicken (ABR-003b).
 *
 * **Weg 1 aus B14**, entschieden am 2026-09-19: Die Praxis druckt diese Seite
 * über ihren Browser nach PDF. Dieselbe Technik wie Tagesplan, Terminzettel
 * und Tourenliste — keine neue Abhängigkeit, kein neuer Ausführungsort.
 *
 * **Was dieser Weg nicht leistet, steht hier und nicht im Kleingedruckten:**
 * Die Datei entsteht beim Nutzer, und die Anwendung sieht sie nie. Aufbewahrt
 * wird deshalb der Snapshot der Rechnung, nicht das Blatt, das die Praxis
 * verschickt hat — **ADR-009 Punkt 11 ist mit diesem Weg nicht erfüllt**. Er
 * wird es mit Weg 3 (serverseitige Erzeugung, Ablage nach ADR-017), und der
 * hängt an OPS-001. Bis dahin hält Weg 1 die Praxis arbeitsfähig, ohne etwas
 * anzulegen, das später im Weg stünde (`docs/decisions/rechnungs-pdf-optionen.md`).
 *
 * **Die Quelle ist der Snapshot.** Eine ausgestellte Rechnung zeigt hier
 * genau das, was beim Ausstellen festgeschrieben wurde (ADR-009 Punkt 10);
 * spätere Änderungen an Stammdaten, Preisen oder Katalog erreichen dieses
 * Blatt nicht. Ein Entwurf wird aus den heutigen Stammdaten gebaut und trägt
 * deshalb einen Vermerk, der **mitgedruckt** wird: Ein ausgedruckter Entwurf
 * darf nicht wie eine Rechnung aussehen.
 *
 * Die Druck-Basis aus UI-000 (`@media print` in `src/index.css`) blendet
 * `nav`, `header` und jeden `button` aus. Deshalb steht der Rechnungskopf
 * hier in einem `div` und nicht in einem `header` — er soll gedruckt werden.
 */
export function InvoicePrintPage() {
  const { invoiceId = '' } = useParams();

  const rechnung = useQuery({
    queryKey: ['rechnung', invoiceId],
    queryFn: () => fetchRechnung(invoiceId),
    retry: false,
  });

  if (rechnung.isPending) return <LoadingState label="Rechnung wird geladen …" />;

  if (rechnung.error instanceof KeineStammdaten) {
    return (
      <Statusmeldung ton="warnung">
        Es sind noch keine Praxis-Stammdaten erfasst. Ohne Absender, Steuernummer und Bankverbindung
        lässt sich kein Rechnungsblatt drucken — sie stehen unter „Praxisstammdaten".
      </Statusmeldung>
    );
  }

  if (rechnung.isError || !rechnung.data) {
    return (
      <ErrorState
        title="Die Rechnung konnte nicht geladen werden."
        description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
      />
    );
  }

  return <Rechnungsblatt ansicht={rechnung.data} />;
}

function Rechnungsblatt({ ansicht }: { ansicht: Rechnungsansicht }) {
  const dokument = ansicht.document;
  const entwurf = ansicht.status === 'draft';
  const empfaenger = dokument.recipient;
  const absender = dokument.issuer;

  return (
    <>
      <div className="nicht-drucken">
        <Link
          to={`/abrechnung/rechnungen/${ansicht.id}`}
          className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
        >
          ← Zurück zur Rechnung
        </Link>
      </div>

      {/* Ein Blatt in Briefbreite. `max-w-[210mm]` gilt am Bildschirm wie auf
          Papier: Wer die Seite ansieht, sieht, was aus dem Drucker kommt. */}
      <article className="text-ink mx-auto max-w-[210mm] text-[0.9375rem]">
        {/* Bewusst kein `header`: Die Druckregeln blenden `header` aus, und
            dieser Kopf gehört auf das Papier. */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Die schwarze Fassung, nicht die farbige umgefärbt:
              `marke/README.md` nennt Rechnung und Fax als genau ihren Fall. */}
          <Wortmarke hoehe={MARKE_RECHNUNGSHOEHE} fassung="schwarz" />
          <address className="text-ink-muted text-right text-sm not-italic">
            <span className="text-ink block font-medium">{absender.legal_name}</span>
            <span className="block">
              {`${absender.street} ${absender.house_number ?? ''}`.trim()}
            </span>
            <span className="block">
              {absender.postal_code} {absender.city}
            </span>
            {absender.phone ? <span className="block">{absender.phone}</span> : null}
            {absender.email ? <span className="block">{absender.email}</span> : null}
          </address>
        </div>

        {entwurf ? (
          // Druckt mit: Ein Entwurf auf Papier darf nicht wie eine Rechnung
          // aussehen. Er trägt keine Nummer, und die Angaben stammen aus den
          // heutigen Stammdaten statt aus einem Snapshot.
          <p className="border-line-strong text-ink mt-8 border-2 px-3 py-2 text-sm font-semibold">
            Entwurf — keine Rechnung. Ohne Nummer, nicht zum Versand.
          </p>
        ) : null}

        <div className="mt-10 flex flex-wrap justify-between gap-8">
          <div className="min-w-[70mm]">
            {/* Die Absenderzeile über dem Anschriftenfeld: klein, einzeilig,
                wie im Fensterumschlag. */}
            <p className="text-ink-subtle border-line border-b pb-1 text-[0.6875rem]">
              {absender.legal_name} · {`${absender.street} ${absender.house_number ?? ''}`.trim()} ·{' '}
              {absender.postal_code} {absender.city}
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
              <p className="text-ink-muted mt-2 text-sm">Aktenzeichen: {empfaenger.reference}</p>
            ) : null}
          </div>

          <dl className="text-sm">
            {ansicht.invoice_number ? (
              <div className="flex gap-3">
                <dt className="text-ink-muted w-40">Rechnungsnummer</dt>
                <dd className="text-ink font-medium tabular-nums">{ansicht.invoice_number}</dd>
              </div>
            ) : null}
            {ansicht.issued_on ? (
              <div className="mt-1 flex gap-3">
                <dt className="text-ink-muted w-40">Rechnungsdatum</dt>
                <dd className="tabular-nums">{formatDate(ansicht.issued_on)}</dd>
              </div>
            ) : null}
            <div className="mt-1 flex gap-3">
              <dt className="text-ink-muted w-40">Behandelte Person</dt>
              <dd>{dokument.patient.name}</dd>
            </div>
            {dokument.patient.date_of_birth ? (
              <div className="mt-1 flex gap-3">
                <dt className="text-ink-muted w-40">Geburtsdatum</dt>
                <dd className="tabular-nums">{formatDate(dokument.patient.date_of_birth)}</dd>
              </div>
            ) : null}
            <div className="mt-1 flex gap-3">
              <dt className="text-ink-muted w-40">Steuernummer</dt>
              <dd className="tabular-nums">{absender.tax_number}</dd>
            </div>
            {absender.vat_id ? (
              <div className="mt-1 flex gap-3">
                <dt className="text-ink-muted w-40">USt-IdNr.</dt>
                <dd className="tabular-nums">{absender.vat_id}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <h1 className="mt-10 text-lg font-semibold">
          {ansicht.invoice_number ? `Rechnung ${ansicht.invoice_number}` : 'Rechnungsentwurf'}
        </h1>
        <p className="text-ink-muted mt-1 text-sm">
          Für die folgenden Leistungen im {monatsname(dokument.period_month)} stellen wir in
          Rechnung:
        </p>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-line-strong border-b text-left">
              <th scope="col" className="py-1 pr-3 font-medium">
                Datum
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Leistung
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">
                Menge
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">
                Einzelpreis
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Betrag
              </th>
            </tr>
          </thead>
          <tbody>
            {dokument.items.map((zeile, index) => (
              <tr
                key={`${zeile.performed_on}-${zeile.code}-${index}`}
                className="border-line border-b"
              >
                <td className="py-1 pr-3 tabular-nums">{formatDate(zeile.performed_on)}</td>
                <td className="py-1 pr-3">
                  {zeile.label} ({zeile.code})
                  {zeile.item_kind === 'absence_fee' ? ' · Ausfallhonorar' : ''}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{zeile.quantity}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {formatEuro(zeile.unit_price_cents, zeile.currency)}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {formatEuro(zeile.line_total_cents, zeile.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={4} className="py-2 pr-3 text-right font-semibold">
                Gesamtbetrag
              </th>
              <td className="py-2 text-right font-semibold tabular-nums">
                {formatEuro(dokument.totals.total_cents, dokument.currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Der Katalogpreis ist der Endpreis; eine enthaltene Umsatzsteuer
            wird je Satz herausgerechnet (ANN-074). Unter Paragraf 19 UStG
            entfällt der Ausweis und der Hinweis tritt an seine Stelle. */}
        <ul className="text-ink-muted mt-2 text-sm">
          {dokument.tax_groups.map((gruppe) => (
            <li key={`${gruppe.tax_treatment}-${gruppe.tax_rate_permille}`}>
              {steuerLabels[gruppe.tax_treatment]}: {formatEuro(gruppe.gross_cents)}
              {gruppe.tax_cents > 0
                ? ` · darin enthaltene Umsatzsteuer ${formatEuro(gruppe.tax_cents)} (${
                    gruppe.tax_rate_permille / 10
                  } %)`
                : ''}
            </li>
          ))}
        </ul>

        {absender.small_business ? (
          <p className="text-ink-muted mt-2 text-sm">
            Kein Ausweis von Umsatzsteuer gemäß § 19 UStG (Kleinunternehmerregelung).
          </p>
        ) : null}

        {dokument.treatment_bases.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-sm font-semibold">Behandlungsgrundlage</h2>
            <ul className="text-ink-muted mt-1 text-sm">
              {dokument.treatment_bases.map((basis, index) => (
                <li key={`${basis.issued_on}-${index}`}>
                  {basisLabels[basis.kind] ?? basis.kind} vom {formatDate(basis.issued_on)}
                  {basis.prescriber ? ` · ${basis.prescriber}` : ''}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-6">
          <h2 className="text-sm font-semibold">Zahlung</h2>
          <p className="text-ink-muted mt-1 text-sm">
            {ansicht.due_on
              ? `Bitte überweisen Sie den Betrag bis zum ${formatDate(ansicht.due_on)} ohne Abzug.`
              : `Zahlungsziel ${absender.payment_term_days} Tage ab Rechnungsdatum.`}
            {ansicht.invoice_number
              ? ` Bitte geben Sie als Verwendungszweck die Rechnungsnummer ${ansicht.invoice_number} an.`
              : ''}
          </p>
          <p className="text-ink-muted mt-1 text-sm">
            {absender.account_holder ?? absender.legal_name} · IBAN {absender.iban}
            {absender.bic ? ` · BIC ${absender.bic}` : ''}
            {absender.bank_name ? ` · ${absender.bank_name}` : ''}
          </p>
        </section>
      </article>

      <div className="nicht-drucken mt-10 flex max-w-[210mm] flex-col gap-3">
        <div>
          <Button type="button" onClick={() => window.print()}>
            Rechnung drucken
          </Button>
        </div>
        <p className="text-ink-subtle max-w-prose text-xs leading-relaxed">
          Der Druckdialog des Browsers führt zu Papier oder zu einer PDF-Datei. Diese Datei entsteht
          auf diesem Gerät; die Anwendung legt sie nicht ab und kann sie später nicht vorlegen —
          aufbewahrt wird die Rechnung als Datensatz. Ein Dokument, das die Anwendung selbst erzeugt
          und ablegt, kommt mit dem serverseitigen Weg (B14, Weg 3).
        </p>
      </div>
    </>
  );
}

const basisLabels: Record<string, string> = {
  first: 'Erstverordnung',
  follow_up: 'Folgeverordnung',
  self_pay: 'Selbstzahlerin',
};

/** „August 2026" aus dem ersten Tag des Abrechnungsmonats. */
function monatsname(periodMonth: string): string {
  const datum = new Date(periodMonth);
  if (Number.isNaN(datum.getTime())) return periodMonth;
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(datum);
}
