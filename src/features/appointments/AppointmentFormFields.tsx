import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import {
  appointmentTypeLabels,
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
  standorte,
  minDatum,
  rasterMinuten,
  fensterMinuten,
  hausbesuch,
}: {
  werte: Record<AppointmentFormField, string>;
  fehler: Partial<Record<AppointmentFormField, string>>;
  onChange: (feld: AppointmentFormField, wert: string) => void;
  therapeuten: AssignableTherapist[];
  standorte: Location[];
  minDatum?: string | undefined;
  /** Praxisraster in Minuten. Steuert die Schrittweite des Beginns (CAL-005). */
  rasterMinuten?: number | undefined;
  /**
   * Länge des Zeitfensters in Minuten, aus der sich das Ende ergibt (CAL-010a).
   *
   * Kein Eingabefeld: §8.1 legt die Länge fest, und ein frei beschreibbares
   * Ende wäre eine Falle - der Server wiese es ab. Beim Bearbeiten reicht die
   * Seite die Länge des Bestandstermins herein, damit ein Termin aus der Zeit
   * vor §8.1 nicht allein durch Öffnen des Formulars verlängert wird.
   */
  fensterMinuten: number;
  /** Darstellung der Adresse bei `home_visit` - je nach Vorgang verschieden. */
  hausbesuch: ReactNode;
}) {
  const art = werte.appointment_type as AppointmentType;

  return (
    <div className="flex flex-col gap-5">
      <Select
        label="Behandelnde Person *"
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
        {(Object.keys(appointmentTypeLabels) as AppointmentType[]).map((typ) => (
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

      {/* items-end: der Rasterhinweis steht nur am Beginn - ohne Ausrichtung
          stuenden Eingabefeld und Ableitung auf verschiedenen Hoehen. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:items-end">
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
        {/* Das Ende ist eine Ableitung, kein Feld (CAL-010a). Fehler von dort
            bleiben trotzdem sichtbar: der Server prueft die Laenge erneut. */}
        <div>
          <p className="text-ink-muted text-sm">Ende</p>
          <p className="text-ink mt-1 text-[0.9375rem] font-medium">
            {werte.end_time ? `${werte.end_time} Uhr` : '—'}
          </p>
          <p className="text-ink-subtle mt-1 text-xs leading-relaxed">
            Terminfenster: {fensterMinuten} Minuten, Dokumentation eingeschlossen.
          </p>
          {fehler.end_time ? <p className="text-danger mt-1 text-xs">{fehler.end_time}</p> : null}
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
