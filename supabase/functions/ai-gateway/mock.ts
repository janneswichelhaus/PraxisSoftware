// Der Adapter ohne Anbieter (ADR-005 Punkt 5), in der Produktion ausgeschlossen (`auswahl.ts`).
// Er hört die Aufnahme nicht an, liefert immer dasselbe synthetische Diktat und gibt sich mit
// `quelle: 'nachbildung'` zu erkennen; die Zuordnung folgt festen Signalwörtern.

import { DIKTAT_ABSCHNITTE } from './zwecke.ts';
import type {
  Adapterergebnis,
  Assistenzadapter,
  Auswahlanfrage,
  Fundstelle,
  Fundstellenanfrage,
  Satzstelle,
  Sprachadapter,
  Umformanfrage,
  Zuordnungsanfrage,
} from './typen.ts';

/**
 * Das feste, synthetische Diktat der Nachbildung - mit allem, was die Inhaltstreue nach §6.3
 * erhalten muss: Zahlen, Körperseiten, Verneinung, Unsicherheit, Aussage und Beobachtung.
 */
export const NACHGEBILDETES_DIKTAT =
  'Patientin berichtet, das rechte Knie sei seit dem letzten Termin besser, Schmerz drei von zehn. ' +
  'Keine Schwellung. Beugung rechts 110 Grad, links 135 Grad. ' +
  'Mobilisation Knie rechts und Kräftigung Quadrizeps. ' +
  'Eigenübungen weiter, vielleicht nächstes Mal Treppe [unverständlich].';

/**
 * Signalwörter je Abschnitt, in der Reihenfolge der Prüfung, nur als ganzes Wort. Berichtende
 * Verben zuerst: „Patientin sagt, die Mobilisation habe geholfen" ist ihre Aussage.
 */
const ANSAGE = /^(?:(Angaben|Anamnese)|(Befund)|(Behandlung)|(Plan))(?![\p{L}\p{N}])/iu;
const SIGNALE: readonly { readonly abschnitt: string; readonly muster: RegExp }[] = [
  {
    abschnitt: 'Angaben der Patient:in',
    muster:
      /(?<![\p{L}\p{N}])(?:berichtet|gibt an|sagt|klagt|äußert|erzählt|beschreibt)(?![\p{L}\p{N}])/iu,
  },
  {
    abschnitt: 'Plan',
    muster:
      /(?<![\p{L}\p{N}])(?:Plan|nächstes Mal|nächste Woche|weiter mit|Hausaufgabe)(?![\p{L}\p{N}])/iu,
  },
  {
    abschnitt: 'Behandlung',
    muster:
      /(?<![\p{L}\p{N}])(?:Behandlung|behandelt|Mobilisation|Kräftigung|Dehnung|Massage|Lymphdrainage|Gangschule)(?![\p{L}\p{N}])/iu,
  },
  {
    abschnitt: 'Befund',
    muster:
      /(?<![\p{L}\p{N}])(?:Befund|Schwellung|Beugung|Streckung|Grad|tastbar|Rötung|Druckschmerz|Beweglichkeit)(?![\p{L}\p{N}])/iu,
  },
];

/** Der Abschnitt eines Satzes - oder `null`, wenn kein Signal darin steht. */
function abschnittVon(satz: string): string | null {
  const ansage = ANSAGE.exec(satz);
  if (ansage) {
    if (ansage[1]) return 'Angaben der Patient:in';
    if (ansage[2]) return 'Befund';
    if (ansage[3]) return 'Behandlung';
    return 'Plan';
  }
  return SIGNALE.find(({ muster }) => muster.test(satz))?.abschnitt ?? null;
}

/**
 * Je Satz ein Titel der Vorlage. Ein Satz ohne Signal folgt dem vorigen, der erste ohne Signal
 * gilt als Befund; was die Vorlage nicht kennt, fällt auf den Befund.
 */
export function ordneZu(liste: readonly string[], vorlage: readonly string[]): string[] {
  const reihenfolge = vorlage.length > 0 ? vorlage : DIKTAT_ABSCHNITTE;
  const fallback = reihenfolge.includes('Befund') ? 'Befund' : reihenfolge[0]!;
  let zuletzt = fallback;
  return liste.map((satz) => {
    const gefunden = abschnittVon(satz) ?? zuletzt;
    zuletzt = reihenfolge.includes(gefunden) ? gefunden : fallback;
    return zuletzt;
  });
}

export function erstelleNachbildung(): Sprachadapter {
  return {
    id: 'mock',
    quelle: 'nachbildung',
    transkribiere(): Promise<Adapterergebnis<{ readonly transkript: string }>> {
      return Promise.resolve({ ok: true, value: { transkript: NACHGEBILDETES_DIKTAT } });
    },
    ordneZu(
      anfrage: Zuordnungsanfrage,
    ): Promise<Adapterergebnis<{ readonly zuordnung: readonly string[] }>> {
      return Promise.resolve({
        ok: true,
        value: { zuordnung: ordneZu(anfrage.saetze, anfrage.abschnitte) },
      });
    },
  };
}

// Abkürzungen, die die Nachbildung ausschreibt - ohne Zahl, Einheit oder Seite zu ändern. Eine
// Seite vor einem Hauptwort („re. Knie“) bleibt stehen: Beugen kann die Nachbildung nicht.
const AUSGESCHRIEBEN: readonly (readonly [RegExp, string])[] = [
  [/(?<![\p{L}\p{N}])(?:tägl|tgl)\.(?![\p{L}\p{N}])/giu, 'täglich'],
  [/(?<![\p{L}\p{N}])evtl\.(?![\p{L}\p{N}])/giu, 'eventuell'],
  [/(?<![\p{L}\p{N}])ggf\.(?![\p{L}\p{N}])/giu, 'gegebenenfalls'],
  [/(?<![\p{L}\p{N}])[Ll]i\.(?![\p{L}\p{N}]|\s+\p{Lu})/gu, 'links'],
  [/(?<![\p{L}\p{N}])[Rr]e\.(?![\p{L}\p{N}]|\s+\p{Lu})/gu, 'rechts'],
  [/(?<![\p{L}\p{N}])[Bb]ds\.(?![\p{L}\p{N}]|\s+\p{Lu})/gu, 'beidseits'],
  [/(?<![\p{L}\p{N}])Min\.(?![\p{L}\p{N}])/gu, 'Minuten'],
  [/(?<![\p{L}\p{N}])Std\.(?![\p{L}\p{N}])/gu, 'Stunden'],
  [/(?<![\p{L}\p{N}])Wdh\.(?![\p{L}\p{N}])/gu, 'Wiederholungen'],
  [/(?<=\d)\s*[x×](?![\p{L}\p{N}])/giu, '-mal'],
];

/** Abkürzungen ausgeschrieben; war ihr Punkt zugleich das Satzende, bleibt eines stehen. */
function ausgeschrieben(text: string): string {
  let satz = text.trim();
  const beendet = /[.!?…]$/u.test(satz);
  for (const [muster, wort] of AUSGESCHRIEBEN) satz = satz.replace(muster, wort);
  return beendet && !/[.!?…]$/u.test(satz) ? `${satz}.` : satz;
}

/** Ein Stichpunkt als Satz: Abkürzungen ausgeschrieben, groß begonnen, mit Punkt beendet. */
export function ausformuliert(stichpunkt: string): string {
  const satz = ausgeschrieben(stichpunkt);
  const gross = satz.charAt(0).toUpperCase() + satz.slice(1);
  return /[.!?…]$/u.test(gross) ? gross : `${gross}.`;
}

/** Fachwörter, die die Nachbildung in Klammern erklärt - eine feste Liste, kein Wörterbuch. */
const ERKLAERT = new Map<string, string>([
  ['flexion', 'Beugung'],
  ['extension', 'Streckung'],
  ['rotation', 'Drehung'],
  ['abduktion', 'Abspreizen'],
  ['adduktion', 'Heranführen'],
  ['quadrizeps', 'vorderer Oberschenkelmuskel'],
  ['ödem', 'Schwellung'],
  ['hämatom', 'Bluterguss'],
  ['lateral', 'außen'],
  ['medial', 'innen'],
  ['dorsal', 'hinten'],
  ['ventral', 'vorn'],
  ['proximal', 'zum Rumpf hin'],
  ['distal', 'vom Rumpf weg'],
  ['lws', 'Lendenwirbelsäule'],
  ['hws', 'Halswirbelsäule'],
  ['bws', 'Brustwirbelsäule'],
  ['isg', 'Kreuz-Darmbein-Gelenk'],
  ['patella', 'Kniescheibe'],
  ['skapula', 'Schulterblatt'],
  ['thorax', 'Brustkorb'],
  ['analgetikum', 'Schmerzmittel'],
  ['kontraktur', 'dauerhafte Bewegungseinschränkung'],
  ['palpation', 'Abtasten'],
  ['tonus', 'Muskelspannung'],
  ['parästhesien', 'Kribbeln'],
]);

/** Ein Satz mit ausgeschriebenen Abkürzungen und erklärten Fachwörtern; alles andere bleibt. */
export function alltagssprachlich(satz: string): string {
  const teile = ausgeschrieben(satz).split(/([\p{L}\p{N}]+)/u);
  return teile
    .map((teil, stelle) => {
      const erklaerung = ERKLAERT.get(teil.toLowerCase());
      if (erklaerung === undefined || (teile[stelle + 1] ?? '').startsWith(' (')) return teil;
      return `${teil} (${erklaerung})`;
    })
    .join('');
}

/** Die Auswahl der Nachbildung: je Eintrag der erste und der letzte Satz - kein Urteil. */
export function ersterUndLetzter(eintraege: readonly (readonly string[])[]): Satzstelle[] {
  return eintraege.flatMap((saetze, eintrag) => {
    if (saetze.length === 0) return [];
    const stellen = [...new Set([0, saetze.length - 1])];
    return stellen.map((satz) => ({ eintrag, satz }));
  });
}

/**
 * Die feste, synthetische Verordnung der Nachbildung. Sie liest das Foto nicht; das Testbild der
 * Ablaufbilder zeigt dieselben Zeilen. Rein erfunden, kein realer Fall.
 */
export const NACHGEBILDETE_VERORDNUNG = [
  'Heilmittelverordnung (synthetisch)',
  'Ausgestellt am 02.11.2026',
  'Folgeverordnung',
  'Dr. med. Petra Probst',
  'ICD-10: M17.1',
  'Gonarthrose rechts, Belastungsschmerz',
  'Krankengymnastik 6 x',
  'Manuelle Therapie 6 x',
  'Hausbesuch: ja',
] as const;

/** Feste Muster je Feld; die erste Gruppe ist der Wert, ohne Gruppe der ganze Treffer. */
const FELDMUSTER: readonly { readonly feld: string; readonly muster: RegExp }[] = [
  { feld: 'ausgestellt_am', muster: /(?:ausgestellt|datum)\D*?(\d{1,2}\.\d{1,2}\.\d{2,4})/i },
  { feld: 'art', muster: /\b(?:erst|folge)verordnung\b/i },
  { feld: 'verordnende', muster: /^(?:Dr\.|Prof\.)\s.+$/ },
  { feld: 'icd10', muster: /ICD-?10\s*:?\s*([A-Z]\d{2}\.?[0-9A-Z]{0,4})/ },
  { feld: 'heilmittel', muster: /^(?:Krankengymnastik|Manuelle Therapie|KG|MT)\b.*\d+\s*x\b.*$/i },
  { feld: 'hausbesuch', muster: /^Hausbesuch\b.*$/i },
];

/**
 * Die Fundstellen der Nachbildung: je Zeile das erste passende Muster; die Diagnose ist die
 * Zeile nach dem ICD-Code, wenn kein Muster sie nimmt. Nur Felder, nach denen gefragt ist.
 */
export function findeFelder(zeilen: readonly string[], felder: readonly string[]): Fundstelle[] {
  const stellen: Fundstelle[] = [];
  let icdZeile = -1;
  for (const [zeile, text] of zeilen.entries()) {
    const passend = FELDMUSTER.map(({ feld, muster }) => ({
      feld,
      treffer: muster.exec(text),
    })).find(({ treffer }) => treffer !== null);
    if (passend?.treffer) {
      const wert = passend.treffer[1] ?? passend.treffer[0];
      const von = text.indexOf(wert, passend.treffer.index);
      stellen.push({ feld: passend.feld, zeile, von, bis: von + wert.length });
      if (passend.feld === 'icd10') icdZeile = zeile;
    } else if (zeile === icdZeile + 1 && icdZeile >= 0) {
      stellen.push({ feld: 'diagnose', zeile, von: 0, bis: text.length });
    }
  }
  const zahl = new Map<string, number>();
  return stellen.filter((stelle) => {
    if (!felder.includes(stelle.feld)) return false;
    zahl.set(stelle.feld, (zahl.get(stelle.feld) ?? 0) + 1);
    return stelle.feld === 'heilmittel' ? zahl.get(stelle.feld)! <= 4 : zahl.get(stelle.feld) === 1;
  });
}

/** Die Hilfen ohne Ton als Nachbildung: feste Regeln statt eines Sprachmodells. */
export function erstelleAssistenznachbildung(): Assistenzadapter {
  return {
    id: 'mock',
    quelle: 'nachbildung',
    ordneZu(
      anfrage: Zuordnungsanfrage,
    ): Promise<Adapterergebnis<{ readonly zuordnung: readonly string[] }>> {
      return Promise.resolve({
        ok: true,
        value: { zuordnung: ordneZu(anfrage.saetze, anfrage.abschnitte) },
      });
    },
    formuliere(
      anfrage: Umformanfrage,
    ): Promise<Adapterergebnis<{ readonly saetze: readonly string[] }>> {
      const umformen = anfrage.aufgabe === 'alltagssprache' ? alltagssprachlich : ausformuliert;
      return Promise.resolve({ ok: true, value: { saetze: anfrage.saetze.map(umformen) } });
    },
    waehleAus(
      anfrage: Auswahlanfrage,
    ): Promise<Adapterergebnis<{ readonly auswahl: readonly Satzstelle[] }>> {
      return Promise.resolve({ ok: true, value: { auswahl: ersterUndLetzter(anfrage.eintraege) } });
    },
    erkenne(): Promise<Adapterergebnis<{ readonly zeilen: readonly string[] }>> {
      return Promise.resolve({ ok: true, value: { zeilen: NACHGEBILDETE_VERORDNUNG } });
    },
    findeFelder(
      anfrage: Fundstellenanfrage,
    ): Promise<Adapterergebnis<{ readonly fundstellen: readonly Fundstelle[] }>> {
      return Promise.resolve({
        ok: true,
        value: { fundstellen: findeFelder(anfrage.zeilen, anfrage.felder) },
      });
    },
  };
}
