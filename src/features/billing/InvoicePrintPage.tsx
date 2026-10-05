import { useParams } from 'react-router-dom';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { KeineStammdaten, fetchRechnung, steuerLabels, type Rechnungsansicht } from './api';
import {
  monatsname,
  diagnoseText,
  grundlageText,
  ibanInGruppen,
  personLabel,
  positionenMitTagen,
  zeitraumText,
} from './anzeige';
import { Angabe, Angaben, Briefkopf } from './Briefkopf';

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
 * `nav` und jeden `button` aus, bis UXR-001 auch `header`. Deshalb steht der
 * Rechnungskopf in einem `div` und nicht in einem `header` — er soll gedruckt werden.
 *
 * Seit UXR-010 steht der Weg zurück auch beim Laden, bei einem Fehler und bei
 * fehlenden Stammdaten da (ABR-30) - und zwar der Baustein mit seiner Regel
 * für einen mitgereisten Rückweg, nicht ein Nachbau (ABR-33).
 */
export function InvoicePrintPage() {
  const { invoiceId = '' } = useParams();

  const rechnung = useQuery({
    queryKey: ['rechnung', invoiceId],
    queryFn: () => fetchRechnung(invoiceId),
    retry: false,
  });

  return (
    <>
      <div className="nicht-drucken">
        <Rueckweg
          standard={`/abrechnung/rechnungen/${invoiceId}`}
          beschriftung="Zurück zur Rechnung"
        />
      </div>
      <Inhalt rechnung={rechnung} />
    </>
  );
}

function Inhalt({ rechnung }: { rechnung: UseQueryResult<Rechnungsansicht> }) {
  if (rechnung.isPending) return <LoadingState label="Rechnung wird geladen …" />;

  if (rechnung.error instanceof KeineStammdaten) {
    return (
      <div>
        <Statusmeldung ton="warnung">
          Es sind noch keine Praxisstammdaten erfasst. Ohne Absender, Steuernummer und
          Bankverbindung lässt sich kein Rechnungsblatt drucken. Erfassen kann sie die
          Praxisinhaber:in.
        </Statusmeldung>
        <Textlink to="/abrechnung/stammdaten" alleinstehend className="text-sm">
          Zu den Praxisstammdaten
        </Textlink>
      </div>
    );
  }

  if (rechnung.isError || !rechnung.data) {
    return (
      <ErrorState
        title="Die Rechnung konnte nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => rechnung.refetch()}
      />
    );
  }

  return <Rechnungsblatt ansicht={rechnung.data} />;
}

/**
 * Die Leistungen als Positionen mit ihren Behandlungstagen (ABR-032, ADR-009
 * Punkt 23): je Heilmittel eine Zeile mit Einzelpreis, Menge und Betrag,
 * darunter die Tage. So ordnen Beihilfe und private Versicherung jede
 * Position ihrem Erstattungssatz zu. Die Beträge stehen im Dokument; hier
 * wird nur zusammengefasst.
 */
function Positionstabelle({ dokument }: { dokument: Rechnungsansicht['document'] }) {
  const positionen = positionenMitTagen(dokument.items);
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-line-strong border-b text-left">
          <th scope="col" className="py-1 pr-3 font-medium">
            Pos.
          </th>
          <th scope="col" className="py-1 pr-3 font-medium">
            Leistung
          </th>
          <th scope="col" className="py-1 pr-3 text-right font-medium">
            Einzelpreis
          </th>
          <th scope="col" className="py-1 pr-3 text-right font-medium">
            Menge
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            Betrag
          </th>
        </tr>
      </thead>
      <tbody>
        {positionen.map((position, index) => (
          <tr
            key={`${position.code}-${position.unit_price_cents}-${index}`}
            className="border-line border-b align-top"
          >
            <td className="py-1 pr-3 tabular-nums">{index + 1}</td>
            <td className="py-1 pr-3">
              {position.label} ({position.code})
              {position.item_kind === 'absence_fee' ? ' · Ausfallhonorar' : ''}
              <span className="text-ink-muted print:text-ink block text-xs tabular-nums">
                Behandlungstage: {position.tage.map((tag) => formatDate(tag)).join(', ')}
              </span>
            </td>
            <td className="py-1 pr-3 text-right tabular-nums">
              {formatEuro(position.unit_price_cents, position.currency)}
            </td>
            <td className="py-1 pr-3 text-right tabular-nums">{position.menge}</td>
            <td className="py-1 text-right tabular-nums">
              {formatEuro(position.summe_cents, position.currency)}
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
  );
}

function Rechnungsblatt({ ansicht }: { ansicht: Rechnungsansicht }) {
  const dokument = ansicht.document;
  const entwurf = ansicht.status === 'draft';
  // ABR-032: Ab schema_version 5 Positionen mit Behandlungstagen; ältere
  // Rechnungen erscheinen, wie sie ausgestellt wurden (ADR-009 Punkt 11).
  const gruppiert = dokument.schema_version >= 5;
  const zeitraum = zeitraumText(dokument.service_period);
  const absender = dokument.issuer;

  return (
    <>
      {/* Ein Blatt in Briefbreite. `max-w-[210mm]` gilt am Bildschirm wie auf
          Papier: Wer die Seite ansieht, sieht, was aus dem Drucker kommt. */}
      <article className="text-ink text-liste mx-auto max-w-[210mm]">
        {/* Bewusst kein `header`: Die Druckregeln blendeten ihn bis UXR-001 aus, und
            dieser Kopf gehört auf das Papier. */}
        <Briefkopf
          absender={absender}
          empfaenger={dokument.recipient}
          angaben={
            <Angaben>
              {ansicht.invoice_number ? (
                <Angabe bezeichnung="Rechnungsnummer" zahl hervorgehoben>
                  {ansicht.invoice_number}
                </Angabe>
              ) : null}
              {ansicht.issued_on ? (
                <Angabe bezeichnung="Rechnungsdatum" zahl>
                  {formatDate(ansicht.issued_on)}
                </Angabe>
              ) : null}
              <Angabe bezeichnung={personLabel(dokument.service_area, 'blatt')}>
                {dokument.patient.name}
              </Angabe>
              {dokument.patient.date_of_birth ? (
                <Angabe bezeichnung="Geburtsdatum" zahl>
                  {formatDate(dokument.patient.date_of_birth)}
                </Angabe>
              ) : null}
              {/* ABN-008: Steuernummer oder USt-IdNr. — mindestens eine steht. */}
              {absender.tax_number ? (
                <Angabe bezeichnung="Steuernummer" zahl>
                  {absender.tax_number}
                </Angabe>
              ) : null}
              {absender.vat_id ? (
                <Angabe bezeichnung="USt-IdNr." zahl>
                  {absender.vat_id}
                </Angabe>
              ) : null}
            </Angaben>
          }
        />

        {/* Die Vermerke stehen unter dem Anschriftfeld, nicht zwischen Kopf
            und Anschrift: Dort verschoben sie das Feld aus dem Fenster
            (ABR-22). Sie drucken mit. */}
        {entwurf ? (
          // Ein Entwurf auf Papier darf nicht wie eine Rechnung aussehen. Er
          // trägt keine Nummer, und die Angaben stammen aus den heutigen
          // Stammdaten statt aus einem Snapshot.
          <p className="border-line-strong text-ink mt-8 border-2 px-3 py-2 text-sm font-semibold">
            Entwurf – keine Rechnung. Ohne Nummer, nicht zum Versand.
          </p>
        ) : null}

        {/* Druckt ebenfalls mit (ABR-003c): Ein Nachdruck einer stornierten
            Rechnung darf nicht wie eine gültige Forderung aussehen. Das
            Stornodokument selbst ist ein eigenes Blatt. */}
        {ansicht.cancellation ? (
          <p className="border-line-strong text-ink mt-8 border-2 px-3 py-2 text-sm font-semibold">
            Storniert am {formatDate(ansicht.cancellation.cancelled_on)} mit Stornodokument{' '}
            {ansicht.cancellation.cancellation_number}. Diese Rechnung ist gegenstandslos.
          </p>
        ) : null}

        {/* H4 der Skala (20 px, 700) statt eines Tailwind-Grads daneben (ABR-34). */}
        <h1 className="text-h4 mt-10 font-bold">
          {ansicht.invoice_number ? `Rechnung ${ansicht.invoice_number}` : 'Rechnungsentwurf'}
        </h1>
        {/* Eine Korrekturrechnung sagt auf dem Papier, welche Rechnung sie
            ersetzt - sonst stuenden beim Empfaenger zwei Rechnungen ueber
            dieselben Leistungen nebeneinander (ADR-009 Punkt 9). */}
        {ansicht.replaces_invoice_number ? (
          <p className="text-ink mt-1 text-sm">
            Korrekturrechnung zur stornierten Rechnung {ansicht.replaces_invoice_number}.
          </p>
        ) : null}
        <p className="text-ink-muted print:text-ink mt-1 text-sm">
          {/* ABR-032: Mit schema_version 5 steht der Zeitraum der Leistungen
              im Dokument; ältere Rechnungen nennen ihren Monat. */}
          {zeitraum
            ? `Für die folgenden Leistungen vom ${zeitraum} stellen wir in Rechnung:`
            : `Für die folgenden Leistungen im ${monatsname(dokument.period_month)} stellen wir in Rechnung:`}
        </p>

        {/* Die Leistungstabelle hat fünf Spalten und passt damit auf A4, aber
            nicht auf ein Telefon. Sie rollt deshalb in ihrem eigenen Rahmen
            statt die ganze Seite quer zu schieben; auf Papier gibt es nichts
            zu rollen, dort steht sie vollständig.

            Der Rahmen ist mit der Tastatur erreichbar und benannt (ABR-B04,
            UIK-24): Ohne das waren die Beträge am Handy für Tastatur und
            Vorlesesoftware nicht zu erreichen. */}
        <div
          className="mt-4 overflow-x-auto print:overflow-visible"
          tabIndex={0}
          role="region"
          aria-label="Leistungen, waagerecht rollbar"
        >
          {gruppiert ? (
            <Positionstabelle dokument={dokument} />
          ) : (
            <table className="w-full border-collapse text-sm">
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
          )}
        </div>
        <p className="nicht-drucken text-ink-muted mt-1 text-sm sm:hidden">
          Die Tabelle lässt sich seitlich wischen; rechts folgt der Betrag.
        </p>

        {/* Der Katalogpreis ist der Endpreis; eine enthaltene Umsatzsteuer
            wird je Satz herausgerechnet (ANN-074). Unter Paragraf 19 UStG
            entfällt der Ausweis und der Hinweis tritt an seine Stelle.
            Der Grund der Steuerbefreiung steht an der Gruppe, die ihn
            betrifft — er ist Pflichtangabe nach § 14 Abs. 4 Nr. 8 UStG
            (ABR-006, BEF-019) und kommt aus dem Dokument, nicht von hier.
            Auf Papier schwarz: Die Pflichtangabe gehört nicht ins Grau
            (ABR-28). */}
        <ul className="text-ink-muted print:text-ink mt-2 text-sm">
          {dokument.tax_groups.map((gruppe) => (
            <li key={`${gruppe.tax_treatment}-${gruppe.tax_rate_permille}`}>
              {steuerLabels[gruppe.tax_treatment]}: {formatEuro(gruppe.gross_cents)}
              {gruppe.tax_cents > 0
                ? ` · darin enthaltene Umsatzsteuer ${formatEuro(gruppe.tax_cents)} (${
                    gruppe.tax_rate_permille / 10
                  } %)`
                : ''}
              {gruppe.exemption_reason ? ` · ${gruppe.exemption_reason}` : ''}
            </li>
          ))}
        </ul>

        {absender.small_business ? (
          <p className="text-ink-muted print:text-ink mt-2 text-sm">
            Kein Ausweis von Umsatzsteuer gemäß § 19 UStG (Kleinunternehmerregelung).
          </p>
        ) : null}

        {dokument.treatment_bases.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-sm font-semibold">Behandlungsgrundlage</h2>
            <ul className="text-ink-muted print:text-ink mt-1 text-sm">
              {dokument.treatment_bases.map((basis, index) => (
                <li key={`${basis.issued_on}-${index}`}>
                  {/* Dieselben Wörter wie in der Akte (ABR-18). */}
                  {grundlageText(basis.kind, basis.issued_on)}
                  {basis.prescriber ? ` · ${basis.prescriber}` : ''}
                  {diagnoseText(basis) ? (
                    <span className="block">{diagnoseText(basis)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-6">
          <h2 className="text-sm font-semibold">Zahlung</h2>
          <p className="text-ink-muted print:text-ink mt-1 text-sm">
            {ansicht.due_on
              ? `Bitte überweisen Sie den Betrag bis zum ${formatDate(ansicht.due_on)} ohne Abzug.`
              : `Zahlungsziel ${absender.payment_term_days} Tage ab Rechnungsdatum.`}
            {ansicht.invoice_number
              ? ` Bitte geben Sie als Verwendungszweck die Rechnungsnummer ${ansicht.invoice_number} an.`
              : ''}
          </p>
          {/* Die IBAN in Vierergruppen: abgetippt wird sie vom Papier (ABR-28). */}
          <p className="text-ink-muted print:text-ink mt-1 text-sm">
            {absender.account_holder ?? absender.legal_name} · IBAN {ibanInGruppen(absender.iban)}
            {absender.bic ? ` · BIC ${absender.bic}` : ''}
            {absender.bank_name ? ` · ${absender.bank_name}` : ''}
          </p>
        </section>
      </article>

      <div className="nicht-drucken mt-10 flex max-w-[210mm] flex-col gap-3">
        <div>
          {/* Am Entwurf heißt der Knopf, was er druckt (ABR-26). */}
          <Button type="button" onClick={() => window.print()}>
            {entwurf ? 'Entwurf drucken' : 'Rechnung drucken'}
          </Button>
        </div>
        <p className="text-ink-muted max-w-prose text-xs leading-relaxed">
          Der Druckdialog des Browsers führt zu Papier oder zu einer PDF-Datei. Diese Datei entsteht
          auf diesem Gerät; die Anwendung legt sie nicht ab und kann sie später nicht vorlegen –
          aufbewahrt werden die Angaben der Rechnung in der Anwendung. Ein Dokument, das die
          Anwendung selbst erzeugt und ablegt, kommt mit dem serverseitigen Weg.
        </p>
      </div>
    </>
  );
}
