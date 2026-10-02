import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { alsFormularfehler, type Formularfehler } from '@/lib/formularfehler';
import { canManageBillingProfile, type CurrentUser } from '@/features/session/types';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import { fetchPraxisStammdaten, savePraxisStammdaten, type PraxisStammdaten } from './api';
import { ibanInGruppen } from './anzeige';

/**
 * Praxisstammdaten für Rechnungen (ABR-000).
 *
 * Das, was auf jeder Rechnung oben steht: Absender, Bankverbindung,
 * Steuernummer und der umsatzsteuerliche Status. Beim Ausstellen wandern
 * diese Angaben in den Snapshot der Rechnung und ändern sich dort nie wieder
 * (ADR-009 Punkt 10) — eine spätere Korrektur hier gilt für neue Rechnungen,
 * nicht für ausgestellte.
 *
 * **Der Umsatzsteuerstatus ist nicht vorbelegt.** Weder „Kleinunternehmer:in"
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
  tax_number: null,
  vat_id: null,
  small_business: false,
  bank_name: null,
  account_holder: null,
  iban: '',
  bic: null,
  invoice_number_prefix: 'RG',
  training_invoice_number_prefix: 'TR',
  payment_term_days: 14,
};

/** Die Sätze des Verlustschutzes für dieses Formular (ABR-14, NAV-01, ANN-046). */
const STAMMDATENTEXTE = { ...EINGABETEXTE, bezeichnung: 'Ungespeicherte Praxisstammdaten' };

/**
 * Die Prüfziffer der IBAN nach ISO 13616 (mod 97 == 1).
 *
 * Dieselbe Rechnung führt `app.iban_checksum_ok` in der Datenbank (R3-010);
 * verbindlich ist die dort, weil sie an der Tabelle hängt. Hier steht sie,
 * damit ein Zahlendreher auffällt, bevor er in den Snapshot der nächsten
 * Rechnung wandert.
 */
function pruefzifferStimmt(iban: string): boolean {
  const geputzt = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(geputzt)) return false;

  const umgestellt = geputzt.slice(4) + geputzt.slice(0, 4);

  // Stellenweise gerechnet: Die umgestellte IBAN hat als Zahl mehr Stellen,
  // als eine Gleitkommazahl genau trägt.
  let rest = 0;
  for (const zeichen of umgestellt) {
    if (zeichen >= '0' && zeichen <= '9') {
      rest = (rest * 10 + Number(zeichen)) % 97;
    } else {
      rest = (rest * 100 + (zeichen.charCodeAt(0) - 55)) % 97;
    }
  }
  return rest === 1;
}

/** Die Felder, an denen eine Meldung stehen kann - in der Reihenfolge des Formulars. */
const PRUEFFELDER = [
  'legal_name',
  'street',
  'postal_code',
  'city',
  'tax_number',
  'steuerstatus',
  'iban',
  'training_invoice_number_prefix',
] as const;

type Prueffeld = (typeof PRUEFFELDER)[number];

const BESCHRIFTUNG: Record<Prueffeld, string> = {
  legal_name: 'Praxis',
  street: 'Straße',
  postal_code: 'PLZ',
  city: 'Ort',
  tax_number: 'Steuernummer oder USt-IdNr.',
  steuerstatus: 'Umsatzsteuerlicher Status',
  iban: 'IBAN',
  training_invoice_number_prefix: 'Kürzel der Rechnungsnummer (Training)',
};

function feldId(feld: Prueffeld): string {
  return `stammdaten-${feld}`;
}

/**
 * Was fehlt — **alles** auf einmal, jedes an seinem Feld (ABR-20). Leer
 * heißt: die Angaben reichen für eine Rechnung.
 *
 * Die Regeln sind dieselben wie bis UXR-010. Bis dahin kam nur der erste
 * Mangel zurück, als Zeile unten am Knopf; wer speicherte, arbeitete sich
 * Fehler für Fehler durch.
 */
function pruefe(
  eingabe: PraxisStammdaten,
  steuerstatus: string,
): Partial<Record<Prueffeld, string>> {
  const fehler: Partial<Record<Prueffeld, string>> = {};
  if (eingabe.legal_name.trim() === '') fehler.legal_name = 'Bitte ausfüllen.';
  if (eingabe.street.trim() === '') fehler.street = 'Bitte ausfüllen.';
  if (eingabe.postal_code.trim() === '') fehler.postal_code = 'Bitte ausfüllen.';
  if (eingabe.city.trim() === '') fehler.city = 'Bitte ausfüllen.';
  // ABN-008: eine von beiden genügt (§ 14 Abs. 4 Nr. 2 UStG).
  if ((eingabe.tax_number ?? '').trim() === '' && (eingabe.vat_id ?? '').trim() === '')
    fehler.tax_number = 'Bitte eine von beiden angeben.';
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(eingabe.iban.replace(/\s/g, '').toUpperCase()))
    fehler.iban = 'Bitte die vollständige IBAN eingeben.';
  else if (!pruefzifferStimmt(eingabe.iban))
    fehler.iban = 'Die IBAN stimmt nicht – bitte die Ziffern prüfen.';
  if (steuerstatus === '') fehler.steuerstatus = 'Bitte wählen.';
  // ADR-009 Punkt 17: lückenlos je Kreis, einmalig über alle. Zwei Kreise mit
  // demselben Kürzel gäben dieselbe Nummer zweimal. Verbindlich ist die
  // Prüfung im Schreibpfad; hier steht sie, bevor das Formular abschickt.
  if (
    eingabe.invoice_number_prefix.trim().toUpperCase() ===
    eingabe.training_invoice_number_prefix.trim().toUpperCase()
  )
    fehler.training_invoice_number_prefix =
      'Die beiden Kürzel der Rechnungsnummer müssen sich unterscheiden.';
  return fehler;
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
        title="Praxisstammdaten"
        description="Der Absender jeder Rechnung: Anschrift, Bankverbindung, Steuernummer."
      />

      {stammdaten.isPending ? <LoadingState label="Stammdaten werden geladen …" /> : null}
      {stammdaten.isError ? (
        <ErrorState
          title="Die Praxisstammdaten konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => stammdaten.refetch()}
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
        Es sind noch keine Praxisstammdaten erfasst. Ohne sie lässt sich keine Rechnung ausstellen;
        erfassen kann sie die Praxisinhaber:in.
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
        {stammdaten.tax_number ? (
          <DetailRow label="Steuernummer">{stammdaten.tax_number}</DetailRow>
        ) : null}
        {stammdaten.vat_id ? <DetailRow label="USt-IdNr.">{stammdaten.vat_id}</DetailRow> : null}
        <DetailRow label="Umsatzsteuer">
          {stammdaten.small_business ? 'Kleinunternehmer:in (§ 19 UStG)' : 'Regelbesteuerung'}
        </DetailRow>
        {/* In Vierergruppen, wie sie auf Papier steht (ABR-28). */}
        <DetailRow label="IBAN">{ibanInGruppen(stammdaten.iban)}</DetailRow>
        {/* ABR-010: ein Nummernkreis je Leistungsbereich (ADR-009 Punkt 17). */}
        <DetailRow label="Nummernkreise">
          {`Behandlung ${stammdaten.invoice_number_prefix} · Training ${stammdaten.training_invoice_number_prefix}`}
        </DetailRow>
        <DetailRow label="Zahlungsziel">{stammdaten.payment_term_days} Tage</DetailRow>
      </DetailList>
    </Section>
  );
}

/** Was gespeichert ist - oder, vor dem ersten Speichern, was geladen wurde. */
interface Stand {
  eingabe: PraxisStammdaten;
  steuerstatus: string;
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
  const [stand, setStand] = useState<Stand>({ eingabe, steuerstatus });
  // Die Meldungen am Feld verschwinden mit der nächsten Eingabe dort; die
  // Zusammenfassung bleibt bis zum nächsten Speichern stehen - sie wechselt
  // nicht unter der Hand, während jemand ein Feld nach dem anderen behebt.
  const [fehler, setFehler] = useState<Partial<Record<Prueffeld, string>>>({});
  const [zusammenfassung, setZusammenfassung] = useState<Formularfehler[]>([]);

  const speichern = useMutation({
    mutationFn: (werte: Stand) =>
      savePraxisStammdaten({ ...werte.eingabe, small_business: werte.steuerstatus === 'klein' }),
    onSuccess: (_ergebnis, werte) => {
      setStand(werte);
      onGespeichert();
    },
  });

  // Schutz vor dem stillen Verlust (ABR-14, NAV-01, ANN-046): Stammdaten
  // kennen keinen Entwurf, also nur „Verwerfen und weitergehen" und „Hier
  // bleiben". Verglichen wird mit dem, was zuletzt gespeichert wurde.
  const ungespeichert = JSON.stringify({ eingabe, steuerstatus }) !== JSON.stringify(stand);
  const schutz = useTextverlustschutz({ ungespeichert, texte: STAMMDATENTEXTE });

  function geaendert(feld?: Prueffeld) {
    // „Gespeichert." gilt dem gespeicherten Stand, nicht dem getippten.
    if (speichern.isSuccess) speichern.reset();
    if (feld && fehler[feld]) setFehler((alt) => ({ ...alt, [feld]: undefined }));
  }

  function setzen<K extends keyof PraxisStammdaten>(feld: K, wert: PraxisStammdaten[K]) {
    setEingabe((alt) => ({ ...alt, [feld]: wert }));
    geaendert((PRUEFFELDER as readonly string[]).includes(feld) ? (feld as Prueffeld) : undefined);
    // Die Kürzel prüfen sich gegenseitig: Eine Änderung am einen nimmt die
    // Meldung am anderen mit.
    if (feld === 'invoice_number_prefix') geaendert('training_invoice_number_prefix');
  }

  function text(feld: keyof PraxisStammdaten): string {
    const wert = eingabe[feld];
    return typeof wert === 'string' ? wert : '';
  }

  function absenden(ereignis: FormEvent) {
    ereignis.preventDefault();
    if (speichern.isPending) return;
    const gefunden = pruefe(eingabe, steuerstatus);
    setFehler(gefunden);
    setZusammenfassung(alsFormularfehler(PRUEFFELDER, BESCHRIFTUNG, gefunden, feldId));
    if (Object.keys(gefunden).length === 0) speichern.mutate({ eingabe, steuerstatus });
  }

  return (
    // Formularbreite statt Seitenbreite (ABR-23): Bei 1440 px waren Praxis und
    // IBAN rund 1100 px breit.
    <form onSubmit={absenden} className="max-w-xl">
      <p className="text-ink-muted mb-6 text-sm">Mit * markierte Felder sind erforderlich.</p>

      <Fehlerzusammenfassung fehler={zusammenfassung} />

      <Section titel="Absender">
        <Feldgruppe>
          <Field
            label="Praxis *"
            feldId={feldId('legal_name')}
            error={fehler.legal_name}
            value={eingabe.legal_name}
            onChange={(e) => setzen('legal_name', e.target.value)}
          />
          <div className="flex gap-4">
            <span className="flex-1">
              <Field
                label="Straße *"
                feldId={feldId('street')}
                error={fehler.street}
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
          <div className="flex gap-4">
            <span className="w-28">
              {/* Ziffernfeld am Handy und die Postleitzahl als Vorschlag (RSP-12). */}
              <Field
                label="PLZ *"
                feldId={feldId('postal_code')}
                error={fehler.postal_code}
                inputMode="numeric"
                autoComplete="postal-code"
                value={eingabe.postal_code}
                onChange={(e) => setzen('postal_code', e.target.value)}
              />
            </span>
            <span className="flex-1">
              <Field
                label="Ort *"
                feldId={feldId('city')}
                error={fehler.city}
                value={eingabe.city}
                onChange={(e) => setzen('city', e.target.value)}
              />
            </span>
          </div>
          <Field
            label="Telefon"
            type="tel"
            value={text('phone')}
            onChange={(e) => setzen('phone', e.target.value || null)}
          />
          {/* Die Tastatur mit @, ohne die Prüfung des Browsers: `type="email"`
              hätte das Absenden dieses Formulars geändert (RSP-12). */}
          <Field
            label="E-Mail"
            inputMode="email"
            value={text('email')}
            onChange={(e) => setzen('email', e.target.value || null)}
          />
        </Feldgruppe>
      </Section>

      <Section titel="Steuer" ebene={2}>
        <Feldgruppe>
          <Field
            label="Steuernummer"
            feldId={feldId('tax_number')}
            hint="Steuernummer oder USt-IdNr. – eine von beiden muss stehen."
            error={fehler.tax_number}
            value={text('tax_number')}
            onChange={(e) => setzen('tax_number', e.target.value || null)}
          />
          {/* Kurze Optionen, die Folge im Hinweis: Bei 390 px war der Satz im
              Auswahlfeld abgeschnitten (ABR-B07). Keine Vorbelegung (ANN-074). */}
          <Select
            label="Umsatzsteuerlicher Status *"
            feldId={feldId('steuerstatus')}
            error={fehler.steuerstatus}
            hint="Bitte selbst setzen – die Anwendung rät ihn nicht. Bei Regelbesteuerung weist die Rechnung Umsatzsteuer aus, als Kleinunternehmer:in nicht."
            value={steuerstatus}
            onChange={(e) => {
              setSteuerstatus(e.target.value);
              geaendert('steuerstatus');
            }}
          >
            <option value="">Bitte wählen …</option>
            <option value="klein">Kleinunternehmer:in (§ 19 UStG)</option>
            <option value="regel">Regelbesteuerung</option>
          </Select>
          <Field
            label="Umsatzsteuer-Identifikationsnummer"
            value={text('vat_id')}
            onChange={(e) => setzen('vat_id', e.target.value || null)}
          />
        </Feldgruppe>
      </Section>

      <Section titel="Bankverbindung" ebene={2}>
        <Feldgruppe>
          <Field
            label="Kontoinhaber:in"
            value={text('account_holder')}
            onChange={(e) => setzen('account_holder', e.target.value || null)}
          />
          <Field
            label="IBAN *"
            feldId={feldId('iban')}
            error={fehler.iban}
            autoCapitalize="characters"
            spellCheck={false}
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
        </Feldgruppe>
      </Section>

      <Section titel="Rechnungen" ebene={2}>
        <Feldgruppe>
          <Field
            label="Kürzel der Rechnungsnummer (Behandlung)"
            hint="Die Nummer entsteht daraus als Kürzel-Jahr-laufende Zahl, etwa RG-2026-0001."
            value={eingabe.invoice_number_prefix}
            onChange={(e) => setzen('invoice_number_prefix', e.target.value.toUpperCase())}
          />
          <Field
            label="Kürzel der Rechnungsnummer (Training)"
            feldId={feldId('training_invoice_number_prefix')}
            error={fehler.training_invoice_number_prefix}
            hint="Jeder Bereich führt seinen eigenen, lückenlosen Kreis. Die beiden Kürzel müssen sich unterscheiden – sonst gäbe es dieselbe Nummer zweimal."
            value={eingabe.training_invoice_number_prefix}
            onChange={(e) => setzen('training_invoice_number_prefix', e.target.value.toUpperCase())}
          />
          <Field
            label="Zahlungsziel in Tagen"
            type="number"
            min={0}
            max={90}
            value={String(eingabe.payment_term_days)}
            onChange={(e) => setzen('payment_term_days', Number(e.target.value))}
          />
        </Feldgruppe>
      </Section>

      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-3">
          {speichern.error.message} Die Eingaben stehen noch im Formular. Bitte die Verbindung
          prüfen und erneut speichern.
        </Statusmeldung>
      ) : null}
      {speichern.isSuccess ? (
        <Statusmeldung ton="erfolg" className="mt-3">
          Gespeichert. Ausgestellte Rechnungen bleiben davon unberührt – sie tragen die Angaben, die
          beim Ausstellen galten.
        </Statusmeldung>
      ) : null}

      {schutz.schutz}

      <div className="mt-4">
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
      </div>
    </form>
  );
}
