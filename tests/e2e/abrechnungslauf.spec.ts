import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { rechnungsansicht } from '../../src/features/billing/testdaten';

/**
 * Monatsabrechnung in einem Lauf (Bereichsüberholung 4) im echten Browser bei
 * 375 px, mit gezählten Tipps:
 *
 *   * **K13**: alle fertigen Rechnungen eines Monats ausstellen in ≤ 3 Tipps
 *     (vorher ≈ 15 je Rechnung: Entwurf anlegen, Rechnung öffnen, Empfänger
 *     prüfen, ausstellen, bestätigen, zurück);
 *   * **K14**: Zahlungseingang als Sammelbuchung - je Zahlung höchstens zwei
 *     Tipps (vorher drei je Zahlung, einzeln).
 *
 * Der Server ist eine kleine Nachbildung über abgefangene Anfragen; die Regeln
 * der Ausstellung prüft `pnpm test:db`. Alles ist synthetisch.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/abrechnungslauf.html';

/** Heute in Berlin und der erste Tag des Vormonats und des laufenden Monats. */
function monate(): { vormonat: string; laufend: string } {
  const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
  const [jahr, monat] = heute.split('-').map(Number) as [number, number];
  const vor = monat === 1 ? `${jahr - 1}-12` : `${jahr}-${String(monat - 1).padStart(2, '0')}`;
  return { vormonat: `${vor}-01`, laufend: `${heute.slice(0, 7)}-01` };
}

interface Kandidat {
  patient_id: string;
  patient_name: string;
  period_month: string;
  treatment_basis_id: string | null;
  basis_released_at: string | null;
  total_cents: number;
  /** Die Nachbildung weist das Ausstellen dieser Rechnung ab. */
  ohneAnschrift?: boolean;
}

interface Rechnung {
  id: string;
  kandidat: Kandidat;
  nummer: string | null;
  bezahlt: number;
}

function nachbildung(kandidaten: Kandidat[], offen: Rechnung[] = []) {
  const rechnungen: Rechnung[] = [...offen];
  const aufrufe: Record<string, Record<string, unknown>[]> = {};
  let nummern = 0;

  function kandidatZeile(k: Kandidat) {
    const entwurf = rechnungen.find((r) => r.kandidat === k && r.nummer === null);
    return {
      patient_id: k.patient_id,
      training_relationship_id: null,
      patient_name: k.patient_name,
      period_month: k.period_month,
      service_area: 'therapy',
      service_count: 3,
      total_cents: k.total_cents,
      currency: 'EUR',
      has_draft: Boolean(entwurf),
      draft_id: entwurf?.id ?? null,
      treatment_basis_id: k.treatment_basis_id,
      basis_kind: k.treatment_basis_id ? 'follow_up' : null,
      basis_issued_on: k.treatment_basis_id ? k.period_month : null,
      first_performed_on: k.treatment_basis_id ? k.period_month : null,
      last_performed_on: k.treatment_basis_id ? k.period_month : null,
      cancelled_invoice_id: null,
      cancelled_invoice_number: null,
      draft_replaces_invoice_number: null,
      basis_released_at: k.basis_released_at,
    };
  }

  function rechnungZeile(r: Rechnung) {
    return {
      id: r.id,
      status: r.nummer ? 'issued' : 'draft',
      invoice_number: r.nummer,
      period_month: r.kandidat.period_month,
      service_area: 'therapy',
      issued_on: r.nummer ? r.kandidat.period_month : null,
      due_on: r.nummer ? r.kandidat.period_month : null,
      patient_id: r.kandidat.patient_id,
      training_relationship_id: null,
      patient_name: r.kandidat.patient_name,
      recipient_name: r.kandidat.patient_name,
      recipient_kind: 'self',
      total_cents: r.kandidat.total_cents,
      currency: 'EUR',
      item_count: 3,
      paid_cents: r.bezahlt,
      outstanding_cents: r.kandidat.total_cents - r.bezahlt,
      payment_state: r.bezahlt > 0 ? 'paid' : 'unpaid',
      overdue: false,
      cancelled: false,
      treatment_basis_id: r.kandidat.treatment_basis_id,
      basis_kind: r.kandidat.treatment_basis_id ? 'follow_up' : null,
      basis_issued_on: r.kandidat.treatment_basis_id ? r.kandidat.period_month : null,
      total_count: rechnungen.length,
      basis_released_at: r.kandidat.basis_released_at,
      is_correction: false,
    };
  }

  const offenePosten = () =>
    rechnungen.filter((r) => r.nummer && r.bezahlt < r.kandidat.total_cents);

  const antworten: Record<string, (p: Record<string, unknown>) => unknown> = {
    list_invoice_candidates: () =>
      kandidaten
        .filter((k) => !rechnungen.some((r) => r.kandidat === k && r.nummer))
        .map(kandidatZeile),
    create_invoice_draft: (p) => {
      const k = kandidaten.find(
        (x) => x.patient_id === p.p_patient_id && x.period_month === p.p_period_month,
      )!;
      const id = `dddddddd-dddd-4ddd-8ddd-${String(rechnungen.length + 1).padStart(12, '0')}`;
      rechnungen.push({ id, kandidat: k, nummer: null, bezahlt: 0 });
      return id;
    },
    create_invoice_draft_for_basis: (p) => {
      const k = kandidaten.find((x) => x.treatment_basis_id === p.p_treatment_basis_id)!;
      const id = `dddddddd-dddd-4ddd-8ddd-${String(rechnungen.length + 1).padStart(12, '0')}`;
      rechnungen.push({ id, kandidat: k, nummer: null, bezahlt: 0 });
      return id;
    },
    list_invoices: (p) =>
      rechnungen
        .filter((r) => (p.p_status === 'draft' ? r.nummer === null : true))
        .map(rechnungZeile),
    list_open_items: () => {
      const liste = offenePosten();
      const summe = liste.reduce((s, r) => s + r.kandidat.total_cents - r.bezahlt, 0);
      return liste.map((r) => ({
        ...rechnungZeile(r),
        invoice_number: r.nummer,
        issued_on: r.kandidat.period_month,
        due_on: r.kandidat.period_month,
        open_total_cents: summe,
        total_count: liste.length,
      }));
    },
    record_payment: (p) => {
      const r = rechnungen.find((x) => x.id === p.p_invoice_id)!;
      r.bezahlt += Number(p.p_amount_cents);
      return null;
    },
    get_invoice: (p) => {
      const r = rechnungen.find((x) => x.id === p.p_invoice_id)!;
      return rechnungsansicht(
        { id: r.id, status: 'issued', invoice_number: r.nummer, issued_on: '2026-10-01' },
        { invoice_number: r.nummer ?? undefined, issued_on: '2026-10-01' },
      );
    },
  };

  async function beantworte(route: Route) {
    const name = new URL(route.request().url()).pathname.split('/rpc/')[1];
    if (!name) {
      await route.fulfill({ json: [] });
      return;
    }
    const parameter = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    (aufrufe[name] ??= []).push(parameter);
    if (name === 'issue_invoice') {
      const r = rechnungen.find((x) => x.id === parameter.p_invoice_id)!;
      if (r.kandidat.ohneAnschrift) {
        await route.fulfill({
          status: 400,
          json: {
            code: '22023',
            message: 'invoice recipient address incomplete',
            details: 'street, house_number',
            hint: null,
          },
        });
        return;
      }
      nummern += 1;
      r.nummer = `RG-2026-${String(nummern).padStart(4, '0')}`;
      await route.fulfill({ json: r.nummer });
      return;
    }
    const antwort = antworten[name];
    await route.fulfill({ json: antwort ? antwort(parameter) : [] });
  }

  return { aufrufe, beantworte };
}

function zaehler() {
  let tipps = 0;
  return {
    async tippe(ziel: Locator) {
      tipps += 1;
      await ziel.click();
    },
    get tipps() {
      return tipps;
    },
  };
}

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

async function mindestens44(ziel: Locator) {
  await expect(ziel).toBeVisible();
  expect((await ziel.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
}

test('K13: alle fertigen Rechnungen des Monats in höchstens drei Tipps ausstellen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { vormonat, laufend } = monate();
  const server = nachbildung([
    {
      patient_id: 'p1',
      patient_name: 'Max Mustermann',
      period_month: vormonat,
      treatment_basis_id: null,
      basis_released_at: null,
      total_cents: 42_000,
    },
    {
      patient_id: 'p2',
      patient_name: 'Erika Beispiel',
      period_month: vormonat,
      treatment_basis_id: 'b1',
      basis_released_at: `${vormonat}T09:00:00+00:00`,
      total_cents: 56_000,
    },
    // Ohne Anschrift: Der Lauf meldet sie und stellt die übrigen aus.
    {
      patient_id: 'p3',
      patient_name: 'Petra Probe',
      period_month: vormonat,
      treatment_basis_id: null,
      basis_released_at: null,
      total_cents: 14_000,
      ohneAnschrift: true,
    },
    // Nicht im Lauf: der laufende Monat und eine Verordnung ohne Freigabe.
    {
      patient_id: 'p1',
      patient_name: 'Max Mustermann',
      period_month: laufend,
      treatment_basis_id: null,
      basis_released_at: null,
      total_cents: 14_000,
    },
    {
      patient_id: 'p4',
      patient_name: 'Tina Training',
      period_month: laufend,
      treatment_basis_id: 'b2',
      basis_released_at: null,
      total_cents: 28_000,
    },
  ]);
  await page.route('**/rest/v1/**', (route) => server.beantworte(route));

  await page.goto(PRUEFSEITE);
  await expect(page.getByText('3 Rechnungen bereit')).toBeVisible();
  await expect(page.getByText(/Monat läuft noch/)).toBeVisible();
  await expect(page.getByText(/Noch nicht in die Abrechnung gestellt/)).toBeVisible();
  const start = page.getByRole('button', { name: 'Abrechnungslauf starten' });
  await mindestens44(start);
  expect(await ueberlaeuft(page)).toBe(false);

  const z = zaehler();
  // 1. Starten: drei Entwürfe, die Prüfliste nennt Empfänger und Betrag.
  await z.tippe(start);
  await expect(page.getByText('3 Entwürfe · 1.120,00 €')).toBeVisible();
  await expect(page.getByText(/an Max Mustermann \(Patient:in selbst\)/)).toBeVisible();
  expect(await ueberlaeuft(page)).toBe(false);

  // 2. Ausstellen öffnet die Rückfrage mit Summe und Kreis.
  await z.tippe(page.getByRole('button', { name: '3 Rechnungen ausstellen' }));
  await expect(page.getByText('3 für Behandlung')).toBeVisible();

  // 3. Bestätigen: jede Rechnung einzeln.
  await z.tippe(page.getByRole('button', { name: 'Ja, 3 Rechnungen ausstellen' }));
  await expect(page.getByText(/2 Rechnungen ausgestellt/)).toBeVisible();
  await expect(page.getByText(/In der Anschrift des Empfängers fehlt/)).toBeVisible();
  await mindestens44(page.getByRole('link', { name: 'Zu den Stammdaten' }));
  expect(server.aufrufe.issue_invoice).toHaveLength(3);
  expect(server.aufrufe.create_invoice_draft).toHaveLength(2);
  expect(server.aufrufe.create_invoice_draft_for_basis).toHaveLength(1);
  expect(await ueberlaeuft(page)).toBe(false);

  test
    .info()
    .annotations.push({ type: 'K13', description: `${z.tipps} Tipps (vorher ≈ 15 je Rechnung)` });
  expect(z.tipps).toBeLessThanOrEqual(3);

  // Danach: alle in einem Druckauftrag, ein Blatt je Rechnung.
  await page.getByRole('link', { name: 'Alle drucken' }).click();
  await expect(page.getByRole('heading', { name: 'Rechnung RG-2026-0001' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rechnung RG-2026-0002' })).toBeVisible();
  await mindestens44(page.getByRole('button', { name: 'Alle 2 drucken' }));
  expect(await ueberlaeuft(page)).toBe(false);
});

test('K14: Zahlungseingang gesammelt - höchstens zwei Tipps je Zahlung', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { vormonat } = monate();
  const posten = (patient_id: string, patient_name: string, total_cents: number, n: number) => ({
    id: `dddddddd-dddd-4ddd-8ddd-00000000010${n}`,
    kandidat: {
      patient_id,
      patient_name,
      period_month: vormonat,
      treatment_basis_id: null,
      basis_released_at: null,
      total_cents,
    },
    nummer: `RG-2026-000${n}`,
    bezahlt: 0,
  });
  const server = nachbildung(
    [],
    [
      posten('p1', 'Max Mustermann', 42_000, 1),
      posten('p2', 'Erika Beispiel', 56_000, 2),
      posten('p3', 'Petra Probe', 14_000, 3),
    ],
  );
  await page.route('**/rest/v1/**', (route) => server.beantworte(route));

  await page.goto(PRUEFSEITE);
  await expect(page.getByText('3 Rechnungen · 1.120,00 € offen')).toBeVisible();

  const z = zaehler();
  await z.tippe(page.getByRole('button', { name: 'Mehrere buchen' }));
  const erster = page.getByRole('checkbox', { name: 'RG-2026-0001 bezahlt' });
  await mindestens44(erster.locator('xpath=ancestor::label'));
  await z.tippe(erster);
  await z.tippe(page.getByRole('checkbox', { name: 'RG-2026-0003 bezahlt' }));
  expect(await ueberlaeuft(page)).toBe(false);
  await z.tippe(page.getByRole('button', { name: /^2 Zahlungen buchen · 560,00\s€$/ }));

  await expect(page.getByText(/2 Zahlungen gebucht\. 560,00\s€/)).toBeVisible();
  expect(server.aufrufe.record_payment).toEqual([
    expect.objectContaining({
      p_invoice_id: 'dddddddd-dddd-4ddd-8ddd-000000000101',
      p_amount_cents: 42_000,
      p_method: 'bank_transfer',
      p_direction: 'incoming',
    }),
    expect.objectContaining({ p_invoice_id: 'dddddddd-dddd-4ddd-8ddd-000000000103' }),
  ]);
  await expect(page.getByText('Eine Rechnung · 560,00 € offen')).toBeVisible();

  test.info().annotations.push({
    type: 'K14',
    description: `${z.tipps} Tipps für 2 Zahlungen (vorher 3 je Zahlung)`,
  });
  expect(z.tipps).toBeLessThanOrEqual(2 * 2);
});

test('der Lauf läuft bei 1280 px nicht über', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { vormonat } = monate();
  const server = nachbildung([
    {
      patient_id: 'p1',
      patient_name: 'Max Mustermann',
      period_month: vormonat,
      treatment_basis_id: null,
      basis_released_at: null,
      total_cents: 42_000,
    },
  ]);
  await page.route('**/rest/v1/**', (route) => server.beantworte(route));

  await page.goto(PRUEFSEITE);
  await page.getByRole('button', { name: 'Abrechnungslauf starten' }).click();
  await expect(page.getByRole('button', { name: 'Eine Rechnung ausstellen' })).toBeVisible();
  expect(await ueberlaeuft(page)).toBe(false);
});
