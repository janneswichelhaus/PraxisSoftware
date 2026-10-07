/**
 * Die Texte zum Trainingsvertrag im eigenen Konto (KND-003, KND-004,
 * PROJECT_PRINCIPLES.md 4.10, ANN-288).
 *
 * Die Widerrufsbelehrung folgt dem Muster der Anlage 1 zu Art. 246a § 1
 * Abs. 2 EGBGB für Dienstleistungen, ergänzt um die Widerrufsfunktion nach
 * § 356a BGB (seit dem 19. Juni 2026). Name und Anschrift der Praxis setzt die
 * Seite aus den Stammdaten ein.
 *
 * **Fassung** (ANN-288): Der Server speichert mit jedem Vertrag die Fassung,
 * die die Person gesehen hat. Ändert sich ein Satz, steigt `VERTRAGSFASSUNG` –
 * und `app.training_contract_wording_version()` in der Migration mit ihr;
 * `vertragstexte.test.ts` prüft, dass beide gleich sind. Eine Seite mit altem
 * Text wird dann abgewiesen.
 *
 * Geprüft wird der Wortlaut vor dem Scharfschalten (Prüfpaket, Vertragsrecht);
 * bis dahin ist er ein Entwurf.
 */
export const VERTRAGSFASSUNG = '2026-10';

/** Der Knopf, mit dem der Vertrag entsteht (§ 312j Abs. 3 BGB). */
export const BUCHEN = 'Zahlungspflichtig buchen';

/** Der Knopf der Widerrufsfunktion (§ 356a BGB) und seine Bestätigung. */
export const WIDERRUFEN = 'Vertrag widerrufen';
export const WIDERRUF_BESTAETIGEN = 'Widerruf bestätigen';

export interface Praxisangaben {
  name: string;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
}

/** Name und Anschrift in einer Zeile, wie das Muster sie einsetzt. */
export function praxisAnschrift(praxis: Praxisangaben): string {
  const strasse = [praxis.street, praxis.house_number].filter(Boolean).join(' ');
  const ort = [praxis.postal_code, praxis.city].filter(Boolean).join(' ');
  const kontakt = [
    praxis.phone ? `Telefon ${praxis.phone}` : null,
    praxis.email ? `E-Mail ${praxis.email}` : null,
  ].filter(Boolean);
  return [praxis.name, strasse, ort, ...kontakt].filter(Boolean).join(', ');
}

export interface Belehrungsabschnitt {
  titel: string;
  absaetze: string[];
}

/** Die Widerrufsbelehrung (Muster für Dienstleistungen, ANN-288). */
export function widerrufsbelehrung(praxis: Praxisangaben): Belehrungsabschnitt[] {
  return [
    {
      titel: 'Widerrufsrecht',
      absaetze: [
        'Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.',
        'Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.',
        `Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (${praxisAnschrift(praxis)}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das unten stehende Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.`,
        `Sie können den Widerruf auch hier in Ihrem Konto erklären: unter „Ich“ → „Trainingsvertrag“ mit der Schaltfläche „${WIDERRUFEN}“. Den Eingang bestätigen wir Ihnen dort sofort mit Datum und Uhrzeit.`,
        'Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.',
      ],
    },
    {
      titel: 'Folgen des Widerrufs',
      absaetze: [
        'Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.',
        'Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen sollen, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.',
      ],
    },
  ];
}

/** Das Muster-Widerrufsformular (Anlage 2 zu Art. 246a § 1 Abs. 2 EGBGB). */
export function musterformular(praxis: Praxisangaben): string[] {
  return [
    '(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)',
    `An ${praxisAnschrift(praxis)}:`,
    'Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung (*):',
    'Bestellt am (*)/erhalten am (*)',
    'Name des/der Verbraucher(s)',
    'Anschrift des/der Verbraucher(s)',
    'Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)',
    'Datum',
    '(*) Unzutreffendes streichen.',
  ];
}

/** Das ausdrückliche Verlangen, vor Ende der Frist zu beginnen (§ 356 Abs. 4 BGB). */
export const FRUEHER_BEGINN =
  'Ich verlange ausdrücklich, dass das Training vor dem Ende der Widerrufsfrist beginnt. Mir ist bekannt, dass ich bei einem Widerruf für die bis dahin erbrachten Leistungen einen anteiligen Betrag zahle.';

/** Was die Akte über das Annehmen erfährt (ANN-285). */
export const AKTE_ERFAEHRT =
  'Die Praxis sieht in Ihrer Behandlungsakte nur, dass und wann Sie das Angebot angenommen haben. Ihr Training wird getrennt von Ihrer Behandlung geführt.';

/** Warum ein Angebot (noch) nicht angenommen werden kann. */
export const ANGEBOTSHINDERNIS: Record<string, string> = {
  care_open:
    'Sie können buchen, sobald Ihre Behandlung abgeschlossen ist. Das Training beginnt erst danach.',
  before_care_end:
    'Das Training beginnt vor dem Abschluss Ihrer Behandlung. Bitte sprechen Sie die Praxis an.',
  has_training:
    'Sie haben schon einen Trainingsvertrag. Ein Paket dazu legt die Praxis direkt an – bitte sprechen Sie sie an.',
  price_changed:
    'Die Preisliste hat sich geändert. Bitte bitten Sie die Praxis um ein neues Angebot.',
};
