import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
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
  reimbursementsKey,
  submitElectricity,
  submitPurchase,
  uploadReceipt,
  type Overview,
} from './api';
import { REIMBURSEMENTS_HOME } from './paths';
import {
  daysInMonth,
  electricityCents,
  electricityFormula,
  ibanValid,
  monthLong,
  monthShort,
  normalizeIban,
  selectableMonths,
} from './rules';

/**
 * Erstattung beantragen, geführt (G10, ERS-001, Budget ≤ 7 Tipps + Betrag):
 *
 *   * **Ladestrom** (6): „Erstattung beantragen“ → Ladestrom → Monat →
 *     Arbeitstage (vorgeschlagen aus dem Wochenplan, änderbar) → Erklärung
 *     als Haken → Absenden.
 *   * **Einkauf** (7 und Betrag): „Erstattung beantragen“ → Einkauf → Beleg
 *     fotografieren → Auslösen → Foto verwenden → Betrag und wofür, Weiter →
 *     Absenden; „Weiterer Beleg“ für den nächsten.
 *
 * Je Seite eine Frage, die Antworten im festen Fuß. Ohne hinterlegte IBAN
 * fragt eine Seite mehr nach dem Konto (ANN-601). Der Beleg lädt hoch,
 * während die Person Betrag und Zweck tippt; er gehört bis zum Absenden
 * keinem Antrag (ANN-600). owner trägt ein, es gilt als genehmigt (ANN-598).
 */

type Page = 'kind' | 'month' | 'days' | 'receipt' | 'item' | 'account' | 'summary';

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

  const [flow, setFlow] = useState<Abfolge<Page>>(() => beginne<Page>('kind'));
  const [kind, setKind] = useState<'electricity' | 'purchase' | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [days, setDays] = useState<string>('');
  const [daysFor, setDaysFor] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [iban, setIban] = useState('');
  const [ibanTouched, setIbanTouched] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const page = flow.seite;

  // Vorschaubilder der Belege freigeben, wenn die Seite geht.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const requested = new Set(
    (state.person?.reimbursements ?? [])
      .filter(
        (r) => r.kind === 'electricity' && ['requested', 'approved', 'paid'].includes(r.status),
      )
      .map((r) => r.period_month),
  );

  const preview = useQuery({
    queryKey: [...REIMBURSEMENTS_KEY, 'preview', month],
    queryFn: () => previewElectricity(month!),
    enabled: kind === 'electricity' && month !== null,
    retry: false,
    staleTime: 60_000,
  });
  // Der Vorschlag füllt das Feld einmal je Monat; danach gilt, was getippt ist.
  useEffect(() => {
    if (preview.data && daysFor !== preview.data.month) {
      setDays(String(preview.data.suggested_days));
      setDaysFor(preview.data.month);
    }
  }, [preview.data, daysFor]);

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

  const dayCount = Number.parseInt(days, 10);
  const maxDays = month ? daysInMonth(month) : 31;
  const daysOk = Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= maxDays;

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
        return submitElectricity({ month: month!, workingDays: dayCount, iban: ibanToSend });
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
      (receiptId) => update({ receiptId, upload: 'done' }),
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
  }

  const toAccountOrSummary = () => {
    setFlow((f) =>
      accountNeeded && !ibanEntered ? weiter(f, 'account') : weiter(f, 'summary', true),
    );
  };

  const pages =
    (kind === 'purchase' ? ['kind', 'receipt', 'item'] : ['kind', 'month', 'days']).length +
    (accountNeeded ? 1 : 0) +
    1;
  const step =
    page === 'kind'
      ? 1
      : page === 'month' || page === 'receipt'
        ? 2
        : page === 'days' || page === 'item'
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
    return (
      <GefuehrterAblauf {...common} titel="Für welchen Monat?">
        <div className="flex flex-col gap-2">
          {years.map((year) => (
            <div key={year} role="group" aria-labelledby={`strom-jahr-${year}`}>
              <Zwischentitel id={`strom-jahr-${year}`}>{year}</Zwischentitel>
              <div className="grid grid-cols-3 gap-2">
                {months
                  .filter((m) => m.startsWith(year))
                  .map((m, index) => {
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
                        {...(index === 0 && year === years[0] ? { 'data-autofocus': true } : {})}
                        onClick={() => {
                          setMonth(m);
                          setFlow((f) => weiter(f, 'days'));
                        }}
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
  if (page === 'days' && month) {
    return (
      <GefuehrterAblauf
        {...common}
        titel={`Wie viele Arbeitstage im ${monthLong(month).split(' ')[0]}?`}
        fuss={
          <Button
            className="w-full"
            disabled={!daysOk || !preview.data || preview.data.already_requested}
            onClick={toAccountOrSummary}
          >
            Weiter
          </Button>
        }
      >
        <Abfragezustand
          abfrage={preview}
          laden="Arbeitstage werden gezählt …"
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
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-end gap-2">
                  {/* Auch aus einer leeren oder zu großen Zahl heraus: „+“ beginnt
                      bei 1, „−“ führt in den Monat zurück. */}
                  <Button
                    variant="secondary"
                    aria-label="Ein Tag weniger"
                    disabled={!Number.isInteger(dayCount) || dayCount <= 1}
                    onClick={() => setDays(String(Math.min(dayCount - 1, maxDays)))}
                  >
                    −
                  </Button>
                  <div className="min-w-0 flex-1">
                    <Field
                      label="Arbeitstage"
                      inputMode="numeric"
                      value={days}
                      error={days !== '' && !daysOk ? `1 bis ${maxDays} Tage` : undefined}
                      onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    aria-label="Ein Tag mehr"
                    disabled={Number.isInteger(dayCount) && dayCount >= maxDays}
                    onClick={() =>
                      setDays(String(Number.isInteger(dayCount) ? Math.max(dayCount + 1, 1) : 1))
                    }
                  >
                    +
                  </Button>
                </div>
                <p className="text-ink-muted text-sm">
                  {`Vorschlag ${data.suggested_days}: Ihr Wochenplan ohne Feiertage, Urlaub und Abwesenheit.`}
                </p>
                {daysOk ? (
                  <p className="text-ink">
                    {`${electricityFormula(dayCount, data.wh_per_day, data.cents_per_kwh)} = `}
                    <strong>
                      {formatEuro(electricityCents(dayCount, data.wh_per_day, data.cents_per_kwh))}
                    </strong>
                  </p>
                ) : null}
              </div>
            )
          }
        </Abfragezustand>
      </GefuehrterAblauf>
    );
  }

  // ---------------------------------------------------------------------------
  if (page === 'receipt') {
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
              <label
                className={`rounded-button text-liste has-[:focus-visible]:outline-accent inline-flex min-h-12 w-full cursor-pointer items-center justify-center border px-5 font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
                  camera === 'vorhanden'
                    ? 'border-line-strong text-accent bg-transparent'
                    : 'bg-accent text-surface border-transparent'
                }`}
              >
                {camera === 'vorhanden' ? 'Beleg als Datei' : 'Beleg wählen'}
                <input
                  ref={fileInput}
                  type="file"
                  accept={DATEI_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (file) startUpload(file);
                  }}
                />
              </label>
            </div>
          }
        >
          <p className="text-ink-muted text-sm">
            Ein Foto mit der Kamera der App oder ein PDF, etwa die Rechnung eines Onlineshops.
          </p>
        </GefuehrterAblauf>
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
            <Button
              className="w-full"
              disabled={!itemOk(item) || item.upload !== 'done'}
              onClick={toAccountOrSummary}
            >
              {item.upload === 'running' ? 'Beleg wird übertragen …' : 'Weiter'}
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
  const electricityReady =
    kind === 'electricity' && month !== null && daysOk && !!preview.data && declared;
  const purchaseReady =
    kind === 'purchase' &&
    items.length > 0 &&
    items.every((i) => itemOk(i) && i.upload === 'done' && i.receiptId);
  const ready = accountReady && (electricityReady || purchaseReady);

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
            {submit.isPending ? 'Wird gesendet …' : action}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <ListRows rahmen={false} beschriftung="Erstattung">
          {kind === 'electricity' && month && preview.data ? (
            <>
              <ListRow
                titel={monthLong(month)}
                meta={`${dayCount} Arbeitstage`}
                aktion={
                  <Button
                    variant="secondary"
                    groesse="kompakt"
                    aria-label="Ändern: Arbeitstage"
                    onClick={() => setFlow((f) => aendern(f, 'days'))}
                  >
                    Ändern
                  </Button>
                }
              />
              <ListRow
                titel="Betrag"
                meta={electricityFormula(
                  dayCount,
                  preview.data.wh_per_day,
                  preview.data.cents_per_kwh,
                )}
                betrag={formatEuro(
                  electricityCents(dayCount, preview.data.wh_per_day, preview.data.cents_per_kwh),
                )}
              />
            </>
          ) : null}
          {kind === 'purchase'
            ? items.map((i) => (
                <ListRow
                  key={i.localId}
                  titel={i.purpose.trim() || 'Ohne Zweck'}
                  meta={i.upload === 'done' ? (i.preview ? 'Foto' : 'PDF') : 'wird übertragen …'}
                  betrag={formatEuro(itemCents(i) ?? 0)}
                  aktion={
                    <Button
                      variant="quiet"
                      groesse="kompakt"
                      aria-label={`Entfernen: ${i.purpose.trim() || 'Beleg'}`}
                      onClick={() => removeItem(i.localId)}
                    >
                      Entfernen
                    </Button>
                  }
                />
              ))
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
          // Die Erklärung als Haken der angemeldeten Person (ANN-553, ANN-599).
          <Checkbox
            label="Ich habe das Lastenrad in diesem Monat zu Hause geladen; der Strom wurde mir nicht anders erstattet."
            checked={declared}
            onChange={(e) => setDeclared(e.target.checked)}
          />
        ) : null}
      </div>
    </GefuehrterAblauf>
  );
}
