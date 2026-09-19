import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { canManageInvoicing, type CurrentUser } from '@/features/session/types';
import {
  KeineStammdaten,
  deleteEntwurf,
  empfaengerartLabels,
  fetchEmpfaenger,
  fetchRechnung,
  fetchRechnungszahlungen,
  richtungLabels,
  saveEmpfaenger,
  setzeEmpfaenger,
  steuerLabels,
  stelleRechnungAus,
  zahlungswegLabels,
  type Empfaenger,
  type Rechnungsansicht,
} from './api';
import { Zahlungsformular } from './Zahlungsformular';

/**
 * Eine Rechnung (ABR-003).
 *
 * Die Seite zeigt das Rechnungsdokument — dieselbe Form für den Entwurf und
 * für die ausgestellte Rechnung. Der Unterschied ist die Herkunft: Der
 * Entwurf wird aus den heutigen Stammdaten gebaut, die ausgestellte Rechnung
 * kommt aus ihrem Snapshot und ändert sich nie wieder (ADR-009 Punkt 10).
 * Deshalb steht auf einem Entwurf auch keine Nummer: Die entsteht erst beim
 * Ausstellen (Punkt 8).
 *
 * Am Entwurf lässt sich genau zweierlei tun — den Empfänger wählen und
 * ausstellen —, dazu das Verwerfen. Alles andere ist an der Leistung zu
 * ändern, nicht an der Rechnung.
 */

const basisLabels: Record<string, string> = {
  first: 'Erstverordnung',
  follow_up: 'Folgeverordnung',
  self_pay: 'Selbstzahlerin',
};

export function InvoiceDetailPage({ user }: { user: CurrentUser }) {
  const { invoiceId = '' } = useParams();
  const darfAusstellen = canManageInvoicing(user.roles);

  const rechnung = useQuery({
    queryKey: ['rechnung', invoiceId],
    queryFn: () => fetchRechnung(invoiceId),
    retry: false,
  });

  return (
    <>
      <Rueckweg standard="/abrechnung" beschriftung="Rechnungen" />
      <PageHeader
        title={rechnung.data?.invoice_number ?? 'Rechnungsentwurf'}
        description={
          rechnung.data?.status === 'issued'
            ? 'Ausgestellt und unveränderlich. Eine Korrektur läuft über Storno und Neuausstellung.'
            : 'Noch ohne Nummer. Die Nummer entsteht beim Ausstellen.'
        }
      />

      {rechnung.isPending ? <LoadingState label="Rechnung wird geladen …" /> : null}

      {rechnung.error instanceof KeineStammdaten ? (
        <Statusmeldung ton="warnung">
          Es sind noch keine Praxis-Stammdaten erfasst. Ohne Absender, Steuernummer und
          Bankverbindung lässt sich keine Rechnung darstellen — sie stehen unter „Praxisstammdaten".
        </Statusmeldung>
      ) : rechnung.isError ? (
        <ErrorState
          title="Die Rechnung konnte nicht geladen werden."
          description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
        />
      ) : null}

      {rechnung.data ? (
        <Rechnungsbild
          ansicht={rechnung.data}
          darfAusstellen={darfAusstellen}
          zeitzone={user.organizationTimeZone}
        />
      ) : null}
    </>
  );
}

function Rechnungsbild({
  ansicht,
  darfAusstellen,
  zeitzone,
}: {
  ansicht: Rechnungsansicht;
  darfAusstellen: boolean;
  zeitzone: string | null;
}) {
  const dokument = ansicht.document;
  const entwurf = ansicht.status === 'draft';

  return (
    <>
      <Section titel="Empfänger" rahmen>
        <p className="text-ink text-[0.9375rem] font-medium">{dokument.recipient.name}</p>
        <p className="text-ink-muted text-sm">
          {empfaengerartLabels[dokument.recipient.kind] ?? 'Kostenträger'}
        </p>
        {dokument.recipient.street ? (
          <p className="text-ink-muted mt-1 text-sm">
            {`${dokument.recipient.street} ${dokument.recipient.house_number ?? ''}`.trim()},{' '}
            {dokument.recipient.postal_code} {dokument.recipient.city}
          </p>
        ) : null}
        {dokument.recipient.reference ? (
          <p className="text-ink-muted mt-1 text-sm">
            Aktenzeichen: {dokument.recipient.reference}
          </p>
        ) : null}

        <p className="text-ink-muted mt-3 text-sm">
          Behandelt: {dokument.patient.name}
          {dokument.patient.date_of_birth
            ? `, geboren am ${formatDate(dokument.patient.date_of_birth)}`
            : ''}
        </p>

        {entwurf && darfAusstellen ? <Empfaengerwahl ansicht={ansicht} /> : null}
      </Section>

      <Section titel="Leistungen" rahmen>
        <ul className="divide-line divide-y">
          {dokument.items.map((zeile, index) => (
            <li
              key={`${zeile.performed_on}-${zeile.code}-${index}`}
              className="flex flex-wrap items-baseline gap-x-3 py-2"
            >
              <span className="text-ink-muted w-24 shrink-0 text-sm tabular-nums">
                {formatDate(zeile.performed_on)}
              </span>
              <span className="text-ink min-w-0 flex-1 text-[0.9375rem]">
                {zeile.quantity} × {zeile.label} ({zeile.code})
                {zeile.item_kind === 'absence_fee' ? (
                  <span className="ml-2">
                    <Badge ton="warnung">Ausfallhonorar</Badge>
                  </span>
                ) : null}
              </span>
              <span className="text-ink text-[0.9375rem] tabular-nums">
                {formatEuro(zeile.line_total_cents, zeile.currency)}
              </span>
            </li>
          ))}
        </ul>

        <div className="border-line mt-3 flex justify-between border-t pt-3">
          <span className="text-ink text-[0.9375rem] font-semibold">Gesamtbetrag</span>
          <span className="text-ink text-[0.9375rem] font-semibold tabular-nums">
            {formatEuro(dokument.totals.total_cents, dokument.currency)}
          </span>
        </div>

        <ul className="mt-2 flex flex-col gap-1">
          {dokument.tax_groups.map((gruppe) => (
            <li key={`${gruppe.tax_treatment}-${gruppe.tax_rate_permille}`}>
              <span className="text-ink-muted text-sm">
                {steuerLabels[gruppe.tax_treatment]}: {formatEuro(gruppe.gross_cents)}
                {gruppe.tax_cents > 0
                  ? ` · darin enthaltene Umsatzsteuer ${formatEuro(gruppe.tax_cents)} (${
                      gruppe.tax_rate_permille / 10
                    } %)`
                  : ''}
              </span>
            </li>
          ))}
        </ul>

        {dokument.issuer.small_business ? (
          <p className="text-ink-muted mt-2 text-sm">
            Kein Ausweis von Umsatzsteuer gemäß § 19 UStG (Kleinunternehmerregelung).
          </p>
        ) : null}
      </Section>

      {dokument.treatment_bases.length > 0 ? (
        <Section titel="Behandlungsgrundlage" rahmen>
          <ul className="flex flex-col gap-1">
            {dokument.treatment_bases.map((basis, index) => (
              <li key={`${basis.issued_on}-${index}`} className="text-ink-muted text-sm">
                {basisLabels[basis.kind] ?? basis.kind} vom {formatDate(basis.issued_on)}
                {basis.prescriber ? ` · ${basis.prescriber}` : ''}
              </li>
            ))}
          </ul>
          <p className="text-ink-subtle mt-2 text-sm">
            Ohne Diagnose: Eine Rechnung geht regelmäßig an Dritte, und klinische Inhalte gehören
            nicht dorthin.
          </p>
        </Section>
      ) : null}

      <Section titel="Absender" rahmen>
        <p className="text-ink text-[0.9375rem]">{dokument.issuer.legal_name}</p>
        <p className="text-ink-muted text-sm">
          {`${dokument.issuer.street} ${dokument.issuer.house_number ?? ''}`.trim()},{' '}
          {dokument.issuer.postal_code} {dokument.issuer.city}
        </p>
        <p className="text-ink-muted mt-1 text-sm">Steuernummer {dokument.issuer.tax_number}</p>
        <p className="text-ink-muted text-sm">
          {dokument.issuer.account_holder ?? dokument.issuer.legal_name} · {dokument.issuer.iban}
          {dokument.issuer.bic ? ` · ${dokument.issuer.bic}` : ''}
        </p>
        {ansicht.due_on ? (
          <p className="text-ink-muted mt-1 text-sm">
            Zahlbar bis {formatDate(ansicht.due_on)} ({dokument.issuer.payment_term_days} Tage).
          </p>
        ) : (
          <p className="text-ink-muted mt-1 text-sm">
            Zahlungsziel {dokument.issuer.payment_term_days} Tage ab Ausstellung.
          </p>
        )}
      </Section>

      {entwurf && darfAusstellen ? <Entwurfsaktionen ansicht={ansicht} /> : null}

      {!entwurf ? (
        <>
          <Zahlungen
            ansicht={ansicht}
            darfBuchen={darfAusstellen}
            zeitzone={zeitzone}
            waehrung={dokument.currency}
          />
          <Statusmeldung className="mt-4">
            Diese Rechnung ist ausgestellt und damit unveränderlich. Das Dokument zum Versenden, das
            Storno der Rechnung und die Zahlungserinnerung kommen mit dem nächsten Schritt.
          </Statusmeldung>
        </>
      ) : null}
    </>
  );
}

/**
 * Die Zahlungen einer ausgestellten Rechnung (ABR-004).
 *
 * Der offene Betrag wird **nicht hier gerechnet**: Er kommt aus derselben
 * Serverfunktion, die auch die Liste und die offenen Posten speist (ADR-009
 * Punkt 12). Eine zweite Rechnung im Browser wäre eine zweite Wahrheit.
 *
 * Stornierte Buchungen bleiben mit ihrem Grund stehen. Sie fallen aus der
 * Summe, nicht aus der Ansicht.
 */
function Zahlungen({
  ansicht,
  darfBuchen,
  zeitzone,
  waehrung,
}: {
  ansicht: Rechnungsansicht;
  darfBuchen: boolean;
  zeitzone: string | null;
  waehrung: string;
}) {
  const zahlungen = useQuery({
    queryKey: ['rechnungszahlungen', ansicht.id],
    queryFn: () => fetchRechnungszahlungen(ansicht.id),
    retry: false,
  });

  const offen = ansicht.outstanding_cents;

  return (
    <Section titel="Zahlungen" rahmen>
      {zahlungen.isError ? (
        <ErrorState
          title="Die Zahlungen konnten nicht geladen werden."
          description="Bitte später erneut versuchen."
        />
      ) : null}

      {zahlungen.data && zahlungen.data.length === 0 ? (
        <p className="text-ink-muted text-sm">Noch keine Zahlung erfasst.</p>
      ) : null}

      <ul className="divide-line divide-y">
        {(zahlungen.data ?? []).map((zahlung) => (
          <li key={zahlung.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
            <span className="text-ink-muted w-24 shrink-0 text-sm tabular-nums">
              {formatDate(zahlung.paid_on)}
            </span>
            <span className="text-ink min-w-0 flex-1 text-[0.9375rem]">
              {richtungLabels[zahlung.direction]} ·{' '}
              {zahlungswegLabels[zahlung.method] ?? zahlung.method}
              {zahlung.voided_at !== null ? (
                <span className="ml-2">
                  <Badge ton="neutral">Storniert</Badge>
                </span>
              ) : null}
              {zahlung.note ? (
                <span className="text-ink-muted block text-sm">{zahlung.note}</span>
              ) : null}
              {zahlung.void_reason ? (
                <span className="text-ink-muted block text-sm">
                  Storniert: {zahlung.void_reason}
                </span>
              ) : null}
            </span>
            <span
              className={`text-[0.9375rem] tabular-nums ${
                zahlung.voided_at !== null ? 'text-ink-subtle line-through' : 'text-ink'
              }`}
            >
              {zahlung.direction === 'refund' ? '−' : ''}
              {formatEuro(zahlung.amount_cents, zahlung.currency)}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-line mt-3 flex justify-between border-t pt-3">
        <span className="text-ink text-[0.9375rem] font-semibold">
          {offen > 0 ? 'Noch offen' : offen < 0 ? 'Zu viel gezahlt' : 'Bezahlt'}
        </span>
        <span className="text-ink text-[0.9375rem] font-semibold tabular-nums">
          {formatEuro(Math.abs(offen), waehrung)}
        </span>
      </div>

      {darfBuchen && zeitzone !== null ? (
        <Zahlungsformular
          invoiceId={ansicht.id}
          offenCent={offen}
          waehrung={waehrung}
          zeitzone={zeitzone}
        />
      ) : null}
    </Section>
  );
}

function Empfaengerwahl({ ansicht }: { ansicht: Rechnungsansicht }) {
  const queryClient = useQueryClient();
  const [neu, setNeu] = useState(false);

  const empfaenger = useQuery({
    queryKey: ['rechnungsempfaenger', ansicht.patient_id],
    queryFn: () => fetchEmpfaenger(ansicht.patient_id),
    retry: false,
  });

  const waehlen = useMutation({
    mutationFn: (id: string | null) => setzeEmpfaenger(ansicht.id, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rechnung', ansicht.id] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
    },
  });

  return (
    <div className="mt-3">
      <Select
        label="Rechnung geht an"
        hint="Ohne hinterlegten Empfänger geht sie an die Patientin selbst."
        value={ansicht.recipient_id ?? ''}
        onChange={(e) => waehlen.mutate(e.target.value === '' ? null : e.target.value)}
      >
        <option value="">{empfaengerartLabels.self}</option>
        {(empfaenger.data ?? []).map((eintrag) => (
          <option key={eintrag.id} value={eintrag.id}>
            {eintrag.name} ({empfaengerartLabels[eintrag.recipient_kind] ?? 'Kostenträger'})
          </option>
        ))}
      </Select>

      {waehlen.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {waehlen.error.message}
        </Statusmeldung>
      ) : null}

      {neu ? (
        <Empfaengerformular
          patientId={ansicht.patient_id}
          onFertig={async () => {
            setNeu(false);
            await queryClient.invalidateQueries({
              queryKey: ['rechnungsempfaenger', ansicht.patient_id],
            });
          }}
        />
      ) : (
        <div className="mt-2">
          <Button type="button" variant="quiet" onClick={() => setNeu(true)}>
            Empfänger hinterlegen
          </Button>
        </div>
      )}
    </div>
  );
}

function Empfaengerformular({
  patientId,
  onFertig,
}: {
  patientId: string;
  onFertig: () => void | Promise<void>;
}) {
  const [eingabe, setEingabe] = useState({
    recipient_kind: 'aid_authority',
    name: '',
    street: '',
    house_number: '',
    postal_code: '',
    city: '',
    reference: '',
    is_default: false,
  });

  const speichern = useMutation({
    mutationFn: () =>
      saveEmpfaenger({
        id: null,
        patientId,
        recipient_kind: eingabe.recipient_kind,
        name: eingabe.name,
        street: eingabe.street || null,
        house_number: eingabe.house_number || null,
        postal_code: eingabe.postal_code || null,
        city: eingabe.city || null,
        reference: eingabe.reference || null,
        is_default: eingabe.is_default,
      }),
    onSuccess: onFertig,
  });

  const arten: Empfaenger['recipient_kind'][] = [
    'aid_authority',
    'private_insurer',
    'legal_representative',
    'guardian',
    'other',
  ];

  return (
    <div className="border-line rounded-card mt-3 border p-3">
      <div className="flex flex-col gap-3">
        <Select
          label="Art"
          value={eingabe.recipient_kind}
          onChange={(e) => setEingabe((alt) => ({ ...alt, recipient_kind: e.target.value }))}
        >
          {arten.map((art) => (
            <option key={art} value={art}>
              {empfaengerartLabels[art]}
            </option>
          ))}
        </Select>
        <Field
          label="Name oder Stelle"
          value={eingabe.name}
          onChange={(e) => setEingabe((alt) => ({ ...alt, name: e.target.value }))}
        />
        <div className="flex gap-3">
          <span className="flex-1">
            <Field
              label="Straße"
              value={eingabe.street}
              onChange={(e) => setEingabe((alt) => ({ ...alt, street: e.target.value }))}
            />
          </span>
          <span className="w-24">
            <Field
              label="Nr."
              value={eingabe.house_number}
              onChange={(e) => setEingabe((alt) => ({ ...alt, house_number: e.target.value }))}
            />
          </span>
        </div>
        <div className="flex gap-3">
          <span className="w-28">
            <Field
              label="PLZ"
              value={eingabe.postal_code}
              onChange={(e) => setEingabe((alt) => ({ ...alt, postal_code: e.target.value }))}
            />
          </span>
          <span className="flex-1">
            <Field
              label="Ort"
              value={eingabe.city}
              onChange={(e) => setEingabe((alt) => ({ ...alt, city: e.target.value }))}
            />
          </span>
        </div>
        <Field
          label="Aktenzeichen oder Versichertennummer"
          value={eingabe.reference}
          onChange={(e) => setEingabe((alt) => ({ ...alt, reference: e.target.value }))}
        />
      </div>

      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          onClick={() => speichern.mutate()}
          disabled={speichern.isPending || eingabe.name.trim() === ''}
        >
          {speichern.isPending ? 'Wird gespeichert …' : 'Empfänger speichern'}
        </Button>
        <Button type="button" variant="quiet" onClick={() => void onFertig()}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

function Entwurfsaktionen({ ansicht }: { ansicht: Rechnungsansicht }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const ausstellen = useMutation({
    mutationFn: () => stelleRechnungAus(ansicht.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rechnung', ansicht.id] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungs-kandidaten'] });
    },
  });

  const verwerfen = useMutation({
    mutationFn: () => deleteEntwurf(ansicht.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungs-kandidaten'] });
      await navigate('/abrechnung');
    },
  });

  return (
    <Section titel="Entwurf" ebene={2}>
      <p className="text-ink-muted text-sm">
        Mit dem Ausstellen bekommt die Rechnung ihre Nummer, und alle Angaben werden
        festgeschrieben. Danach ist sie unveränderlich — eine Korrektur läuft über Storno und
        Neuausstellung.
      </p>

      {ausstellen.error instanceof KeineStammdaten ? (
        <Statusmeldung ton="fehler" className="mt-2">
          Ohne Praxis-Stammdaten lässt sich keine Rechnung ausstellen. Sie stehen unter
          „Praxisstammdaten".
        </Statusmeldung>
      ) : ausstellen.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {ausstellen.error.message}
        </Statusmeldung>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={() => ausstellen.mutate()} disabled={ausstellen.isPending}>
          {ausstellen.isPending ? 'Wird ausgestellt …' : 'Rechnung ausstellen'}
        </Button>

        <Rueckfrage
          ausloeser="Entwurf verwerfen"
          bestaetigen="Verwerfen"
          bestaetigenLaeuft="Wird verworfen …"
          laeuft={verwerfen.isPending}
          fehler={verwerfen.isError ? verwerfen.error.message : undefined}
          onBestaetigen={() => verwerfen.mutate()}
        >
          <p>
            Der Entwurf wird gelöscht; seine Leistungen stehen danach wieder unter „Abzurechnen".
            Eine Nummer wurde nie vergeben, es entsteht also keine Lücke.
          </p>
        </Rueckfrage>
      </div>
    </Section>
  );
}
