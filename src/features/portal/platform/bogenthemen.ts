import { gewaehlteKennungen, type Antworten } from '@/features/clinical/assessments/antworten';
import type { ScoreDefinition, ScoreItem } from '@/features/clinical/assessments/schema';
import { bogenschritte, schrittTitel } from './bogenschritte';

// Ein Thema je Seite nach den Gruppen des Vordrucks; Fragen, Folge und Antworten bleiben. Ohne
// passenden Plan gilt `bogenschritte.ts`. Das Feld der Praxis fehlt hier nur in der Anzeige - die
// Zugriffskontrolle liegt am Server.

/** Eine Frage des Bogens, wie die Plattform sie stellt. */
export interface Bogenfrage {
  item: ScoreItem;
  /** Freitext in drei Zeilen (`TextArea`) statt in einer (`Field`). */
  mehrzeilig: boolean;
  /** Eine Folgefrage erscheint erst mit dieser Wahl bei ihrer Frage (26 mit „Welche/n?“ …). */
  folgeVon?: { itemId: string; wahl: string } | undefined;
}

export interface Bogenthema {
  titel: string;
  fragen: readonly Bogenfrage[];
  /** Eine Linie zwischen den Fragen: viele gleich gebaute Fragen unter einem Hinweis (Thema 8). */
  linien: boolean;
}

interface Themenplan {
  themen: readonly { titel: string; items: readonly string[]; linien?: true }[];
  mehrzeilig: readonly string[];
  folgefragen: Readonly<Record<string, { wahl: string; fragen: readonly string[] }>>;
}

/** Je Vorlage die Themen mit den Kennungen ihrer Items, in der Folge des Vordrucks. */
const PLAENE: Readonly<Record<string, Themenplan>> = {
  anamnese_v8: {
    themen: [
      { titel: 'Zu Ihrer Person', items: ['beruf', 'sport_hobby'] },
      { titel: 'Wo haben Sie Beschwerden?', items: ['beschwerden_ort'] },
      { titel: 'Ihre Schmerzen heute', items: ['schmerzen_aktuell', 'schmerzstaerke'] },
      {
        titel: 'Schmerzen, Beweglichkeit und Kraft',
        items: ['schmerzart', 'beweglichkeit_veraendert', 'kraft_vermindert'],
      },
      { titel: 'Wie fühlen sich die Beschwerden an?', items: ['merkmale', 'weitere_beschwerden'] },
      {
        titel: 'Seit wann und wie?',
        items: ['beschwerden_seit', 'beschwerden_zeitlich', 'beschwerden_verlauf'],
      },
      {
        titel: 'Was verbessert, was verschlechtert?',
        items: ['verbessert_durch', 'verschlechtert_durch'],
      },
      {
        titel: 'Die vergangenen zwei Wochen',
        items: [
          'schmerz_durchschnitt',
          'unsicher_umgang',
          'stark_gestoert',
          'kurze_wege',
          'mehrere_koerperteile',
          'lange_anhalten',
          'andere_gesundheitsprobleme',
          'niedergeschlagen',
        ],
        linien: true,
      },
      { titel: 'Ihre Einschätzung', items: ['aktivitaet_schaedlich', 'seit_sechs_monaten'] },
      {
        titel: 'Beobachtungen der letzten Wochen',
        items: ['symptome_neurologisch', 'symptome_organisch', 'symptome_allgemein'],
      },
      {
        titel: 'Vorerkrankungen und Ereignisse',
        items: [
          'tumor',
          'tumor_welcher',
          'tumor_wann',
          'tumor_nachuntersuchung',
          'erkrankungen',
          'ereignisse',
          'wechseljahre_schwangerschaft',
        ],
      },
      { titel: 'Medikamente', items: ['medikamente'] },
      {
        titel: 'Alltag und Lebensstil',
        items: [
          'rauchen',
          'ernaehrung',
          'bewegung',
          'krafttraining',
          'schlaf',
          'stress_arbeit',
          'stress_alltag',
        ],
      },
      {
        titel: 'Untersuchungen, Erwartungen und Ziele',
        items: ['bisherige_massnahmen', 'erwartungen_ziele'],
      },
    ],
    mehrzeilig: ['weitere_beschwerden', 'erwartungen_ziele'],
    folgefragen: {
      tumor: { wahl: 'ja', fragen: ['tumor_welcher', 'tumor_wann', 'tumor_nachuntersuchung'] },
    },
  },
};

/** Die Themen einer Vorlage auf der Plattform, ohne das Feld der Praxis. */
export function bogenthemen(definition: ScoreDefinition): Bogenthema[] {
  const items = definition.items.filter((item) => item.ausgefuellt_von !== 'therapeut');
  const plan = PLAENE[definition.meta.id];
  if (plan && passt(plan, items)) {
    const nachKennung = new Map(items.map((item) => [item.id, item]));
    const folge = new Map(
      Object.entries(plan.folgefragen).flatMap(([itemId, { wahl, fragen }]) =>
        fragen.map((frage) => [frage, { itemId, wahl }] as const),
      ),
    );
    return plan.themen.map((thema) => ({
      titel: thema.titel,
      linien: thema.linien === true,
      fragen: thema.items.map((kennung) => ({
        item: nachKennung.get(kennung)!,
        mehrzeilig: plan.mehrzeilig.includes(kennung),
        folgeVon: folge.get(kennung),
      })),
    }));
  }
  return bogenschritte(items).map((schritt) => ({
    titel: schrittTitel(schritt),
    linien: false,
    fragen: schritt.map((item) => ({ item, mehrzeilig: item.typ === 'freitext' })),
  }));
}

/** Passt der Plan zur Fassung? Jedes Item genau einmal, in der Folge der Vorlage. */
function passt(plan: Themenplan, items: readonly ScoreItem[]): boolean {
  const kennungen = plan.themen.flatMap((thema) => thema.items);
  return (
    kennungen.length === items.length && kennungen.every((kennung, i) => items[i]?.id === kennung)
  );
}

/** Die Hinweise für Papier entfallen auf der Plattform, ebenso ein Doppelpunkt am Ende. */
const PAPIERHINWEIS = /\s*\(bitte (?:einzeichnen|kennzeichnen)\)/g;

/** Der Wortlaut der Vorlage ohne Hinweis für Papier: „Wo haben Sie Ihre Beschwerden?“. */
export function wortlaut(item: ScoreItem): string {
  return item.text.replace(PAPIERHINWEIS, '').replace(/:\s*$/, '').trim();
}

/** Die Frage mit ihrer Nummer, wie die Plattform sie zeigt: „1. Wo haben Sie Ihre Beschwerden?“. */
export function frageText(item: ScoreItem): string {
  return `${item.nummer === undefined ? '' : `${item.nummer}. `}${wortlaut(item)}`;
}

/** Die Überschrift der Seite: die Frage, wenn das Thema nur eine hat, sonst sein Titel. */
export function seitentitel(thema: Bogenthema): string {
  const [einzige, ...weitere] = thema.fragen;
  return einzige && weitere.length === 0 ? frageText(einzige.item) : thema.titel;
}

/** „0 heißt „kein Schmerz“, 10 heißt „maximaler Schmerz“.“ - der Satz über der Skala. */
export function ankerSatz(item: ScoreItem): string | null {
  if (!item.anker || !item.skala) return null;
  return `${item.skala.min} heißt „${item.anker.min}“, ${item.skala.max} heißt „${item.anker.max}“.`;
}

/** Eine Einzelwahl aus genau „ja“ und „nein“: zwei Flächen nebeneinander. */
export function istJaNein(item: ScoreItem): boolean {
  const woerter = (item.optionen ?? []).map((option) => option.label);
  return item.typ === 'einzelauswahl' && woerter.join('|') === 'ja|nein';
}

/** Folgefragen erst mit ihrer Wahl - oder wenn sie aus einem Entwurf schon eine Antwort tragen. */
export function sichtbar(frage: Bogenfrage, antworten: Antworten): boolean {
  if (!frage.folgeVon) return true;
  const { itemId, wahl } = frage.folgeVon;
  return (
    gewaehlteKennungen(antworten[itemId]).includes(wahl) || antworten[frage.item.id] !== undefined
  );
}

/** Wie viele sichtbare Fragen des Themas offen sind; verborgene Folgefragen zählen nicht. */
export function offeneFragen(thema: Bogenthema, antworten: Antworten): number {
  return thema.fragen.filter(
    (frage) => sichtbar(frage, antworten) && antworten[frage.item.id] === undefined,
  ).length;
}

/** „2 Fragen offen“, „1 Frage offen“. */
export function offenText(anzahl: number): string {
  return anzahl === 1 ? '1 Frage offen' : `${anzahl} Fragen offen`;
}

/** Wo der Bogen öffnet: nach dem letzten Thema mit Antwort, nach dem letzten beim Abschluss. */
export function beginn(themen: readonly Bogenthema[], antworten: Antworten): number {
  let letztes = -1;
  themen.forEach((thema, index) => {
    if (thema.fragen.some((frage) => antworten[frage.item.id] !== undefined)) letztes = index;
  });
  return letztes + 1;
}
