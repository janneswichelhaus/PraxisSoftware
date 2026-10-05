import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { BEGRIFFE } from '@/lib/begriffe';
import {
  aufRaster,
  ausserhalbArbeitszeit,
  gitterlinien,
  kachelZeilen,
  kachelBreite,
  linienAchse,
  minuteZuPixel,
  minuteZuZeit,
  pixelZuMinute,
  rueckfrageOben,
  spalten,
  trifftPunktauswahl,
  type Zeitband,
} from './calendar';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  abweichendeLaengeMinuten,
  abweichendeLaengeText,
  appointmentStatusLabels,
  appointmentStatusTon,
  appointmentTypeHint,
  dokuOffen,
  terminBezeichnung,
  type CalendarEntry,
  terminPfad,
} from './api';
import { Laengenzeichen } from './Laengenzeichen';
import { useTerminZiehen, type ZiehZustand } from './useTerminZiehen';
import { WegauskunftFuer } from './Wegauskunft';
import type { Wegfrage } from './wegpruefung';
import type { Lueckenstufe } from './lueckenfinder';
import { useSpanneAufziehen, type Spanne } from './useSpanneAufziehen';
import { AnlegenMenue, type AnlegenEintrag } from './AnlegenMenue';
import { VerschiebenRueckfrage, type VerschiebenFrage } from './VerschiebenRueckfrage';
import { useZweiFingerZoom } from './useZweiFingerZoom';

/**
 * Eine abgelegte, noch nicht bestätigte Verschiebung, wie das Gitter sie
 * zeigt (FIX-017, BEF-013): der alte Platz als Umriss, der neue als Kachel,
 * der Kasten mit der Frage direkt daneben.
 */
export interface GitterVorschlag {
  terminId: string;
  spalteId: string;
  startMinute: number;
  endeMinute: number;
  frage: VerschiebenFrage;
  laeuft: boolean;
  /** Warum der letzte Versuch gescheitert ist - steht im Kasten (KAL-01). */
  fehler?: string | undefined;
  onBestaetigen: () => void;
  onAbbrechen: () => void;
}

/**
 * Das offene Anlegen-Menü an einer Auswahl (CAL-019).
 *
 * Das Gitter zeichnet die Auswahl und das Menü daneben; **was** die Einträge
 * bedeuten, weiß allein die aufrufende Seite - sie kennt Person, Datum,
 * Patientenfilter und Rückweg. Dasselbe Verhältnis wie bei der
 * Zieh-Rückfrage (FIX-017).
 */
export interface GitterAuswahl extends Spanne {
  eintraege: AnlegenEintrag[];
  onSchliessen: () => void;
  /** Person und Tag der Auswahl für die Kopfzeile der Leiste (KAL-10). */
  kopf?: string | undefined;
}

/**
 * Wohin der Fokus im Gitter wandert, wenn ein Kasten schließt (KAL-21).
 *
 * Nach der Rückfrage auf die Kachel, um die es ging; nach der Anlegen-Leiste
 * auf die Spalte der Auswahl. Ohne dieses Ziel fiel der Fokus auf den
 * Seitenanfang, vor 1 250 px Raster. Jede Anfrage ist ein neues Objekt - auch
 * zweimal dieselbe Kachel wird zweimal fokussiert.
 */
export type GitterFokus = { kachel: string } | { spalte: string };

/**
 * Zeitgitter des Kalenders (CAL-006).
 *
 * Eine Darstellung für beide Ansichten. Was sich unterscheidet, ist
 * ausschließlich die Bedeutung einer Spalte:
 *
 *   * Tag   - eine Spalte je behandelnder Person
 *   * Woche - eine Spalte je Wochentag, für genau eine Person
 *
 * Deshalb kennt das Gitter selbst weder Personen noch Daten, sondern nur
 * Spalten mit einer Kennung. Wohin ein Termin verschoben wurde, übersetzt die
 * aufrufende Seite zurück in Person beziehungsweise Datum.
 *
 * Waagerechtes Scrollen ist ausdrücklich erwünscht: bei sechs zeitgleich
 * arbeitenden Personen ist eine gequetschte Spalte unbrauchbar, eine schmale
 * scrollbare dagegen lesbar. Die Zeitachse bleibt dabei stehen.
 *
 * **Die Linien tragen drei Stärken (CAL-011).** Die Stunde bleibt die
 * Orientierung und ist am kräftigsten; die halbe Stunde teilt sie; das
 * Praxisraster steht als feinste Stufe darunter, sobald die Zoomstufe dafür
 * Platz lässt. Ohne diese Abstufung wäre ein durchgehendes Fünf-Minuten-Gitter
 * bloß eine graue Fläche — man sähe jede Linie und keine Uhrzeit.
 *
 * **Für Vorlesesoftware ein Bereich mit Gruppen (KAL-16, UIK-17).** Bis dahin
 * hieß das Gitter `grid`, hatte aber weder Zeilen noch Spaltenköpfe - axe
 * meldete zwei kritische Verstöße, und `grid` versprach eine Pfeiltasten-
 * Führung, die es nicht gibt. Jetzt ist es ein benannter Bereich, jede Spalte
 * eine benannte Gruppe (Person bzw. Tag), und die Kacheln bleiben Links. Ein
 * echtes Raster mit Zeilen und Pfeiltasten wäre ein eigener Schritt.
 */

/** Unter dieser Breite wird eine Spalte unlesbar. Dann lieber scrollen. */
const SPALTEN_MINDESTBREITE = '9rem';

/**
 * Mindesthöhe einer Auswahl oder Vorschau im Gitter (BEF-037).
 *
 * Der Inhalt ist eine Zeile Uhrzeit: 2 px Rahmen, 4 px Innenabstand und 16 px
 * Zeile, oben und unten - zusammen 28 px, dieselbe Mindesthöhe wie eine
 * Kachel. Mit den früheren 16 px lief „08:50" über die untere Rahmenlinie.
 * Die Fläche wird dadurch bei einem einzelnen Feld höher als das Feld; die
 * Uhrzeit darin sagt, wo sie beginnt.
 */
const AUSWAHL_MINDESTHOEHE = 28;

/**
 * Stärke der drei Linienarten.
 *
 * Die erste Fassung nahm für alle drei `--color-line` und unterschied nur die
 * Deckkraft. In der Sichtprüfung war die Stunde daraufhin von der
 * Fünf-Minuten-Linie nicht zu unterscheiden: `--color-line` liegt bei 90 %
 * Helligkeit, und zwischen 30 % und 100 % einer fast weißen Linie auf fast
 * weißem Grund liegt kaum ein sichtbarer Unterschied. Das Ergebnis war die
 * gestreifte Fläche, die das Gitter gerade nicht sein soll.
 *
 * Die Stunde nimmt deshalb `--color-line-strong` (63 % Helligkeit), gedämpft
 * auf 60 %. Sie ist damit die Linie, an der man die Uhrzeit abliest; die
 * halbe Stunde teilt sie, das Praxisraster bleibt ein Hauch.
 */
const LINIE = {
  stunde: 'border-line-strong/60',
  halb: 'border-line-strong/30',
  fein: 'border-line/45',
} as const;

/**
 * Zeichen und Farbe des Statusworts in der Kachel (KAL-23) - dieselben
 * Zeichen wie im `Badge` (DS-001), damit der Zustand auch ohne Farbe lesbar
 * ist. Eine eigene Zeile statt eines Abzeichens: In einer 144-px-Spalte liefe
 * die Pille „! Nicht angetroffen" über den Kachelrand, eine Zeile kürzt
 * dagegen mit Auslassungszeichen, und der ganze Zustand steht im Tooltip.
 */
const STATUS_ZEICHEN = { positiv: '✓', warnung: '!', kritisch: '×' } as const;
const STATUS_FARBE = {
  positiv: 'text-positiv',
  warnung: 'text-warnung',
  kritisch: 'text-danger',
} as const;

/**
 * Die Linie links an der Kachel sagt den Zustand (Design-Handoff 2026-10-01,
 * Abschnitt 3, letzte Zeile): bestätigt in der Hauptfarbe, erledigt
 * (abgeschlossen, dokumentiert, abgerechnet) in `line-strong`, nicht
 * angetroffen in Warn-, abgesagt in Fehlerfarbe. Bis dahin trug sie eine
 * Farbe je Person - ein Orange, das wie eine Warnung aussah, ohne eine zu
 * sein. Die Person zeigt der Kalender ohnehin: Die Woche zeigt eine Person,
 * der Tag eine Spalte je Person mit Namen im Kopf. Farbe trägt nie allein -
 * Warnung und Absage stehen als Zeichen und Wort in der Kachel (KAL-23).
 */
function statusLinie(eintrag: CalendarEntry): string {
  const status = eintrag.status;
  if (status === 'confirmed') return 'border-l-accent';
  // Abgeschlossen ohne festgeschriebene Doku: Warnfarbe (Zyklen 2-4, ANN-201).
  if (status === 'no_show' || dokuOffen(eintrag)) return 'border-l-warnung';
  if (status === 'cancelled') return 'border-l-danger';
  return 'border-l-line-strong';
}

/**
 * Die dritte Zeile der Kachel (Design-Handoff 2026-10-01, Abschnitt 7a):
 * Zeichen und Wort für einen abweichenden Zustand - „! Doku offen",
 * „✓ Dokumentiert", „× Abgesagt" -, sonst der Ort, wenn er vom Regelfall
 * abweicht (ANN-192).
 */
function unterzeile(
  eintrag: CalendarEntry,
): { zeichen: string | null; text: string; farbe: string } | null {
  if (dokuOffen(eintrag)) return { zeichen: '!', text: 'Doku offen', farbe: 'text-warnung' };
  if (eintrag.status !== 'confirmed') {
    const ton = appointmentStatusTon[eintrag.status];
    return {
      zeichen: ton in STATUS_ZEICHEN ? STATUS_ZEICHEN[ton] : null,
      text: appointmentStatusLabels[eintrag.status],
      farbe: ton in STATUS_FARBE ? STATUS_FARBE[ton] : 'text-ink-muted',
    };
  }
  const ort = ortsHinweis(eintrag);
  return ort ? { zeichen: null, text: ort, farbe: 'text-ink-muted' } : null;
}

export interface GitterSpalte {
  id: string;
  titel: string;
  unterTitel?: string;
  /** Hervorhebung des heutigen Tages beziehungsweise der eigenen Person. */
  hervorgehoben?: boolean;
  /**
   * Das Wort zur Hervorhebung, sichtbar im Kopf (KAL-B01, KAL-03): „heute" am
   * Tag der Woche, „ich" an der eigenen Spalte. Ein Farbton allein war kaum zu
   * sehen und für Vorlesesoftware gar nicht da.
   */
  zusatz?: string | undefined;
  /** Der Kopf steht für den heutigen Tag: `aria-current="date"`. */
  aktuellesDatum?: boolean | undefined;
  /**
   * Arbeitszeit dieser Spalte. Gezeichnet wird ihr Gegenstück: Was außerhalb
   * liegt, ist grau schraffiert (UX-005c). `null` heißt „noch nicht bekannt"
   * - dann bleibt die Spalte weiß, statt einen ganzen Tag grau zu behaupten.
   */
  baender: Zeitband[] | null;
  /**
   * Belegte Zeiten ohne Termin dahinter (ABN-021, BEF-112): Was die
   * Trainingsbetreuung nicht als Termin lesen darf, steht als anonymer Block
   * „belegt" da - ohne Namen, Kontext oder Zustand.
   */
  belegt?: readonly Zeitband[];
  /**
   * Fahrwege vor den Besuchen dieser Spalte (UBK-005, ANN-235): ein Block so
   * lang wie die Fahrzeit, endend am Beginn des Besuchs. Darstellung, keine
   * Prüfung - ob es zu knapp ist, sagt der Fahrpuffer (ANN-097).
   */
  fahrwege?: readonly (Zeitband & { minuten: number; veraltet?: boolean })[];
  /** Lückenfinder (UBK-014): die freien Lücken, eingefärbt. Ohne Angabe keine. */
  luecken?: readonly GitterLuecke[] | undefined;
  /**
   * Wohin ein Tippen auf den Spaltenkopf führt (CAL-012).
   *
   * Das Gitter kennt weiterhin weder Personen noch Daten — was der Wechsel
   * bedeutet, entscheidet die aufrufende Seite und übergibt ihn fertig.
   * Ohne Ziel bleibt der Kopf eine Beschriftung.
   */
  ziel?: { to: string; beschriftung: string };
}

/**
 * Farbe, Zeichen und Wort je Stufe des Lückenfinders. Farbe trägt nie allein
 * (WCAG 1.4.1): Das Wort steht immer dabei. Dieselben Grenzen wie der
 * Wegbalken (ANN-195, `luftStufe`).
 */
const lueckenDarstellung: Record<
  Exclude<Lueckenstufe, 'laedt'>,
  { flaeche: string; zeichen: string; text: string }
> = {
  passt: { flaeche: 'bg-accent-soft/70 text-accent', zeichen: '✓', text: 'passt' },
  knapp: { flaeche: 'bg-warnung-soft text-warnung', zeichen: '!', text: 'knapp' },
  nicht: { flaeche: 'bg-danger-soft/70 text-danger', zeichen: '×', text: 'passt nicht' },
  zu_kurz: { flaeche: 'bg-danger-soft/70 text-danger', zeichen: '×', text: 'zu kurz' },
  ungeprueft: { flaeche: 'bg-surface-sunken text-ink-muted', zeichen: '?', text: 'nicht geprüft' },
};

/**
 * Eine freie Lücke, eingefärbt vom Lückenfinder (UBK-014, ANN-239): passt,
 * knapp oder passt nicht - mit Fahrweg vom Termin davor und zum Termin
 * danach. Nur Auskunft: Die Fläche darunter bleibt antippbar.
 */
export interface GitterLuecke {
  vonMinute: number;
  bisMinute: number;
  stufe: Lueckenstufe;
  /** Frühester Beginn als „hh:mm“. */
  ab: string | null;
}

export interface GitterEintrag {
  eintrag: CalendarEntry;
  spalteId: string;
  beginnMinute: number;
  endeMinute: number;
  /** Abgesagte und abgeschlossene Termine werden nicht gezogen. */
  ziehbar: boolean;
  /** Gerade angelegt - beim Zurückkommen aus dem Formular hervorgehoben (FIX-016). */
  neu?: boolean;
  /**
   * Belegt, aber nicht gemeint: Mit Patientenfilter stehen die übrigen
   * Termine als neutrale, gestrichelte Kachel da, statt zu verschwinden
   * (BEF-053 Punkt 1, ANN-239) - eine Lücke sieht nur frei aus, wenn sie es ist.
   */
  zurueckgenommen?: boolean;
}

/**
 * Kurze Einordnung: wo der Termin stattfindet - nur, wenn es vom Regelfall
 * abweicht. Der Hausbesuch trägt kein Wort (ANN-192, UX-005d).
 */
function ortsHinweis(eintrag: CalendarEntry): string | null {
  if (eintrag.appointment_type === 'practice') return eintrag.location_name ?? 'Praxis';
  return appointmentTypeHint(eintrag.appointment_type);
}

/** Name einer Spalte für Vorlesesoftware: Person bzw. Tag samt Hervorhebung. */
function spaltenName(s: GitterSpalte): string {
  const name = [s.titel, s.unterTitel].filter(Boolean).join(' ');
  return s.zusatz ? `${name}, ${s.zusatz}` : name;
}

export function CalendarGrid({
  spaltenModell,
  eintraege,
  fenster,
  raster,
  stundenHoehe,
  ziehbarErlaubt,
  onVerschieben,
  onAuswahl,
  auswahl = null,
  rueckweg,
  onWaehlen,
  gewaehlt = null,
  beschriftung,
  vorschlag = null,
  kontext,
  onBlaettern,
  onZoom,
  ecke,
  jetzt = null,
  sprung = 0,
  laedtNach = false,
  fokus = null,
  startSpalte = null,
  wegfrage,
  zeitzone = null,
}: {
  /**
   * „Passt es?“ zu einer Verschiebung (UBK-013): Die Seite weiß, welche
   * Person, welcher Tag und welcher Ort zu einer Spalte gehören. Ohne Angabe
   * zeigt das Ziehen keine Auskunft.
   */
  wegfrage?:
    | ((ziel: { terminId: string; spalteId: string; startMinute: number }) => Wegfrage | null)
    | undefined;
  /** Zeitzone der Praxis - für die Uhrzeiten der Auskunft. */
  zeitzone?: string | null;
  /**
   * Was in der Ecke über der Zeitachse steht (BEF-039): der Knopf zu Ansicht
   * und Filter. Die Ecke bleibt beim waagerechten Bildlauf stehen - damit ist
   * er „direkt am Raster" erreichbar.
   */
  ecke?: ReactNode;
  /**
   * Die aktuelle Uhrzeit als Linie in den Spalten, die heute sind (BEF-039).
   * Ohne Angabe gibt es keine Linie.
   */
  jetzt?: { minute: number; spalten: readonly string[] } | null;
  /**
   * Zähler für „Jetzt": Jede Erhöhung bringt die Linie ins Bild, sobald ihre
   * Spalte gezeichnet ist - auch wenn der Ausschnitt dafür erst laden muss.
   */
  sprung?: number;
  /**
   * Eine Zoomstufe weiter, mit zwei Fingern im Raster (BEF-038). Ohne Angabe
   * bleibt die Geste beim Browser.
   */
  onZoom?: ((richtung: 1 | -1) => void) | undefined;
  /**
   * Der gezeigte Stand ist der alte, der neue lädt noch (FIX-018). Das Gitter
   * meldet es über `aria-busy`; die sichtbare Zeile dazu setzt die Seite
   * (KAL-18) - eine Deckkraft als Zustand ist im System nicht vorgesehen.
   */
  laedtNach?: boolean;
  /** Die offene Rückfrage zum Verschieben - im Gitter gezeichnet (FIX-017). */
  vorschlag?: GitterVorschlag | null;
  /** Kennung des gezeigten Ausschnitts, etwa sein erster Tag (FIX-018). */
  kontext: string;
  /** Blättert während des Ziehens, wenn der Zeiger seitlich am Gitter verharrt (FIX-018). */
  onBlaettern?: ((richtung: -1 | 1) => void) | undefined;
  spaltenModell: GitterSpalte[];
  eintraege: GitterEintrag[];
  fenster: { vonMinute: number; bisMinute: number };
  raster: number | null;
  /** Höhe einer Stunde in Pixeln - die gewählte Zoomstufe (CAL-011). */
  stundenHoehe: number;
  /** Ohne Änderungsrecht wird gar nicht erst gezogen. */
  ziehbarErlaubt: boolean;
  onVerschieben: (ziel: { terminId: string; spalteId: string; startMinute: number }) => void;
  /**
   * Eine Auswahl auf der freien Fläche einer Spalte (UX-005, CAL-019).
   *
   * Aufgezogen als Spanne oder angetippt als Rasterpunkt - dann sind beide
   * Enden gleich. Ohne Angabe passiert nichts; die freie Fläche bleibt dann
   * schlicht Hintergrund. Beides ist eine Abkürzung für Zeigegeräte; der Weg
   * über die Tastatur sind die Schaltflächen über dem Gitter.
   */
  onAuswahl?: ((spanne: Spanne) => void) | undefined;
  /** Das offene Anlegen-Menü, von der aufrufenden Seite gefüllt (CAL-019). */
  auswahl?: GitterAuswahl | null;
  /**
   * Der Weg zurück in genau diesen Kalenderstand (UX-012).
   *
   * Die Kachel führt zum Termin; von dort soll der Weg zurück wieder hier
   * ankommen - mit Ansicht, Datum, Zoomstufe und allen Filtern. Der Kalender
   * kennt seinen eigenen Stand, das Gitter nicht; deshalb kommt er von oben.
   */
  rueckweg?: string | undefined;
  /**
   * Ein Tipp auf die Kachel wählt den Termin, statt ihn zu öffnen
   * (Design-Handoff 2026-10-01, Abschnitt 7a): Die Seite zeigt dann ein
   * Terminpanel mit Haken und „Doku". Ohne Angabe bleibt die Kachel ein Link.
   */
  onWaehlen?: ((eintrag: CalendarEntry) => void) | undefined;
  /** Der gewählte Termin - seine Kachel trägt den Rahmen der Hauptfarbe. */
  gewaehlt?: string | null | undefined;
  beschriftung: string;
  /** Wohin der Fokus nach dem Schließen eines Kastens geht (KAL-21). */
  fokus?: GitterFokus | null;
  /**
   * Die Spalte, die beim ersten Zeichnen eines Ausschnitts neben der
   * Zeitachse stehen soll (RSP-03) - in der Woche der heutige Tag. Gerollt
   * wird nur waagerecht und nur einmal je Ausschnitt; senkrecht bleibt die
   * Seite, wo sie ist, sonst verschwände die Zeile mit Monat und „Jetzt".
   */
  startSpalte?: string | null;
}) {
  const spaltenRefs = useRef(new Map<string, HTMLElement>());
  const kachelRefs = useRef(new Map<string, HTMLElement>());
  const gitterRef = useRef<HTMLDivElement>(null);
  const eckeRef = useRef<HTMLDivElement>(null);
  const rueckfrageRef = useRef<HTMLDivElement>(null);
  const hoehe = ((fenster.bisMinute - fenster.vonMinute) / 60) * stundenHoehe;

  const linien = gitterlinien(stundenHoehe, raster);
  const stunden = linienAchse(fenster.vonMinute, fenster.bisMinute, 60);
  // Halbe und feine Linien lassen die Stundenlinie aus: zwei Linien
  // uebereinander ergaeben einen dickeren, dunkleren Strich an genau der
  // Stelle, an der die Abstufung ihn nicht haben will.
  const halbe = linien.halbeStunde
    ? linienAchse(fenster.vonMinute, fenster.bisMinute, 30).filter((m) => m % 60 !== 0)
    : [];
  const feine = linien.fein
    ? linienAchse(fenster.vonMinute, fenster.bisMinute, linien.fein).filter(
        (m) => m % 60 !== 0 && (!linien.halbeStunde || m % 30 !== 0),
      )
    : [];

  const ziehen = useTerminZiehen({
    fensterVon: fenster.vonMinute,
    fensterBis: fenster.bisMinute,
    raster,
    stundenHoehe,
    // Die Spalte unter dem Zeiger wird aus den tatsächlichen Kästen gelesen -
    // damit stimmt sie auch bei waagerechtem Bildlauf.
    spalteAn: (clientX) => {
      for (const [id, element] of spaltenRefs.current) {
        const kasten = element.getBoundingClientRect();
        if (clientX >= kasten.left && clientX <= kasten.right) return id;
      }
      return null;
    },
    kontext,
    // Seitlich ueber dem Gitter: dort wird geblaettert (FIX-018). Ein paar
    // Pixel Toleranz, damit die Spaltenkante selbst noch Ziel ist.
    randAn: (clientX) => {
      const kasten = gitterRef.current?.getBoundingClientRect();
      if (!kasten) return 0;
      if (clientX < kasten.left + 4) return -1;
      if (clientX > kasten.right - 4) return 1;
      return 0;
    },
    onBlaettern,
    onAblegen: (zustand: ZiehZustand) =>
      onVerschieben({
        terminId: zustand.terminId,
        spalteId: zustand.spalteId,
        startMinute: zustand.startMinute,
      }),
  });

  // Die Spanne auf der freien Flaeche (CAL-019). Der obere Rand kommt aus
  // irgendeiner Spalte: Alle beginnen auf derselben Hoehe.
  const spanne = useSpanneAufziehen({
    fensterVon: fenster.vonMinute,
    fensterBis: fenster.bisMinute,
    raster,
    stundenHoehe,
    spalteAn: (clientX) => {
      for (const [id, element] of spaltenRefs.current) {
        const kasten = element.getBoundingClientRect();
        if (clientX >= kasten.left && clientX <= kasten.right) return id;
      }
      return null;
    },
    obenAn: () => {
      const erste = spaltenRefs.current.values().next().value;
      return erste ? erste.getBoundingClientRect().top : null;
    },
    onAuswahl: (gewaehlt) => onAuswahl?.(gewaehlt),
  });

  // „Jetzt" (BEF-039): Der Sprung wartet, bis die Linie gezeichnet ist - wer
  // aus einer anderen Woche springt, muss erst den neuen Ausschnitt laden.
  const jetztRef = useRef<HTMLDivElement>(null);
  const ersteHeutigeSpalte = jetzt
    ? spaltenModell.find((x) => jetzt.spalten.includes(x.id))?.id
    : undefined;
  const offenerSprung = useRef(0);
  useEffect(() => {
    if (sprung === offenerSprung.current || !jetztRef.current) return;
    offenerSprung.current = sprung;
    // jsdom kennt kein scrollIntoView; ein Browser ohne es bleibt, wo er ist.
    jetztRef.current.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'smooth' });
  });

  // Die Woche beginnt am Telefon beim heutigen Tag (RSP-03): Bei 390 px sind
  // zwei, bei 820 px knapp fünf Tagesspalten zu sehen, und am Sonntag lag
  // „heute" rechts außerhalb. Einmal je Ausschnitt - danach gehört der
  // waagerechte Bildlauf der Person.
  const gerollterAusschnitt = useRef<string | null>(null);
  useEffect(() => {
    if (!startSpalte) return;
    const schluessel = `${kontext}|${startSpalte}`;
    if (gerollterAusschnitt.current === schluessel) return;
    const kasten = gitterRef.current;
    const spalte = spaltenRefs.current.get(startSpalte);
    const erste = spaltenModell[0] ? spaltenRefs.current.get(spaltenModell[0].id) : undefined;
    if (!kasten || !spalte || !erste) return;
    gerollterAusschnitt.current = schluessel;
    // Der Abstand zur ersten Spalte ist genau der Bildlauf, bei dem die Spalte
    // an der stehenden Zeitachse beginnt - unabhängig vom jetzigen Stand.
    kasten.scrollLeft = spalte.getBoundingClientRect().left - erste.getBoundingClientRect().left;
  });

  // Der Fokus nach einem geschlossenen Kasten (KAL-21). Ohne Ziel - die
  // Kachel ist nach dem Blättern fort - der Knopf in der Ecke.
  useEffect(() => {
    if (!fokus) return;
    const ziel =
      'kachel' in fokus
        ? kachelRefs.current.get(fokus.kachel)
        : spaltenRefs.current.get(fokus.spalte);
    const ersatz = eckeRef.current?.querySelector<HTMLElement>('button, a');
    // Ohne Bildlauf: Die Stelle ist im Bild, und ein Sprung nähme sie heraus.
    (ziel ?? ersatz)?.focus({ preventScroll: true });
  }, [fokus]);

  // Die Lage des Rückfragekastens aus seiner gemessenen Höhe (KAL-13). Vor
  // dem Zeichnen gemessen, damit er nicht erst an der falschen Stelle
  // aufblitzt.
  const [rueckfrageLage, setRueckfrageLage] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!vorschlag) {
      if (rueckfrageLage !== null) setRueckfrageLage(null);
      return;
    }
    const kasten = rueckfrageRef.current;
    const spalte = spaltenRefs.current.get(vorschlag.spalteId);
    if (!kasten || !spalte) return;
    const rahmen = spalte.getBoundingClientRect();
    const lage = rueckfrageOben({
      kachelOben: minuteZuPixel(vorschlag.startMinute, fenster.vonMinute, stundenHoehe),
      kachelHoehe: Math.max(
        AUSWAHL_MINDESTHOEHE,
        ((vorschlag.endeMinute - vorschlag.startMinute) / 60) * stundenHoehe,
      ),
      kastenHoehe: kasten.getBoundingClientRect().height,
      spaltenHoehe: hoehe,
      sichtbarVon: Math.max(0, -rahmen.top),
      sichtbarBis: Math.min(hoehe, window.innerHeight - rahmen.top),
    });
    if (lage !== rueckfrageLage) setRueckfrageLage(lage);
  });

  // Zwei Finger zoomen das Raster (BEF-038); der zweite Finger beendet,
  // was der erste begonnen hat - Verschieben und Aufziehen brechen dabei
  // nicht, sie enden ohne Ergebnis.
  const zweiFinger = useZweiFingerZoom(gitterRef, {
    onZoom,
    onZweiterFinger: () => {
      ziehen.abbrechen();
      spanne.abbrechen();
    },
  });

  return (
    <>
      <div
        ref={gitterRef}
        aria-busy={laedtNach || undefined}
        // `isolate`: Die Ebenen im Gitter (stehende Ecke, Köpfe, Kacheln)
        // bleiben unter allem, was darüber aufgeht - etwa der Trefferliste der
        // Suche am Telefon (BEF-039). Kein Kasten mehr, nur eine Linie oben
        // und unten: Das Raster reicht bis an den Rand der Fläche (BEF-043).
        //
        // touch-action: das Gitter scrollt weiterhin, aber eine begonnene Geste
        // auf einer Kachel wird nicht vom Browser übernommen - als Klassen
        // statt als Stil (TOK-17), der Wert ist fest.
        className="border-line isolate mt-2 touch-pan-x touch-pan-y overflow-x-auto border-y"
      >
        <div
          className="grid min-w-max"
          style={{
            gridTemplateColumns: `3.25rem repeat(${spaltenModell.length}, minmax(${SPALTEN_MINDESTBREITE}, 1fr))`,
          }}
          role="region"
          aria-label={beschriftung}
        >
          {/* Kopfzeile. */}
          <div
            ref={eckeRef}
            className="bg-surface border-line sticky top-0 left-0 z-30 flex h-11 items-center justify-center border-b"
          >
            {ecke}
          </div>
          {spaltenModell.map((s) => {
            const beschriftung = (
              <>
                <span
                  className={[
                    'truncate text-sm font-medium',
                    s.hervorgehoben ? 'text-accent' : 'text-ink',
                  ].join(' ')}
                >
                  {s.titel}
                </span>
                {s.unterTitel || s.zusatz ? (
                  // Die Hervorhebung als Wort neben dem Datum (KAL-B01): „heute"
                  // bzw. „ich" - ein Farbton allein trägt keine Bedeutung.
                  <span className="flex min-w-0 items-baseline gap-1 text-xs">
                    {s.unterTitel ? (
                      <span className="text-ink-muted truncate">{s.unterTitel}</span>
                    ) : null}
                    {s.zusatz ? (
                      <span className="text-accent shrink-0 font-semibold">
                        {s.unterTitel ? `· ${s.zusatz}` : s.zusatz}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </>
            );

            return (
              <div
                key={s.id}
                aria-current={!s.ziel && s.aktuellesDatum ? 'date' : undefined}
                className={[
                  s.hervorgehoben ? 'bg-accent-soft' : 'bg-surface',
                  'border-line sticky top-0 z-20 flex h-11 flex-col justify-center',
                  'border-b border-l',
                  // Traegt der Kopf einen Wechsel, polstert der Link selbst -
                  // sonst waere nur der Text anklickbar und nicht die Spalte.
                  s.ziel ? '' : 'px-2',
                ].join(' ')}
              >
                {s.ziel ? (
                  <Link
                    to={s.ziel.to}
                    aria-label={s.ziel.beschriftung}
                    aria-current={s.aktuellesDatum ? 'date' : undefined}
                    title={s.ziel.beschriftung}
                    className="hover:bg-surface-sunken flex h-full min-w-0 flex-col justify-center px-2 transition-colors"
                  >
                    {beschriftung}
                  </Link>
                ) : (
                  beschriftung
                )}
              </div>
            );
          })}

          {/* Zeitachse: bleibt beim waagerechten Bildlauf stehen. */}
          <div
            className="bg-surface border-line sticky left-0 z-10 border-r"
            style={{ height: `${hoehe}px` }}
            aria-hidden="true"
          >
            {stunden.map((m) => (
              // Die Beschriftung steht unter ihrer Linie, nicht auf ihr: zentriert
              // waere die oberste Stunde am Rand des Gitters halb abgeschnitten.
              <div
                key={m}
                className="text-ink-muted absolute right-1 pt-0.5 text-[0.6875rem]"
                style={{ top: `${minuteZuPixel(m, fenster.vonMinute, stundenHoehe)}px` }}
              >
                {minuteZuZeit(m)}
              </div>
            ))}
            {/* Ab dieser Zoomstufe liegen die halben Stunden 72 px auseinander -
              genug fuer eine zweite Beschriftung, ohne dass sie sich beruehren.
              Eine feine Linie ohne Uhrzeit in der Naehe laesst sich sonst nur
              abzaehlen. */}
            {stundenHoehe >= 144
              ? halbe.map((m) => (
                  <div
                    key={m}
                    className="text-ink-muted absolute right-1 pt-0.5 text-[0.625rem]"
                    style={{ top: `${minuteZuPixel(m, fenster.vonMinute, stundenHoehe)}px` }}
                  >
                    {minuteZuZeit(m)}
                  </div>
                ))
              : null}
          </div>

          {spaltenModell.map((s) => {
            const eigene = eintraege
              .filter((e) => e.spalteId === s.id)
              .sort((a, b) => a.beginnMinute - b.beginnMinute);
            const verteilung = spalten(
              eigene.map((e) => ({ beginn: e.beginnMinute, ende: e.endeMinute })),
            );

            return (
              <div
                key={s.id}
                ref={(el) => {
                  if (el) spaltenRefs.current.set(s.id, el);
                  else spaltenRefs.current.delete(s.id);
                }}
                className={`border-line relative border-l ${onAuswahl ? 'cursor-copy' : ''}`}
                style={{ height: `${hoehe}px` }}
                role="group"
                aria-label={spaltenName(s)}
                // Fokussierbar nur per Programm: Nach dem Schließen der
                // Anlegen-Leiste kehrt der Fokus hierher zurück (KAL-21).
                tabIndex={-1}
                // Nur die freie Fläche: eine Kachel liegt darüber und fängt ihre
                // eigene Geste ab. Der Hintergrund (Arbeitszeitbänder,
                // Stundenlinien) ist `pointer-events-none`, damit ein Tipp
                // darauf hier ankommt und nicht ins Leere geht.
                onPointerDown={
                  onAuswahl
                    ? (event) => {
                        if (event.target !== event.currentTarget) return;
                        spanne.beginnen(event, s.id);
                      }
                    : undefined
                }
                onClick={
                  onAuswahl
                    ? (event) => {
                        if (event.target !== event.currentTarget) return;
                        if (ziehen.klickUnterdruecken()) return;
                        // Ein aufgezogener Bereich hat sein Ergebnis schon
                        // gemeldet; der folgende Klick wäre ein zweites.
                        if (spanne.klickUnterdruecken()) return;
                        // Ebenso der Klick nach dem Zoomen mit zwei Fingern (BEF-038).
                        if (zweiFinger.klickUnterdruecken()) return;
                        const kasten = event.currentTarget.getBoundingClientRect();
                        const pixel = event.clientY - kasten.top;
                        // Ein Tipp in die gezeichnete Auswahl ist „dasselbe
                        // Feld" und hebt sie auf (KAL-09, BEF-036) - nicht nur
                        // der eine Rasterpunkt, auf dem sie beginnt.
                        if (
                          auswahl &&
                          trifftPunktauswahl(
                            auswahl,
                            { spalteId: s.id, pixel },
                            fenster.vonMinute,
                            stundenHoehe,
                            AUSWAHL_MINDESTHOEHE,
                          )
                        ) {
                          onAuswahl({
                            spalteId: s.id,
                            vonMinute: auswahl.vonMinute,
                            bisMinute: auswahl.vonMinute,
                          });
                          return;
                        }
                        const roh = pixelZuMinute(pixel, fenster.vonMinute, stundenHoehe);
                        const minute = Math.max(
                          fenster.vonMinute,
                          Math.min(fenster.bisMinute, aufRaster(roh, raster)),
                        );
                        // Ein Tap ohne Ziehen ist ein Rasterpunkt, keine Spanne
                        // (CAL-019): beide Enden gleich.
                        onAuswahl({ spalteId: s.id, vonMinute: minute, bisMinute: minute });
                      }
                    : undefined
                }
              >
                {/* Außerhalb der Arbeitszeit grau schraffiert (UX-005c) -
                    Darstellung, keine Prüfung; die freie Fläche bleibt
                    antippbar, und der Server fragt nach (CAL-005). */}
                {s.baender
                  ? ausserhalbArbeitszeit(s.baender, fenster).map((b, i) => (
                      <div
                        key={i}
                        aria-hidden="true"
                        data-testid="ausserhalb-arbeitszeit"
                        className="bg-surface-sunken schraffur pointer-events-none absolute inset-x-0"
                        style={{
                          top: `${minuteZuPixel(b.vonMinute, fenster.vonMinute, stundenHoehe)}px`,
                          height: `${minuteZuPixel(b.bisMinute, fenster.vonMinute, stundenHoehe) - minuteZuPixel(b.vonMinute, fenster.vonMinute, stundenHoehe)}px`,
                        }}
                      />
                    ))
                  : null}

                {/* Belegt, aber ohne lesbaren Termin (ABN-021, BEF-112):
                    sichtbar, nicht ziehbar, kein Panel; die freie Fläche
                    daneben bleibt antippbar. */}
                {(s.belegt ?? []).map((b, i) => (
                  <div
                    key={`belegt-${i}`}
                    data-testid="belegt"
                    className="border-line-strong bg-surface-sunken text-ink-muted rounded-button pointer-events-none absolute inset-x-1 overflow-hidden border border-dashed px-1.5 py-0.5 text-xs"
                    style={{
                      top: `${minuteZuPixel(b.vonMinute, fenster.vonMinute, stundenHoehe)}px`,
                      height: `${minuteZuPixel(b.bisMinute, fenster.vonMinute, stundenHoehe) - minuteZuPixel(b.vonMinute, fenster.vonMinute, stundenHoehe)}px`,
                    }}
                  >
                    belegt
                    <span className="sr-only">
                      {' '}
                      {minuteZuZeit(b.vonMinute)} bis {minuteZuZeit(b.bisMinute)}
                    </span>
                  </div>
                ))}

                {/* Die drei Linienarten von fein nach kraeftig: die spaetere
                  Regel gewinnt bei gleicher Deckkraft nicht, aber die
                  Zeichenreihenfolge haelt die Stunde obenauf. */}
                {feine.map((m) => (
                  <div
                    key={`f${m}`}
                    aria-hidden="true"
                    className={`${LINIE.fein} pointer-events-none absolute inset-x-0 border-t`}
                    style={{ top: `${minuteZuPixel(m, fenster.vonMinute, stundenHoehe)}px` }}
                  />
                ))}
                {halbe.map((m) => (
                  <div
                    key={`h${m}`}
                    aria-hidden="true"
                    className={`${LINIE.halb} pointer-events-none absolute inset-x-0 border-t`}
                    style={{ top: `${minuteZuPixel(m, fenster.vonMinute, stundenHoehe)}px` }}
                  />
                ))}
                {stunden.map((m) => (
                  <div
                    key={`s${m}`}
                    aria-hidden="true"
                    className={`${LINIE.stunde} pointer-events-none absolute inset-x-0 border-t`}
                    style={{ top: `${minuteZuPixel(m, fenster.vonMinute, stundenHoehe)}px` }}
                  />
                ))}

                {/* Fahrwege (UBK-005): über den Linien, unter den Kacheln, nicht antippbar - die
                    freie Fläche darunter bleibt eine Auswahl. Ragt der Weg in
                    den Termin davor, liegt die Kachel darüber; was sichtbar
                    bleibt, ist der Rest der Fahrt. */}
                {/* UBK-014: Lücken unter Fahrwegen und Kacheln - eine Auskunft,
                  die den Tipp auf die freie Fläche nicht abfängt. */}
                {(s.luecken ?? []).map((l) => {
                  const von = Math.max(l.vonMinute, fenster.vonMinute);
                  const bis = Math.min(l.bisMinute, fenster.bisMinute);
                  if (bis <= von || l.stufe === 'laedt') return null;
                  const oben = minuteZuPixel(von, fenster.vonMinute, stundenHoehe);
                  const hoehe = minuteZuPixel(bis, fenster.vonMinute, stundenHoehe) - oben;
                  const darstellung = lueckenDarstellung[l.stufe];
                  const text =
                    l.ab && (l.stufe === 'passt' || l.stufe === 'knapp')
                      ? `${darstellung.text} ab ${l.ab}`
                      : darstellung.text;
                  return (
                    <div
                      key={`luecke-${l.vonMinute}`}
                      data-testid="luecke"
                      data-stufe={l.stufe}
                      className={`${darstellung.flaeche} pointer-events-none absolute inset-x-0 overflow-hidden px-1.5 pt-0.5 text-xs leading-4 font-semibold`}
                      style={{ top: `${oben}px`, height: `${hoehe}px` }}
                    >
                      <span aria-hidden="true" className={hoehe >= 16 ? '' : 'hidden'}>
                        {darstellung.zeichen} {text}
                      </span>
                      <span className="sr-only">
                        {`Lücke ${minuteZuZeit(l.vonMinute)} bis ${minuteZuZeit(l.bisMinute)}: ${text}`}
                      </span>
                    </div>
                  );
                })}

                {(s.fahrwege ?? []).map((w) => {
                  const von = Math.max(w.vonMinute, fenster.vonMinute);
                  const bis = Math.min(w.bisMinute, fenster.bisMinute);
                  if (bis <= von) return null;
                  const oben = minuteZuPixel(von, fenster.vonMinute, stundenHoehe);
                  const hoehe = minuteZuPixel(bis, fenster.vonMinute, stundenHoehe) - oben;
                  return (
                    <div
                      key={`weg-${w.vonMinute}-${w.bisMinute}`}
                      data-testid={w.veraltet ? 'fahrweg-veraltet' : 'fahrweg'}
                      className={`${
                        w.veraltet
                          ? 'border-warnung bg-warnung-soft text-warnung'
                          : 'border-accent/40 bg-accent-soft text-accent'
                      } rounded-button pointer-events-none absolute inset-x-1 overflow-hidden border border-dashed px-1.5 text-xs leading-4 font-semibold`}
                      style={{ top: `${oben}px`, height: `${hoehe}px` }}
                    >
                      {/* Die Zahl nur, wo sie hineinpasst; vorgelesen wird sie immer. */}
                      <span aria-hidden="true" className={hoehe >= 16 ? '' : 'hidden'}>
                        {w.veraltet ? '! Adresse veraltet' : `Weg ≈ ${w.minuten} min`}
                      </span>
                      <span className="sr-only">
                        {w.veraltet
                          ? `Fahrzeit nicht verfügbar: Die Adresse am Termin um ${minuteZuZeit(w.bisMinute)} ist veraltet`
                          : `Fahrweg etwa ${w.minuten} Minuten, ${minuteZuZeit(w.vonMinute)} bis ${minuteZuZeit(w.bisMinute)}`}
                      </span>
                    </div>
                  );
                })}

                {/* Die aktuelle Uhrzeit (BEF-039). Die erste heutige Spalte
                  trägt den Anker für „Jetzt"; außerhalb des Fensters steht
                  der Anker am Rand und die Linie fehlt. */}
                {jetzt && jetzt.spalten.includes(s.id)
                  ? (() => {
                      const imFenster =
                        jetzt.minute >= fenster.vonMinute && jetzt.minute <= fenster.bisMinute;
                      const minute = Math.max(
                        fenster.vonMinute,
                        Math.min(fenster.bisMinute, jetzt.minute),
                      );
                      return (
                        <div
                          ref={s.id === ersteHeutigeSpalte ? jetztRef : undefined}
                          data-testid={imFenster ? 'jetzt-linie' : undefined}
                          aria-hidden="true"
                          className={`pointer-events-none absolute inset-x-0 z-30 ${imFenster ? 'border-accent border-t-2' : ''}`}
                          style={{
                            top: `${minuteZuPixel(minute, fenster.vonMinute, stundenHoehe)}px`,
                          }}
                        />
                      );
                    })()
                  : null}

                {eigene.map((g, i) => {
                  const { spalte, anzahl } = verteilung[i]!;
                  const { links, breite } = kachelBreite(spalte, anzahl);
                  const wirdGezogen = ziehen.vorschau?.terminId === g.eintrag.id;
                  return (
                    <Kachel
                      key={g.eintrag.id}
                      linkRef={(el) => {
                        if (el) kachelRefs.current.set(g.eintrag.id, el);
                        else kachelRefs.current.delete(g.eintrag.id);
                      }}
                      gitter={g}
                      fensterVon={fenster.vonMinute}
                      stundenHoehe={stundenHoehe}
                      links={links}
                      breite={breite}
                      stapel={spalte + 1}
                      gedimmt={wirdGezogen}
                      bisher={vorschlag?.terminId === g.eintrag.id}
                      wartet={ziehen.wartetAuf === g.eintrag.id}
                      ziehbar={ziehbarErlaubt && g.ziehbar}
                      rueckweg={rueckweg}
                      onWaehlen={onWaehlen}
                      gewaehlt={gewaehlt === g.eintrag.id}
                      onPointerDown={(event) =>
                        ziehen.beginnen(event, {
                          id: g.eintrag.id,
                          spalteId: g.spalteId,
                          startMinute: g.beginnMinute,
                          dauer: g.endeMinute - g.beginnMinute,
                        })
                      }
                      onClickCapture={(event) => {
                        if (ziehen.klickUnterdruecken()) event.preventDefault();
                      }}
                    />
                  );
                })}

                {/* Die Rueckfrage im Gitter (FIX-017): die neue Kachel am Ziel,
                  der Kasten daneben. Die alte Kachel steht als Umriss weiter
                  oben (`bisher`). Bei den rechten Spalten haengt der Kasten
                  links an, damit er nicht aus dem Gitter laeuft; unter oder
                  ueber der Kachel, je nach gemessener Hoehe (KAL-13). */}
                {vorschlag && vorschlag.spalteId === s.id
                  ? (() => {
                      const oben = minuteZuPixel(
                        vorschlag.startMinute,
                        fenster.vonMinute,
                        stundenHoehe,
                      );
                      const kachelHoehe = Math.max(
                        AUSWAHL_MINDESTHOEHE,
                        ((vorschlag.endeMinute - vorschlag.startMinute) / 60) * stundenHoehe,
                      );
                      const spalteIndex = spaltenModell.findIndex((x) => x.id === s.id);
                      const rechts =
                        spalteIndex >= spaltenModell.length / 2 && spaltenModell.length > 1;
                      // Bis zur ersten Messung unter der Kachel; die Messung
                      // läuft vor dem Zeichnen.
                      const kastenOben = rueckfrageLage ?? oben + kachelHoehe + 4;
                      return (
                        <>
                          <div
                            data-testid="vorschlag-kachel"
                            className="border-accent bg-surface text-accent rounded-button outline-accent absolute inset-x-1 z-40 border-2 px-2 py-1 text-xs font-semibold outline-2"
                            style={{ top: `${oben}px`, height: `${kachelHoehe}px` }}
                            aria-hidden="true"
                          >
                            Neu · {minuteZuZeit(vorschlag.startMinute)}–
                            {minuteZuZeit(vorschlag.endeMinute)}
                          </div>
                          <VerschiebenRueckfrage
                            ref={rueckfrageRef}
                            frage={vorschlag.frage}
                            laeuft={vorschlag.laeuft}
                            fehler={vorschlag.fehler}
                            onBestaetigen={vorschlag.onBestaetigen}
                            onAbbrechen={vorschlag.onAbbrechen}
                            auskunft={
                              wegfrage && zeitzone ? (
                                <WegauskunftFuer
                                  frage={wegfrage({
                                    terminId: vorschlag.terminId,
                                    spalteId: vorschlag.spalteId,
                                    startMinute: vorschlag.startMinute,
                                  })}
                                  zeitzone={zeitzone}
                                  variante="rueckfrage"
                                />
                              ) : undefined
                            }
                            className={[
                              'absolute z-50 w-72 max-w-[calc(100vw-5rem)]',
                              rechts ? 'right-1' : 'left-1',
                            ].join(' ')}
                            style={{ top: `${kastenOben}px` }}
                          />
                        </>
                      );
                    })()
                  : null}

                {/* Die aufgezogene Spanne (CAL-019): Sie zeigt beide Enden,
                  solange der Zeiger unten ist. Geschrieben ist nichts - das
                  Menü fragt erst, was daraus werden soll. Flächen in der
                  weichen Hauptfarbe, ohne Deckkraft (TOK-09). */}
                {spanne.vorschau && spanne.vorschau.spalteId === s.id ? (
                  <div
                    data-testid="spanne-vorschau"
                    className="border-accent bg-accent-soft text-accent rounded-button pointer-events-none absolute inset-x-1 z-40 overflow-hidden border-2 border-dashed px-2 py-1 text-xs leading-4 font-medium"
                    style={{
                      top: `${minuteZuPixel(spanne.vorschau.vonMinute, fenster.vonMinute, stundenHoehe)}px`,
                      height: `${Math.max(AUSWAHL_MINDESTHOEHE, ((spanne.vorschau.bisMinute - spanne.vorschau.vonMinute) / 60) * stundenHoehe)}px`,
                    }}
                    aria-hidden="true"
                  >
                    {minuteZuZeit(spanne.vorschau.vonMinute)}
                    {spanne.vorschau.bisMinute > spanne.vorschau.vonMinute
                      ? `–${minuteZuZeit(spanne.vorschau.bisMinute)}`
                      : ''}
                  </div>
                ) : null}

                {/* Die Auswahl (CAL-019). Das Menü dazu steht als Leiste unter
                  dem Gitter, damit die Spalte frei bleibt (BEF-035). */}
                {auswahl && auswahl.spalteId === s.id ? (
                  <div
                    data-testid="auswahl-flaeche"
                    className="border-accent bg-accent-soft text-accent rounded-button pointer-events-none absolute inset-x-1 z-40 overflow-hidden border-2 px-2 py-1 text-xs leading-4 font-semibold"
                    style={{
                      top: `${minuteZuPixel(auswahl.vonMinute, fenster.vonMinute, stundenHoehe)}px`,
                      height: `${Math.max(AUSWAHL_MINDESTHOEHE, ((auswahl.bisMinute - auswahl.vonMinute) / 60) * stundenHoehe)}px`,
                    }}
                    aria-hidden="true"
                  >
                    {minuteZuZeit(auswahl.vonMinute)}
                    {auswahl.bisMinute > auswahl.vonMinute
                      ? `–${minuteZuZeit(auswahl.bisMinute)}`
                      : ''}
                  </div>
                ) : null}

                {/* Vorschau: zeigt nur, wohin es ginge. Geschrieben ist noch nichts. */}
                {ziehen.vorschau && ziehen.vorschau.spalteId === s.id ? (
                  <div
                    data-testid="zieh-vorschau"
                    className="border-accent bg-accent-soft text-accent rounded-button pointer-events-none absolute inset-x-1 z-40 overflow-hidden border-2 border-dashed px-2 py-1 text-xs leading-4 font-medium"
                    style={{
                      top: `${minuteZuPixel(ziehen.vorschau.startMinute, fenster.vonMinute, stundenHoehe)}px`,
                      height: `${Math.max(AUSWAHL_MINDESTHOEHE, (ziehen.vorschau.dauer / 60) * stundenHoehe)}px`,
                    }}
                    aria-hidden="true"
                  >
                    {minuteZuZeit(ziehen.vorschau.startMinute)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Das Anlegen-Menü als Leiste am unteren Rand (BEF-035, ANN-108):
        klebt beim Bildlauf am Fensterrand, über der Tableiste des
        Telefons, und lässt die Spalte der Auswahl frei. Außerhalb des
        Gitters, weil dessen waagerechter Bildlauf ein `sticky` darin an
        den Kasten statt an das Fenster bände. */}
      {/* UBK-013: Beim Ziehen steht „Passt es?“ am unteren Rand - der Finger
          deckt die Vorschau selbst zu. Gefragt wird, wenn die Vorschau einen
          Augenblick stillsteht. */}
      {ziehen.vorschau && wegfrage && zeitzone ? (
        <div
          data-testid="zieh-auskunft"
          aria-hidden="true"
          className="border-line-strong bg-surface rounded-card sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mt-2 border-2 px-3 py-2 sm:bottom-4"
        >
          <p className="text-ink text-sm font-semibold tabular-nums">
            Neu · {minuteZuZeit(ziehen.vorschau.startMinute)}–
            {minuteZuZeit(ziehen.vorschau.startMinute + ziehen.vorschau.dauer)} Uhr · Passt es?
          </p>
          <WegauskunftFuer
            frage={wegfrage({
              terminId: ziehen.vorschau.terminId,
              spalteId: ziehen.vorschau.spalteId,
              startMinute: ziehen.vorschau.startMinute,
            })}
            zeitzone={zeitzone}
            variante="ziehen"
            verzoegerung={250}
          />
        </div>
      ) : null}

      {auswahl ? (
        <AnlegenMenue
          auswahl={auswahl}
          className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mt-2 sm:bottom-4"
        />
      ) : null}
    </>
  );
}

function Kachel({
  gitter,
  fensterVon,
  stundenHoehe,
  links,
  breite,
  stapel,
  gedimmt,
  bisher,
  wartet,
  ziehbar,
  rueckweg,
  onWaehlen,
  gewaehlt,
  linkRef,
  onPointerDown,
  onClickCapture,
}: {
  gitter: GitterEintrag;
  /** Der alte Platz einer Verschiebung, ueber die gerade gefragt wird (FIX-017). */
  bisher: boolean;
  fensterVon: number;
  stundenHoehe: number;
  links: number;
  breite: number;
  stapel: number;
  gedimmt: boolean;
  /** Der lange Druck läuft gerade - sichtbare Rückmeldung am Finger (UX-010). */
  wartet: boolean;
  ziehbar: boolean;
  rueckweg: string | undefined;
  onWaehlen: ((eintrag: CalendarEntry) => void) | undefined;
  gewaehlt: boolean;
  /** Für die Fokusführung nach der Rückfrage (KAL-21). */
  linkRef: (element: HTMLElement | null) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onClickCapture: (event: React.MouseEvent) => void;
}) {
  const { eintrag, beginnMinute, endeMinute } = gitter;
  const oben = minuteZuPixel(beginnMinute, fensterVon, stundenHoehe);
  // Mindesthöhe, damit auch ein sehr kurzer Termin greifbar bleibt. Sie
  // verzerrt einen Termin unterhalb dieser Dauer nach oben; die Zieh-Vorschau
  // zeigt daneben die tatsächliche Dauer, und auf einer höheren Zoomstufe
  // greift die Mindesthöhe ohnehin nicht mehr.
  const hoehe = Math.max(28, ((endeMinute - beginnMinute) / 60) * stundenHoehe);
  const vermerk = eintrag.status === 'confirmed' ? null : appointmentStatusLabels[eintrag.status];
  // §8.1: Eine abweichende Länge wird gekennzeichnet - als Bild in der
  // Zeitzeile, als Satz für Vorlesewerkzeuge und im Tooltip (CAL-020).
  const abweichung = abweichendeLaengeMinuten(eintrag);
  // Drei Zeilen (Design-Handoff 2026-10-01, Abschnitt 7a): Zeit, Name,
  // Unterzeile mit Zeichen und Wort - „! Doku offen", „✓ Dokumentiert",
  // „× Abgesagt" - oder dem Ort, wenn er vom Regelfall abweicht.
  //
  // Zustände mit eigenen Flächen statt Deckkraft (KAL-18): Abgesagt, nicht
  // angetroffen, eine Fehlzeit und der alte Platz einer Verschiebung stehen
  // auf dem Seitengrund; abgesagt und der alte Platz zusätzlich gestrichelt.
  const abgesagt = eintrag.status === 'cancelled';
  const zurueckgelassen = gedimmt || bisher || gitter.zurueckgenommen === true;
  const aufGrund = abgesagt || eintrag.status === 'no_show' || eintrag.kind === 'internal';
  const zeile3 = unterzeile(eintrag);
  // BEF-072: So viele Zeilen, wie ganz hineinpassen - eine halb
  // angeschnittene Zeile entfällt lieber. Jede Zeile ist 16 px hoch.
  const zeilen = kachelZeilen(hoehe);

  const titel = [
    bisher ? 'Bisher' : null,
    gitter.zurueckgenommen ? 'Belegt' : null,
    `${minuteZuZeit(beginnMinute)}–${minuteZuZeit(endeMinute)}`,
    // Warum eine Kachel nicht zieht, steht dran - eine stumme Kachel sieht
    // aus wie ein Fehler (BEF-015).
    !gitter.ziehbar && eintrag.status !== 'confirmed'
      ? `Nicht verschiebbar: ${appointmentStatusLabels[eintrag.status]}`
      : null,
    abweichung === null ? null : abweichendeLaengeText(abweichung),
    vermerk,
    dokuOffen(eintrag) ? 'Doku offen' : null,
    ortsHinweis(eintrag),
  ]
    .filter(Boolean)
    .join(' · ');

  const klassen = [
    // Spalte mit sichtbarer Reihenfolge Zeit, Name, Unterzeile; vorgelesen
    // wird zuerst der Name (KAL-16) - die Zeit steht im Quelltext danach.
    'rounded-button absolute flex flex-col overflow-hidden',
    // Ohne Schatten (Design-Handoff 2026-10-01): Fläche und Linie tragen.
    'border border-l-[3px] px-1.5 py-1 text-left transition-colors',
    abgesagt || zurueckgelassen
      ? 'bg-canvas border-dashed'
      : aufGrund
        ? 'bg-canvas'
        : 'bg-surface hover:bg-surface-sunken',
    // Sichtbare Rueckmeldung auf den langen Druck: sonst sieht Warten aus
    // wie nichts.
    wartet ? 'scale-102' : '',
    wartet || gitter.neu || gewaehlt
      ? 'border-accent border-2'
      : abgesagt || zurueckgelassen
        ? 'border-line-strong'
        : 'border-line',
    // Nach der Randfarbe: Die Linie links behält ihre Statusfarbe, auch an
    // einer hervorgehobenen Kachel. Eine zurückgenommene Kachel ist neutral.
    gitter.zurueckgenommen ? 'border-l-line-strong' : statusLinie(eintrag),
    // Bewusst NICHT `touch-none` (UX-010): Der Bildlauf bleibt beim Browser;
    // das Verschieben beginnt erst nach dem langen Druck.
    ziehbar ? 'cursor-grab touch-pan-x touch-pan-y' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const stil = {
    top: `${oben}px`,
    height: `${hoehe}px`,
    left: `${links}%`,
    width: `${breite}%`,
    zIndex: stapel,
  };

  const inhalt = (
    <>
      {zeilen >= 2 ? (
        // Der Titel eines Ereignisses steht dort, wo sonst der Name steht -
        // und ein Zeichen davor sagt, dass es keine Behandlung ist (CAL-015b).
        // Vorgelesen wird das Wort, nicht das Zeichen (KAL-16).
        <span
          className={`block truncate text-[0.8125rem] leading-4 font-semibold ${
            eintrag.status === 'documented' || eintrag.status === 'invoiced'
              ? 'text-ink-muted'
              : 'text-ink'
          }`}
        >
          {eintrag.kind === 'internal' ? (
            <>
              <span aria-hidden="true">▪ </span>
              <span className="sr-only">{BEGRIFFE.fehlzeit}: </span>
            </>
          ) : null}
          {/* Training ist keine Behandlung - ein eigenes Zeichen, vorgelesen
              als Wort (TRN-006, ADR-021 Punkt 9). */}
          {eintrag.kind === 'training' ? (
            <>
              <span aria-hidden="true">◆ </span>
              <span className="sr-only">Training: </span>
            </>
          ) : null}
          {terminBezeichnung(eintrag)}
        </span>
      ) : (
        <span className="sr-only">{terminBezeichnung(eintrag)}</span>
      )}
      <span className="text-ink-muted order-first block truncate text-xs leading-4 tabular-nums">
        {bisher ? <span>Bisher · </span> : null}
        {minuteZuZeit(beginnMinute)}–{minuteZuZeit(endeMinute)}{' '}
        <Laengenzeichen termin={eintrag} knapp />
      </span>
      {zeile3 && zeilen >= 3 ? (
        <span
          className={`block truncate text-xs leading-4 font-medium ${zeile3.farbe}`}
          data-testid={zeile3.farbe === 'text-ink-muted' ? undefined : 'kachel-status'}
        >
          {zeile3.zeichen ? <span aria-hidden="true">{zeile3.zeichen} </span> : null}
          {zeile3.text}
        </span>
      ) : zeile3 && zeile3.farbe !== 'text-ink-muted' ? (
        // Zu niedrig für die dritte Zeile: Der Zustand bleibt vorgelesen.
        <span className="sr-only">{zeile3.text}</span>
      ) : null}
    </>
  );

  if (onWaehlen) {
    return (
      <button
        ref={linkRef}
        type="button"
        aria-pressed={gewaehlt}
        // Für die Prüfungen: die Kachel EINES Termins, ohne Link-Adresse.
        data-termin={eintrag.id}
        onPointerDown={ziehbar ? onPointerDown : undefined}
        onClickCapture={onClickCapture}
        onClick={(event) => {
          if (event.defaultPrevented) return;
          onWaehlen(eintrag);
        }}
        title={titel}
        style={stil}
        className={klassen}
      >
        {inhalt}
      </button>
    );
  }

  return (
    <Link
      ref={linkRef}
      // Ein Trainingstermin oeffnet im Trainingsbereich (TRN-004): Seine
      // Detailseite kennt die Kund:in statt einer Patient:in.
      to={mitRueckweg(terminPfad(eintrag), rueckweg)}
      // Ein Link ist im Browser von Haus aus ziehbar. Diese eingebaute Geste
      // bricht die Zeigerverfolgung sofort mit pointercancel ab - ohne
      // draggable=false kaeme das Verschieben gar nicht erst zustande.
      draggable={false}
      data-termin={eintrag.id}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={ziehbar ? onPointerDown : undefined}
      onClickCapture={onClickCapture}
      title={titel}
      style={stil}
      className={klassen}
    >
      {inhalt}
    </Link>
  );
}
