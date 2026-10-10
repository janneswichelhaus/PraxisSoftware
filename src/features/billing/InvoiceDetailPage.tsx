import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Aufklappzeichen, Inhaltsflaeche } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Textlink } from '@/components/ui/Textlink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { todayInTimeZone } from '@/features/appointments/api';
import {
  canManageBillingProfile,
  canManageInvoicing,
  type CurrentUser,
} from '@/features/session/types';
import {
  KeineStammdaten,
  bereichLabels,
  deleteEntwurf,
  empfaengerartLabels,
  erstelleErinnerung,
  erstelleKorrektur,
  fetchEmpfaenger,
  fetchErinnerungen,
  fetchRechnung,
  fetchRechnungszahlungen,
  richtungLabels,
  saveEmpfaenger,
  setzeEmpfaenger,
  steuerLabels,
  AnschriftUnvollstaendig,
  stelleRechnungAus,
  storniereRechnung,
  verrechneMitKorrektur,
  zahlungsstandLabels,
  zahlungswegAnzeige,
  type Empfaenger,
  type Rechnungsansicht,
} from './api';
import {
  empfaengerart,
  diagnoseText,
  grundlageText,
  ibanInGruppen,
  monatsname,
  personLabel,
  zahlungsTon,
  zeitraumText,
} from './anzeige';
import { Zahlungsformular } from './Zahlungsformular';
import { Zahlungsstorno } from './Zahlungsstorno';

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
 *
 * **Seit UXR-010 nennt der Kopf die Rechnung (ABR-05):** Nummer oder
 * „Entwurf", Person, Monat, Bereich, Betrag und den Zahlungsstand aus dem
 * Server - dieselben Werte wie in der Liste. Solange nichts geladen ist,
 * heißt die Seite nur „Rechnung": Vorher stand dort der Entwurfstext, auch
 * beim Laden einer ausgestellten Rechnung (ZST-09).
 */

/** „RG-2026-0001 · Max Mustermann" oder „Entwurf · Erika Beispiel". */
function titel(ansicht: Rechnungsansicht): string {
  const person = ansicht.document.patient.name;
  return ansicht.status === 'draft'
    ? `Entwurf · ${person}`
    : `${ansicht.invoice_number ?? 'Rechnung'} · ${person}`;
}

/** „August 2026 · Behandlung · 63,00 €" - alles aus dem Dokument, nichts gerechnet. */
function beschreibung(ansicht: Rechnungsansicht): string {
  const dokument = ansicht.document;
  return [
    // ABR-032: der Leistungszeitraum, ältere Snapshots nennen den Monat.
    zeitraumText(dokument.service_period) ?? monatsname(dokument.period_month),
    // Snapshots mit `schema_version` 1 und 2 tragen keinen Bereich.
    dokument.service_area ? bereichLabels[dokument.service_area] : null,
    formatEuro(dokument.totals.total_cents, dokument.currency),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function InvoiceDetailPage({ user }: { user: CurrentUser }) {
  const { invoiceId = '' } = useParams();
  const darfAusstellen = canManageInvoicing(user.roles);
  const darfStammdaten = canManageBillingProfile(user.roles);

  const rechnung = useQuery({
    queryKey: ['rechnung', invoiceId],
    queryFn: () => fetchRechnung(invoiceId),
    retry: false,
  });
  const ansicht = rechnung.data;

  return (
    <>
      <Rueckweg standard="/abrechnung" beschriftung="Zurück zu den Rechnungen" />
      <PageHeader
        title={ansicht ? titel(ansicht) : 'Rechnung'}
        description={ansicht ? beschreibung(ansicht) : undefined}
        actions={
          ansicht ? (
            <ButtonLink to={`/abrechnung/rechnungen/${ansicht.id}/druck`} variant="secondary">
              Rechnungsblatt öffnen
            </ButtonLink>
          ) : undefined
        }
      />
      {ansicht ? <Zustandszeile ansicht={ansicht} /> : null}

      {rechnung.isPending ? <LoadingState label="Rechnung wird geladen …" /> : null}

      {rechnung.error instanceof KeineStammdaten ? (
        <StammdatenFehlen
          darfPflegen={darfStammdaten}
          folge="Ohne Absender, Steuernummer und Bankverbindung lässt sich keine Rechnung darstellen."
        />
      ) : rechnung.isError ? (
        <ErrorState
          title="Die Rechnung konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => rechnung.refetch()}
        />
      ) : null}

      {ansicht ? (
        <Rechnungsbild
          // Eine Meldung wie „Rechnung … ausgestellt." gehört zu genau dieser
          // Rechnung und reist nicht zur nächsten mit.
          key={ansicht.id}
          ansicht={ansicht}
          darfAusstellen={darfAusstellen}
          darfStammdaten={darfStammdaten}
          zeitzone={user.organizationTimeZone}
        />
      ) : null}
    </>
  );
}

/**
 * Der Zustand unter dem Kopf: dieselben Etiketten wie in der Liste, aus
 * denselben Serverwerten (ABR-05). Bei 390 px stand der Zahlungsstand vorher
 * erst nach gut zwei Bildschirmhöhen.
 */
function Zustandszeile({ ansicht }: { ansicht: Rechnungsansicht }) {
  let etiketten: ReactNode;
  let satz: string;

  if (ansicht.status === 'draft') {
    etiketten = <Badge ton="neutral">Entwurf</Badge>;
    satz = 'Noch ohne Nummer. Die Nummer entsteht beim Ausstellen.';
  } else if (ansicht.cancellation) {
    // Storniert ist keine Forderung mehr: kein Zahlungsstand daneben.
    etiketten = <Badge ton="neutral">Storniert</Badge>;
    satz = 'Das Stornodokument steht unten; die Rechnung selbst bleibt unverändert.';
  } else {
    etiketten = (
      <>
        <Badge ton={zahlungsTon[ansicht.payment_state]}>
          {zahlungsstandLabels[ansicht.payment_state]}
        </Badge>
        {ansicht.overdue ? <Badge ton="kritisch">Überfällig</Badge> : null}
      </>
    );
    // Die Frist steht hier statt im Absenderblock; dass die Rechnung fest
    // ist, sagt der Storno-Abschnitt, wo es zählt (UX-005i).
    satz = ansicht.due_on
      ? `Zahlbar bis ${formatDate(ansicht.due_on)} (${ansicht.document.issuer.payment_term_days} Tage).`
      : `Zahlungsziel ${ansicht.document.issuer.payment_term_days} Tage ab Ausstellung.`;
  }

  return (
    <div className="-mt-3 mb-6">
      <div className="flex flex-wrap items-center gap-2">{etiketten}</div>
      <p className="text-ink-muted mt-2 max-w-prose text-sm">{satz}</p>
    </div>
  );
}

/**
 * Fehlende Praxisstammdaten - mit dem Weg dorthin für die, die sie erfassen
 * darf, und dem Namen der Rolle für alle anderen (ABR-17). Das Office darf
 * sie nicht pflegen (ANN-074); ein Auftrag an sie wäre eine Sackgasse.
 */
function StammdatenFehlen({
  darfPflegen,
  folge,
  ton = 'warnung',
}: {
  darfPflegen: boolean;
  folge: string;
  ton?: 'warnung' | 'fehler';
}) {
  return (
    <div>
      <Statusmeldung ton={ton}>
        Es sind noch keine Praxisstammdaten erfasst. {folge}{' '}
        {darfPflegen
          ? 'Bitte zuerst Absender, Steuernummer und Bankverbindung erfassen.'
          : 'Die Praxisinhaber:in muss sie erst erfassen.'}
      </Statusmeldung>
      {darfPflegen ? (
        <Textlink to="/abrechnung/stammdaten" alleinstehend className="text-sm">
          Zu den Praxisstammdaten
        </Textlink>
      ) : null}
    </div>
  );
}

/**
 * Eine Zeile mit Datum, Text und Betrag (ABR-B08).
 *
 * Am Handy stehen Datum und Betrag oben nebeneinander und der Text darunter
 * in voller Breite. Vorher blieben dem Text in der Mitte rund 120 px, und
 * „1 × Krankengymnastik (KG)" brach dreizeilig. Ab 640 px drei Spalten wie
 * bisher. Die Reihenfolge im Quelltext bleibt Datum, Text, Betrag - so liest
 * sie auch die Vorlesesoftware.
 */
function Listenzeile({
  datum,
  betrag,
  children,
}: {
  datum: string;
  betrag?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 py-2 sm:grid-cols-[6rem_1fr_auto]">
      <span className="text-ink-muted col-start-1 row-start-1 text-sm tabular-nums">{datum}</span>
      <div className="col-span-2 col-start-1 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        {children}
      </div>
      {betrag === undefined ? null : (
        <span className="col-start-2 row-start-1 text-right sm:col-start-3">{betrag}</span>
      )}
    </li>
  );
}

function Rechnungsbild({
  ansicht,
  darfAusstellen,
  darfStammdaten,
  zeitzone,
}: {
  ansicht: Rechnungsansicht;
  darfAusstellen: boolean;
  darfStammdaten: boolean;
  zeitzone: string | null;
}) {
  const dokument = ansicht.document;
  const entwurf = ansicht.status === 'draft';
  // Die Nummer der eben ausgestellten Rechnung (ABR-10). Sie kommt aus dem
  // Aufruf, der sie vergeben hat - die Seite rät keine.
  const [ausgestellt, setAusgestellt] = useState<string | null>(null);

  return (
    <>
      {/* Die Kette rückwärts (ABR-003c): Wer diese Rechnung ansieht, soll
          sehen, dass sie eine andere ersetzt — und dorthin kommen. Der Link
          sieht aus wie einer (TOK-12). */}
      {ansicht.replaces_invoice_id ? (
        <Statusmeldung className="mb-4">
          Korrekturrechnung zur stornierten Rechnung{' '}
          <Textlink to={`/abrechnung/rechnungen/${ansicht.replaces_invoice_id}`}>
            {ansicht.replaces_invoice_number ?? 'ohne Nummer'}
          </Textlink>
          .
        </Statusmeldung>
      ) : null}

      {/* Auskunft im Rahmen, die Empfängerwahl darunter und ohne Rahmen:
          Ein Formular steht nicht in einem Auskunftskasten (UI-002c, ABR-33). */}
      <Section titel="Empfänger">
        <Inhaltsflaeche>
          <p className="text-ink text-liste font-medium">{dokument.recipient.name}</p>
          <p className="text-ink-muted text-sm">
            {empfaengerart(dokument.recipient.kind, dokument.service_area)}
            {/* Geht die Rechnung an die Person selbst, steht ihr Name nicht
                ein zweites Mal darunter - nur das Geburtsdatum (UX-005i). */}
            {dokument.recipient.kind === 'self' && dokument.patient.date_of_birth
              ? `, geb. ${formatDate(dokument.patient.date_of_birth)}`
              : ''}
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

          {dokument.recipient.kind === 'self' ? null : (
            <p className="text-ink-muted mt-3 text-sm">
              {personLabel(dokument.service_area, 'kurz')}: {dokument.patient.name}
              {dokument.patient.date_of_birth
                ? `, geb. ${formatDate(dokument.patient.date_of_birth)}`
                : ''}
            </p>
          )}
        </Inhaltsflaeche>

        {/* ANN-182: Eine Trainingsrechnung geht an die Kund:in selbst. Die
            hinterlegten Empfänger hängen an der Akte und gelten im Training
            nicht (ADR-021 Punkt 3). */}
        {entwurf && darfAusstellen && ansicht.patient_id ? (
          <Empfaengerwahl ansicht={ansicht} patientId={ansicht.patient_id} />
        ) : null}
        {entwurf && darfAusstellen && !ansicht.patient_id ? (
          <p className="text-ink-muted mt-4 text-sm">
            Eine Trainingsrechnung geht an die Kund:in selbst, mit der Anschrift aus dem Training.
          </p>
        ) : null}
      </Section>

      <Section titel="Leistungen" rahmen>
        <ul className="divide-line divide-y">
          {dokument.items.map((zeile, index) => (
            <Listenzeile
              key={`${zeile.performed_on}-${zeile.code}-${index}`}
              datum={
                // ANG-002: Ein Abo-Monat nennt seinen Zeitraum.
                zeile.period_until
                  ? `${formatDate(zeile.performed_on)} bis ${formatDate(zeile.period_until)}`
                  : formatDate(zeile.performed_on)
              }
              betrag={
                <span className="text-ink text-liste tabular-nums">
                  {formatEuro(zeile.line_total_cents, zeile.currency)}
                </span>
              }
            >
              <span className="text-ink text-liste">
                {zeile.quantity} × {zeile.label} ({zeile.code})
                {/* Eine Art, kein Warnzustand (ABR-16): ohne „!". */}
                {zeile.item_kind === 'absence_fee' ? (
                  <span className="ml-2">
                    <Badge ton="neutral">Ausfallhonorar</Badge>
                  </span>
                ) : null}
              </span>
            </Listenzeile>
          ))}
        </ul>

        <div className="border-line mt-3 flex justify-between border-t pt-3">
          <span className="text-ink text-liste font-semibold">Gesamtbetrag</span>
          <span className="text-ink text-liste font-semibold tabular-nums">
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
                {/* Pflichtangabe nach § 14 Abs. 4 Nr. 8 UStG (ABR-006): Die
                    Ansicht zeigt denselben Satz wie das Blatt, weil beide aus
                    demselben Dokument kommen. */}
                {gruppe.exemption_reason ? ` · ${gruppe.exemption_reason}` : ''}
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
                {/* Dieselben Wörter wie in der Akte (ABR-18): „Selbstzahler
                    seit …", nicht „Selbstzahlerin vom …". */}
                {grundlageText(basis.kind, basis.issued_on)}
                {basis.prescriber ? ` · ${basis.prescriber}` : ''}
                {diagnoseText(basis) ? <span className="block">{diagnoseText(basis)}</span> : null}
              </li>
            ))}
          </ul>
          {/* Kein Satz „Ohne Diagnose": Was nicht da ist, braucht keine
              Erklärung an jeder Rechnung (UX-005i). */}
        </Section>
      ) : null}

      {/* Der Absender ist auf jeder Rechnung derselbe und steht zugeklappt;
          die Zahlungsfrist steht oben in der Zustandszeile (UX-005i). */}
      <details className="group border-line bg-surface rounded-card mt-8 border px-4 sm:px-5">
        <summary className={`${aufklappKopfKlassen} text-ink-muted hover:text-ink text-sm`}>
          <Aufklappzeichen />
          Absender und Bankverbindung
        </summary>
        <div className="pb-3">
          <p className="text-ink text-liste">{dokument.issuer.legal_name}</p>
          <p className="text-ink-muted text-sm">
            {`${dokument.issuer.street} ${dokument.issuer.house_number ?? ''}`.trim()},{' '}
            {dokument.issuer.postal_code} {dokument.issuer.city}
          </p>
          <p className="text-ink-muted mt-1 text-sm">
            {dokument.issuer.tax_number
              ? `Steuernummer ${dokument.issuer.tax_number}`
              : `USt-IdNr. ${dokument.issuer.vat_id ?? ''}`}
          </p>
          {/* Beschriftet und in Vierergruppen (ABR-28); gespeichert bleibt sie,
              wie sie ist. */}
          <p className="text-ink-muted text-sm">
            {dokument.issuer.account_holder ?? dokument.issuer.legal_name} · IBAN{' '}
            {ibanInGruppen(dokument.issuer.iban)}
            {dokument.issuer.bic ? ` · BIC ${dokument.issuer.bic}` : ''}
          </p>
        </div>
      </details>

      {/* Das Blatt zum Verschicken öffnet der Kopf der Seite (ABR-05). Nach
          dem Ausstellen steht es hier noch einmal - als nächster Schritt, mit
          dem Fokus darauf (ABR-10). */}
      {ausgestellt ? (
        <Ausstellmeldung nummer={ausgestellt} invoiceId={ansicht.id} />
      ) : entwurf && darfAusstellen ? (
        <Entwurfsaktionen
          ansicht={ansicht}
          darfStammdaten={darfStammdaten}
          onAusgestellt={setAusgestellt}
        />
      ) : null}

      {!entwurf ? (
        <>
          <Zahlungen
            ansicht={ansicht}
            darfBuchen={darfAusstellen}
            zeitzone={zeitzone}
            waehrung={dokument.currency}
          />
          <Zahlungserinnerungen
            ansicht={ansicht}
            darfErinnern={darfAusstellen}
            zeitzone={zeitzone}
          />
          <Stornokette ansicht={ansicht} darfStornieren={darfAusstellen} />
        </>
      ) : null}
    </>
  );
}

/**
 * Die Rückmeldung nach dem Ausstellen, an der Stelle des Entwurfsabschnitts
 * (ABR-10). Der Knopf „Rechnung ausstellen" ist mit dem Abschnitt fort; ohne
 * Fokusziel fiele die Tastaturbedienung an den Seitenanfang, und die Nummer
 * stünde nur im Kopf - am Handy außer Sicht.
 */
function Ausstellmeldung({ nummer, invoiceId }: { nummer: string; invoiceId: string }) {
  const kasten = useRef<HTMLDivElement>(null);

  useEffect(() => {
    kasten.current?.querySelector('a')?.focus();
  }, []);

  return (
    <div ref={kasten} className="mt-8">
      <Statusmeldung ton="erfolg">Rechnung {nummer} ausgestellt.</Statusmeldung>
      <div className="mt-3">
        <ButtonLink to={`/abrechnung/rechnungen/${invoiceId}/druck`}>
          Rechnungsblatt öffnen
        </ButtonLink>
      </div>
    </div>
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
 *
 * Die Summenzeile heißt, was sie zeigt (ABR-B01): „Noch offen" mit dem
 * Serverbetrag, daneben das Etikett des Zahlungsstands. Vorher wechselte nur
 * die Beschriftung, und eine bezahlte Rechnung zeigte „Bezahlt 0,00 €". An
 * einer stornierten Rechnung steht keine Forderung mehr (ABR-06).
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
  const storniert = ansicht.cancellation !== null;
  // An einer bezahlten Rechnung ist Buchen selten - eine Rückzahlung etwa.
  // Das Formular steht dort eingeklappt hinter einem Knopf (ABR-09). Einmal
  // offen, bleibt es offen: Eine Buchung, die die Rechnung ausgleicht, soll
  // ihre eigene Meldung nicht mit dem Formular verschwinden lassen.
  const [formularOffen, setFormularOffen] = useState(offen > 0);

  return (
    <Section titel="Zahlungen">
      <Inhaltsflaeche>
        {zahlungen.isPending ? <LoadingState label="Zahlungen werden geladen …" /> : null}
        {zahlungen.isError ? (
          <ErrorState
            title="Die Zahlungen konnten nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => zahlungen.refetch()}
          />
        ) : null}

        {zahlungen.data && zahlungen.data.length === 0 ? (
          <p className="text-ink-muted text-sm">Noch keine Zahlung erfasst.</p>
        ) : null}

        <ul className="divide-line divide-y">
          {(zahlungen.data ?? []).map((zahlung) => (
            <Listenzeile
              key={zahlung.id}
              datum={formatDate(zahlung.paid_on)}
              betrag={
                <span
                  className={`text-liste tabular-nums ${
                    zahlung.voided_at !== null ? 'text-ink-muted line-through' : 'text-ink'
                  }`}
                >
                  {zahlung.direction === 'refund' ? '−' : ''}
                  {formatEuro(zahlung.amount_cents, zahlung.currency)}
                </span>
              }
            >
              <span className="text-ink text-liste">
                {richtungLabels[zahlung.direction]} ·{' '}
                {zahlungswegAnzeige[zahlung.method] ?? zahlung.method}
              </span>
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
              {/* ABR-07: Das Storno der Zahlung steht dort, wo sie steht - nicht
                  nur unter „Zahlungen". Derselbe Knopf, derselbe Aufruf. */}
              {darfBuchen && zahlung.voided_at === null ? (
                <div className="mt-1">
                  <Zahlungsstorno
                    zahlungId={zahlung.id}
                    invoiceId={ansicht.id}
                    ausloeser="Zahlung stornieren"
                  />
                </div>
              ) : null}
            </Listenzeile>
          ))}
        </ul>

        <div className="border-line mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-3">
          {storniert ? (
            // ABN-008: Was vor dem Storno eingegangen ist, bleibt stehen, bis
            // es zurückgezahlt oder mit der Korrekturrechnung verrechnet ist.
            ansicht.paid_cents > 0 ? (
              <>
                <span className="text-ink text-liste font-semibold">
                  Storniert – eingegangen, noch zurückzuzahlen oder zu verrechnen
                </span>
                <span className="text-ink text-liste font-semibold tabular-nums">
                  {formatEuro(ansicht.paid_cents, waehrung)}
                </span>
              </>
            ) : (
              <span className="text-ink text-liste font-semibold">Storniert – keine Forderung</span>
            )
          ) : (
            <>
              <span className="flex flex-wrap items-center gap-2">
                {/* Den Zahlungsstand trägt die Zustandszeile oben; hier
                    stünde er ein zweites Mal (UX-005i). */}
                <span className="text-ink text-liste font-semibold">
                  {offen < 0 ? 'Zu viel gezahlt' : 'Noch offen'}
                </span>
              </span>
              <span className="text-ink text-liste font-semibold tabular-nums">
                {formatEuro(Math.abs(offen), waehrung)}
              </span>
            </>
          )}
        </div>
      </Inhaltsflaeche>

      {/* An einer stornierten Rechnung geht kein Eingang mehr ein (R3-004).
          Seit ABN-008 steht dort, solange Geld eingegangen ist, die
          Rückzahlung und die Verrechnung mit der Korrekturrechnung. Das
          Formular steht außerhalb des Rahmens: Der Rahmen gehört der Auskunft
          (UI-002c, ABR-33). */}
      {darfBuchen && zeitzone !== null && storniert && ansicht.paid_cents > 0 ? (
        <Guthaben ansicht={ansicht} waehrung={waehrung} zeitzone={zeitzone} />
      ) : null}
      {darfBuchen && zeitzone !== null && !storniert ? (
        formularOffen ? (
          <Zahlungsformular
            invoiceId={ansicht.id}
            offenCent={offen}
            eingegangenCent={ansicht.paid_cents}
            waehrung={waehrung}
            zeitzone={zeitzone}
          />
        ) : (
          <div className="mt-4">
            <Button type="button" variant="secondary" onClick={() => setFormularOffen(true)}>
              Zahlung buchen
            </Button>
          </div>
        )
      ) : null}
    </Section>
  );
}

/**
 * Der eingegangene Betrag an einer stornierten Rechnung (ABN-008, BEF-100).
 *
 * Er verschwindet nicht mit dem Storno. Zwei Wege führen ihn ab: die
 * tatsächliche Rückzahlung an die Zahlende und die Verrechnung mit der
 * ausgestellten Korrekturrechnung. Ein Zahlungsstorno ist keiner davon — es
 * korrigiert nur eine falsche Buchung (ANN-079 Fassung 2, ANN-215).
 */
function Guthaben({
  ansicht,
  waehrung,
  zeitzone,
}: {
  ansicht: Rechnungsansicht;
  waehrung: string;
  zeitzone: string;
}) {
  const queryClient = useQueryClient();
  const [weg, setWeg] = useState<'keiner' | 'rueckzahlung'>('keiner');
  const korrektur = ansicht.correction_invoice_number ? ansicht.correction_invoice_id : null;

  const verrechnen = useMutation({
    mutationFn: () =>
      verrechneMitKorrektur({
        stornierteId: ansicht.id,
        korrekturId: korrektur ?? '',
        betragCent: ansicht.paid_cents,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rechnung', ansicht.id] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungszahlungen', ansicht.id] });
      if (korrektur) {
        await queryClient.invalidateQueries({ queryKey: ['rechnung', korrektur] });
        await queryClient.invalidateQueries({ queryKey: ['rechnungszahlungen', korrektur] });
      }
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
      await queryClient.invalidateQueries({ queryKey: ['offene-posten'] });
      await queryClient.invalidateQueries({ queryKey: ['zahlungen'] });
    },
  });

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {korrektur ? (
          <Rueckfrage
            ausloeser={`Mit Korrekturrechnung ${ansicht.correction_invoice_number ?? ''} verrechnen`}
            bestaetigen="Verrechnung buchen"
            bestaetigenLaeuft="Wird gebucht …"
            laeuft={verrechnen.isPending}
            fehler={verrechnen.isError ? verrechnen.error.message : undefined}
            onBestaetigen={() => verrechnen.mutateAsync()}
          >
            <p className="text-ink-muted text-sm">
              {formatEuro(ansicht.paid_cents, waehrung)} gehen von dieser Rechnung auf die
              Korrekturrechnung über: hier als Rückzahlung, dort als Eingang, beide als Verrechnung.
            </p>
          </Rueckfrage>
        ) : null}
        {weg === 'keiner' ? (
          <Button type="button" variant="secondary" onClick={() => setWeg('rueckzahlung')}>
            Rückzahlung buchen
          </Button>
        ) : null}
      </div>
      {!korrektur ? (
        <p className="text-ink-muted text-sm">
          Verrechnen lässt sich mit der Korrekturrechnung, sobald sie ausgestellt ist.
        </p>
      ) : null}
      {weg === 'rueckzahlung' ? (
        <Zahlungsformular
          invoiceId={ansicht.id}
          offenCent={0}
          eingegangenCent={ansicht.paid_cents}
          waehrung={waehrung}
          zeitzone={zeitzone}
          nurRueckzahlung
        />
      ) : null}
    </div>
  );
}

/**
 * Die Zahlungserinnerungen einer Rechnung (ABR-003d, `IDEA-PRX-012`).
 *
 * **Ohne Stufen, ohne Gebühren, ohne Automatik.** Es gibt genau einen Knopf,
 * und er heißt, was er tut. Eine zweite Erinnerung ist keine zweite Mahnstufe
 * — Mahnstufen entscheidet ABR-005 nach Praxiserfahrung (ADR-009 nennt das
 * Mahnwesen ausdrücklich als nicht entschieden).
 *
 * Die Liste zeigt jede ausgestellte Erinnerung mit **ihrem** offenen Betrag:
 * dem vom Tag der Ausstellung (ANN-080). Der heutige steht darüber bei den
 * Zahlungen und wird dort gerechnet.
 *
 * **Seit UXR-010:** Solange die Liste lädt oder nicht geladen werden konnte,
 * steht das da - und nicht „Noch keine Erinnerung ausgestellt." (ABR-30).
 * Der Knopf erscheint erst mit der geladenen Liste und ist gesperrt, wenn
 * heute schon eine besteht: Der Server lässt eine je Tag zu (ANN-080) und
 * bleibt maßgeblich (ABR-B03). Nach dem Ausstellen geht es zum Blatt (ABR-10).
 */
function Zahlungserinnerungen({
  ansicht,
  darfErinnern,
  zeitzone,
}: {
  ansicht: Rechnungsansicht;
  darfErinnern: boolean;
  zeitzone: string | null;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const erinnerungen = useQuery({
    queryKey: ['zahlungserinnerungen', ansicht.id],
    queryFn: () => fetchErinnerungen(ansicht.id),
    retry: false,
  });

  const erstellen = useMutation({
    mutationFn: () => erstelleErinnerung(ansicht.id),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['zahlungserinnerungen', ansicht.id] });
      // Der nächste Schritt ist das Blatt, das verschickt wird (ABR-10).
      await navigate(`/abrechnung/erinnerungen/${id}`);
    },
  });

  // An einer stornierten Rechnung gibt es nichts zu erinnern: Sie ist keine
  // Forderung mehr (ABR-003c).
  if (ansicht.cancellation) return null;

  const bezahlt = ansicht.outstanding_cents <= 0;
  const eintraege = erinnerungen.data ?? [];
  const heute = zeitzone === null ? null : todayInTimeZone(zeitzone);
  const heuteSchon = heute !== null && eintraege.some((eintrag) => eintrag.reminder_on === heute);

  return (
    <Section titel="Zahlungserinnerung" rahmen>
      {erinnerungen.isPending ? <LoadingState label="Erinnerungen werden geladen …" /> : null}
      {erinnerungen.isError ? (
        <ErrorState
          title="Die Zahlungserinnerungen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => erinnerungen.refetch()}
        />
      ) : null}

      {erinnerungen.isSuccess && eintraege.length === 0 ? (
        <p className="text-ink-muted text-sm">Noch keine Erinnerung ausgestellt.</p>
      ) : null}

      {eintraege.length > 0 ? (
        <ul className="divide-line divide-y">
          {eintraege.map((eintrag) => (
            <Listenzeile key={eintrag.id} datum={formatDate(eintrag.reminder_on)}>
              <span className="text-ink text-liste block">
                Frist bis {formatDate(eintrag.due_on)} ·{' '}
                {formatEuro(eintrag.outstanding_cents, eintrag.currency)} offen
              </span>
              {/* Ein Link, der wie einer aussieht, 44 px hoch, und der sagt,
                  welches Blatt er öffnet (ABR-25). */}
              <Textlink
                to={`/abrechnung/erinnerungen/${eintrag.id}`}
                alleinstehend
                className="text-sm"
              >
                Erinnerung vom {formatDate(eintrag.reminder_on)} öffnen
              </Textlink>
            </Listenzeile>
          ))}
        </ul>
      ) : null}

      {darfErinnern && !bezahlt && erinnerungen.isSuccess ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            disabled={erstellen.isPending || !ansicht.overdue || heuteSchon}
            onClick={() => erstellen.mutate()}
          >
            {erstellen.isPending ? 'Wird ausgestellt …' : 'Zahlungserinnerung ausstellen'}
          </Button>
          <p className="text-ink-muted mt-2 max-w-prose text-sm">
            {heuteSchon
              ? 'Heute ist bereits eine Erinnerung ausgestellt.'
              : ansicht.overdue
                ? // Kurz: Was das Blatt nicht ist, muss hier nicht stehen (UX-005i).
                  'Neue Frist 14 Tage, ohne Gebühr.'
                : `Die Rechnung ist noch nicht fällig${
                    ansicht.due_on ? ` – sie läuft bis zum ${formatDate(ansicht.due_on)}` : ''
                  }. Vorher gibt es nichts zu erinnern.`}
          </p>
        </div>
      ) : null}

      {erstellen.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {erstellen.error.message}
        </Statusmeldung>
      ) : null}
    </Section>
  );
}

/**
 * Storno und Korrektur einer ausgestellten Rechnung (ABR-003c).
 *
 * ADR-009 Punkt 9: Eine ausgestellte Rechnung ist unveränderbar; korrigiert
 * wird über ein **eigenes Dokument**. Deshalb steht hier kein „Bearbeiten"
 * und kein „Löschen", sondern zwei Schritte: das Storno mit Grund und — wenn
 * die Praxis sie braucht — die Korrekturrechnung.
 *
 * „Storniert" ist ein abgeleiteter Zustand (ANN-079): Es gibt ein
 * Stornodokument zu dieser Rechnung. Die Rechnung selbst ändert sich nicht,
 * und an ihr steht dazu keine Spalte.
 *
 * **Seit UXR-010 (ABR-07):** Steht noch eine gebuchte Zahlung, sagt der
 * Abschnitt das, bevor jemand einen Grund tippt - statt erst danach mit der
 * Meldung des Servers. Die Regel bleibt die des Servers (ANN-079); die Seite
 * liest sie aus derselben Zahlungsliste wie der Abschnitt darüber.
 */
function Stornokette({
  ansicht,
  darfStornieren,
}: {
  ansicht: Rechnungsansicht;
  darfStornieren: boolean;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string | undefined>(undefined);

  // ABN-008: Eine stehende Zahlung sperrt das Storno nicht mehr; die
  // Rückfrage sagt, was mit dem eingegangenen Betrag geschieht.
  const eingegangen = ansicht.paid_cents > 0;

  const stornieren = useMutation({
    mutationFn: () => storniereRechnung(ansicht.id, grund.trim()),
    onSuccess: async () => {
      setGrund('');
      await queryClient.invalidateQueries({ queryKey: ['rechnung', ansicht.id] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
      await queryClient.invalidateQueries({ queryKey: ['offene-posten'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungs-kandidaten'] });
    },
  });

  const korrigieren = useMutation({
    mutationFn: () => erstelleKorrektur(ansicht.id),
    onSuccess: async (id) => {
      // Die stornierte Rechnung zeigt danach den Weg zu ihrer Korrektur;
      // ohne sie neu zu laden bot sie weiter „Korrekturrechnung erstellen" an
      // (ABR-01).
      await queryClient.invalidateQueries({ queryKey: ['rechnung', ansicht.id] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungs-kandidaten'] });
      await navigate(`/abrechnung/rechnungen/${id}`);
    },
  });

  if (ansicht.cancellation) {
    const storno = ansicht.cancellation;
    return (
      <Section titel="Storniert" rahmen>
        <p className="text-ink text-liste">
          Stornodokument {storno.cancellation_number} vom {formatDate(storno.cancelled_on)}
        </p>
        <p className="text-ink-muted mt-1 text-sm">Grund: {storno.reason}</p>
        <p className="text-ink-muted mt-2 text-sm">
          Die Rechnung bleibt unverändert stehen – sie ist ausgestellt gewesen, und das lässt sich
          nicht zurücknehmen. Sie steht in keinem offenen Posten mehr, und ihre Leistungen sind
          wieder abzurechnen.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink to={`/abrechnung/rechnungen/${ansicht.id}/storno`} variant="secondary">
            Stornodokument öffnen
          </ButtonLink>

          {ansicht.correction_invoice_id ? (
            <ButtonLink
              to={`/abrechnung/rechnungen/${ansicht.correction_invoice_id}`}
              variant="secondary"
            >
              {ansicht.correction_invoice_number
                ? `Korrekturrechnung ${ansicht.correction_invoice_number} öffnen`
                : 'Korrekturentwurf öffnen'}
            </ButtonLink>
          ) : darfStornieren ? (
            <Button
              type="button"
              variant="secondary"
              disabled={korrigieren.isPending}
              onClick={() => korrigieren.mutate()}
            >
              {korrigieren.isPending ? 'Wird erstellt …' : 'Korrekturrechnung erstellen'}
            </Button>
          ) : null}
        </div>

        {korrigieren.isError ? (
          <Statusmeldung ton="fehler" className="mt-2">
            {korrigieren.error.message}
          </Statusmeldung>
        ) : null}
      </Section>
    );
  }

  if (!darfStornieren) return null;

  return (
    <Section titel="Storno" ebene={2}>
      {/* Was das Storno bedeutet, steht in der Rückfrage - dort, wo
          entschieden wird, nicht als Vorrede (UX-005i). */}
      <div>
        {
          <Rueckfrage
            ausloeser="Rechnung stornieren"
            bestaetigen="Storno ausstellen"
            bestaetigenLaeuft="Wird storniert …"
            laeuft={stornieren.isPending}
            fehler={fehler ?? (stornieren.isError ? stornieren.error.message : undefined)}
            onBestaetigen={() => {
              if (grund.trim().length < 3) {
                setFehler('Bitte einen Grund angeben – er steht auf dem Stornodokument.');
                // Abgewiesen, nicht ausgeführt: Der Kasten bleibt offen, damit
                // der Hinweis am Feld steht, in dem er gilt.
                return Promise.reject(new Error('Grund fehlt'));
              }
              setFehler(undefined);
              return stornieren.mutateAsync();
            }}
            onAbbrechen={() => {
              setGrund('');
              setFehler(undefined);
              stornieren.reset();
            }}
          >
            <p className="text-ink-muted text-sm">
              Die Rechnung bleibt, wie sie ist; das Storno ist ein eigenes Dokument mit eigener
              Nummer und lässt sich nicht zurücknehmen. Danach sind die Leistungen wieder
              abzurechnen, und eine Korrekturrechnung lässt sich aus ihnen erstellen.
            </p>
            {eingegangen ? (
              <p className="text-ink-muted mt-2 text-sm">
                Auf diese Rechnung sind {formatEuro(ansicht.paid_cents, ansicht.document.currency)}{' '}
                eingegangen. Der Betrag bleibt nach dem Storno stehen und wird zurückgezahlt oder
                mit der Korrekturrechnung verrechnet.
              </p>
            ) : null}
            {/* Eine Zeile Grund, keine Seitenbreite (ABR-23). */}
            <div className="mt-2 max-w-xl">
              <Field label="Grund" value={grund} onChange={(e) => setGrund(e.target.value)} />
            </div>
          </Rueckfrage>
        }
      </div>
    </Section>
  );
}

/**
 * Wer die Rechnung bekommt, am Entwurf.
 *
 * **Seit UXR-010:** Laden und Ladefehler stehen da, statt dass die Auswahl
 * nur „Patient:in selbst" anbietet (ABR-30). Während des Setzens zeigt die
 * Auswahl schon die neue Wahl und ist gesperrt - vorher sprang sie bis zum
 * Neuladen auf den alten Wert zurück und nahm einen zweiten Wechsel an; danach
 * sagt eine Meldung, dass er gesetzt ist (ABR-10, ZST-20).
 *
 * **Seit UX-008c (BEF-062 Teil 2, Jannes 2026-10-09):** Ein hinterlegter
 * Empfänger lässt sich korrigieren und als Standard der Person setzen; ein
 * neu hinterlegter ist danach für diese Rechnung gewählt. Eine Änderung wirkt
 * auf Entwürfe, nie auf ausgestellte Rechnungen - die tragen ihren Snapshot
 * (ADR-009 Punkt 10).
 */
function Empfaengerwahl({ ansicht, patientId }: { ansicht: Rechnungsansicht; patientId: string }) {
  const queryClient = useQueryClient();
  // Welches Formular offen ist: keines, ein neuer oder ein bestehender Empfänger.
  const [formular, setFormular] = useState<'zu' | 'neu' | Empfaenger>('zu');
  const [meldung, setMeldung] = useState<string | null>(null);

  const empfaenger = useQuery({
    queryKey: ['rechnungsempfaenger', patientId],
    queryFn: () => fetchEmpfaenger(patientId),
    retry: false,
  });

  const waehlen = useMutation({
    mutationFn: (id: string | null) => setzeEmpfaenger(ansicht.id, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rechnung', ansicht.id] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
    },
  });

  if (empfaenger.isPending) {
    return <LoadingState label="Hinterlegte Empfänger werden geladen …" />;
  }

  if (empfaenger.isError) {
    return (
      <div className="mt-4">
        <ErrorState
          title="Die hinterlegten Empfänger konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => empfaenger.refetch()}
        />
      </div>
    );
  }

  const wert = waehlen.isPending ? (waehlen.variables ?? '') : (ansicht.recipient_id ?? '');
  const gewaehlt = empfaenger.data.find((eintrag) => eintrag.id === ansicht.recipient_id) ?? null;

  async function gespeichert(id: string, neu: boolean) {
    setFormular('zu');
    await queryClient.invalidateQueries({ queryKey: ['rechnungsempfaenger', patientId] });
    if (neu) {
      // Wer gerade einen Empfänger hinterlegt, meint diese Rechnung (BEF-062).
      try {
        await waehlen.mutateAsync(id);
        setMeldung('Empfänger hinterlegt und für diese Rechnung gewählt.');
      } catch {
        // Hinterlegt ist er; dass das Setzen scheiterte, sagt die Meldung
        // der Auswahl.
      }
    } else {
      // Der Entwurf wird aus den Stammdaten gebaut und zeigt die Änderung.
      await queryClient.invalidateQueries({ queryKey: ['rechnung', ansicht.id] });
      setMeldung('Empfänger geändert. Das Blatt ausgestellter Rechnungen bleibt, wie es ist.');
    }
  }

  return (
    <div className="mt-4 max-w-xl">
      <Select
        label="Rechnung geht an"
        hint="Ohne hinterlegten Empfänger geht sie an die Patient:in selbst."
        value={wert}
        disabled={waehlen.isPending || formular !== 'zu'}
        onChange={(e) => {
          setMeldung(null);
          waehlen.mutate(e.target.value === '' ? null : e.target.value, {
            onSuccess: () => setMeldung('Empfänger gesetzt.'),
          });
        }}
      >
        <option value="">{empfaengerartLabels.self}</option>
        {empfaenger.data.map((eintrag) => (
          <option key={eintrag.id} value={eintrag.id}>
            {eintrag.name} ({empfaengerartLabels[eintrag.recipient_kind] ?? 'Kostenträger'})
            {eintrag.is_default ? ' · Standard' : ''}
          </option>
        ))}
      </Select>

      {waehlen.isPending ? (
        <Statusmeldung className="mt-2">Wird gesetzt …</Statusmeldung>
      ) : meldung ? (
        <Statusmeldung ton="erfolg" className="mt-2">
          {meldung}
        </Statusmeldung>
      ) : null}

      {waehlen.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {waehlen.error.message}
        </Statusmeldung>
      ) : null}

      {formular === 'zu' ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {gewaehlt ? (
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setMeldung(null);
                setFormular(gewaehlt);
              }}
            >
              Empfänger bearbeiten
            </Button>
          ) : null}
          <Button
            type="button"
            variant="quiet"
            onClick={() => {
              setMeldung(null);
              setFormular('neu');
            }}
          >
            Empfänger hinterlegen
          </Button>
        </div>
      ) : (
        <Empfaengerformular
          // Ein anderer Empfänger ist ein anderes Formular.
          key={formular === 'neu' ? 'neu' : formular.id}
          patientId={patientId}
          bestehend={formular === 'neu' ? null : formular}
          onGespeichert={gespeichert}
          onAbbrechen={() => setFormular('zu')}
        />
      )}
    </div>
  );
}

/** Die Arten zur Wahl - ohne Vorbelegung (BEF-062): Die Art bestimmt Anrede und Aktenzeichen. */
const EMPFAENGERARTEN: Empfaenger['recipient_kind'][] = [
  'aid_authority',
  'private_insurer',
  'legal_representative',
  'guardian',
  'other',
];

/**
 * Einen Empfänger hinterlegen oder korrigieren.
 *
 * **Seit UXR-010:** kein Kasten im Kasten mehr (ABR-33), höchstens so breit
 * wie ein Formular (ABR-23), und „Empfänger speichern" ist nicht mehr ohne
 * Grund gesperrt: Fehlt der Name, steht das am Feld (ABR-20). Die
 * Postleitzahl öffnet am Handy das Ziffernfeld (RSP-12).
 *
 * **Seit UX-008c (BEF-062):** Die Art ist nicht mehr mit „Beihilfestelle"
 * vorbelegt - fehlt sie, steht das am Feld. Ein bestehender Empfänger kommt
 * mit seinen Angaben ins Formular und behält seine Kennung; „Standard" macht
 * ihn zur Vorgabe neuer Rechnungen der Person (höchstens einer, ANN-076).
 */
function Empfaengerformular({
  patientId,
  bestehend,
  onGespeichert,
  onAbbrechen,
}: {
  patientId: string;
  bestehend: Empfaenger | null;
  onGespeichert: (id: string, neu: boolean) => void | Promise<void>;
  onAbbrechen: () => void;
}) {
  const namensfeld = useId();
  const artfeld = useId();
  const [namensfehler, setNamensfehler] = useState<string | undefined>(undefined);
  const [artfehler, setArtfehler] = useState<string | undefined>(undefined);
  const [eingabe, setEingabe] = useState({
    recipient_kind: bestehend?.recipient_kind ?? '',
    name: bestehend?.name ?? '',
    street: bestehend?.street ?? '',
    house_number: bestehend?.house_number ?? '',
    postal_code: bestehend?.postal_code ?? '',
    city: bestehend?.city ?? '',
    reference: bestehend?.reference ?? '',
    is_default: bestehend?.is_default ?? false,
  });

  const speichern = useMutation({
    mutationFn: () =>
      saveEmpfaenger({
        id: bestehend?.id ?? null,
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
    onSuccess: (id) => onGespeichert(id, bestehend === null),
  });

  function absenden() {
    if (speichern.isPending) return;
    const ohneArt = eingabe.recipient_kind === '';
    const ohneName = eingabe.name.trim() === '';
    setArtfehler(ohneArt ? 'Bitte die Art wählen.' : undefined);
    setNamensfehler(ohneName ? 'Bitte ausfüllen.' : undefined);
    // Der Fokus geht an das erste Feld mit Fehler.
    if (ohneArt) {
      document.getElementById(artfeld)?.focus();
      return;
    }
    if (ohneName) {
      document.getElementById(namensfeld)?.focus();
      return;
    }
    speichern.mutate();
  }

  return (
    <div className="mt-4 flex max-w-xl flex-col gap-4">
      {/* „Das Blatt": Rechnungsliste und offene Posten lesen den Namen noch
          aus den Stammdaten, nicht aus dem Snapshot (BEF-141). */}
      {bestehend ? (
        <p className="text-ink-muted text-sm">
          Die Änderung gilt für alle Entwürfe an diesen Empfänger; das Blatt ausgestellter
          Rechnungen bleibt, wie es ist.
        </p>
      ) : null}
      <Select
        label="Art *"
        feldId={artfeld}
        value={eingabe.recipient_kind}
        error={artfehler}
        onChange={(e) => {
          setEingabe((alt) => ({ ...alt, recipient_kind: e.target.value }));
          setArtfehler(undefined);
        }}
      >
        <option value="">Bitte wählen …</option>
        {EMPFAENGERARTEN.map((art) => (
          <option key={art} value={art}>
            {empfaengerartLabels[art]}
          </option>
        ))}
      </Select>
      <Field
        label="Name oder Stelle *"
        feldId={namensfeld}
        value={eingabe.name}
        error={namensfehler}
        onChange={(e) => {
          setEingabe((alt) => ({ ...alt, name: e.target.value }));
          setNamensfehler(undefined);
        }}
      />
      <div className="flex gap-4">
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
      <div className="flex gap-4">
        <span className="w-28">
          <Field
            label="PLZ"
            inputMode="numeric"
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
      <Checkbox
        label="Standard für neue Rechnungen dieser Person"
        hint="Neue Entwürfe gehen dann an diesen Empfänger statt an die Person selbst."
        checked={eingabe.is_default}
        onChange={(e) => setEingabe((alt) => ({ ...alt, is_default: e.target.checked }))}
      />

      {speichern.isError ? (
        <Statusmeldung ton="fehler">
          {speichern.error.message} Die Eingaben stehen noch im Formular.
        </Statusmeldung>
      ) : null}

      {/* Umbrechend: Bei 390 px brach „Empfänger speichern" sonst zweizeilig
          im 48-px-Knopf um (BEF-062). */}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={absenden} disabled={speichern.isPending}>
          {speichern.isPending
            ? 'Wird gespeichert …'
            : bestehend
              ? 'Änderung speichern'
              : 'Empfänger speichern'}
        </Button>
        <Button type="button" variant="quiet" onClick={onAbbrechen}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

/**
 * Die Kontrollwerte der Rückfrage vor dem Ausstellen (BEF-063): an wen, wie
 * viel, aus welchem Nummernkreis. Alles aus dem Dokument des Entwurfs - dem
 * Stand, den der Server beim Ausstellen festschreibt (ADR-009 Punkt 10).
 */
function Kontrollwerte({ ansicht }: { ansicht: Rechnungsansicht }) {
  const dokument = ansicht.document;
  const positionen = dokument.items.length;
  return (
    <>
      <p className="font-medium">Diese Rechnung jetzt ausstellen?</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-ink-muted">An</dt>
        <dd>
          {dokument.recipient.name} ({empfaengerart(dokument.recipient.kind, dokument.service_area)}
          )
        </dd>
        <dt className="text-ink-muted">Betrag</dt>
        <dd className="tabular-nums">
          {formatEuro(dokument.totals.total_cents, dokument.currency)} ·{' '}
          {positionen === 1 ? 'eine Position' : `${positionen} Positionen`}
        </dd>
        <dt className="text-ink-muted">Nummer</dt>
        <dd>aus dem Kreis {bereichLabels[dokument.service_area ?? 'therapy']}</dd>
      </dl>
      <p className="mt-2">
        Danach ist die Rechnung unveränderlich; eine Korrektur geht nur über Storno und neue
        Rechnung.
      </p>
    </>
  );
}

function Entwurfsaktionen({
  ansicht,
  darfStammdaten,
  onAusgestellt,
}: {
  ansicht: Rechnungsansicht;
  darfStammdaten: boolean;
  /** Mit der Nummer, die der Server vergeben hat (ABR-10). */
  onAusgestellt: (nummer: string) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Nach einem Fehlschlag ist die Rückfrage zu; der Fokus geht an den
  // Hinweis, der sagt, was fehlt (Zweitreview H5).
  const fehlerKasten = useRef<HTMLDivElement>(null);
  const ausstellen = useMutation({
    mutationFn: () => stelleRechnungAus(ansicht.id),
    onSuccess: async (nummer) => {
      onAusgestellt(nummer);
      await queryClient.invalidateQueries({ queryKey: ['rechnung', ansicht.id] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungen'] });
      await queryClient.invalidateQueries({ queryKey: ['rechnungs-kandidaten'] });
      // Die neue Rechnung ist ein offener Posten, und ihre Leistungen gelten
      // jetzt als abgerechnet (ABR-01).
      await queryClient.invalidateQueries({ queryKey: ['offene-posten'] });
      await queryClient.invalidateQueries({ queryKey: ['abrechnung-leistungen'] });
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
      {/* Was das Ausstellen bedeutet, steht in der Rückfrage - dort, wo
          entschieden wird (BEF-063, UX-005i). */}
      <div ref={fehlerKasten} tabIndex={-1} className="outline-none">
        {ausstellen.error instanceof KeineStammdaten ? (
          <div className="mt-2">
            <StammdatenFehlen
              ton="fehler"
              darfPflegen={darfStammdaten}
              folge="Ohne sie lässt sich keine Rechnung ausstellen."
            />
          </div>
        ) : ausstellen.error instanceof AnschriftUnvollstaendig ? (
          // ABN-020 (BEF-111): Der Server nennt, was fehlt; die Seite führt
          // dorthin, wo es zu ergänzen ist - an der Akte, wenn die Rechnung an
          // die Person selbst geht.
          <Statusmeldung ton="fehler" className="mt-2">
            {ausstellen.error.message}
            {ansicht.patient_id && !ansicht.recipient_id ? (
              <>
                {' '}
                <Textlink to={`/patienten/${ansicht.patient_id}/stammdaten`}>
                  Zu den Stammdaten
                </Textlink>
              </>
            ) : null}
          </Statusmeldung>
        ) : ausstellen.isError ? (
          <Statusmeldung ton="fehler" className="mt-2">
            {ausstellen.error.message} Bitte die Verbindung prüfen und erneut versuchen.
          </Statusmeldung>
        ) : null}
      </div>

      {/* BEF-063 (Jannes 2026-10-09): Ausstellen vergibt eine Nummer und
          macht die Rechnung unveränderlich - deshalb eine Rückfrage mit den
          Werten, die vorher niemand noch einmal ansieht: Empfänger, Betrag,
          Kreis. Ein Fehlschlag schließt sie; der Hinweis steht darüber, mit
          dem Weg zur fehlenden Angabe. */}
      <div className="mt-3">
        <Rueckfrage
          ausloeser="Rechnung ausstellen"
          ausloeserVariante="primary"
          bezeichnung="Rechnung ausstellen – Rückfrage"
          bestaetigen="Ja, Rechnung ausstellen"
          bestaetigenLaeuft="Wird ausgestellt …"
          laeuft={ausstellen.isPending}
          onBestaetigen={() =>
            ausstellen.mutateAsync().catch(() => {
              fehlerKasten.current?.focus();
            })
          }
          onAbbrechen={() => ausstellen.reset()}
        >
          <Kontrollwerte ansicht={ansicht} />
        </Rueckfrage>
      </div>

      {/* Verwerfen ist folgenlos und steht abgesetzt als ruhige Aktion: Seine
          Bestätigung stand sonst als zweiter gefüllter Knopf direkt unter
          „Rechnung ausstellen“ (BEF-063). */}
      <div className="border-line mt-8 border-t pt-4">
        {/* Mit Versprechen: Der Kasten bleibt offen, bis der Server
            geantwortet hat, und zeigt einen Fehlschlag (ABR-03, ZST-06). */}
        <Rueckfrage
          ausloeser="Entwurf verwerfen"
          ausloeserVariante="quiet"
          bestaetigen="Ja, Entwurf verwerfen"
          bestaetigenLaeuft="Wird verworfen …"
          laeuft={verwerfen.isPending}
          fehler={
            verwerfen.isError
              ? `${verwerfen.error.message} Bitte die Verbindung prüfen und erneut versuchen.`
              : undefined
          }
          onBestaetigen={() => verwerfen.mutateAsync()}
          onAbbrechen={() => verwerfen.reset()}
        >
          <p>
            Der Entwurf wird gelöscht; seine Leistungen stehen danach wieder unter „Abzurechnen“.
            Eine Nummer wurde nie vergeben, es entsteht also keine Lücke.
          </p>
        </Rueckfrage>
      </div>
    </Section>
  );
}
