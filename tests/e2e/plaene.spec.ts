import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type AxeCore from 'axe-core';
import { KATALOG } from '../../src/features/exercises/katalog';
import { alsDosis } from '../../src/features/exercises/katalog/dosierung';
import { ausruestungVon } from '../../src/features/exercises/katalog/schema';
import type { Katalogeintrag } from '../../src/features/exercises/katalog/typen';

/**
 * Übungspläne im echten Browser (UEB-EPIC-002, Welle B).
 *
 * Die Komponententests prüfen Inhalt, Rollen und Wege, `pnpm test:db` die
 * Regeln am Server. Hier geht es um das, was jsdom nicht misst: kein
 * waagerechtes Scrollen bei 375 px - mit langen Titeln, offenem Auswahlblatt
 * und offener Dosierung -, Tippziele von 44 px und die Prüfung mit axe.
 *
 * Dazu die **Ablauftests** mit gezählten Tipps (docs/product/kernablaeufe.md,
 * K12): ein Heimprogramm mit fünf Übungen individuell und eines aus einer
 * Vorlage, jeweils von „Neuer Plan“ in der Akte bis zum zugewiesenen Plan.
 * Die Aufrufe an den Server beantwortet ein Nachbau mit synthetischem Katalog
 * (`page.route`) - die Regeln am Server prüft `pnpm test:db`.
 */
const PRUEFSEITE = '/tests/e2e/fixtures/plaene.html';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

async function ueberlaeuft(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

async function axeVerstoesse(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof AxeCore }).axe;
    const ergebnis = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return ergebnis.violations.map(
      (v) => `${v.id}: ${v.help} – ${v.nodes.map((n) => n.html.slice(0, 80)).join(' | ')}`,
    );
  });
}

async function hoehe(knopf: Locator): Promise<number> {
  await expect(knopf).toBeVisible();
  return (await knopf.boundingBox())?.height ?? 0;
}

test.describe('Übungspläne', () => {
  for (const breite of [375, 1280]) {
    test(`Entwurf mit Auswahlblatt und Dosierung bei ${breite} px`, async ({ page }) => {
      // Das Auswahlblatt lädt den Katalog (eigener Teil des Builds), dazu
      // zweimal axe: Beim ersten Aufruf übersetzt der Entwicklungsserver ihn.
      test.slow();
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(PRUEFSEITE);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Heimprogramm Knie');
      for (const name of [
        'Übungen hinzufügen',
        'Zuweisen',
        'Aus Vorlage',
        'Titel ändern',
        'Häufigkeit: weniger',
        'Häufigkeit: mehr',
      ]) {
        expect(await hoehe(page.getByRole('button', { name, exact: true }))).toBeGreaterThanOrEqual(
          44,
        );
      }
      expect(
        await hoehe(page.getByRole('button', { name: /1\. Kniebeuge am Geländer/ })),
      ).toBeGreaterThanOrEqual(44);
      // Befund B9: die Häufigkeit pro Woche als Zeile direkt im Entwurf.
      await expect(page.getByRole('group', { name: 'Häufigkeit' })).toBeVisible();
      await expect(page.getByText('3-mal pro Woche').first()).toBeVisible();

      // Das Auswahlblatt: Suche, Filter auf Abruf, Zeilen mit Haken.
      await page.getByRole('button', { name: 'Übungen hinzufügen' }).click();
      const blatt = page.getByRole('dialog', { name: 'Übungen hinzufügen' });
      await blatt.getByRole('searchbox', { name: 'Übung suchen' }).fill('band');
      await expect(
        blatt.getByRole('checkbox', { name: /Rudern im Sitzen, Theraband rot/ }),
      ).toBeVisible();
      await blatt.getByRole('checkbox', { name: /Rudern im Sitzen, Theraband rot/ }).check();
      await expect(blatt.getByRole('button', { name: '1 hinzufügen' })).toBeVisible();
      await blatt.getByText('Filter', { exact: true }).click();
      await expect(blatt.getByRole('group', { name: 'Körperregion' })).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
      await blatt.getByRole('button', { name: 'Abbrechen' }).click();

      // Die Dosierung einer Position: Zahlschritte, 44 px.
      await page.getByRole('button', { name: /1\. Kniebeuge am Geländer/ }).click();
      const fenster = page.getByRole('dialog', { name: '1. Kniebeuge am Geländer, halbe Tiefe' });
      for (const name of ['Sätze: mehr', 'Halten: weniger', 'Am Tag: mehr']) {
        expect(await hoehe(fenster.getByRole('button', { name }))).toBeGreaterThanOrEqual(44);
      }
      // Mit eingetragener Last steht „Mehr“ schon offen.
      await expect(fenster.getByLabel('Last')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`zugewiesener Plan, läuft aus, in Alltagssprache bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=zugewiesen`);
      await expect(page.getByText(/Bitte entscheiden/)).toBeVisible();
      for (const name of ['Verlängern', 'Plan beenden', 'In Alltagssprache']) {
        expect(
          await hoehe(page.getByRole('button', { name, exact: true }).first()),
        ).toBeGreaterThanOrEqual(44);
      }
      await page.getByRole('button', { name: 'In Alltagssprache' }).click();
      await expect(page.getByText('Sie brauchen: Theraband gelb')).toBeVisible();
      // OUT-003: je Übung gezählt - eine Liste, die am Telefon nicht quer rollt.
      const jeUebung = page.getByRole('list', { name: /Je Übung/ });
      await expect(jeUebung.getByRole('listitem')).toHaveCount(2);
      await expect(jeUebung).toContainText('ein Teil');
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`neue Fassung mit Schritt bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=fassung`);
      await expect(
        page.getByText('Last: Rucksack mit 3 kg Wasserflaschen → Rucksack 5 kg'),
      ).toBeVisible();
      await page.getByRole('button', { name: /2\. Rudern im Sitzen/ }).click();
      const fenster = page.getByRole('dialog');
      await fenster.getByRole('button', { name: 'Schwerer' }).click();
      await fenster.getByLabel('Achse').selectOption('last');
      await expect(
        fenster.getByRole('button', { name: 'Rudern im Sitzen, Theraband rot', exact: true }),
      ).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });

    test(`Abschnitt in der Akte und Wiedervorlage bei ${breite} px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await page.goto(`${PRUEFSEITE}?seite=akte`);
      await expect(page.getByRole('heading', { name: 'Übungspläne' })).toBeVisible();
      await expect(page.getByText('läuft aus')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);

      await page.goto(`${PRUEFSEITE}?seite=offen`);
      await expect(page.getByRole('heading', { name: 'Pläne laufen aus (2)' })).toBeVisible();
      await expect(page.getByText('abgelaufen')).toBeVisible();
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
    });
  }
});

// -----------------------------------------------------------------------------
// Ablauftests mit gezählten Tipps (Welle B)
// -----------------------------------------------------------------------------

const HEUTE = '2026-10-07';

/** Ein Katalogeintrag, wie ihn die Bibliothek nach der Übernahme führt - ungeprüft. */
function uebernommen(e: Katalogeintrag) {
  const d = alsDosis(e.dosierung);
  return {
    id: `u-${e.schluessel}`,
    name: e.name,
    lay_name: e.alltagsname,
    body_region: e.region,
    archived: false,
    variants: [
      {
        id: `v-${e.schluessel}`,
        name: e.name,
        lay_name: e.alltagsname,
        instruction: e.anleitung.join('\n'),
        equipment: ausruestungVon(e),
        common_faults: e.fehler.join('\n'),
        practice_notes: e.hinweise_praxis ?? null,
        archived: false,
        catalog_key: e.schluessel,
        catalog_version: e.version,
        goal: e.ziel,
        starting_position: e.ausgangsstellung,
        level: e.niveau,
        default_dosage: {
          sets: d.sets,
          reps_min: d.reps_min,
          reps_max: d.reps_max,
          duration_seconds: d.duration_seconds,
          hold_seconds: d.hold_seconds ?? null,
          per_side: d.per_side ?? false,
          times_per_day: d.times_per_day ?? null,
        },
        reviewed_at: null,
        reviewed_by_name: null,
      },
    ],
  };
}

/**
 * Der synthetische Bestand: Knie, Hüfte, Gleichgewicht aus dem Katalog, alle
 * ungeprüft. Für owner (`can_manage`) steht der Rest des Katalogs im
 * Auswahlblatt daneben und kommt beim Hinzufügen dazu (Befund B9,
 * `add_catalog_exercises_for_plan`); alle anderen wählen aus der Bibliothek
 * (ANN-293).
 */
function bibliothek() {
  return {
    can_manage: false,
    links: [],
    exercises: KATALOG.filter((e) => /^(KN|HU|GG)-/.test(e.schluessel))
      .map(uebernommen)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'de')),
  };
}

type Argumente = Record<string, unknown>;

/**
 * Ein Nachbau der Serverfunktionen, die Akte und Planeditor rufen - im
 * Arbeitsspeicher, ohne Regeln (die prüft `pnpm test:db`). Er hält fest, was
 * ankam, damit der Test die Standarddosierung und das Ergebnis prüft.
 */
class Nachbau {
  bibliothek = bibliothek();
  /** Was aus dem Katalog übernommen wurde, in der Reihenfolge der Aufrufe. */
  uebernommen: string[] = [];
  /** Der Plattformzugang der Person: keiner oder aktiv (Bestätigung, B9). */
  plattform: 'keiner' | 'aktiv' = 'keiner';
  plaene = new Map<string, Argumente & { items: Argumente[] }>();
  zaehler = 0;
  /** UEB-014: die Vorlagen der Praxis; `null` heißt, der Server ist nicht zu erreichen. */
  vorlagen: Argumente[] | null = [];

  variante(id: string) {
    for (const u of this.bibliothek.exercises) {
      const v = u.variants.find((x) => x.id === id);
      if (v) return { u, v };
    }
    throw new Error(`Variante ${id} unbekannt`);
  }

  plan(id: string) {
    const p = this.plaene.get(id)!;
    return {
      ...p,
      items: p.items.map((item, index) => ({ ...item, position: index + 1 })),
    };
  }

  rufe(name: string, a: Argumente): unknown {
    switch (name) {
      case 'list_exercise_library':
        return this.bibliothek;
      case 'list_exercise_plan_templates':
        if (this.vorlagen === null) throw new Error('nicht erreichbar');
        return { can_create: true, templates: this.vorlagen };
      case 'save_exercise_plan_template': {
        const id = `vorlage-${(this.vorlagen ?? []).length + 1}`;
        (this.vorlagen ??= []).push({
          id,
          name: a['p_name'],
          goal: a['p_goal'] || null,
          can_edit: true,
          created_by_name: 'Anna Beispiel',
          updated_on: HEUTE,
          items: a['p_items'],
        });
        return id;
      }
      case 'add_catalog_exercises_for_plan': {
        // Wie der Server: Vorhandenes nehmen; Fehlendes übernimmt nur owner,
        // sonst kommt es als „missing“ zurück (O-002, ANN-293).
        const variants: Record<string, string> = {};
        const imported: string[] = [];
        const conflicts: { catalog_key: string; name: string; reason: string }[] = [];
        for (const e of a['p_entries'] as Katalogeintrag[]) {
          const da = this.bibliothek.exercises.find((u) =>
            u.variants.some((v) => v.catalog_key === e.schluessel),
          );
          if (!da && !this.bibliothek.can_manage) {
            conflicts.push({ catalog_key: e.schluessel, name: e.name, reason: 'missing' });
            continue;
          }
          if (!da) {
            this.bibliothek.exercises.push(uebernommen(e));
            imported.push(e.schluessel);
          }
          variants[e.schluessel] = `v-${e.schluessel}`;
        }
        this.uebernommen.push(...imported);
        return { variants, imported, conflicts };
      }
      case 'list_exercise_plans':
        return {
          can_write: true,
          today: HEUTE,
          plans: [...this.plaene.values()].map((p) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            sessions_per_week: p.sessions_per_week,
            previous_plan_id: null,
            assigned_at: p.assigned_at,
            runs_from: p.runs_from,
            runs_until: p.runs_until,
            ended_at: null,
            created_at: `${HEUTE}T08:00:00Z`,
            item_count: p.items.length,
            review_due: false,
          })),
        };
      case 'create_exercise_plan': {
        this.zaehler += 1;
        const id = `aaaaaaaa-0000-4000-8000-00000000000${this.zaehler}`;
        this.plaene.set(id, {
          id,
          service_area: a['p_area'],
          relationship_id: a['p_relationship_id'],
          given_name: 'Erika',
          family_name: 'Beispiel',
          title: a['p_title'],
          sessions_per_week: null,
          status: 'draft',
          previous_plan_id: null,
          follow_up: null,
          assigned_at: null,
          assigned_by_name: null,
          runs_from: null,
          runs_until: null,
          original_runs_until: null,
          extended_at: null,
          ended_at: null,
          ended_on: null,
          ended_by_name: null,
          created_at: `${HEUTE}T08:00:00Z`,
          created_by_name: 'Anna Beispiel',
          today: HEUTE,
          can_write: true,
          review_due: false,
          relationship_open: true,
          previous: null,
          items: [],
          sessions: [],
        });
        return id;
      }
      case 'get_exercise_plan':
        return this.plan(String(a['p_plan_id']));
      case 'save_exercise_plan': {
        const p = this.plaene.get(String(a['p_plan_id']))!;
        p.title = a['p_title'];
        p.sessions_per_week = a['p_sessions_per_week'];
        return null;
      }
      case 'save_exercise_plan_item': {
        const p = this.plaene.get(String(a['p_plan_id']))!;
        const { u, v } = this.variante(String(a['p_variant_id']));
        const id = (a['p_item_id'] as string | null) ?? `item-${p.items.length + 1}`;
        const item = {
          id,
          variant_id: v.id,
          exercise_name: u.name,
          exercise_lay_name: u.lay_name,
          variant_name: v.name,
          variant_lay_name: v.lay_name,
          body_region: u.body_region,
          instruction: v.instruction,
          equipment: v.equipment,
          variant_archived: false,
          sets: a['p_sets'],
          reps_min: a['p_reps_min'],
          reps_max: a['p_reps_max'],
          duration_seconds: a['p_duration_seconds'],
          hold_seconds: a['p_hold_seconds'],
          per_side: a['p_per_side'],
          times_per_day: a['p_times_per_day'],
          load: a['p_load'] || null,
          tempo: a['p_tempo'] || null,
          rest_seconds: a['p_rest_seconds'],
          double_progression: a['p_double_progression'],
          note: a['p_note'] || null,
          previous_item_id: null,
          step_axis: null,
          step_direction: null,
        };
        const vorhanden = p.items.findIndex((i) => i['id'] === id);
        if (vorhanden >= 0) p.items[vorhanden] = item;
        else p.items.push(item);
        return id;
      }
      case 'assign_exercise_plan': {
        const p = this.plaene.get(String(a['p_plan_id']))!;
        p.status = 'assigned';
        p.runs_from = HEUTE;
        p.runs_until = a['p_runs_until'];
        p.original_runs_until = a['p_runs_until'];
        p.assigned_at = `${HEUTE}T09:00:00Z`;
        p.assigned_by_name = 'Anna Beispiel';
        return null;
      }
      case 'get_platform_access': {
        // Wie der Server: ohne Zugang eine leere Zeile (POR-002).
        const aktiv = this.plattform === 'aktiv';
        return [
          {
            id: aktiv ? 'bbbbbbbb-0000-4000-8000-000000000001' : null,
            status: aktiv ? 'active' : null,
            created_at: aktiv ? `${HEUTE}T07:00:00Z` : null,
            activated_at: aktiv ? `${HEUTE}T07:05:00Z` : null,
            locked_at: null,
            revoked_at: null,
            revoked_reason: null,
            invitation_id: null,
            invitation_purpose: null,
            invitation_channel: null,
            invitation_expires_at: null,
            invitation_sent_at: null,
            relationship_email: null,
            ended_at: null,
          },
        ];
      }
      default:
        throw new Error(`Der Nachbau kennt ${name} nicht.`);
    }
  }
}

async function mitNachbau(page: Page): Promise<Nachbau> {
  const nachbau = new Nachbau();
  await page.route('**/rest/v1/rpc/*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    try {
      const daten = nachbau.rufe(name, (route.request().postDataJSON() ?? {}) as Argumente);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(daten),
      });
    } catch (fehler) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: String(fehler) }),
      });
    }
  });
  return nachbau;
}

/** Zählt jede Berührung - Knopf, Zeile, Haken, Feld (kernablaeufe.md, „Zählweise“). */
class Zaehler {
  tipps = 0;
  eingaben = 0;
  async tippe(ziel: Locator) {
    await ziel.click();
    this.tipps += 1;
  }
  async tippeEin(feld: Locator, text: string) {
    await this.tippe(feld);
    await feld.fill(text);
    this.eingaben += 1;
  }
}

test.describe('Ablauf Heimprogramm (K12, Welle B)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test('mit 5 Übungen individuell: höchstens 15 Tipps, Tastatur nur für die Suche', async ({
    page,
  }) => {
    const nachbau = await mitNachbau(page);
    const z = new Zaehler();
    await page.goto(`${PRUEFSEITE}?seite=planbau`);
    await z.tippe(page.getByRole('button', { name: 'Neuer Plan' }));
    await z.tippe(page.getByRole('button', { name: 'Übungen hinzufügen' }));
    const blatt = page.getByRole('dialog', { name: 'Übungen hinzufügen' });
    await z.tippeEin(blatt.getByRole('searchbox', { name: 'Übung suchen' }), 'knie');
    const haken = blatt.getByRole('checkbox');
    await expect(haken.first()).toBeVisible();
    for (let i = 0; i < 5; i += 1) await z.tippe(haken.nth(i));
    await z.tippe(blatt.getByRole('button', { name: '5 hinzufügen' }));
    await expect(page.getByText('5 Übungen hinzugefügt.')).toBeVisible();
    await z.tippe(page.getByRole('button', { name: 'Zuweisen' }));
    await z.tippe(page.getByRole('dialog').getByRole('button', { name: 'Zuweisen' }));
    // Befund B9: Die Bestätigung führt gleich zum Planblatt - auch ohne
    // Plattform; der Link im Satz ist ein Tippziel von 44 px. Ohne Zugang
    // sagt sie, dass das Blatt der Weg zur Person ist.
    expect(
      await hoehe(page.getByRole('status').getByRole('link', { name: 'Als PDF oder drucken' })),
    ).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('status').filter({ hasText: 'Zugewiesen bis' })).toContainText(
      'Ohne Plattformzugang: Als PDF oder drucken mitgeben.',
    );
    expect(await ueberlaeuft(page)).toBe(false);

    const plan = [...nachbau.plaene.values()][0]!;
    expect(plan.status).toBe('assigned');
    expect(plan.items).toHaveLength(5);
    // Jede Übung kam mit ihrer Standarddosierung aus dem Katalog (ANN-384).
    for (const item of plan.items) {
      const { v } = nachbau.variante(String(item['variant_id']));
      expect(item['sets']).toBe(v.default_dosage.sets);
      expect(item['per_side']).toBe(v.default_dosage.per_side);
    }
    // Vorher (Analyse 12.10., Abschnitt 1.1): rund 35 Tipps und 10 bis 13 Eingaben.
    test.info().annotations.push({
      type: 'Tipps',
      description: `${z.tipps} Tipps, ${z.eingaben} Eingabe (Suche)`,
    });
    expect(z.tipps).toBe(11);
    expect(z.tipps).toBeLessThanOrEqual(15);
    expect(z.eingaben).toBe(1);
  });

  test('eine Übung, die der Praxis noch fehlt, kommt für owner beim Hinzufügen still dazu (B9)', async ({
    page,
  }) => {
    const nachbau = await mitNachbau(page);
    nachbau.bibliothek.can_manage = true;
    const fehlt = KATALOG.find((e) => e.schluessel === 'BT-01')!;
    expect(nachbau.bibliothek.exercises.some((u) => u.name === fehlt.name)).toBe(false);
    await page.goto(`${PRUEFSEITE}?seite=planbau`);
    await page.getByRole('button', { name: 'Neuer Plan' }).click();
    await page.getByRole('button', { name: 'Übungen hinzufügen' }).click();
    const blatt = page.getByRole('dialog', { name: 'Übungen hinzufügen' });
    await blatt.getByRole('searchbox', { name: 'Übung suchen' }).fill(fehlt.alltagsname);
    const haken = blatt.getByRole('checkbox', { name: fehlt.name });
    await expect(haken).toHaveAccessibleName(/ungeprüft/);
    // B9: Der lange Fachname („Fußpumpe (Dorsal-/Plantarflexion)“) bricht bei
    // 375 px um, statt in den Haken zu laufen.
    const titel = blatt.getByText(fehlt.name, { exact: true });
    expect(await titel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await haken.check();
    await blatt.getByRole('button', { name: '1 hinzufügen' }).click();
    await expect(page.getByText('1 Übung hinzugefügt.')).toBeVisible();
    expect(nachbau.uebernommen).toEqual(['BT-01']);
    const plan = [...nachbau.plaene.values()][0]!;
    expect(plan.items.map((i) => i['variant_id'])).toEqual(['v-BT-01']);
    expect(await ueberlaeuft(page)).toBe(false);
  });

  test('ohne Pflegerecht steht nur die Bibliothek im Auswahlblatt (ANN-293)', async ({ page }) => {
    const nachbau = await mitNachbau(page);
    const fehlt = KATALOG.find((e) => e.schluessel === 'BT-01')!;
    await page.goto(`${PRUEFSEITE}?seite=planbau`);
    await page.getByRole('button', { name: 'Neuer Plan' }).click();
    await page.getByRole('button', { name: 'Übungen hinzufügen' }).click();
    const blatt = page.getByRole('dialog', { name: 'Übungen hinzufügen' });
    await blatt.getByRole('searchbox', { name: 'Übung suchen' }).fill('knie');
    await expect(blatt.getByRole('checkbox').first()).toBeVisible();
    await blatt.getByRole('searchbox', { name: 'Übung suchen' }).fill(fehlt.alltagsname);
    await expect(blatt.getByRole('checkbox', { name: fehlt.name })).toHaveCount(0);
    expect(nachbau.uebernommen).toEqual([]);
  });

  // Was der Praxis fehlt, übernimmt nur owner (ANN-293): Die Therapeut:in
  // sieht die Zeile ohne Haken, owner fügt sie mit hinzu.
  for (const { wer, pflegt } of [
    { wer: 'die Therapeut:in', pflegt: false },
    { wer: 'owner', pflegt: true },
  ]) {
    test(`aus Vorlage mit Vorschau für ${wer}: höchstens 5 Tipps, ohne Tastatur (K12)`, async ({
      page,
    }) => {
      // Dreizehn Aufrufe an den Nachbau, dazu axe: bei voller Maschine länger.
      test.slow();
      const nachbau = await mitNachbau(page);
      nachbau.bibliothek.can_manage = pflegt;
      // Einmal mit, einmal ohne Plattformzugang der Person (B9).
      nachbau.plattform = pflegt ? 'aktiv' : 'keiner';
      const anzahl = pflegt ? 6 : 5;
      const z = new Zaehler();
      await page.goto(`${PRUEFSEITE}?seite=planbau`);
      await z.tippe(page.getByRole('button', { name: 'Neuer Plan' }));
      // Im leeren Entwurf stehen die Vorlagen gleich als Zeilen (Befund B9).
      await z.tippe(page.getByRole('button', { name: /Knie im Sitz \(Prüfvorlage\)/ }));
      const vorschau = page.getByRole('dialog', { name: 'Knie im Sitz (Prüfvorlage)' });
      // Alles Wählbare vorgewählt.
      await expect(vorschau.getByRole('checkbox')).toHaveCount(anzahl);
      for (const haken of await vorschau.getByRole('checkbox').all()) {
        await expect(haken).toBeChecked();
      }
      // Für die Therapeut:in die eine fehlende Übung als Zeile ohne Haken.
      await expect(
        vorschau.getByRole('listitem').filter({ hasText: 'nicht in der Bibliothek' }),
      ).toHaveCount(pflegt ? 0 : 1);
      for (const zeile of await vorschau.locator('label').all()) {
        expect(await hoehe(zeile)).toBeGreaterThanOrEqual(44);
      }
      expect(await ueberlaeuft(page)).toBe(false);
      expect(await axeVerstoesse(page)).toEqual([]);
      await z.tippe(vorschau.getByRole('button', { name: `${anzahl} hinzufügen` }));
      await expect(
        page.getByText(`${anzahl} Übungen hinzugefügt aus „Knie im Sitz (Prüfvorlage)“.`),
      ).toBeVisible({ timeout: 15_000 });
      await z.tippe(page.getByRole('button', { name: 'Zuweisen' }));
      await z.tippe(page.getByRole('dialog').getByRole('button', { name: 'Zuweisen' }));
      await expect(
        page.getByRole('status').getByRole('link', { name: 'Als PDF oder drucken' }),
      ).toBeVisible();
      // Die Bestätigung sagt, ob die Person den Plan auf der Plattform sieht.
      await expect(page.getByRole('status').filter({ hasText: 'Zugewiesen bis' })).toContainText(
        pflegt
          ? 'Erika sieht ihn auf der Plattform. Als PDF oder drucken'
          : 'Ohne Plattformzugang: Als PDF oder drucken mitgeben.',
      );

      const plan = [...nachbau.plaene.values()][0]!;
      expect(plan.status).toBe('assigned');
      expect(plan.items.map((i) => i['variant_id'])).toEqual([
        'v-KN-01',
        'v-KN-02',
        'v-KN-03',
        'v-KN-05',
        'v-KN-06',
        ...(pflegt ? ['v-AF-01'] : []),
      ]);
      // Was der Praxis fehlte, kam für owner still dazu.
      expect(nachbau.uebernommen).toEqual(pflegt ? ['AF-01'] : []);
      // Der leere Entwurf heißt danach wie die Vorlage.
      expect(plan.title).toBe('Knie im Sitz (Prüfvorlage)');
      // Vorher (bis Befund B9): 5 Tipps ohne Wahl, wenn alles in der Bibliothek
      // stand; fehlte etwas, für owner 6 Tipps mit allem, für die Therapeut:in
      // nur eine Warnung.
      test
        .info()
        .annotations.push({ type: 'Tipps', description: `${z.tipps} Tipps, keine Eingabe` });
      expect(z.tipps).toBe(5);
      expect(z.tipps).toBeLessThanOrEqual(5);
      expect(z.eingaben).toBe(0);
      expect(await ueberlaeuft(page)).toBe(false);
    });
  }

  test('aus einer Vorlage der Praxis: 5 Tipps; als Vorlage speichern: 3 Tipps (K12, UEB-014)', async ({
    page,
  }) => {
    test.slow();
    const nachbau = await mitNachbau(page);
    const dosis = (v: string, sets: number) => ({
      variant_id: v,
      sets,
      reps_min: 10,
      reps_max: 10,
      duration_seconds: null,
      hold_seconds: null,
      per_side: true,
      times_per_day: 2,
      load: null,
      tempo: null,
      rest_seconds: null,
      double_progression: false,
    });
    nachbau.vorlagen = [
      {
        id: 'vorlage-1',
        name: 'Zuhause nach dem Knie',
        goal: null,
        can_edit: true,
        created_by_name: 'Anna Beispiel',
        updated_on: HEUTE,
        items: [dosis('v-KN-01', 2), dosis('v-KN-05', 4)],
      },
    ];
    const z = new Zaehler();
    await page.goto(`${PRUEFSEITE}?seite=planbau`);
    await z.tippe(page.getByRole('button', { name: 'Neuer Plan' }));
    // Die Vorlage der Praxis steht vor den mitgelieferten.
    const erste = page.getByRole('button', { name: /Vorlage der Praxis/ }).first();
    await expect(erste).toContainText('Zuhause nach dem Knie');
    await z.tippe(erste);
    const vorschau = page.getByRole('dialog', { name: 'Zuhause nach dem Knie' });
    await expect(vorschau.getByRole('checkbox')).toHaveCount(2);
    expect(await ueberlaeuft(page)).toBe(false);
    expect(await axeVerstoesse(page)).toEqual([]);
    await z.tippe(vorschau.getByRole('button', { name: '2 hinzufügen' }));
    await expect(page.getByText('2 Übungen hinzugefügt aus „Zuhause nach dem Knie“.')).toBeVisible({
      timeout: 15_000,
    });
    await z.tippe(page.getByRole('button', { name: 'Zuweisen' }));
    await z.tippe(page.getByRole('dialog').getByRole('button', { name: 'Zuweisen' }));
    await expect(page.getByRole('status').filter({ hasText: 'Zugewiesen bis' })).toBeVisible();
    const plan = [...nachbau.plaene.values()][0]!;
    expect(plan.status).toBe('assigned');
    // Mit der Dosierung der Vorlage, nicht der Standarddosierung.
    expect(plan.items.map((i) => [i['variant_id'], i['sets'], i['times_per_day']])).toEqual([
      ['v-KN-01', 2, 2],
      ['v-KN-05', 4, 2],
    ]);
    test.info().annotations.push({ type: 'Tipps', description: `${z.tipps} Tipps (K12)` });
    expect(z.tipps).toBe(5);
    expect(z.eingaben).toBe(0);

    // Der zugewiesene Plan wird Vorlage: Knopf, Name steht schon, Speichern.
    const s = new Zaehler();
    await s.tippe(page.getByRole('button', { name: 'Als Vorlage speichern' }));
    const fenster = page.getByRole('dialog', { name: 'Als Vorlage speichern' });
    await expect(fenster.getByRole('textbox', { name: /^Name/ })).toHaveValue(
      'Zuhause nach dem Knie',
    );
    await fenster.getByRole('textbox', { name: /^Name/ }).fill('Knie, Woche 2');
    s.eingaben += 1;
    s.tipps += 1;
    expect(await ueberlaeuft(page)).toBe(false);
    await s.tippe(fenster.getByRole('button', { name: 'Speichern' }));
    await expect(page.getByText(/Als Vorlage „Knie, Woche 2“ gespeichert/)).toBeVisible();
    expect(nachbau.vorlagen.map((v) => v['name'])).toEqual([
      'Zuhause nach dem Knie',
      'Knie, Woche 2',
    ]);
    expect(nachbau.vorlagen[1]!['items']).toEqual([dosis('v-KN-01', 2), dosis('v-KN-05', 4)]);
    test
      .info()
      .annotations.push({ type: 'Tipps', description: `Als Vorlage: ${s.tipps} Tipps, 1 Eingabe` });
    expect(s.tipps).toBe(3);
  });
});
