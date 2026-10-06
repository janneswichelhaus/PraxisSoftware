/**
 * Beschriftungen des Retention Schedule (LOE-001a).
 *
 * Die verbindlichen Angaben — Frist, Anker, Grundlage — stehen in der Datenbank
 * (`public.retention_classes`), nicht hier. Diese Datei übersetzt ihre
 * Schlüssel in die Sprache der Oberfläche; sie entscheidet nichts.
 *
 * `supabase/tests/retention.test.ts` hält beide Listen deckungsgleich: eine
 * neue Datenklasse ohne Beschriftung lässt den Datenbanktest scheitern.
 */

interface DatenklasseTexte {
  /** Überschrift in der Aufbewahrungsübersicht. */
  label: string;
  /** Ein Satz: worum es geht. */
  beschreibung: string;
}

export const DATENKLASSEN: Record<string, DatenklasseTexte> = {
  patientenakte: {
    label: 'Klinische Patientenakte',
    beschreibung:
      'Dokumentation, Verordnungen, Termine mit Behandlungsnachweis, Dokumentationsfotos und die Stammdaten der Patient:in.',
  },
  patientenfoto: {
    label: 'Foto-Arbeitshilfen',
    beschreibung:
      'Fotos für Übergabe und Vergleich, die die Praxis mit Einwilligung von der Person aufnimmt. Neben der Akte, nicht Teil von ihr; beim Widerruf sofort gelöscht. Dokumentationsfotos gehören zur Akte (ADR-017).',
  },
  trainingsverhaeltnis: {
    label: 'Trainingsverhältnis',
    beschreibung:
      'Vertragsdaten des Trainings. Eigene Frist neben der Patientenakte: Training ist keine Heilbehandlung (ADR-021).',
  },
  termin_ohne_nachweis: {
    label: 'Abgesagte Termine ohne Nachweis',
    beschreibung:
      'Abgesagte Termine, an denen keine Dokumentation hängt. Hängt Dokumentation daran, gilt die Frist der Akte.',
  },
  auditlog: {
    label: 'Protokoll',
    beschreibung:
      'Exporte, Herunterladen, Plattformzugänge, Konten und Rechte, Löschläufe. Nur Metadaten, keine klinischen Inhalte.',
  },
  auditlog_lesen_sicherheit: {
    label: 'Protokoll: Lesen und Sicherheit',
    beschreibung:
      'Wer an welchem Tag eine Akte geöffnet hat, abgewiesene Zugriffe und Ereignisse am eigenen Konto. Nur Metadaten.',
  },
  zugangseinladung: {
    label: 'Einladungen zu Zugängen',
    beschreibung:
      'Angenommene, zurückgenommene und abgelaufene Einladungen von Mitarbeitenden zu einem Zugang.',
  },
  plattformzugang: {
    label: 'Plattformzugänge',
    beschreibung:
      'Zugänge von Patient:innen und Kund:innen zur Plattform mit ihren Einladungen als Nachweis. Das Konto fällt 30 Tage nach dem Ende des letzten Zugangs, der Nachweis nach drei Jahren.',
  },
  terminwunsch: {
    label: 'Terminwünsche',
    beschreibung:
      'Terminwünsche über die Plattform, beantwortet oder zurückgezogen. Offene Wünsche bleiben, bis die Praxis antwortet oder sie mit dem Verhältnis fallen.',
  },
  warteliste: {
    label: 'Warteliste',
    beschreibung:
      'Eingeplante und zurückgezogene Einträge der Warteliste. Offene Einträge bleiben, bis sie geschlossen werden oder mit der Akte fallen.',
  },
  aufgabe: {
    label: 'Aufgaben',
    beschreibung:
      'Erledigte Aufgaben und Wiedervorlagen. Offene bleiben stehen; mit Bezug auf eine Person fallen sie mit der Akte.',
  },
  anrufstand: {
    label: 'Anrufliste',
    beschreibung:
      'Vermerk „nicht erreicht“ oder „Nachricht hinterlassen“ an einem Termin. Fällt zwei Wochen nach dem Termin; „erreicht“ steht als Mitteilung am Termin.',
  },
  sitzungsvermerk: {
    label: 'Sitzungssperre',
    beschreibung:
      'Zeitpunkt der letzten Bedienung je angemeldeter Sitzung, damit sich die Anwendung nach 30 Minuten ohne Bedienung sperrt. Fällt einen Tag danach und mit dem Konto.',
  },
  personenstammdaten: {
    label: 'Personenstammdaten',
    beschreibung:
      'Name, Geburtsdatum und Kontakt einer Person. Bleiben, solange eine Rolle darauf verweist.',
  },
  beschaeftigtendaten: {
    label: 'Beschäftigtendaten',
    beschreibung: 'Stammdaten der Mitarbeitenden, ihre Privatangaben und Arbeitszeiten.',
  },
  accountdaten: {
    label: 'Zugangsdaten',
    beschreibung: 'Konto und Rollen. Getrennt von den aufbewahrungspflichtigen Fachdaten.',
  },
  abrechnungsdaten: {
    label: 'Abrechnungsdaten',
    beschreibung:
      'Rechnungen, erfasste Leistungen und der Leistungskatalog. Folgen der steuerlichen Frist, nicht der Frist der Akte – eine ausgestellte Rechnung hält die Akte so lange fest.',
  },
  verordnerkartei: {
    label: 'Verordner:innen',
    beschreibung: 'Berufliche Kontaktdaten verordnender Ärzt:innen, ohne Patientenbezug.',
  },
  betriebsdaten: {
    label: 'Betriebsdaten der Praxis',
    beschreibung: 'Textbausteine und vergleichbare Arbeitsmittel ohne Patientenbezug.',
  },
  stammdaten_praxis: {
    label: 'Praxisstammdaten',
    beschreibung: 'Organisation und Standorte.',
  },
  loeschjournal: {
    label: 'Löschjournal',
    beschreibung:
      'Liste wirksam gewordener Löschungen, damit sie nach einer Wiederherstellung nachgezogen werden. Enthält keine Personendaten.',
  },
  loeschauftrag: {
    label: 'Löschaufträge der Ablage',
    beschreibung:
      'Aufträge, eine Datei aus der Ablage zu entfernen, mit Quittung. Offene bleiben, bis sie ausgeführt sind.',
  },
  konfiguration: {
    label: 'Konfiguration',
    beschreibung: 'Rollenkatalog und Aufbewahrungsplan selbst. Kein Personenbezug.',
  },
};

/** Ab wann die Frist läuft. */
export const ANKER_TEXTE: Record<string, string> = {
  care_concluded: 'ab Abschluss der Versorgung',
  contract_ended: 'ab Ende des Vertrages',
  calendar_year_end: 'ab Ende des Kalenderjahres',
  event_time: 'ab dem Ereignis',
  case_closed: 'ab Abschluss des Vorgangs',
  none: 'keine automatische Löschung',
};

/** Die Obergrenze einer Frist: ab wann sie spätestens endet (ADR-017 Punkt 38). */
export const OBERGRENZE_TEXTE: Record<string, string> = {
  care_concluded_recorded: 'nach dem festgehaltenen Abschluss der Versorgung',
};

/** Woher die Frist kommt. */
export const GRUNDLAGE_TEXTE: Record<string, string> = {
  gesetzlich: 'gesetzlich',
  gesetzlich_gepraegt: 'gesetzlich geprägt',
  intern: 'interne Festlegung',
  abgeleitet: 'abgeleitet',
  offen: 'noch nicht entschieden',
};

/** Wie gelöscht wird. */
export const LOESCHWEG_TEXTE: Record<string, string> = {
  automatisch: 'eigene Regel im Löschlauf',
  ueber_elterndatensatz: 'mit dem übergeordneten Datensatz',
  keine: 'keine automatische Löschung',
};

/**
 * Frist als Text.
 *
 * PostgreSQL liefert `interval` als ISO-8601-Dauer (`P10Y`) oder als
 * Textform (`10 years`), je nach Einstellung der Verbindung. Beide Formen
 * werden hier auf dieselbe deutsche Angabe gebracht; alles Unbekannte bleibt
 * unverändert stehen, statt eine falsche Zahl zu erfinden.
 */
export function fristText(interval: string | null): string {
  if (!interval) return 'keine Frist';

  // Verankert, die optionalen Gruppen haben je ein eigenes Endzeichen - das
  // Muster laeuft linear und kann nicht rueckwaerts laufen. Der Wert kommt aus
  // der Datenbank.
  // eslint-disable-next-line security/detect-unsafe-regex
  const iso = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/.exec(interval.trim());
  if (iso) {
    const [, jahre, monate, tage] = iso;
    const teile: string[] = [];
    if (jahre) teile.push(`${jahre} ${jahre === '1' ? 'Jahr' : 'Jahre'}`);
    if (monate) teile.push(`${monate} ${monate === '1' ? 'Monat' : 'Monate'}`);
    if (tage) teile.push(`${tage} ${tage === '1' ? 'Tag' : 'Tage'}`);
    if (teile.length > 0) return teile.join(' und ');
  }

  const text = /^(\d+)\s+(year|years|mon|mons|month|months|day|days)$/.exec(interval.trim());
  if (text) {
    const [, anzahl, einheit] = text;
    const eins = anzahl === '1';
    if (einheit?.startsWith('year')) return `${anzahl} ${eins ? 'Jahr' : 'Jahre'}`;
    if (einheit?.startsWith('mon')) return `${anzahl} ${eins ? 'Monat' : 'Monate'}`;
    return `${anzahl} ${eins ? 'Tag' : 'Tage'}`;
  }

  return interval;
}
