import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { fetchErinnerung, type Erinnerungsdokument } from './api';
import { ibanInGruppen } from './anzeige';
import { Angabe, Angaben, Briefkopf } from './Briefkopf';

/**
 * Die Zahlungserinnerung als Blatt (ABR-003d, `IDEA-PRX-012`).
 *
 * **Ohne Stufe, ohne Gebühr, ohne Zinsen.** Das Blatt heißt
 * „Zahlungserinnerung" und nicht „1. Mahnung": Eine Stufe ist eine
 * Rechtsfolge mit eigenen Voraussetzungen, und die entscheidet ABR-005 nach
 * Praxiserfahrung — nicht dieses Dokument.
 *
 * Alle Zahlen stehen fest: Der offene Betrag ist der vom Tag der Ausstellung
 * (ANN-080), Absender und Empfänger kommen aus dem Snapshot der Rechnung
 * (ADR-009 Punkt 10). Ein Beleg, dessen Zahlen sich beim nächsten Aufruf
 * ändern, wäre keiner — deshalb liest diese Seite nichts nach.
 *
 * Seit UXR-010 steht der Weg zurück in jedem Zustand da (ABR-30). Solange
 * die Erinnerung nicht geladen ist, kennt die Seite ihre Rechnung noch nicht;
 * dann führt er zu den Rechnungen.
 */
export function ReminderPrintPage() {
  const { reminderId = '' } = useParams();

  const erinnerung = useQuery({
    queryKey: ['zahlungserinnerung', reminderId],
    queryFn: () => fetchErinnerung(reminderId),
    retry: false,
  });

  const rechnung = erinnerung.data?.invoice_id;

  return (
    <>
      <div className="nicht-drucken">
        <Rueckweg
          standard={rechnung ? `/abrechnung/rechnungen/${rechnung}` : '/abrechnung'}
          beschriftung={rechnung ? 'Zurück zur Rechnung' : 'Zurück zu den Rechnungen'}
        />
      </div>

      {erinnerung.isPending ? <LoadingState label="Zahlungserinnerung wird geladen …" /> : null}

      {erinnerung.isError ? (
        <ErrorState
          title="Die Zahlungserinnerung konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => erinnerung.refetch()}
        />
      ) : null}

      {erinnerung.data ? <Erinnerungsblatt erinnerung={erinnerung.data} /> : null}
    </>
  );
}

function Erinnerungsblatt({ erinnerung }: { erinnerung: Erinnerungsdokument }) {
  const dokument = erinnerung.document;
  const absender = dokument.issuer;

  return (
    <>
      <article className="text-ink text-liste mx-auto max-w-[210mm]">
        <Briefkopf
          absender={absender}
          empfaenger={dokument.recipient}
          angaben={
            <Angaben>
              <Angabe bezeichnung="Rechnungsnummer" zahl hervorgehoben>
                {erinnerung.invoice_number}
              </Angabe>
              <Angabe bezeichnung="Rechnungsdatum" zahl>
                {formatDate(erinnerung.issued_on)}
              </Angabe>
              <Angabe bezeichnung="Datum" zahl>
                {formatDate(erinnerung.reminder_on)}
              </Angabe>
              <Angabe bezeichnung="Behandelte Person">{dokument.patient.name}</Angabe>
            </Angaben>
          }
        />

        {/* H4 der Skala (20 px, 700) statt eines Tailwind-Grads daneben (ABR-34). */}
        <h1 className="text-h4 mt-10 font-bold">Zahlungserinnerung</h1>

        <p className="mt-3 leading-relaxed">
          Unsere Rechnung {erinnerung.invoice_number} vom {formatDate(erinnerung.issued_on)} war am{' '}
          {formatDate(erinnerung.invoice_due_on)} fällig. Nach unseren Unterlagen ist davon ein
          Betrag von {formatEuro(erinnerung.outstanding_cents, erinnerung.currency)} offen.
        </p>

        <p className="mt-3 leading-relaxed">
          Bitte gleichen Sie den offenen Betrag bis zum {formatDate(erinnerung.due_on)} aus. Hat
          sich Ihre Zahlung mit diesem Schreiben gekreuzt, betrachten Sie es bitte als
          gegenstandslos.
        </p>

        <div className="border-line mt-6 flex justify-between border-t pt-3">
          <span className="font-semibold">Offener Betrag</span>
          <span className="font-semibold tabular-nums">
            {formatEuro(erinnerung.outstanding_cents, erinnerung.currency)}
          </span>
        </div>

        {/* Bankverbindung und Verwendungszweck auf Papier schwarz, die IBAN in
            Vierergruppen: Das sind die Angaben, nach denen gezahlt wird (ABR-28). */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Zahlung</h2>
          <p className="text-ink-muted print:text-ink mt-1 text-sm">
            {absender.account_holder ?? absender.legal_name} · IBAN {ibanInGruppen(absender.iban)}
            {absender.bic ? ` · BIC ${absender.bic}` : ''}
            {absender.bank_name ? ` · ${absender.bank_name}` : ''}
          </p>
          <p className="text-ink-muted print:text-ink mt-1 text-sm">
            Bitte geben Sie als Verwendungszweck die Rechnungsnummer {erinnerung.invoice_number} an.
          </p>
        </section>
      </article>

      <div className="nicht-drucken mt-10 flex max-w-[210mm] flex-col gap-3">
        <div>
          <Button type="button" onClick={() => window.print()}>
            Zahlungserinnerung drucken
          </Button>
        </div>
        <p className="text-ink-muted max-w-prose text-xs leading-relaxed">
          Keine Mahnung, keine Stufe, keine Gebühr: Dieses Blatt erinnert an eine fällige Rechnung.
          Der Betrag darauf ist der vom Tag der Ausstellung und ändert sich nicht mehr – eine
          spätere Zahlung steht an der Rechnung.
        </p>
      </div>
    </>
  );
}
