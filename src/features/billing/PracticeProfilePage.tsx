import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { canManageBillingProfile, type CurrentUser } from '@/features/session/types';
import { fetchPraxisStammdaten, savePraxisStammdaten, type PraxisStammdaten } from './api';

/**
 * Praxis-Stammdaten für Rechnungen (ABR-000).
 *
 * Das, was auf jeder Rechnung oben steht: Absender, Bankverbindung,
 * Steuernummer und der umsatzsteuerliche Status. Beim Ausstellen wandern
 * diese Angaben in den Snapshot der Rechnung und ändern sich dort nie wieder
 * (ADR-009 Punkt 10) — eine spätere Korrektur hier gilt für neue Rechnungen,
 * nicht für ausgestellte.
 *
 * **Der Umsatzsteuerstatus ist nicht vorbelegt.** Weder „Kleinunternehmerin"
 * noch „Regelbesteuerung" ist der wahrscheinlichere Fall, und eine falsche
 * Vorbelegung stünde am Ende auf einer Rechnung. Die Software rät ihn nicht
 * (ANN-074); bis zur Antwort aus G13 setzt die Praxis ihn selbst.
 *
 * Pflegen darf allein die Inhaberin (PROJECT_PRINCIPLES.md 4.1). Das Office
 * sieht die Angaben, weil es die Rechnungen ausstellt — die Oberfläche zeigt
 * ihm die Auskunft ohne Formular. Verbindlich ist die Prüfung im Schreibpfad,
 * nicht diese Weiche (ADR-004).
 */

const LEER: PraxisStammdaten = {
  legal_name: '',
  street: '',
  house_number: null,
  postal_code: '',
  city: '',
  phone: null,
  email: null,
  tax_number: '',
  vat_id: null,
  small_business: false,
  bank_name: null,
  account_holder: null,
  iban: '',
  bic: null,
  invoice_number_prefix: 'RG',
  payment_term_days: 14,
};

/** Was fehlt — leer heißt: die Angaben reichen für eine Rechnung. */
function pruefe(eingabe: PraxisStammdaten, steuerstatus: string): string | undefined {
  if (eingabe.legal_name.trim() === '') return 'Der Name der Praxis fehlt.';
  if (eingabe.street.trim() === '') return 'Die Straße fehlt.';
  if (eingabe.postal_code.trim() === '') return 'Die Postleitzahl fehlt.';
  if (eingabe.city.trim() === '') return 'Der Ort fehlt.';
  if (eingabe.tax_number.trim() === '') return 'Die Steuernummer fehlt.';
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(eingabe.iban.replace(/\s/g, '').toUpperCase()))
    return 'Die IBAN ist unvollständig.';
  if (steuerstatus === '') return 'Der umsatzsteuerliche Status fehlt.';
  return undefined;
}

export function PracticeProfilePage({ user }: { user: CurrentUser }) {
  const darfPflegen = canManageBillingProfile(user.roles);
  const queryClient = useQueryClient();

  const stammdaten = useQuery({
    queryKey: ['praxis-stammdaten'],
    queryFn: fetchPraxisStammdaten,
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Praxis-Stammdaten"
        description="Der Absender jeder Rechnung: Anschrift, Bankverbindung, Steuernummer."
      />

      {stammdaten.isPending ? <LoadingState label="Stammdaten werden geladen …" /> : null}
      {stammdaten.isError ? (
        <ErrorState
          title="Die Praxis-Stammdaten konnten nicht geladen werden."
          description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
        />
      ) : null}

      {stammdaten.isSuccess && !darfPflegen ? <Auskunft stammdaten={stammdaten.data} /> : null}

      {stammdaten.isSuccess && darfPflegen ? (
        <Formular
          vorhanden={stammdaten.data}
          onGespeichert={() => {
            void queryClient.invalidateQueries({ queryKey: ['praxis-stammdaten'] });
          }}
        />
      ) : null}
    </>
  );
}

function Auskunft({ stammdaten }: { stammdaten: PraxisStammdaten | null }) {
  if (stammdaten === null) {
    return (
      <Statusmeldung ton="warnung">
        Es sind noch keine Praxis-Stammdaten erfasst. Ohne sie lässt sich keine Rechnung ausstellen;
        erfassen kann sie die Inhaberin.
      </Statusmeldung>
    );
  }

  return (
    <Section titel="Absender" rahmen>
      <DetailList>
        <DetailRow label="Praxis">{stammdaten.legal_name}</DetailRow>
        <DetailRow label="Anschrift">
          {`${stammdaten.street} ${stammdaten.house_number ?? ''}`.trim()}
          {'\n'}
          {`${stammdaten.postal_code} ${stammdaten.city}`}
        </DetailRow>
        <DetailRow label="Steuernummer">{stammdaten.tax_number}</DetailRow>
        <DetailRow label="Umsatzsteuer">
          {stammdaten.small_business ? 'Kleinunternehmerin (§ 19 UStG)' : 'Regelbesteuerung'}
        </DetailRow>
        <DetailRow label="IBAN">{stammdaten.iban}</DetailRow>
        <DetailRow label="Zahlungsziel">{stammdaten.payment_term_days} Tage</DetailRow>
      </DetailList>
    </Section>
  );
}

function Formular({
  vorhanden,
  onGespeichert,
}: {
  vorhanden: PraxisStammdaten | null;
  onGespeichert: () => void;
}) {
  const [eingabe, setEingabe] = useState<PraxisStammdaten>(vorhanden ?? LEER);
  // Getrennt vom übrigen Zustand: „noch nicht gewählt" ist ein eigener Wert
  // und nicht `false`. Ein Auswahlfeld mit drei Zuständen braucht drei.
  const [steuerstatus, setSteuerstatus] = useState(
    vorhanden === null ? '' : vorhanden.small_business ? 'klein' : 'regel',
  );
  const [gezeigt, setGezeigt] = useState(false);

  const fehler = pruefe(eingabe, steuerstatus);

  const speichern = useMutation({
    mutationFn: () =>
      savePraxisStammdaten({ ...eingabe, small_business: steuerstatus === 'klein' }),
    onSuccess: onGespeichert,
  });

  function setzen<K extends keyof PraxisStammdaten>(feld: K, wert: PraxisStammdaten[K]) {
    setEingabe((alt) => ({ ...alt, [feld]: wert }));
  }

  function text(feld: keyof PraxisStammdaten): string {
    const wert = eingabe[feld];
    return typeof wert === 'string' ? wert : '';
  }

  return (
    <form
      onSubmit={(ereignis) => {
        ereignis.preventDefault();
        setGezeigt(true);
        if (fehler === undefined) speichern.mutate();
      }}
    >
      <Section titel="Absender">
        <div className="flex flex-col gap-3">
          <Field
            label="Praxis"
            value={eingabe.legal_name}
            onChange={(e) => setzen('legal_name', e.target.value)}
          />
          <div className="flex gap-3">
            <span className="flex-1">
              <Field
                label="Straße"
                value={eingabe.street}
                onChange={(e) => setzen('street', e.target.value)}
              />
            </span>
            <span className="w-24">
              <Field
                label="Nr."
                value={text('house_number')}
                onChange={(e) => setzen('house_number', e.target.value || null)}
              />
            </span>
          </div>
          <div className="flex gap-3">
            <span className="w-28">
              <Field
                label="PLZ"
                value={eingabe.postal_code}
                onChange={(e) => setzen('postal_code', e.target.value)}
              />
            </span>
            <span className="flex-1">
              <Field
                label="Ort"
                value={eingabe.city}
                onChange={(e) => setzen('city', e.target.value)}
              />
            </span>
          </div>
          <Field
            label="Telefon"
            value={text('phone')}
            onChange={(e) => setzen('phone', e.target.value || null)}
          />
          <Field
            label="E-Mail"
            value={text('email')}
            onChange={(e) => setzen('email', e.target.value || null)}
          />
        </div>
      </Section>

      <Section titel="Steuer" ebene={2}>
        <div className="flex flex-col gap-3">
          <Field
            label="Steuernummer"
            value={eingabe.tax_number}
            onChange={(e) => setzen('tax_number', e.target.value)}
          />
          <Select
            label="Umsatzsteuerlicher Status"
            hint="Bitte selbst setzen — die Anwendung rät ihn nicht. Er entscheidet, ob eine Rechnung Umsatzsteuer ausweist."
            value={steuerstatus}
            onChange={(e) => setSteuerstatus(e.target.value)}
          >
            <option value="">Bitte wählen</option>
            <option value="klein">Kleinunternehmerin (§ 19 UStG), kein Ausweis</option>
            <option value="regel">Regelbesteuerung, Umsatzsteuer wird ausgewiesen</option>
          </Select>
          <Field
            label="Umsatzsteuer-Identifikationsnummer (falls vorhanden)"
            value={text('vat_id')}
            onChange={(e) => setzen('vat_id', e.target.value || null)}
          />
        </div>
      </Section>

      <Section titel="Bankverbindung" ebene={2}>
        <div className="flex flex-col gap-3">
          <Field
            label="Kontoinhaber:in"
            value={text('account_holder')}
            onChange={(e) => setzen('account_holder', e.target.value || null)}
          />
          <Field
            label="IBAN"
            value={eingabe.iban}
            onChange={(e) => setzen('iban', e.target.value)}
          />
          <Field
            label="BIC"
            value={text('bic')}
            onChange={(e) => setzen('bic', e.target.value || null)}
          />
          <Field
            label="Bank"
            value={text('bank_name')}
            onChange={(e) => setzen('bank_name', e.target.value || null)}
          />
        </div>
      </Section>

      <Section titel="Rechnungen" ebene={2}>
        <div className="flex flex-col gap-3">
          <Field
            label="Kürzel der Rechnungsnummer"
            hint="Die Nummer entsteht daraus als Kürzel-Jahr-laufende Zahl, etwa RG-2026-0001."
            value={eingabe.invoice_number_prefix}
            onChange={(e) => setzen('invoice_number_prefix', e.target.value.toUpperCase())}
          />
          <Field
            label="Zahlungsziel in Tagen"
            type="number"
            min={0}
            max={90}
            value={String(eingabe.payment_term_days)}
            onChange={(e) => setzen('payment_term_days', Number(e.target.value))}
          />
        </div>
      </Section>

      {gezeigt && fehler ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {fehler}
        </Statusmeldung>
      ) : null}
      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}
      {speichern.isSuccess ? (
        <Statusmeldung className="mt-3">
          Gespeichert. Ausgestellte Rechnungen bleiben davon unberührt — sie tragen die Angaben, die
          beim Ausstellen galten.
        </Statusmeldung>
      ) : null}

      <div className="mt-4">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
      </div>
    </form>
  );
}
