import { formatLocalTime } from './api';
import type { Seite, Wegpruefung } from './wegpruefung';

/**
 * „Passt es?“ - An- und Weiterfahrt eines geplanten Termins (UBK-012,
 * ANN-238). Nur Auskunft: Der Termin lässt sich immer anlegen; was knapp ist,
 * entscheidet die Person, die den Weg kennt (ANN-097).
 *
 * Kein Name eines anderen Termins: „vom Termin davor (bis 10:00)“ genügt,
 * um ihn im Kalender zu finden.
 */
export function Wegauskunft({
  pruefung,
  zeitzone,
  kompakt = false,
}: {
  pruefung: Wegpruefung;
  zeitzone: string;
  /** Für die Ziehvorschau (UBK-013): ohne Überschrift und Erklärsatz. */
  kompakt?: boolean;
}) {
  if (pruefung.stand === 'aus') return null;

  const zeilen = inhalt(pruefung, zeitzone);
  const zuKnapp =
    pruefung.stand === 'bereit' &&
    [pruefung.an, pruefung.weiter].some((s) => s.stand === 'geprueft' && s.stufe === 'nicht');

  return (
    <div
      className={kompakt ? 'space-y-0.5' : 'mt-6 space-y-1'}
      // Beim Ziehen ändert sich die Auskunft ständig; vorgelesen wird sie im
      // Formular, nicht bei jedem Rasterschritt.
      {...(kompakt ? {} : { role: 'status', 'aria-live': 'polite' as const })}
      data-testid="wegauskunft"
    >
      {kompakt ? null : <p className="text-ink text-sm font-semibold">Passt es?</p>}
      {zeilen.map((zeile) => (
        <p key={zeile.text} className={`text-sm ${farbe[zeile.ton]}`}>
          {zeile.ton === 'gut' ? (
            <span aria-hidden="true" className="mr-1.5">
              ✓
            </span>
          ) : zeile.ton === 'knapp' || zeile.ton === 'nicht' ? (
            <span aria-hidden="true" className="mr-1.5">
              !
            </span>
          ) : null}
          {zeile.text}
          {zeile.detail ? <span className="text-ink-muted"> · {zeile.detail}</span> : null}
        </p>
      ))}
      {zuKnapp && !kompakt ? (
        <p className="text-ink-muted text-xs">
          Nur Auskunft – der Termin lässt sich trotzdem anlegen.
        </p>
      ) : null}
    </div>
  );
}

type Ton = 'gut' | 'knapp' | 'nicht' | 'still';

const farbe: Record<Ton, string> = {
  gut: 'text-positiv',
  knapp: 'text-warnung',
  nicht: 'text-warnung font-medium',
  still: 'text-ink-muted',
};

interface Zeile {
  text: string;
  detail?: string;
  ton: Ton;
}

function inhalt(pruefung: Wegpruefung, zeitzone: string): Zeile[] {
  switch (pruefung.stand) {
    case 'laedt':
      return [{ text: 'Fahrweg wird geprüft …', ton: 'still' }];
    case 'nicht_verortet':
      return [{ text: 'Die Adresse ist nicht verortet – Fahrzeit nicht geprüft.', ton: 'still' }];
    case 'veraltet':
      return [
        { text: 'Die Anschrift am Termin ist veraltet – Fahrzeit nicht geprüft.', ton: 'still' },
      ];
    case 'fehler':
      return [{ text: 'Der Fahrweg ließ sich gerade nicht prüfen.', ton: 'still' }];
    case 'bereit': {
      const zeilen = [
        seitenzeile('an', pruefung.an, zeitzone),
        seitenzeile('weiter', pruefung.weiter, zeitzone),
      ].filter((z): z is Zeile => z !== null);
      return zeilen.length > 0
        ? zeilen
        : [{ text: 'Kein Termin mit Ort davor oder danach.', ton: 'still' }];
    }
    default:
      return [];
  }
}

function seitenzeile(richtung: 'an' | 'weiter', seite: Seite, zeitzone: string): Zeile | null {
  const titel =
    richtung === 'an'
      ? 'Anfahrt'
      : seite.stand === 'geprueft' && seite.nachbar === 'tagesrand'
        ? 'Rückfahrt'
        : 'Weiterfahrt';
  switch (seite.stand) {
    case 'offen':
      return null;
    case 'laedt':
      return { text: `${titel} wird geprüft …`, ton: 'still' };
    case 'nachbar_nicht_verortet':
      return {
        text: `${titel}: Der Termin ${richtung === 'an' ? 'davor' : 'danach'} ist nicht verortet – nicht geprüft.`,
        ton: 'still',
      };
    case 'nicht_geprueft':
      return { text: `${titel}: Fahrzeit nicht verfügbar – nicht geprüft.`, ton: 'still' };
    case 'geprueft': {
      const uhr = (iso: string) => `${formatLocalTime(iso, zeitzone)} Uhr`;
      const weg =
        seite.fahrtMinuten === 0
          ? 'gleicher Ort'
          : `≈ ${seite.fahrtMinuten} Min. ${
              richtung === 'an'
                ? seite.nachbar === 'termin'
                  ? `vom Termin davor (bis ${uhr(seite.nachbarZeit)})`
                  : `vom Startort ab Arbeitsbeginn ${uhr(seite.nachbarZeit)}`
                : seite.nachbar === 'termin'
                  ? `zum Termin danach (ab ${uhr(seite.nachbarZeit)})`
                  : `zum Startort bis Arbeitsende ${uhr(seite.nachbarZeit)}`
            }`;
      if (seite.stufe === 'nicht') {
        const frueh =
          richtung === 'an'
            ? `frühester Beginn ${uhr(seite.fruehester)}`
            : seite.nachbar === 'termin'
              ? `nächster Termin frühestens ${uhr(seite.fruehester)}`
              : `Ankunft frühestens ${uhr(seite.fruehester)}`;
        return {
          text: `${titel}: zu knapp um ${-seite.luft} Min., ${frueh}`,
          detail: weg,
          ton: 'nicht',
        };
      }
      return {
        text: `${titel}: passt · ${seite.luft} Min. Luft`,
        detail: weg,
        ton: seite.stufe === 'knapp' ? 'knapp' : 'gut',
      };
    }
  }
}
