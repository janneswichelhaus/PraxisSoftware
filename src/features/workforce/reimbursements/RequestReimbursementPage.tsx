import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { roleLabels } from '@/components/ui/roleLabels';
import {
  aendern,
  beginne,
  kannZurueck,
  weiter,
  zurueck,
  type Abfolge,
} from '@/components/ui/abfolge';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { DATEI_ACCEPT } from '@/lib/dateien/pruefung';
import { Kameradialog } from '@/components/ui/Kameradialog';
import { useKamera } from '@/lib/dateien/kamera';
import type { CurrentUser } from '@/features/core';
import { formatEuro, parseEuroZuCent } from '@/lib/geld';
import { leseRueckweg } from '@/lib/rueckweg';
import {
  LOAD_ERROR,
  REIMBURSEMENTS_KEY,
  discardReceipt,
  fetchReimbursements,
  reimbursementsKey,
  submitPurchase,
  uploadReceipt,
  type Overview,
} from './api';
import { BelowRow } from './BelowRow';
import { REIMBURSEMENTS_HOME } from './paths';
import { electricityPurpose, ibanValid, normalizeIban } from './rules';
import { todayInTimeZone } from '@/lib/datum';

/**
 * Erstattung beantragen, geführt (G10): Ladestrom geht denselben Weg wie ein Einkauf, mit Beleg,
 * Betrag und vorbelegtem Zweck (ANN-749). Der Beleg lädt hoch, während die Person tippt - nur das
 * Absenden wartet auf ihn (Funkloch); ohne hinterlegte IBAN fragt eine Seite mehr (ANN-601).
 */

type Page = 'kind' | 'receipt' | 'item' | 'account' | 'summary';

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
  // Nur der Einstieg: Beantragt wird in beiden Fällen ein Einkauf (ANN-749).
  const [entry, setEntry] = useState<'electricity' | 'purchase' | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [iban, setIban] = useState('');
  const [ibanTouched, setIbanTouched] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Belege, die während ihrer Übertragung entfernt wurden: Kommt die Kennung
  // danach, wird der Beleg gleich verworfen (Zweitreview Runde 2).
  const removedDuringUpload = useRef(new Set<string>());
  const page = flow.seite;

  // Vorschaubilder der Belege freigeben, wenn die Seite geht.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const back = () => {
    const previous = zurueck(flow);
    if (previous) setFlow(previous);
  };

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: entry !== null,
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
    mutationFn: () =>
      submitPurchase({
        items: readyItems.map((item) => ({
          receiptId: item.receiptId!,
          amountCents: itemCents(item)!,
          purpose: item.purpose.trim(),
        })),
        iban: ibanEntered ? normalizeIban(iban) : null,
      }),
    onSuccess: async (result) => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: REIMBURSEMENTS_KEY });
      const what = entry === 'electricity' ? 'Ladestrom' : 'Einkauf';
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
        purpose: entry === 'electricity' ? electricityPurpose(today) : '',
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

  const pages = accountNeeded ? 5 : 4;
  const step =
    page === 'kind'
      ? 1
      : page === 'receipt'
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
    stand: entry ? { text: `Schritt ${step} von ${pages}`, wert: step, von: pages } : undefined,
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
                setEntry('electricity');
                setFlow((f) => weiter(f, 'receipt'));
              }}
            >
              Ladestrom für das Lastenrad
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setEntry('purchase');
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
    entry === 'electricity'
      ? selfEntered
        ? 'Ladestrom eintragen'
        : 'Ladestrom beantragen'
      : selfEntered
        ? 'Einkauf eintragen'
        : 'Einkauf beantragen';
  const ready =
    accountReady &&
    items.length > 0 &&
    items.every((i) => itemOk(i) && i.upload === 'done' && i.receiptId);
  const uploading = items.some((i) => i.upload === 'running');

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
          {items.map((i) => {
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
          })}
          {items.length > 1 ? <ListRow titel="Summe" betrag={formatEuro(sum)} /> : null}
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
        {items.length < 10 ? (
          <div>
            <Button variant="secondary" onClick={() => setFlow((f) => aendern(f, 'receipt'))}>
              Weiterer Beleg
            </Button>
          </div>
        ) : null}
      </div>
    </GefuehrterAblauf>
  );
}
