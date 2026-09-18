import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import {
  TERMINFENSTER_OPTIONEN,
  appointmentTypeLabels,
  istRegellaenge,
  type AppointmentFormField,
  type AppointmentType,
  type AssignableTherapist,
  type Location,
} from './api';

/**
 * Eingabefelder eines Termins.
 *
 * Von der Anlage und der Bearbeitung gemeinsam genutzt: beide Formulare
 * erfassen dieselben Felder mit derselben Ortslogik. Was sich unterscheidet -
 * der Hinweis zur Hausbesuchsadresse -, wird von der jeweiligen Seite
 * hineingereicht.
 *
 * Die Prüfung hier ist Bedienkomfort. Verbindlich prüft und normalisiert die
 * Serverfunktion (ADR-004).
 */
export function AppointmentFormFields({
  werte,
  fehler,
  onChange,
  therapeuten,
  personBeschriftung = 'Behandelnde Person *',
  standorte,
  arten,
  minDatum,
  rasterMinuten,
  fensterMinuten,
  onFensterMinuten,
  laengeHinweis,
  hausbesuch,
}: {
  werte: Record<AppointmentFormField, string>;
  fehler: Partial<Record<AppointmentFormField, string>>;
  onChange: (feld: AppointmentFormField, wert: string) => void;
  therapeuten: AssignableTherapist[];
  /**
   * Beschriftung der Personenauswahl.
   *
   * An einem Ereignis behandelt niemand - dort steht die beteiligte Person
   * (CAL-016).
   */
  personBeschriftung?: string | undefined;
  standorte: Location[];
  /**
   * Zulässige Terminarten. Ohne Angabe alle.
   *
   * Ein Ereignis kennt keinen Hausbesuch - es gäbe keine Anschrift, und der
   * Server weist ihn ab. Eine Auswahl, die man treffen kann und die dann
   * scheitert, wäre eine Falle (CAL-016).
   */
  arten?: readonly AppointmentType[] | undefined;
  minDatum?: string | undefined;
  /** Praxisraster in Minuten. Steuert die Schrittweite des Beginns (CAL-005). */
  rasterMinuten?: number | undefined;
  /**
   * Länge des Zeitfensters in Minuten, aus der sich das Ende ergibt (CAL-010a).
   *
   * Gewählt wird die Länge, nicht der Endzeitpunkt. Beim Bearbeiten reicht die
   * Seite die Länge des gespeicherten Termins herein, damit er nicht allein
   * durch Öffnen des Formulars verlängert oder verkürzt wird (§8.1, ANN-056).
   */
  fensterMinuten: number;
  /**
   * Wechselt die Länge (CAL-015b, CAL-020). Fehlt sie, steht die Länge als
   * Text da.
   *
   * Seit `PROJECT_PRINCIPLES.md` 0.11 §8.1 ist die Länge frei: Die Auswahl
   * führt die beiden Regellängen und den Eintrag „Andere Länge …", der ein
   * Minutenfeld öffnet. Eine abweichende Länge wird nicht verhindert, sondern
   * angekündigt — der Termin trägt danach das Abweichungszeichen.
   */
  onFensterMinuten?: ((minuten: number | null) => void) | undefined;
  /**
   * Text unter dem abgeleiteten Ende. Ohne Angabe der Hinweis auf das
   * Terminfenster.
   *
   * Ein Ereignis hat kein Terminfenster und schließt keine Dokumentation ein
   * (CAL-016).
   */
  laengeHinweis?: string | undefined;
  /** Darstellung der Adresse bei `home_visit` - je nach Vorgang verschieden. */
  hausbesuch: ReactNode;
}) {
  const art = werte.appointment_type as AppointmentType;

  return (
    <div className="flex flex-col gap-5">
      <Select
        label={personBeschriftung}
        value={werte.staff_member_id}
        error={fehler.staff_member_id}
        onChange={(e) => onChange('staff_member_id', e.target.value)}
      >
        <option value="">Bitte wählen …</option>
        {therapeuten.map((t) => (
          <option key={t.staff_member_id} value={t.staff_member_id}>
            {t.display_name}
          </option>
        ))}
      </Select>

      <Select
        label="Terminart *"
        value={werte.appointment_type}
        error={fehler.appointment_type}
        onChange={(e) => onChange('appointment_type', e.target.value)}
      >
        {(arten ?? (Object.keys(appointmentTypeLabels) as AppointmentType[])).map((typ) => (
          <option key={typ} value={typ}>
            {appointmentTypeLabels[typ]}
          </option>
        ))}
      </Select>

      <Field
        label="Datum *"
        type="date"
        value={werte.date}
        error={fehler.date}
        min={minDatum}
        onChange={(e) => onChange('date', e.target.value)}
      />

      {/* items-start: Die Dauerwahl kann ein zweites Feld aufklappen (CAL-020);
          am oberen Rand ausgerichtet bleibt der Beginn stehen, wo er war. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:items-start">
        <Field
          label="Beginn *"
          type="time"
          value={werte.start_time}
          error={fehler.start_time}
          // step rechnet in Sekunden ab 00:00 - also genau in Minuten seit
          // Mitternacht, wie das Praxisraster. Nur der Beginn ist gebunden;
          // verbindlich prueft der Server (CAL-005).
          step={rasterMinuten ? rasterMinuten * 60 : undefined}
          hint={rasterMinuten ? `Praxisraster: ${rasterMinuten} Minuten` : undefined}
          onChange={(e) => onChange('start_time', e.target.value)}
        />
        {/* Das Ende bleibt eine Ableitung, kein Feld (CAL-010a) - gewählt wird
            die Länge, nicht der Zeitpunkt. Fehler von dort bleiben trotzdem
            sichtbar: der Server prüft die Länge erneut. */}
        <div>
          {onFensterMinuten ? (
            <Dauerwahl
              minuten={fensterMinuten}
              rasterMinuten={rasterMinuten}
              endeHinweis={
                werte.end_time ? `Ende: ${werte.end_time} Uhr` : 'Dokumentation eingeschlossen'
              }
              fehler={fehler.end_time}
              onMinuten={onFensterMinuten}
            />
          ) : (
            <>
              <p className="text-ink-muted text-sm">Ende</p>
              <p className="text-ink mt-1 text-[0.9375rem] font-medium">
                {werte.end_time ? `${werte.end_time} Uhr` : '—'}
              </p>
              <p className="text-ink-subtle mt-1 text-xs leading-relaxed">
                {laengeHinweis ??
                  `Terminfenster: ${fensterMinuten} Minuten, Dokumentation eingeschlossen.`}
              </p>
              {fehler.end_time ? (
                <p className="text-danger mt-1 text-xs">{fehler.end_time}</p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {art === 'practice' ? (
        <Select
          label="Standort *"
          value={werte.location_id}
          error={fehler.location_id}
          onChange={(e) => onChange('location_id', e.target.value)}
        >
          <option value="">Bitte wählen …</option>
          {standorte.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      ) : null}

      {art === 'home_visit' ? hausbesuch : null}

      {art === 'video' ? (
        <div className="border-line bg-surface-sunken rounded-card border p-4">
          <p className="text-ink text-sm">
            Für Videotermine wird in diesem Stand noch kein Videolink erzeugt.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Wert des Eintrags „Andere Länge …" - keine Zahl, damit er mit keiner Länge kollidiert. */
const FREIE_LAENGE = 'frei';

/**
 * Dauer eines Behandlungstermins: Auswahl mit freier Eingabe (CAL-020).
 *
 * Die beiden Regellängen bleiben der kurze Weg - 60 ist vorbelegt, 45 einen
 * Schritt entfernt. „Andere Länge …" öffnet ein Minutenfeld in der Schrittweite
 * des Praxisrasters. Ein gespeicherter Termin mit abweichender Länge öffnet
 * sich gleich in dieser Fassung, mit seiner Länge im Feld: Er wird durch das
 * Öffnen weder verlängert noch verkürzt (§8.1, ANN-056).
 *
 * Die Prüfung hier ist Bedienkomfort; ob die Länge ins Raster passt,
 * entscheidet `app.is_valid_treatment_length` (ADR-004).
 */
function Dauerwahl({
  minuten,
  rasterMinuten,
  endeHinweis,
  fehler,
  onMinuten,
}: {
  minuten: number;
  rasterMinuten: number | undefined;
  endeHinweis: string;
  fehler: string | undefined;
  /** `null`: das Minutenfeld enthält gerade keine gültige Zahl. */
  onMinuten: (minuten: number | null) => void;
}) {
  const [freiGewaehlt, setFreiGewaehlt] = useState(false);
  // Der getippte Text, solange er von der gültigen Länge abweichen kann
  // (leeres Feld, halbe Eingabe). `null`: das Feld zeigt die gültige Länge.
  const [eingabe, setEingabe] = useState<string | null>(null);

  const frei = freiGewaehlt || !istRegellaenge(minuten);
  const text = eingabe ?? String(minuten);
  const zahl = Number(text);
  const istZahl = text.trim().length > 0 && Number.isInteger(zahl) && zahl > 0;

  let eingabeFehler: string | undefined;
  if (!istZahl) eingabeFehler = 'Bitte eine Länge in ganzen Minuten eingeben.';
  else if (rasterMinuten && zahl % rasterMinuten !== 0) {
    eingabeFehler = `Bitte ein Vielfaches von ${rasterMinuten} Minuten wählen (Praxisraster).`;
  }

  return (
    <div className="flex flex-col gap-3">
      <Select
        label="Dauer"
        value={frei ? FREIE_LAENGE : String(minuten)}
        hint={endeHinweis}
        error={fehler}
        onChange={(e) => {
          setEingabe(null);
          if (e.target.value === FREIE_LAENGE) {
            setFreiGewaehlt(true);
            return;
          }
          setFreiGewaehlt(false);
          onMinuten(Number(e.target.value));
        }}
      >
        {TERMINFENSTER_OPTIONEN.map((option) => (
          <option key={option} value={String(option)}>
            {option} Minuten
          </option>
        ))}
        <option value={FREIE_LAENGE}>Andere Länge …</option>
      </Select>

      {frei ? (
        <Field
          label="Länge in Minuten"
          type="number"
          inputMode="numeric"
          min={rasterMinuten ?? 1}
          step={rasterMinuten ?? 1}
          value={text}
          error={eingabeFehler}
          hint={
            istRegellaenge(minuten)
              ? undefined
              : 'Weicht von 45 und 60 Minuten ab. Der Termin wird im Kalender und in den Terminlisten gekennzeichnet.'
          }
          onChange={(e) => {
            // Wer hier 60 tippt, bleibt im Feld - sonst verschwände es unter
            // den Fingern, sobald die Eingabe eine Regellänge ergibt.
            setFreiGewaehlt(true);
            setEingabe(e.target.value);
            const neu = Number(e.target.value);
            const gueltig = e.target.value.trim().length > 0 && Number.isInteger(neu) && neu > 0;
            // Ungültig heißt: kein Ende - das Formular speichert dann nicht
            // mit der zuletzt gültigen Länge weiter.
            onMinuten(gueltig ? neu : null);
          }}
          onBlur={() => {
            if (istZahl) setEingabe(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Adresse, die beim Anlegen oder beim Wechsel zu einem Hausbesuch übernommen wird. */
export function UebernommeneAdresse({
  street,
  houseNumber,
  postalCode,
  city,
  ueberschrift = 'Adresse des Hausbesuchs',
  ergaenzenZiel,
}: {
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  ueberschrift?: string;
  /**
   * Weg in die Stammdaten, um die fehlende Adresse zu ergänzen (UX-012).
   *
   * Ohne Angabe bleibt es beim Satz „bitte zuerst die Stammdaten ergänzen" -
   * so wie bisher. Wo der Aufrufer einen Rückweg bauen kann, wird daraus ein
   * Abstecher, der wieder hierher zurückführt.
   */
  ergaenzenZiel?: string | undefined;
}) {
  const strasse = [street, houseNumber].filter(Boolean).join(' ');
  const ort = [postalCode, city].filter(Boolean).join(' ');
  const vollstaendig = Boolean(street && houseNumber && postalCode && city);

  return (
    <div className="border-line bg-surface-sunken rounded-card border p-4">
      <p className="text-ink-muted text-sm">{ueberschrift}</p>
      {vollstaendig ? (
        <>
          <p className="text-ink text-[0.9375rem]">{[strasse, ort].filter(Boolean).join(', ')}</p>
          <p className="text-ink-subtle mt-2 text-xs leading-relaxed">
            Wird aus den Stammdaten übernommen und am Termin festgehalten. Eine spätere Änderung der
            Stammdaten verändert diesen Termin nicht.
          </p>
        </>
      ) : (
        <p className="text-danger text-sm">
          Für einen Hausbesuch fehlt eine vollständige Adresse (Straße, Hausnummer, PLZ und Ort).{' '}
          {ergaenzenZiel ? (
            <Link
              to={ergaenzenZiel}
              className="text-danger inline-flex min-h-11 items-center underline"
            >
              Jetzt in den Stammdaten ergänzen
            </Link>
          ) : (
            'Bitte zuerst die Stammdaten ergänzen.'
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Rückfrage bei einem Termin außerhalb der Arbeitszeit (CAL-005).
 *
 * Der Server hat den Vorgang abgewiesen und NICHTS geschrieben. Die Bestätigung
 * schickt denselben Vorgang vollständig neu; geprüft wird dabei wieder alles -
 * Überschneidung, Rolle, Organisation, Raster und der erwartete Stand. Bestätigt
 * wird ausschließlich die Arbeitszeit.
 *
 * Bewusst keine Warnung, die sich wegklicken lässt: ohne ausdrückliche
 * Bestätigung passiert nichts.
 */
export function ArbeitszeitRueckfrage({
  onBestaetigen,
  laeuft,
  beschriftung,
}: {
  onBestaetigen: () => void;
  laeuft: boolean;
  beschriftung: string;
}) {
  return (
    <div
      role="group"
      aria-label="Außerhalb der Arbeitszeit"
      className="border-line-strong bg-surface-sunken rounded-card mb-6 border p-4"
    >
      <p className="text-ink text-sm">
        Dieser Zeitraum liegt außerhalb der hinterlegten Arbeitszeit der behandelnden Person. Der
        Termin wurde noch nicht gespeichert.
      </p>
      <p className="text-ink-subtle mt-2 text-xs leading-relaxed">
        Ist für die Person an diesem Tag keine Arbeitszeit hinterlegt, gilt der Termin ebenfalls als
        außerhalb. Arbeitszeiten werden unter „Planung" gepflegt.
      </p>
      <div className="mt-3">
        <Button type="button" disabled={laeuft} onClick={onBestaetigen}>
          {laeuft ? 'Wird gespeichert …' : beschriftung}
        </Button>
      </div>
    </div>
  );
}
