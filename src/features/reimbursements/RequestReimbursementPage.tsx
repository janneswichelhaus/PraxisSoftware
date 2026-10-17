import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { roleLabels } from '@/components/ui/roleLabels';
import {
  aendern,
  beginne,
  kannZurueck,
  weiter,
  zurueck,
  type Abfolge,
} from '@/components/ui/abfolge';
import { todayInTimeZone } from '@/features/appointments/api';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import { DATEI_ACCEPT } from '@/features/files/dokumentarten';
import { Kameradialog } from '@/features/files/Kameradialog';
import { useKamera } from '@/features/files/kamera';
import type { CurrentUser } from '@/features/session/types';
import { formatEuro, parseEuroZuCent } from '@/lib/geld';
import { leseRueckweg } from '@/lib/rueckweg';
import {
  LOAD_ERROR,
  PREVIEW_ERROR,
  REIMBURSEMENTS_KEY,
  discardReceipt,
  fetchReimbursements,
  previewElectricity,
  previewTourDistance,
  recordTourDistance,
  reimbursementsKey,
  submitElectricity,
  submitPurchase,
  uploadReceipt,
  type Overview,
} from './api';
import { BelowRow } from './BelowRow';
import { REIMBURSEMENTS_HOME } from './paths';
import {
  electricityCentsFromKm,
  electricityHoursFormula,
  electricityKmFormula,
  hoursText,
  ibanValid,
  monthLong,
  monthShort,
  normalizeIban,
  selectableMonths,
} from './rules';

/**
 * Erstattung beantragen, geführt (G10, ERS-001, Budget ≤ 7 Tipps + Betrag):
 *
 *   * **Ladestrom** (5, ORG-008): „Erstattung beantragen“ → Ladestrom → Monat
 *     (der jüngste freie im Fuß) → „zu Hause geladen“ als Haken → Absenden.
 *     Den Betrag rechnet der Server aus den Kilometern der geplanten Touren
 *     (BEF-181, ADR-019 Fassung 6); ohne Ergebnis aus dem Wochenplan und dem
 *     Wert je Stunde (ORG-008). Die Zusammenfassung nennt die Rechnung; nach
 *     dem Absenden trägt der Server die Monatssumme am Antrag ein. Aus dem
 *     Vorschlag im Eingang (`?monat=`) beginnt der Ablauf an der
 *     Zusammenfassung (3).
 *   * **Einkauf** (7 und Betrag): „Erstattung beantragen“ → Einkauf → Beleg
 *     fotografieren → Auslösen → Foto verwenden → Betrag und wofür, Weiter →
 *     Absenden; „Weiterer Beleg“ für den nächsten.
 *
 * Je Seite eine Frage, die Antworten im festen Fuß. Ohne hinterlegte IBAN
 * fragt eine Seite mehr nach dem Konto (ANN-601). Der Beleg lädt hoch,
 * während die Person Betrag und Zweck tippt und weitergeht - nur das
 * Absenden wartet auf ihn (Praxis-Review Überholung 10, Funkloch); er gehört
 * bis zum Absenden keinem Antrag (ANN-600). owner trägt ein, es gilt als
 * genehmigt (ANN-598).
 */

type Page = 'kind' | 'month' | 'receipt' | 'item' | 'account' | 'summary';

/** Der vorgewählte Monat aus dem Eingang (ORG-008), siehe `requestElectricityPath`. */
const MONTH_PARAM = 'monat';

interface Item {
  localId: string;
  file: Blob;
  preview: string | null;
  receiptId: string | null;
  upload: 'running' | 'done' | 'failed';
  error: string | null;
  amount: string;
  purpose: string;
}

const TEXTS = {
  ...EINGABETEXTE,
  bezeichnung: 'Noch nicht beantragt',
  zeile: {
    weitergehen: 'Die Erstattung ist noch nicht beantragt.',
    abmelden: 'Die Erstattung ist noch nicht beantragt – abmelden?',
    bleiben: 'Weiter',
  },
};

export function RequestReimbursementPage({ user }: { user: CurrentUser }) {
  const query = useQuery({
    queryKey: reimbursementsKey(null),
    queryFn: () => fetchReimbursements(null),
    retry: false,
  });
  return (
    <Abfragezustand
      abfrage={query}
      laden="Erstattungen werden geladen …"
      fehler={LOAD_ERROR}
      rahmen={(zustand) => (
        <>
          <PageHeader title="Erstattung beantragen" />
          {zustand}
        </>
      )}
    >
      {(state) => <Flow state={state} user={user} />}
    </Abfragezustand>
  );
}

let nextLocalId = 0;

function Flow({ state, user }: { state: Overview; user: CurrentUser }) {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const returnTo = leseRueckweg(search, REIMBURSEMENTS_HOME);
  const queryClient = useQueryClient();
  const camera = useKamera();
  const today = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');
  const selfEntered = state.can_decide;
  const storedAccount = state.person?.account ?? null;

  const requested = new Set(
    (state.person?.reimbursements ?? [])
      .filter(
        (r) => r.kind === 'electricity' && ['requested', 'approved', 'paid'].includes(r.status),
      )
      .map((r) => r.period_month),
  );

  // Aus dem Vorschlag im Eingang: Ladestrom und Monat sind gewählt, der
  // Ablauf beginnt mit dem Konto oder der Zusammenfassung; „Zurück“ führt
  // zur Wahl des Monats.
  const [preset] = useState(() => {
    const wanted = search.get(MONTH_PARAM);
    return wanted && selectableMonths(today).includes(wanted) && !requested.has(wanted)
      ? wanted
      : null;
  });
  const [flow, setFlow] = useState<Abfolge<Page>>(() =>
    preset
      ? {
          seite: storedAccount === null ? 'account' : 'summary',
          verlauf: ['kind', 'month'],
          rueckkehr: null,
        }
      : beginne<Page>('kind'),
  );
  const [kind, setKind] = useState<'electricity' | 'purchase' | null>(
    preset ? 'electricity' : null,
  );
  const [month, setMonth] = useState<string | null>(preset);
  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [iban, setIban] = useState('');
  const [ibanTouched, setIbanTouched] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Belege, die während ihrer Übertragung entfernt wurden: Kommt die Kennung
  // danach, wird der Beleg gleich verworfen (Zweitreview Runde 2).
  const removedDuringUpload = useRef(new Set<string>());
  const page = flow.seite;

  // Vorschaubilder der Belege freigeben, wenn die Seite geht.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const preview = useQuery({
    queryKey: [...REIMBURSEMENTS_KEY, 'preview', month],
    queryFn: () => previewElectricity(month!),
    enabled: kind === 'electricity' && month !== null,
    retry: false,
    staleTime: 60_000,
  });
  // BEF-181: die Kilometer der geplanten Touren, zur Anzeige - gespeichert
  // wird erst beim Beantragen, vom Server. Ohne Ergebnis `null`, dann gilt
  // der Wert je Stunde.
  const tour = useQuery({
    queryKey: [...REIMBURSEMENTS_KEY, 'tour', month],
    queryFn: () => previewTourDistance(month!),
    enabled: kind === 'electricity' && month !== null,
    retry: false,
    staleTime: 60_000,
  });
  const back = () => {
    const previous = zurueck(flow);
    if (previous) setFlow(previous);
  };

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: kind !== null,
    kompakt: true,
    texte: TEXTS,
    schrittZurueck: kannZurueck(flow) ? back : undefined,
  });

  const accountNeeded = storedAccount === null;
  const ibanEntered = iban.trim() !== '';
  const ibanOk = ibanValid(iban);
  const accountReady = ibanEntered ? ibanOk : !accountNeeded;
  const accountLine = ibanEntered
    ? `${normalizeIban(iban).slice(0, 4)} •••• ${normalizeIban(iban).slice(-4)}`
    : (storedAccount?.iban_masked ?? null);

  const readyItems = items.filter((item) => item.upload === 'done' && item.receiptId);
  const itemCents = (item: Item) => parseEuroZuCent(item.amount);
  const itemOk = (item: Item) => {
    const cents = itemCents(item);
    return cents !== null && cents >= 1 && cents <= 100_000 && item.purpose.trim() !== '';
  };
  const sum = items.reduce((total, item) => total + (itemCents(item) ?? 0), 0);

  const submit = useMutation({
    mutationFn: async () => {
      const ibanToSend = ibanEntered ? normalizeIban(iban) : null;
      if (kind === 'electricity') {
        const submitted = await submitElectricity({
          month: month!,
          declared,
          iban: ibanToSend,
        });
        // Der Server rechnet die Touren neu und trägt die Summe ein; ohne
        // Ergebnis bleibt der Betrag nach Stunden.
        const recorded = await recordTourDistance(month!, submitted.id);
        return recorded ? { ...submitted, amount_cents: recorded.amountCents } : submitted;
      }
      return submitPurchase({
        items: readyItems.map((item) => ({
          receiptId: item.receiptId!,
          amountCents: itemCents(item)!,
          purpose: item.purpose.trim(),
        })),
        iban: ibanToSend,
      });
    },
    onSuccess: async (result) => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: REIMBURSEMENTS_KEY });
      const what = kind === 'electricity' && month ? `Ladestrom ${monthLong(month)}` : 'Einkauf';
      void navigate(returnTo, {
        state: {
          meldung:
            result.status === 'approved'
              ? `${what} eingetragen: ${formatEuro(result.amount_cents)}. Er gilt als genehmigt.`
              : `${what} beantragt: ${formatEuro(result.amount_cents)}. Es entscheidet: ${roleLabels.owner}.`,
        },
      });
    },
  });

  function startUpload(file: Blob) {
    const localId = `beleg-${(nextLocalId += 1)}`;
    const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    if (url) previews.current.push(url);
    setItems((all) => [
      ...all,
      {
        localId,
        file,
        preview: url,
        receiptId: null,
        upload: 'running',
        error: null,
        amount: '',
        purpose: '',
      },
    ]);
    setCurrent(localId);
    runUpload(localId, file);
    setFlow((f) => weiter(f, 'item'));
  }

  function runUpload(localId: string, file: Blob) {
    const update = (patch: Partial<Item>) =>
      setItems((all) =>
        all.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
      );
    update({ upload: 'running', error: null });
    uploadReceipt(file).then(
      (receiptId) => {
        if (removedDuringUpload.current.has(localId)) {
          void discardReceipt(receiptId).catch(() => undefined);
          return;
        }
        update({ receiptId, upload: 'done' });
      },
      (failure: unknown) =>
        update({
          upload: 'failed',
          error:
            failure instanceof Error
              ? failure.message
              : 'Der Beleg konnte nicht übertragen werden.',
        }),
    );
  }

  function removeItem(localId: string) {
    const item = items.find((i) => i.localId === localId);
    setItems((all) => all.filter((i) => i.localId !== localId));
    // Nur ein Beleg ohne Antrag; fällt das aus, räumt der tägliche Lauf auf.
    if (item?.receiptId) void discardReceipt(item.receiptId).catch(() => undefined);
    else if (item?.upload === 'running') removedDuringUpload.current.add(localId);
  }

  const toAccountOrSummary = () => {
    setFlow((f) =>
      accountNeeded && !ibanEntered ? weiter(f, 'account') : weiter(f, 'summary', true),
    );
  };

  const pages =
    (kind === 'purchase' ? ['kind', 'receipt', 'item'] : ['kind', 'month']).length +
    (accountNeeded ? 1 : 0) +
    1;
  const step =
    page === 'kind'
      ? 1
      : page === 'month' || page === 'receipt'
        ? 2
        : page === 'item'
          ? 3
          : page === 'account'
            ? pages - 1
            : pages;
  const common = {
    objekt: 'Erstattung beantragen',
    schliessen: 'Schließen',
    onSchliessen: () => void navigate(returnTo),
    seite: page,
    stand: kind ? { text: `Schritt ${step} von ${pages}`, wert: step, von: pages } : undefined,
    onZurueck: kannZurueck(flow) ? back : undefined,
    schutz,
  };

  const cameraDialog = cameraOpen ? (
    <Kameradialog
      titel="Beleg fotografieren"
      hinweis="Den ganzen Beleg ins Bild, gerade und gut lesbar - Betrag und Händler müssen erkennbar sein."
      onAufnahme={(photo) => {
        setCameraOpen(false);
        startUpload(photo);
      }}
      onSchliessen={() => setCameraOpen(false)}
    />
  ) : null;

  // ---------------------------------------------------------------------------
  if (page === 'kind') {
    return (
      <GefuehrterAblauf
        {...common}
        titel="Was erstatten?"
        fuss={
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              className="w-full"
              data-autofocus
              onClick={() => {
                setKind('electricity');
                setFlow((f) => weiter(f, 'month'));
              }}
            >
              Ladestrom für das Lastenrad
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setKind('purchase');
                setFlow((f) => weiter(f, 'receipt'));
              }}
            >
              Einkauf mit Beleg
            </Button>
          </div>
        }
      >
        <p className="text-ink-muted text-sm">
          {selfEntered
            ? 'Sie tragen selbst ein; es gilt sofort als genehmigt.'
            : `Es entscheidet: ${roleLabels.owner}.`}
        </p>
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  if (page === 'month') {
    const months = selectableMonths(today);
    const years = [...new Set(months.map((m) => m.slice(0, 4)))];
    // Der jüngste freie Monat ist die Antwort im Fuß, die übrigen stehen
    // darüber (Design- und Praxis-Review Überholung 10).
    const newest = months.find((m) => !requested.has(m)) ?? null;
    const pick = (m: string) => {
      // Die Erklärung gilt dem Monat: Ein anderer Monat braucht sie neu.
      if (m !== month) setDeclared(false);
      setMonth(m);
      toAccountOrSummary();
    };
    return (
      <GefuehrterAblauf
        {...common}
        titel="Für welchen Monat?"
        fuss={
          newest ? (
            <Button className="w-full" data-autofocus onClick={() => pick(newest)}>
              {monthLong(newest)}
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-2">
          {years.map((year) => (
            <div key={year} role="group" aria-labelledby={`strom-jahr-${year}`}>
              <Zwischentitel id={`strom-jahr-${year}`}>{year}</Zwischentitel>
              <div className="grid grid-cols-3 gap-2">
                {months
                  .filter((m) => m.startsWith(year))
                  .map((m) => {
                    const done = requested.has(m);
                    return (
                      <Button
                        key={m}
                        variant={month === m ? 'primary' : 'secondary'}
                        className="w-full"
                        disabled={done}
                        // Der Name beginnt mit dem sichtbaren Wort (WCAG 2.5.3).
                        aria-label={`${monthShort(m)} ${year}${done ? ', schon beantragt' : ''}`}
                        aria-pressed={month === m}
                        onClick={() => pick(m)}
                      >
                        <span className="flex flex-col items-center leading-tight">
                          {monthShort(m)}
                          {done ? <span className="text-xs font-normal">✓ beantragt</span> : null}
                        </span>
                      </Button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  if (page === 'receipt') {
    const fileLabel = camera === 'vorhanden' ? 'Beleg als Datei' : 'Beleg wählen';
    return (
      <>
        <GefuehrterAblauf
          {...common}
          titel={items.length === 0 ? 'Beleg?' : 'Weiterer Beleg?'}
          fuss={
            <div className="flex flex-col gap-2">
              {camera === 'vorhanden' ? (
                <Button className="w-full" data-autofocus onClick={() => setCameraOpen(true)}>
                  Beleg fotografieren
                </Button>
              ) : null}
              {/* Ein Knopf des Systems öffnet die Dateiwahl; das Feld selbst
                  bleibt unsichtbar, wie am Foto der Akte (Design-Review
                  Überholung 10). */}
              <Button
                variant={camera === 'vorhanden' ? 'secondary' : 'primary'}
                className="w-full"
                {...(camera === 'vorhanden' ? {} : { 'data-autofocus': true })}
                onClick={() => fileInput.current?.click()}
              >
                {fileLabel}
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept={DATEI_ACCEPT}
                aria-label={fileLabel}
                tabIndex={-1}
                className="sr-only"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = '';
                  if (file) startUpload(file);
                }}
              />
            </div>
          }
        />
        {cameraDialog}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  const item = items.find((i) => i.localId === current);
  if (page === 'item' && item) {
    const cents = itemCents(item);
    const amountError =
      item.amount !== '' && (cents === null || cents < 1 || cents > 100_000)
        ? 'Ein Betrag bis 1.000 €, etwa 12,90'
        : undefined;
    const update = (patch: Partial<Item>) =>
      setItems((all) => all.map((i) => (i.localId === item.localId ? { ...i, ...patch } : i)));
    return (
      <GefuehrterAblauf
        {...common}
        titel="Wie viel und wofür?"
        fuss={
          <div className="flex flex-col gap-2">
            {item.upload === 'failed' ? (
              <>
                <Statusmeldung ton="fehler">{item.error}</Statusmeldung>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => runUpload(item.localId, item.file)}
                >
                  Erneut übertragen
                </Button>
              </>
            ) : null}
            {/* Weiter wartet nicht auf die Übertragung - erst das Absenden. */}
            <Button className="w-full" disabled={!itemOk(item)} onClick={toAccountOrSummary}>
              Weiter
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {item.preview ? (
            <img
              src={item.preview}
              alt="Der fotografierte Beleg"
              className="bg-surface-sunken rounded-image h-32 w-full object-contain"
            />
          ) : (
            <p className="text-ink-muted text-sm">PDF ausgewählt.</p>
          )}
          <Field
            label="Betrag in €"
            inputMode="decimal"
            placeholder="0,00"
            autoComplete="off"
            data-autofocus
            value={item.amount}
            error={amountError}
            onChange={(e) => update({ amount: e.target.value })}
          />
          <Field
            label="Wofür?"
            placeholder="z. B. Massageöl"
            maxLength={200}
            value={item.purpose}
            onChange={(e) => update({ purpose: e.target.value })}
          />
        </div>
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  if (page === 'account') {
    return (
      <GefuehrterAblauf
        {...common}
        titel="Auf welches Konto?"
        fuss={
          <Button
            className="w-full"
            disabled={!ibanOk}
            onClick={() => setFlow((f) => weiter(f, 'summary', true))}
          >
            Weiter
          </Button>
        }
      >
        {/* Großbuchstaben, keine Autokorrektur und keine Vorschläge: Am
            Telefon kann die Autokorrektur die IBAN beim Tippen verändern. */}
        <Field
          label="IBAN"
          placeholder="DE89 3704 0044 0532 0130 00"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          data-autofocus
          value={iban}
          error={
            ibanTouched && ibanEntered && !ibanOk
              ? 'Die IBAN stimmt nicht – bitte die Ziffern prüfen.'
              : undefined
          }
          onBlur={() => setIbanTouched(true)}
          onChange={(e) => setIban(e.target.value)}
        />
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  const action =
    kind === 'electricity'
      ? selfEntered
        ? 'Ladestrom eintragen'
        : 'Ladestrom beantragen'
      : selfEntered
        ? 'Einkauf eintragen'
        : 'Einkauf beantragen';
  const offer = preview.data;
  const tourKm = tour.data ?? null;
  const electricityReady =
    kind === 'electricity' &&
    month !== null &&
    !!offer &&
    !tour.isFetching &&
    !offer.already_requested &&
    offer.amount_cents >= 1 &&
    declared;
  const purchaseReady =
    kind === 'purchase' &&
    items.length > 0 &&
    items.every((i) => itemOk(i) && i.upload === 'done' && i.receiptId);
  const ready = accountReady && (electricityReady || purchaseReady);
  const uploading = kind === 'purchase' && items.some((i) => i.upload === 'running');

  return (
    <GefuehrterAblauf
      {...common}
      titel={`${action}?`}
      abschluss
      fuss={
        <div className="flex flex-col gap-2">
          {submit.isError ? (
            <Statusmeldung ton="fehler">
              {submit.error instanceof Error
                ? submit.error.message
                : 'Die Erstattung konnte nicht beantragt werden.'}
            </Statusmeldung>
          ) : null}
          <Button
            className="w-full"
            disabled={!ready || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? 'Wird gesendet …' : uploading ? 'Beleg wird übertragen …' : action}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <ListRows rahmen={false} beschriftung="Erstattung">
          {kind === 'electricity' && month ? (
            <>
              {/* Je Angabe ein „Ändern“ (Design-Review Überholung 10). */}
              <ListRow
                titel={monthLong(month)}
                aktion={
                  <Button
                    variant="secondary"
                    groesse="kompakt"
                    aria-label="Ändern: Monat"
                    onClick={() => setFlow((f) => aendern(f, 'month'))}
                  >
                    Ändern
                  </Button>
                }
              />
              {offer && tour.isFetching ? (
                <ListRow titel="Betrag" meta="Strecke der geplanten Touren wird berechnet …" />
              ) : offer && tourKm ? (
                <>
                  <ListRow
                    titel={`${tourKm.km} km geplante Touren`}
                    meta={
                      tourKm.source === 'nachbildung'
                        ? 'Summe der Routen je Tag · Nachbildung ohne Kartendienst'
                        : 'Summe der Routen je Tag'
                    }
                  />
                  <ListRow
                    titel="Betrag"
                    meta={electricityKmFormula(tourKm.km, offer.wh_per_km, offer.cents_per_kwh)}
                    betrag={formatEuro(
                      electricityCentsFromKm(tourKm.km, offer.wh_per_km, offer.cents_per_kwh),
                    )}
                  />
                </>
              ) : offer ? (
                <>
                  <ListRow
                    titel={`${hoursText(offer.working_minutes)} Arbeitszeit`}
                    meta="Wochenplan ohne Feiertage, Urlaub und Abwesenheit"
                  />
                  <ListRow
                    titel="Betrag"
                    meta={electricityHoursFormula(
                      offer.working_minutes,
                      offer.km_per_hour,
                      offer.wh_per_km,
                      offer.cents_per_kwh,
                    )}
                    betrag={formatEuro(offer.amount_cents)}
                  />
                </>
              ) : null}
            </>
          ) : null}
          {kind === 'purchase'
            ? items.map((i) => {
                const label = i.purpose.trim() || 'Beleg';
                return (
                  <ListRow
                    key={i.localId}
                    titel={i.purpose.trim() || 'Ohne Zweck'}
                    meta={i.upload === 'running' ? 'wird übertragen …' : i.preview ? 'Foto' : 'PDF'}
                    betrag={formatEuro(itemCents(i) ?? 0)}
                    status={
                      i.upload === 'failed' ? <Badge ton="kritisch">Nicht übertragen</Badge> : null
                    }
                    aktion={
                      <Button
                        variant="secondary"
                        groesse="kompakt"
                        aria-label={`Ändern: ${label}`}
                        onClick={() => {
                          setCurrent(i.localId);
                          setFlow((f) => aendern(f, 'item'));
                        }}
                      >
                        Ändern
                      </Button>
                    }
                    darunter={
                      // Leise am Ende, mit Rückfrage (DESIGN.md 9.16).
                      <BelowRow>
                        {i.upload === 'failed' ? (
                          <Button
                            variant="secondary"
                            groesse="kompakt"
                            onClick={() => runUpload(i.localId, i.file)}
                          >
                            Erneut übertragen
                          </Button>
                        ) : null}
                        <Rueckfrage
                          ausloeser="Entfernen"
                          ausloeserVariante="quiet"
                          ausloeserGroesse="kompakt"
                          ausloeserZusatz={`– ${label}`}
                          bezeichnung={`${label} entfernen`}
                          bestaetigen="Ja, entfernen"
                          onBestaetigen={() => removeItem(i.localId)}
                        >
                          {`Den Beleg „${label}“ verwerfen?`}
                        </Rueckfrage>
                      </BelowRow>
                    }
                  />
                );
              })
            : null}
          {kind === 'purchase' && items.length > 1 ? (
            <ListRow titel="Summe" betrag={formatEuro(sum)} />
          ) : null}
          <ListRow
            titel={accountLine ? `Auszahlung auf ${accountLine}` : 'Noch keine IBAN'}
            aktion={
              <Button
                variant="secondary"
                groesse="kompakt"
                aria-label="Ändern: IBAN"
                onClick={() => setFlow((f) => aendern(f, 'account'))}
              >
                Ändern
              </Button>
            }
          />
          <ListRow
            titel={selfEntered ? 'Sie tragen selbst ein' : 'Entscheidet'}
            meta={selfEntered ? 'Es gilt sofort als genehmigt.' : roleLabels.owner}
          />
        </ListRows>
        {kind === 'purchase' && items.length < 10 ? (
          <div>
            <Button variant="secondary" onClick={() => setFlow((f) => aendern(f, 'receipt'))}>
              Weiterer Beleg
            </Button>
          </div>
        ) : null}
        {kind === 'electricity' ? (
          <Abfragezustand
            abfrage={preview}
            laden="Ladestrom wird berechnet …"
            fehler={PREVIEW_ERROR}
            endgueltig={{
              wenn: (failure) => failure instanceof Error && failure.message !== PREVIEW_ERROR,
              titel: preview.error instanceof Error ? preview.error.message : PREVIEW_ERROR,
            }}
          >
            {(data) =>
              data.already_requested ? (
                <Statusmeldung ton="fehler">
                  Für diesen Monat ist Ladestrom schon beantragt.
                </Statusmeldung>
              ) : data.amount_cents < 1 ? (
                <Statusmeldung ton="fehler">
                  In diesem Monat sind keine Arbeitsstunden geplant – es gibt nichts zu erstatten.
                </Statusmeldung>
              ) : (
                // Die Erklärung als Haken der angemeldeten Person (ANN-553):
                // eine Wahl im Ablauf, keine gespeicherte Ortsangabe (ORG-008).
                <Checkbox
                  label="Ich habe das Lastenrad in diesem Monat zu Hause geladen; der Strom wurde mir nicht anders erstattet."
                  hint="Im Depot lädt die Praxis selbst – dann gibt es nichts zu erstatten."
                  checked={declared}
                  onChange={(e) => setDeclared(e.target.checked)}
                />
              )
            }
          </Abfragezustand>
        ) : null}
      </div>
    </GefuehrterAblauf>
  );
}
