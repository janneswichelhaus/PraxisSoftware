import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import {
  lebensmittelfehler,
  lebensmittelSchema,
  quelleSchema,
  type Lebensmittel,
  type LebensmittelAngaben,
  type Quelle,
} from '@/features/nutrition/lebensmittel';
import {
  MAHLZEITEN,
  schnellwahlSchema,
  tagSchema,
  zieleSchema,
  type Mahlzeit,
  type Mengenangabe,
} from '@/features/nutrition/tagebuch';
import { GESCHLECHTER, ZIELE, zielwerteSchema } from '@/features/nutrition/zielwerte';

// -----------------------------------------------------------------------------
// Ernährung (ADR-027) - die eigene laufende Beratung, Gewicht,
// Zielgewicht, Tagebuch und Einwilligung. Die Begleitung bekommt nichts
// (Recht nutrition); gerechnet hat der Server (`app.nutrition_calculation`).
// -----------------------------------------------------------------------------

const eigeneErnaehrungSchema = z.object({
  today: z.string(),
  can_write: z.boolean(),
  can_grant: z.boolean(),
  wording_version: z.string(),
  target_weight_floor_kg: z.number(),
  profile: z.object({
    started_on: z.string(),
    ended_on: z.string().nullable(),
    height_cm: z.number(),
    formula_sex: z.enum(GESCHLECHTER),
    body_fat_percent: z.number().nullable(),
    activity_pal: z.number(),
    goal: z.enum(ZIELE),
    target_weight_kg: z.number().nullable(),
    target_weight_source: z.enum(['counsellor', 'person']).nullable(),
    diary_enabled: z.boolean(),
    diary_changed_at: z.string().nullable(),
    consent: z
      .object({
        state: z.enum(['granted', 'withdrawn']),
        occurred_on: z.string(),
        source: z.enum(['practice', 'platform']),
      })
      .nullable(),
    weights: z.array(
      z.object({
        measured_on: z.string(),
        weight_kg: z.number(),
        source: z.enum(['practice', 'platform']),
      }),
    ),
    targets: zielwerteSchema,
    // Die eigenen Lebensmittel der Person.
    own_foods: z.array(lebensmittelSchema),
  }),
});

export type EigeneErnaehrung = z.infer<typeof eigeneErnaehrungSchema>;

export function ernaehrungSchluessel(zugangId: string) {
  return ['platform-nutrition', zugangId] as const;
}

/** Die eigene laufende Beratung; `null` heißt: keine oder ohne Recht. */
export async function ladeErnaehrung(zugangId: string): Promise<EigeneErnaehrung | null> {
  const satz = 'Ihre Ernährung konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_nutrition', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  const daten = ergebnis.data as { profile?: unknown } | null;
  if (daten === null || daten.profile === null || daten.profile === undefined) return null;
  return antwort(eigeneErnaehrungSchema, daten, satz);
}

function ernaehrungsfehler(meldung: string | undefined): Error {
  const m = meldung ?? '';
  if (m.includes('below floor'))
    return new Error('Dieses Zielgewicht liegt unter der Grenze. Bitte ein höheres wählen.');
  if (m.includes('future')) return new Error('Das Datum liegt in der Zukunft.');
  if (m.includes('before')) return new Error('Das Datum liegt vor dem Beginn der Beratung.');
  if (m.includes('check constraint') || m.includes('violates'))
    return new Error('Bitte das Gewicht in kg angeben, zwischen 20 und 350.');
  if (m.includes('not found')) return new Error('Ihre Praxis hat die Beratung beendet.');
  if (m.includes('wording outdated'))
    return new Error('Der Text der Einwilligung hat sich geändert. Bitte die Seite neu laden.');
  if (m.includes('consent') || m.includes('not allowed'))
    return new Error('Ihr Zugang erlaubt das gerade nicht. Bitte wenden Sie sich an die Praxis.');
  return new Error('Nicht gespeichert. Bitte die Verbindung prüfen und erneut versuchen.');
}

/** Ein Fehler des Servers als Satz für die Person. */
function ernaehrungsergebnis(antwort: { error: { message?: string } | null }): void {
  if (antwort.error) throw ernaehrungsfehler(antwort.error.message);
}

/** Das eigene Gewicht eintragen, eines je Tag (ADR-027 Punkt 5). */
export async function ernaehrungGewichtEintragen(
  zugangId: string,
  tag: string,
  gewicht: number,
): Promise<void> {
  ernaehrungsergebnis(
    (await getSupabase().rpc('record_platform_nutrition_weight', {
      p_access_id: zugangId,
      p_measured_on: tag,
      p_weight_kg: gewicht,
    })) as { error: { message?: string } | null },
  );
}

/** Das Zielgewicht wählen; `null` nimmt es zurück (ADR-027 Punkt 21). */
export async function ernaehrungZielgewichtSetzen(
  zugangId: string,
  zielgewicht: number | null,
): Promise<void> {
  ernaehrungsergebnis(
    (await getSupabase().rpc('set_platform_nutrition_target_weight', {
      p_access_id: zugangId,
      p_target_weight_kg: zielgewicht,
    })) as { error: { message?: string } | null },
  );
}

/** Das Tagebuch ein- oder ausschalten (ADR-027 Punkt 2). */
export async function ernaehrungTagebuchSchalten(zugangId: string, an: boolean): Promise<void> {
  ernaehrungsergebnis(
    (await getSupabase().rpc('set_platform_nutrition_diary', {
      p_access_id: zugangId,
      p_enabled: an,
    })) as { error: { message?: string } | null },
  );
}

/** Die Einwilligung „Ernährungsberatung“ erteilen oder widerrufen (ADR-027 Punkt 3). */
export async function ernaehrungEinwilligen(
  zugangId: string,
  erteilen: boolean,
  fassung: string,
): Promise<void> {
  ernaehrungsergebnis(
    (await getSupabase().rpc('record_platform_nutrition_consent', {
      p_access_id: zugangId,
      p_grant: erteilen,
      p_wording_version: fassung,
    })) as { error: { message?: string } | null },
  );
}

// -----------------------------------------------------------------------------
// Lebensmittel nachschlagen und eigene anlegen (ADR-027 Punkte 8 und 9). Gesucht wird im eigenen
// Katalog am Server, nie bei einem fremden Dienst; eigene Lebensmittel nur mit Einwilligung, nie
// die Begleitung.
// -----------------------------------------------------------------------------

/** Die Suche der Person (`search_platform_foods`). */
export async function lebensmittelSuchen(
  zugangId: string,
  begriff: string,
): Promise<Lebensmittel[]> {
  const satz = 'Die Suche hat nicht geklappt.';
  const { data, error } = (await getSupabase().rpc('search_platform_foods', {
    p_access_id: zugangId,
    p_query: begriff,
    p_limit: 20,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(lebensmittelSchema), data, satz);
}

/** Die Quellenangabe der Lebensmitteldaten. */
export async function lebensmittelQuellen(): Promise<Quelle[]> {
  const satz = 'Die Quellen konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_food_sources')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  return antwort(z.array(quelleSchema), data, satz);
}

/** Ein eigenes Lebensmittel anlegen (`id` null) oder ändern. */
export async function eigenesLebensmittelSpeichern(
  zugangId: string,
  id: string | null,
  angaben: LebensmittelAngaben,
): Promise<void> {
  const { error } = (await getSupabase().rpc('save_platform_food', {
    p_access_id: zugangId,
    p_id: id,
    p_food: angaben,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(lebensmittelfehler(error.message));
}

/** Ein eigenes Lebensmittel löschen. */
export async function eigenesLebensmittelLoeschen(zugangId: string, id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('delete_platform_food', {
    p_access_id: zugangId,
    p_id: id,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(lebensmittelfehler(error.message));
}

// -----------------------------------------------------------------------------
// Das Ernährungstagebuch (ADR-027 Punkte 10 und 11). Eintragen nur mit Einwilligung und
// eingeschaltetem Tagebuch, nie die Begleitung; gerechnet hat der Server aus Lebensmittel und
// Menge.
// -----------------------------------------------------------------------------

const tagebuchSchema = z.object({
  today: z.string(),
  started_on: z.string(),
  enabled: z.boolean(),
  can_write: z.boolean(),
  can_delete: z.boolean(),
  glass_ml: z.number(),
  // Die Einstellung der Person, zuletzt und Favoriten.
  hide_numbers: z.boolean(),
  recent: z.array(schnellwahlSchema),
  favorites: z.array(schnellwahlSchema),
  targets: zieleSchema,
  day: tagSchema,
});

export type EigenesTagebuch = z.infer<typeof tagebuchSchema>;

export function tagebuchSchluessel(zugangId: string, tag?: string) {
  return tag === undefined
    ? (['platform-nutrition-diary', zugangId] as const)
    : (['platform-nutrition-diary', zugangId, tag] as const);
}

/** Ein Tag des eigenen Tagebuchs; `null` heißt: keine Beratung oder ohne Recht. */
export async function ladeTagebuch(
  zugangId: string,
  tag: string | null,
): Promise<EigenesTagebuch | null> {
  const satz = 'Ihr Tagebuch konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_nutrition_diary', {
    p_access_id: zugangId,
    p_day: tag,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  const daten = ergebnis.data as { diary?: unknown } | null;
  if (daten === null || (daten && 'diary' in daten && daten.diary === null)) return null;
  return antwort(tagebuchSchema, daten, satz);
}

/** Ein Satz statt der Meldung des Servers (§13). */
export function tagebuchfehler(meldung: string | undefined): Error {
  const m = meldung ?? '';
  if (m.includes('future') || m.includes('before') || m.includes('outside'))
    return new Error('An diesem Tag lässt sich nichts eintragen.');
  if (m.includes('too many')) return new Error('An diesem Tag stehen schon 80 Einträge.');
  if (m.includes('food not found'))
    return new Error('Dieses Lebensmittel gibt es nicht mehr. Bitte neu suchen.');
  if (m.includes('entry not found')) return new Error('Dieser Eintrag ist schon gelöscht.');
  if (m.includes('portion or amount') || m.includes('unknown portion'))
    return new Error('Bitte die Menge prüfen.');
  if (m.includes('diary is off')) return new Error('Ihr Tagebuch ist ausgeschaltet.');
  if (m.includes('profile not found')) return new Error('Ihre Praxis hat die Beratung beendet.');
  if (m.includes('consent') || m.includes('not allowed'))
    return new Error('Ihr Zugang erlaubt das gerade nicht. Bitte wenden Sie sich an die Praxis.');
  return new Error('Nicht gespeichert. Bitte die Verbindung prüfen und erneut versuchen.');
}

function tagebuchergebnis(antwort: { error: { message?: string } | null }): void {
  if (antwort.error) throw tagebuchfehler(antwort.error.message);
}

/** Ein Lebensmittel ins Tagebuch - mit Portion und Anzahl oder in g bzw. ml. */
export async function tagebuchEintragen(
  zugangId: string,
  tag: string,
  mahlzeit: Mahlzeit,
  lebensmittel: { kind: 'catalog' | 'practice' | 'person'; id: string },
  angabe: Mengenangabe,
): Promise<void> {
  tagebuchergebnis(
    (await getSupabase().rpc('add_platform_diary_entry', {
      p_access_id: zugangId,
      p_eaten_on: tag,
      p_meal: mahlzeit,
      p_food_kind: lebensmittel.kind,
      p_food_id: lebensmittel.id,
      p_amount: angabe.art === 'menge' ? angabe.menge : null,
      p_portion_label: angabe.art === 'portion' ? angabe.label : null,
      p_portion_count: angabe.art === 'portion' ? angabe.anzahl : null,
    })) as { error: { message?: string } | null },
  );
}

/** Mahlzeit und Menge eines Eintrags ändern; die Portion bleibt dieselbe. */
export async function tagebuchAendern(
  zugangId: string,
  id: string,
  mahlzeit: Mahlzeit,
  angabe: { menge: number | null; anzahl: number | null },
): Promise<void> {
  tagebuchergebnis(
    (await getSupabase().rpc('update_platform_diary_entry', {
      p_access_id: zugangId,
      p_id: id,
      p_meal: mahlzeit,
      p_amount: angabe.menge,
      p_portion_count: angabe.anzahl,
    })) as { error: { message?: string } | null },
  );
}

/** Einen Eintrag löschen - auch nach einem Widerruf. */
export async function tagebuchLoeschen(zugangId: string, id: string): Promise<void> {
  tagebuchergebnis(
    (await getSupabase().rpc('delete_platform_diary_entry', {
      p_access_id: zugangId,
      p_id: id,
    })) as { error: { message?: string } | null },
  );
}

/** Wasser zählen: ein Glas dazu oder wieder weg; liefert die Menge des Tages. */
export async function wasserZaehlen(zugangId: string, tag: string, ml: number): Promise<number> {
  const { data, error } = (await getSupabase().rpc('add_platform_water', {
    p_access_id: zugangId,
    p_drunk_on: tag,
    p_delta_ml: ml,
  })) as { data: unknown; error: { message?: string } | null };
  if (error) throw tagebuchfehler(error.message);
  return antwort(z.number(), data, 'Nicht gespeichert.');
}

/** Ein Lebensmittel als Favorit markieren oder abnehmen. */
export async function favoritSetzen(
  zugangId: string,
  lebensmittel: { kind: 'catalog' | 'practice' | 'person'; id: string },
  favorit: boolean,
): Promise<void> {
  tagebuchergebnis(
    (await getSupabase().rpc('set_platform_diary_favorite', {
      p_access_id: zugangId,
      p_food_kind: lebensmittel.kind,
      p_food_id: lebensmittel.id,
      p_favorite: favorit,
    })) as { error: { message?: string } | null },
  );
}

/** Eine Mahlzeit (oder ohne Mahlzeit den Tag) an einen anderen Tag kopieren. */
export async function tagebuchKopieren(
  zugangId: string,
  vonTag: string,
  mahlzeit: Mahlzeit | null,
  nachTag: string,
): Promise<number> {
  const { data, error } = (await getSupabase().rpc('copy_platform_diary', {
    p_access_id: zugangId,
    p_from_day: vonTag,
    p_from_meal: mahlzeit,
    p_to_day: nachTag,
    p_to_meal: null,
  })) as { data: unknown; error: { message?: string } | null };
  if (error) {
    if ((error.message ?? '').includes('onto itself'))
      throw new Error('Bitte einen anderen Tag wählen.');
    throw tagebuchfehler(error.message);
  }
  return antwort(z.number(), data, 'Nicht kopiert.');
}

/** „Zahlen ausblenden“ ein- und ausschalten (ADR-027 Punkt 11). */
export async function zahlenAusblenden(zugangId: string, ausblenden: boolean): Promise<void> {
  tagebuchergebnis(
    (await getSupabase().rpc('set_platform_diary_hide_numbers', {
      p_access_id: zugangId,
      p_hide: ausblenden,
    })) as { error: { message?: string } | null },
  );
}

// Erinnerungen an das Tagebuch (ADR-027 Punkt 12) - je Zugang und
// Mahlzeit eine Uhrzeit, dazu die Wege dieser Art; von Anfang an aus.

const erinnerungenSchema = z.object({
  reminders: z.array(z.object({ meal: z.enum(MAHLZEITEN), time: z.string() })),
  email: z.boolean(),
  push: z.boolean(),
  switched_off: z.boolean(),
  quiet_from: z.number(),
  quiet_until: z.number(),
});

export type Tagebucherinnerungen = z.infer<typeof erinnerungenSchema>;

export function erinnerungenSchluessel(zugangId: string) {
  return ['platform-diary-reminders', zugangId] as const;
}

/** Die eigenen Erinnerungen; `null` heißt: keine Beratung oder ohne Recht. */
export async function ladeErinnerungen(zugangId: string): Promise<Tagebucherinnerungen | null> {
  const satz = 'Ihre Erinnerungen konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('platform_diary_reminders', {
    p_access_id: zugangId,
  })) as { data: { reminders?: unknown } | null; error: unknown };
  if (error) throw new Error(satz);
  if (data === null || data.reminders === null) return null;
  return antwort(erinnerungenSchema, data, satz);
}

/** Die Wahl ersetzen: Uhrzeiten je Mahlzeit, per Mail, per Push. */
export async function erinnerungenSpeichern(
  zugangId: string,
  erinnerungen: { meal: Mahlzeit; time: string }[],
  wege: { email: boolean; push: boolean },
): Promise<void> {
  tagebuchergebnis(
    (await getSupabase().rpc('set_platform_diary_reminders', {
      p_access_id: zugangId,
      p_reminders: erinnerungen,
      p_email: wege.email,
      p_push: wege.push,
    })) as { error: { message?: string } | null },
  );
}
