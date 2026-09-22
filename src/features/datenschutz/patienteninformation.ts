/**
 * Die zwei Blätter für die Aufnahme (PAT-006): Datenschutzinformation nach
 * Art. 13 DSGVO und die Regel zum Ausfallhonorar.
 *
 * **Entwurf.** Beide Texte sind vom Projekt formuliert, nicht von einer
 * Rechtsberatung. Sie gehen mit Anfrage B2 (Datenschutz) und B4 (Ausfallhonorar,
 * Rechnungstext) in die Prüfung; das Blatt trägt den Vermerk sichtbar, bis
 * jemand ihn nach der Prüfung entfernt. Echte Patient:innen bekommen es erst
 * danach — so wie jedes andere Scharfschalten (§15.2).
 *
 * **Die Fassung ist Teil des Vermerks.** Wer „Datenschutzinformation
 * ausgehändigt" vermerkt, vermerkt diese Fassung. Ändert sich der Text,
 * ändert sich `DATENSCHUTZINFORMATION_FASSUNG`; alte Vermerke behalten ihre.
 * Die Form `JJJJ-MM` prüft auch die Datenbank.
 */

export const DATENSCHUTZINFORMATION_FASSUNG = '2026-09';

export interface Abschnitt {
  titel: string;
  absaetze: string[];
}

/**
 * Die Datenschutzinformation, Abschnitt für Abschnitt.
 *
 * Der Abschnitt zum Kartendienst folgt ADR-019: Punkt 12 (was an den Dienst
 * geht — keine Namen, keine Termine, keine Gesundheitsangaben) und Punkt 23
 * (die Navigations-App bekommt nur das Ziel, und erst auf Aktion der
 * Therapeutin). Die Fristen folgen dem Aufbewahrungsplan (ADR-008).
 */
export function datenschutzinformation(praxis: string): Abschnitt[] {
  return [
    {
      titel: 'Wer für Ihre Daten verantwortlich ist',
      absaetze: [
        `Verantwortlich ist ${praxis}. Bei Fragen zum Datenschutz wenden Sie sich bitte direkt an die Praxis — persönlich, telefonisch oder schriftlich.`,
      ],
    },
    {
      titel: 'Wofür wir Ihre Daten verarbeiten',
      absaetze: [
        'Für Ihre Behandlung: Terminplanung, Befund, Behandlungsdokumentation und Verordnung. Grundlage ist der Behandlungsvertrag (§§ 630a ff. BGB) in Verbindung mit Art. 9 Abs. 2 lit. h DSGVO und § 22 Abs. 1 Nr. 1 lit. b BDSG. Die Dokumentation ist gesetzlich vorgeschrieben (§ 630f BGB).',
        'Für die Abrechnung: Rechnung und Zahlung. Grundlage sind der Vertrag (Art. 6 Abs. 1 lit. b DSGVO) und die steuerlichen Aufbewahrungspflichten (Art. 6 Abs. 1 lit. c DSGVO).',
        'Nur mit Ihrer Einwilligung (Art. 6 Abs. 1 lit. a, Art. 9 Abs. 2 lit. a DSGVO): Kontakt per E-Mail und Rückmeldungen an die Praxis, die Ihre Behandlung verordnet hat. Eine Einwilligung ist freiwillig; ohne sie behandeln wir Sie genauso.',
      ],
    },
    {
      titel: 'Hausbesuche und Kartendienst',
      absaetze: [
        'Für die Planung der Hausbesuche nutzen wir einen Kartendienst. Er erhält Ihre Adresse beziehungsweise deren Kartenposition — nie Ihren Namen, keine Termine, keine Uhrzeiten und keine Angaben zu Ihrer Gesundheit. Fahrzeiten werden nicht gespeichert.',
        'Für die Anfahrt kann die Therapeutin oder der Therapeut eine Navigations-App auf dem Diensthandy öffnen. Übergeben wird nur das Ziel, ohne Ihren Namen, und erst wenn sie oder er es ausdrücklich antippt — nie automatisch.',
      ],
    },
    {
      titel: 'Wer Ihre Daten sonst erhält',
      absaetze: [
        'Unsere Software läuft bei einem Dienstleister in der Europäischen Union, der Ihre Daten nur in unserem Auftrag verarbeitet (Art. 28 DSGVO). Darüber hinaus geben wir Daten nur weiter, wenn ein Gesetz es verlangt oder Sie eingewilligt haben.',
      ],
    },
    {
      titel: 'Wie lange wir Ihre Daten aufbewahren',
      absaetze: [
        'Die Behandlungsdokumentation zehn Jahre nach Abschluss der Behandlung (§ 630f Abs. 3 BGB), Rechnungen nach den steuerlichen Fristen. Danach werden die Daten gelöscht.',
      ],
    },
    {
      titel: 'Ihre Rechte',
      absaetze: [
        'Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit (Art. 15 bis 20 DSGVO) sowie auf Widerspruch (Art. 21 DSGVO). Eine Löschung ist nicht möglich, solange eine gesetzliche Aufbewahrungspflicht besteht; wir sagen Ihnen dann, welche und bis wann.',
        'Eine Einwilligung können Sie jederzeit für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO), formlos bei uns.',
        'Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO).',
      ],
    },
    {
      titel: 'Müssen Sie uns Ihre Daten geben?',
      absaetze: [
        'Ohne die Angaben, die wir für Behandlung, Dokumentation und Abrechnung brauchen, können wir Sie nicht behandeln. Eine automatisierte Entscheidung über Sie findet nicht statt.',
      ],
    },
  ];
}

/**
 * Die Regel zum Ausfallhonorar, wie sie für die Praxis gilt
 * (`PROJECT_PRINCIPLES.md` §8, ADR-018 Fassung 2 Punkt 8 und Fassung 3 Punkt 9).
 *
 * **Kein Betrag.** Die Höhe steht im Leistungskatalog (ABR-001) und ist mit
 * G13 noch offen; der Text verweist deshalb auf die Preisliste, statt eine
 * Zahl zu erfinden.
 */
export function ausfallhonorarRegel(): Abschnitt {
  return {
    titel: 'Absagen und Ausfallhonorar',
    absaetze: [
      'Einen Termin, den Sie nicht wahrnehmen können, sagen Sie bitte spätestens 24 Stunden vor Beginn ab. Maßgeblich ist, wann Ihre Absage bei uns eingeht — auch auf dem Anrufbeantworter.',
      'Geht die Absage weniger als 24 Stunden vor Beginn ein, berechnen wir ein Ausfallhonorar. Genau 24 Stunden vorher genügt.',
      'Bei einem Hausbesuch gilt dasselbe, wenn wir Sie nicht antreffen: Wir warten 15 Minuten, klingeln und rufen Sie an. Erreichen wir Sie so nicht, berechnen wir ein Ausfallhonorar.',
      'Sagen wir einen Termin ab, entsteht für Sie selbstverständlich keine Gebühr.',
      'Die Höhe des Ausfallhonorars steht in unserer aktuellen Preisliste.',
    ],
  };
}
