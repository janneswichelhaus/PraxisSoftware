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

export interface DatenklasseTexte {
  /** Überschrift in der Aufbewahrungsübersicht. */
  label: string;
  /** Ein Satz: worum es geht. */
  beschreibung: string;
}

export const DATENKLASSEN: Record<string, DatenklasseTexte> = {
  patientenakte: {
    label: 'Klinische Patientenakte',
    beschreibung:
      'Dokumentation, Verordnungen, Termine mit Behandlungsnachweis und die Stammdaten der Patientin.',
  },
  termin_ohne_nachweis: {
    label: 'Abgesagte Termine ohne Nachweis',
    beschreibung:
      'Abgesagte Termine, an denen keine Dokumentation hängt. Hängt Dokumentation daran, gilt die Frist der Akte.',
  },
  auditlog: {
    label: 'Auditlog',
    beschreibung: 'Nachweis sensibler Zugriffe. Nur Metadaten, keine klinischen Inhalte.',
  },
  zugangseinladung: {
    label: 'Einladungen zu Zugängen',
    beschreibung:
      'Angenommene, zurückgenommene und abgelaufene Einladungen von Mitarbeitenden zu einem Zugang.',
  },
  personenstammdaten: {
    label: 'Personenstammdaten',
    beschreibung:
      'Name, Geburtsdatum und Kontakt einer Person. Bleiben, solange eine Rolle darauf verweist.',
  },
  beschaeftigtendaten: {
    label: 'Beschäftigtendaten',
    beschreibung: 'Mitarbeiterdatensätze, Privatangaben und Arbeitszeiten.',
  },
  accountdaten: {
    label: 'Zugangsdaten',
    beschreibung: 'Konto und Rollen. Getrennt von den aufbewahrungspflichtigen Fachdaten.',
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
      'Nachweis wirksam gewordener Löschungen. Enthält nach der Löschung keine Personendaten mehr.',
  },
  konfiguration: {
    label: 'Konfiguration',
    beschreibung: 'Rollenkatalog und Aufbewahrungsplan selbst. Kein Personenbezug.',
  },
};

/** Ab wann die Frist läuft. */
export const ANKER_TEXTE: Record<string, string> = {
  care_concluded: 'ab Abschluss der Versorgung',
  calendar_year_end: 'ab Ende des Kalenderjahres',
  event_time: 'ab dem Ereignis',
  case_closed: 'ab Abschluss des Vorgangs',
  none: 'keine automatische Löschung',
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
