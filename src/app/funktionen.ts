import { arbeitsbereiche } from './navigation';
import { BEGRIFFE, BEREICHE } from '@/lib/begriffe';
import {
  canManageAppointments,
  canManageStaffMasterData,
  canReadPatientDirectory,
  canWriteTreatmentBases,
  type CurrentUser,
} from '@/features/session/types';

/**
 * Der Katalog, den die Kopfleistensuche durchsucht (UX-013).
 *
 * Die Suchleiste suchte bis hierher **Namen** (UX-004). Festlegung von Jannes
 * (E17, 2026-09-16): Sie sucht **Funktionen und Bereiche** — und seit dem
 * 2026-09-18 zusätzlich weiterhin Namen, in einer zweiten Gruppe darunter
 * (E17 Fassung 2, ANN-061). Diese Datei ist die erste Gruppe: Bereiche,
 * Seiten und Vorgänge, also alles, was die Anwendung selbst kann.
 *
 * Zwei Dinge hält der Katalog bewusst auseinander:
 *
 *   * **Bereiche und Seiten leitet er ab**, aus `arbeitsbereiche(user)`. Eine
 *     zweite, von Hand gepflegte Liste derselben Menüpunkte würde beim ersten
 *     umbenannten Bereich auseinanderlaufen.
 *   * **Vorgänge stehen hier ausgeschrieben.** Sie sind keine Menüpunkte,
 *     sondern Wege in ein Formular, und nur die mit einer eigenen Adresse
 *     können überhaupt aus der Suche heraus beginnen.
 *
 * **Die Rollenprüfung ist Relevanz, keine Zugriffskontrolle**
 * (`PROJECT_PRINCIPLES.md` §4.7, ADR-004): Sie hält die Liste bei dem, was die
 * angemeldete Rolle im Alltag aufruft. Wer eine Adresse trotzdem eintippt,
 * bekommt vom Server keine Daten — die Grenze liegt in den RLS-Policies, und
 * ein fehlender Treffer ist keine.
 */

export type Funktionsart = 'Bereich' | 'Seite' | 'Vorgang';

export interface Funktion {
  /** Stabil über Rollen hinweg, damit Tests und Trefferliste ihn benennen können. */
  id: string;
  art: Funktionsart;
  bezeichnung: string;
  /** Wohin der Treffer führt. Immer ein anwendungsinterner Pfad. */
  ziel: string;
  /** Der Arbeitsbereich, in dem sie liegt — zweite Zeile am Treffer. */
  bereich?: string;
  /** Kurzer Zusatz, wo die Bezeichnung allein zu wenig sagt. */
  hinweis?: string;
  /** Weitere Wörter, unter denen gefunden wird, ohne dass sie dastehen. */
  stichworte?: readonly string[];
  /** Vorschaubereich ohne Hintergrundfunktionen (`development/ARBEITSBEREICHE.md`). */
  vorschau?: boolean;
  /**
   * Nimmt den Rückweg mit (UX-012b).
   *
   * Nur Vorgänge: Wer mitten im Kalender eine Fehlzeit einträgt, will danach
   * zurück in den Kalender. Ein Bereich ist dagegen das Ziel selbst und
   * schleppte den Rückweg nur durch die Adresszeile.
   */
  rueckweg?: boolean;
}

/**
 * Vergleichsform eines Suchworts.
 *
 * Dieselben Regeln wie `app.suchform` in
 * `supabase/migrations/20260910110000_patient_search.sql`: Kleinschreibung,
 * Umlaute und Akzente auf Grundbuchstaben, `ß`/`ae`/`oe`/`ue` eingeebnet. Wer
 * „Ubersicht" tippt, weil die Umlauttaste auf dem Weg ist, findet die
 * Übersicht — und zwar nach derselben Regel, nach der er „Muller" findet.
 */
export function suchform(text: string): string {
  const grund: Record<string, string> = {
    ä: 'a',
    ö: 'o',
    ü: 'u',
    à: 'a',
    á: 'a',
    â: 'a',
    ã: 'a',
    å: 'a',
    è: 'e',
    é: 'e',
    ê: 'e',
    ë: 'e',
    ì: 'i',
    í: 'i',
    î: 'i',
    ï: 'i',
    ò: 'o',
    ó: 'o',
    ô: 'o',
    õ: 'o',
    ù: 'u',
    ú: 'u',
    û: 'u',
    ý: 'y',
    ñ: 'n',
    ç: 'c',
  };
  return text
    .toLowerCase()
    .replace(/[äöüàáâãåèéêëìíîïòóôõùúûýñç]/g, (zeichen) => grund[zeichen] ?? zeichen)
    .replace(/ß/g, 'ss')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u');
}

/**
 * Die Vorgänge mit eigener Adresse.
 *
 * Jeder Eintrag steht unter derselben Rollenbedingung wie seine Route in
 * `src/routes/AuthenticatedRoutes.tsx`. Läuft die dort auseinander, führt die
 * Suche auf eine Weiterleitung statt ins Formular — deshalb stehen die
 * Bedingungen hier als dieselben Funktionen und nicht als eigene Rollenliste.
 */
function vorgaenge(user: CurrentUser): Funktion[] {
  const { roles } = user;
  const eintraege: Funktion[] = [];

  if (canReadPatientDirectory(roles)) {
    eintraege.push({
      id: 'vorgang-patient-suchen',
      art: 'Vorgang',
      bezeichnung: `${BEGRIFFE.patientIn} suchen`,
      // Namen findet diese Leiste seit E17 Fassung 2 selbst, in der Gruppe
      // darunter. Dieser Treffer führt deshalb dorthin, wo mehr steht als der
      // Sprung in eine Akte: in die Kartei mit Filtern und Status.
      hinweis: 'Kartei mit Filtern und Status',
      ziel: '/patienten',
      bereich: BEREICHE.patienten.label,
      stichworte: ['name', 'akte', 'kartei', 'finden'],
    });
    eintraege.push({
      id: 'vorgang-patient-anlegen',
      art: 'Vorgang',
      bezeichnung: `${BEGRIFFE.patientIn} anlegen`,
      ziel: '/patienten/neu',
      bereich: BEREICHE.patienten.label,
      stichworte: ['neu', 'aufnehmen', 'erfassen'],
      rueckweg: true,
    });
    eintraege.push({
      id: 'vorgang-verordner-anlegen',
      art: 'Vorgang',
      bezeichnung: `${BEGRIFFE.verordnerIn} anlegen`,
      ziel: '/verordner/neu',
      bereich: BEREICHE.patienten.label,
      stichworte: ['arzt', 'ärztin', 'praxis', 'neu'],
      rueckweg: true,
    });
  }

  if (canWriteTreatmentBases(roles)) {
    eintraege.push({
      id: 'vorgang-grundlage-erfassen',
      art: 'Vorgang',
      bezeichnung: 'Grundlage erfassen',
      // Eine Behandlungsgrundlage gehört an eine Akte (VER-003); eine Adresse ohne
      // Patient:in gibt es dafür nicht. Der Treffer sagt das, statt auf ein
      // Formular zu führen, das zuerst nach der Person fragen müsste.
      hinweis: 'Zuerst die Patient:in wählen',
      ziel: '/patienten',
      bereich: BEREICHE.patienten.label,
      stichworte: ['rezept', 'verordnung', 'selbstzahler', 'heilmittel', 'neu'],
    });
  }

  if (canManageAppointments(roles)) {
    eintraege.push({
      id: 'vorgang-termin-anlegen',
      art: 'Vorgang',
      bezeichnung: `${BEGRIFFE.termin} anlegen`,
      ziel: '/termine/neu',
      bereich: BEREICHE.termine.label,
      stichworte: ['neu', 'buchen', 'planen'],
      rueckweg: true,
    });
    eintraege.push({
      id: 'vorgang-tag-umplanen',
      art: 'Vorgang',
      bezeichnung: 'Tag umplanen',
      hinweis: 'Bei einem Ausfall die Besuche eines Tages verteilen',
      ziel: '/kalender/tag-umplanen',
      bereich: BEREICHE.termine.label,
      stichworte: ['ausfall', 'krank', 'verschieben'],
      rueckweg: true,
    });
    eintraege.push({
      id: 'vorgang-fehlzeit',
      art: 'Vorgang',
      bezeichnung: `${BEGRIFFE.fehlzeit} eintragen`,
      ziel: '/termine/ereignis',
      bereich: BEREICHE.termine.label,
      stichworte: ['besprechung', 'teammeeting', 'ereignis', 'block'],
      rueckweg: true,
    });
    eintraege.push({
      id: 'vorgang-dauerfehlzeit',
      art: 'Vorgang',
      bezeichnung: `${BEGRIFFE.dauerfehlzeit} eintragen`,
      hinweis: 'Dieselbe Fehlzeit über mehrere Wochen',
      ziel: '/termine/dauerfehlzeit',
      bereich: BEREICHE.termine.label,
      stichworte: ['serie', 'wöchentlich', 'ereignis'],
      rueckweg: true,
    });
  }

  if (canManageStaffMasterData(roles)) {
    eintraege.push({
      id: 'vorgang-mitarbeitende-anlegen',
      art: 'Vorgang',
      bezeichnung: `${BEGRIFFE.mitarbeiterIn} anlegen`,
      ziel: '/praxis/team/neu',
      bereich: BEREICHE.betrieb.label,
      stichworte: ['personal', 'einladen', 'zugang', 'neu'],
      rueckweg: true,
    });
  }

  // Das eigene Konto steht jeder angemeldeten Rolle offen (STAFF-004) und ist
  // deshalb der eine Eintrag ohne Bedingung.
  eintraege.push({
    id: 'seite-mein-konto',
    art: 'Seite',
    bezeichnung: 'Mein Konto',
    hinweis: 'Kennwort, zweiter Faktor, Sitzungen',
    ziel: '/mein-konto',
    stichworte: ['kennwort', 'passwort', 'sitzung', 'profil', 'zwei-faktor'],
  });

  return eintraege;
}

/**
 * Alles, was die angemeldete Rolle aufrufen kann — Bereiche, Seiten, Vorgänge.
 */
export function funktionskatalog(user: CurrentUser): Funktion[] {
  const bereiche = arbeitsbereiche(user);
  const katalog: Funktion[] = [];

  for (const bereich of bereiche) {
    katalog.push({
      id: `bereich-${bereich.id}`,
      art: 'Bereich',
      bezeichnung: bereich.label,
      hinweis: bereich.leitfrage,
      ziel: bereich.to,
      // Die Kurzform aus der Tableiste ist der zweite Name, den dieselbe Sache
      // im Haus trägt („Nachrichten", „Organisation") - beide finden sie.
      stichworte: [bereich.kurz],
    });

    for (const punkt of bereich.unterpunkte) {
      // Der Unterpunkt, der den Bereich wiederholt, steht schon oben:
      // „Kalender" im Bereich Kalender wäre sonst zweimal dieselbe Zeile.
      if (punkt.label === bereich.label) continue;
      katalog.push({
        id: `seite-${bereich.id}-${punkt.to}`,
        art: 'Seite',
        bezeichnung: punkt.label,
        ziel: punkt.to,
        bereich: bereich.label,
        ...(punkt.vorschau ? { vorschau: true } : {}),
      });
    }
  }

  return [...katalog, ...vorgaenge(user)];
}

/** Wie gut passt ein Eintrag zum Suchbegriff? Höher ist besser, 0 ist kein Treffer. */
function gewicht(eintrag: Funktion, begriff: string): number {
  const bezeichnung = suchform(eintrag.bezeichnung);
  if (bezeichnung.startsWith(begriff)) return 4;
  // Wortanfang: „anlegen" findet „Patient:in anlegen", ohne dass jede
  // Teilzeichenkette gleich stark zählt.
  if (bezeichnung.split(/[\s:.-]+/).some((wort) => wort.startsWith(begriff))) return 3;
  if (bezeichnung.includes(begriff)) return 2;
  const weiteres = [eintrag.bereich, eintrag.hinweis, ...(eintrag.stichworte ?? [])]
    .filter((wert): wert is string => Boolean(wert))
    .map(suchform);
  if (weiteres.some((wert) => wert.includes(begriff))) return 1;
  return 0;
}

/** Bereich vor Seite vor Vorgang — bei gleichem Gewicht die gröbere Ebene zuerst. */
const REIHENFOLGE: Record<Funktionsart, number> = { Bereich: 0, Seite: 1, Vorgang: 2 };

/**
 * Obergrenze der Funktionstreffer.
 *
 * Nicht aus Geschwindigkeitsgründen — der Katalog hat zwei Dutzend Einträge —,
 * sondern damit die Gruppe „Patient:innen" darunter ohne Scrollen sichtbar
 * bleibt.
 */
export const FUNKTIONSTREFFER_MAX = 8;

/**
 * Die Treffer zu einem Suchbegriff, beste zuerst.
 *
 * Ein leerer Begriff liefert die Bereiche: Wer die Suche öffnet und noch nichts
 * getippt hat, sieht damit, was ihm überhaupt offensteht, statt einer leeren
 * Fläche.
 */
export function sucheFunktionen(katalog: readonly Funktion[], begriff: string): Funktion[] {
  const gesucht = suchform(begriff.trim());
  if (gesucht.length === 0) {
    return katalog.filter((eintrag) => eintrag.art === 'Bereich');
  }

  return katalog
    .map((eintrag) => ({ eintrag, punkte: gewicht(eintrag, gesucht) }))
    .filter(({ punkte }) => punkte > 0)
    .sort(
      (a, b) =>
        b.punkte - a.punkte ||
        REIHENFOLGE[a.eintrag.art] - REIHENFOLGE[b.eintrag.art] ||
        a.eintrag.bezeichnung.localeCompare(b.eintrag.bezeichnung, 'de'),
    )
    .slice(0, FUNKTIONSTREFFER_MAX)
    .map(({ eintrag }) => eintrag);
}
