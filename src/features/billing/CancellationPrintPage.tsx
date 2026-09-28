import { useParams } from 'react-router-dom';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { KeineStammdaten, fetchRechnung, type Rechnungsansicht } from './api';
import { Angabe, Angaben, Briefkopf } from './Briefkopf';

/**
 * Das Stornodokument als Blatt zum Verschicken (ABR-003c).
 *
 * ADR-009 Punkt 9 verlangt ein **nachvollziehbares Storno- oder
 * Korrekturdokument** — und das geht an denselben Empfänger wie die Rechnung,
 * die es aufhebt. Deshalb ein eigenes Blatt mit eigener Nummer und nicht ein
 * Vermerk auf der Rechnung.
 *
 * Gebaut aus zwei Quellen, die beide feststehen: dem Snapshot der
 * ausgestellten Rechnung (ADR-009 Punkt 10) und der Stornozeile mit Nummer,
 * Tag und Grund. Eine dritte Fassung derselben Angaben gibt es nicht.
 *
 * Gedruckt wird wie die Rechnung über den Browser (B14, Weg 1): Die Datei
 * entsteht beim Nutzer, und die Anwendung sieht sie nie.
 *
 * Seit UXR-010 steht der Weg zurück in jedem Zustand da (ABR-30), als
 * Baustein mit seiner Regel für einen mitgereisten Rückweg (ABR-33).
 */
export function CancellationPrintPage() {
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
  if (rechnung.isPending) return <LoadingState label="Stornodokument wird geladen …" />;

  if (rechnung.error instanceof KeineStammdaten) {
    return (
      <div>
        <Statusmeldung ton="warnung">
          Es sind noch keine Praxisstammdaten erfasst. Ohne Absender lässt sich kein Stornodokument
          drucken. Erfassen kann sie die Praxisinhaber:in.
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
        title="Das Stornodokument konnte nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => rechnung.refetch()}
      />
    );
  }

  if (!rechnung.data.cancellation) {
    return (
      <Statusmeldung ton="warnung">
        Diese Rechnung ist nicht storniert. Ein Stornodokument entsteht erst mit dem Storno – auf
        der Rechnung selbst.
      </Statusmeldung>
    );
  }

  return <Stornoblatt ansicht={rechnung.data} storno={rechnung.data.cancellation} />;
}

/**
 * Das Storno kommt als eigener Parameter und nicht aus `ansicht`: Dass es
 * existiert, hat die aufrufende Komponente bereits beantwortet — so steht es
 * auch im Typ und nicht nur in der Reihenfolge der Aufrufe.
 */
function Stornoblatt({
  ansicht,
  storno,
}: {
  ansicht: Rechnungsansicht;
  storno: NonNullable<Rechnungsansicht['cancellation']>;
}) {
  const dokument = ansicht.document;
  const absender = dokument.issuer;

  return (
    <>
      <article className="text-ink text-liste mx-auto max-w-[210mm]">
        <Briefkopf
          absender={absender}
          empfaenger={dokument.recipient}
          angaben={
            <Angaben>
              <Angabe bezeichnung="Stornonummer" zahl hervorgehoben>
                {storno.cancellation_number}
              </Angabe>
              <Angabe bezeichnung="Datum" zahl>
                {formatDate(storno.cancelled_on)}
              </Angabe>
              <Angabe bezeichnung="Behandelte Person">{dokument.patient.name}</Angabe>
              <Angabe bezeichnung="Steuernummer" zahl>
                {absender.tax_number}
              </Angabe>
            </Angaben>
          }
        />

        {/* H4 der Skala (20 px, 700) statt eines Tailwind-Grads daneben (ABR-34). */}
        <h1 className="text-h4 mt-10 font-bold">
          Stornierung der Rechnung {ansicht.invoice_number}
        </h1>

        <p className="mt-3 leading-relaxed">
          Die Rechnung {ansicht.invoice_number}
          {ansicht.issued_on ? ` vom ${formatDate(ansicht.issued_on)}` : ''} über{' '}
          {formatEuro(dokument.totals.total_cents, dokument.currency)} wird hiermit vollständig
          storniert. Sie ist damit gegenstandslos; ein Ausgleich ist zu ihr nicht mehr nötig.
        </p>

        <dl className="mt-4 text-sm">
          <dt className="text-ink-muted">Grund</dt>
          <dd className="text-ink mt-1">{storno.reason}</dd>
        </dl>

        {/* Der ausgewiesene Steuerbetrag der stornierten Rechnung gehört auf
            das Blatt: Er ist es, der beim Empfänger rückgängig zu machen ist.
            Auf Papier schwarz (ABR-28). */}
        {dokument.totals.tax_total_cents > 0 ? (
          <p className="text-ink-muted print:text-ink mt-4 text-sm">
            In dem stornierten Betrag war Umsatzsteuer in Höhe von{' '}
            {formatEuro(dokument.totals.tax_total_cents, dokument.currency)} enthalten.
          </p>
        ) : null}

        {ansicht.correction_invoice_number ? (
          <p className="text-ink-muted print:text-ink mt-4 text-sm">
            Die Leistungen werden mit der Rechnung {ansicht.correction_invoice_number} neu
            abgerechnet.
          </p>
        ) : null}
      </article>

      <div className="nicht-drucken mt-10 flex max-w-[210mm] flex-col gap-3">
        <div>
          <Button type="button" onClick={() => window.print()}>
            Stornodokument drucken
          </Button>
        </div>
        <p className="text-ink-muted max-w-prose text-xs leading-relaxed">
          Wie bei der Rechnung entsteht die Datei im Druckdialog auf diesem Gerät; die Anwendung
          legt sie nicht ab. Aufbewahrt wird das Storno in der Anwendung, mit Nummer, Tag und Grund.
        </p>
      </div>
    </>
  );
}
