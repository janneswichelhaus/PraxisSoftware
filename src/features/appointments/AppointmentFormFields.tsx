import type { ReactNode } from 'react';
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
  hausbesuch,
}: {
  werte: Record<AppointmentFormField, string>;
  fehler: Partial<Record<AppointmentFormField, string>>;
  onChange: (feld: AppointmentFormField, wert: string) => void;
  therapeuten: AssignableTherapist[];
  standorte: Location[];
  minDatum?: string | undefined;
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label="Beginn *"
          type="time"
          value={werte.start_time}
          error={fehler.start_time}
          onChange={(e) => onChange('start_time', e.target.value)}
        />
        <Field
          label="Ende *"
          type="time"
          value={werte.end_time}
          error={fehler.end_time}
          onChange={(e) => onChange('end_time', e.target.value)}
        />
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
        <div className="border-line bg-surface-sunken rounded-lg border p-4">
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
}: {
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  ueberschrift?: string;
}) {
  const strasse = [street, houseNumber].filter(Boolean).join(' ');
  const ort = [postalCode, city].filter(Boolean).join(' ');
  const vollstaendig = Boolean(street && houseNumber && postalCode && city);

  return (
    <div className="border-line bg-surface-sunken rounded-lg border p-4">
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
          Für einen Hausbesuch fehlt eine vollständige Adresse (Straße, Hausnummer, PLZ und Ort).
          Bitte zuerst die Stammdaten ergänzen.
        </p>
      )}
    </div>
  );
}
