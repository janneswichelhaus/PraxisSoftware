import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import type { AssignableTherapist } from '@/features/appointments/api';
import type { StammdatenFeld } from './api';
import { Feldgruppe, Section } from '@/components/ui/Section';

/**
 * Eingabefelder der organisatorischen Stammdaten.
 *
 * Anlegen und Ändern erfassen dieselben Felder. Die Felder liegen deshalb an
 * einer Stelle; Absenden, Fehlerbanner und Navigation bleiben bei der
 * jeweiligen Seite, weil sie sich fachlich unterscheiden.
 *
 * Der Abschnitt „Versorgung" (PAT-005) erfasst interne Angaben der Praxis. Sie
 * sind ausdrücklich organisatorisch: klinische Inhalte gehören in die
 * Behandlungsdokumentation, wo sie versioniert und nachvollziehbar sind
 * (PROJECT_PRINCIPLES.md §5, ADR-016). Der Hinweistext sagt das, damit hier
 * keine zweite, unversionierte Akte entsteht.
 */
export function PatientMasterDataFields({
  werte,
  fehler,
  onChange,
  therapeutinnen,
}: {
  werte: Record<StammdatenFeld, string>;
  fehler: Partial<Record<StammdatenFeld, string>>;
  onChange: (feld: StammdatenFeld, wert: string) => void;
  therapeutinnen: AssignableTherapist[];
}) {
  return (
    <>
      <Section titel="Person">
        <Feldgruppe>
          <Field
            label="Vorname *"
            name="given_name"
            autoComplete="off"
            required
            value={werte.given_name}
            error={fehler.given_name}
            onChange={(event) => onChange('given_name', event.target.value)}
          />
          <Field
            label="Nachname *"
            name="family_name"
            autoComplete="off"
            required
            value={werte.family_name}
            error={fehler.family_name}
            onChange={(event) => onChange('family_name', event.target.value)}
          />
          <Field
            label="Geburtsdatum *"
            name="date_of_birth"
            type="date"
            required
            value={werte.date_of_birth}
            error={fehler.date_of_birth}
            onChange={(event) => onChange('date_of_birth', event.target.value)}
          />
        </Feldgruppe>
      </Section>

      <Section titel="Kontakt">
        <Feldgruppe>
          <Field
            label="E-Mail"
            name="email"
            type="email"
            autoComplete="off"
            value={werte.email}
            error={fehler.email}
            onChange={(event) => onChange('email', event.target.value)}
          />
          <Field
            label="Telefon (privat)"
            name="phone"
            type="tel"
            autoComplete="off"
            value={werte.phone}
            error={fehler.phone}
            onChange={(event) => onChange('phone', event.target.value)}
          />
          <Field
            label="Mobil"
            name="phone_mobile"
            type="tel"
            autoComplete="off"
            hint="Die Nummer, unter der eine Verspätung angekündigt wird."
            value={werte.phone_mobile}
            error={fehler.phone_mobile}
            onChange={(event) => onChange('phone_mobile', event.target.value)}
          />
          <Field
            label="Telefon (geschäftlich)"
            name="phone_work"
            type="tel"
            autoComplete="off"
            value={werte.phone_work}
            error={fehler.phone_work}
            onChange={(event) => onChange('phone_work', event.target.value)}
          />
          <Field
            label="Telefax"
            name="fax"
            type="tel"
            autoComplete="off"
            value={werte.fax}
            error={fehler.fax}
            onChange={(event) => onChange('fax', event.target.value)}
          />
        </Feldgruppe>
      </Section>

      <Section titel="Adresse">
        <Feldgruppe>
          <Field
            label="Einrichtung"
            name="institution"
            autoComplete="off"
            hint="Pflegeheim, betreutes Wohnen oder Pflegedienst, falls vorhanden."
            value={werte.institution}
            error={fehler.institution}
            onChange={(event) => onChange('institution', event.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field
              label="Straße"
              name="street"
              autoComplete="off"
              value={werte.street}
              error={fehler.street}
              onChange={(event) => onChange('street', event.target.value)}
            />
            <Field
              label="Hausnummer"
              name="house_number"
              autoComplete="off"
              value={werte.house_number}
              error={fehler.house_number}
              onChange={(event) => onChange('house_number', event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field
              label="PLZ"
              name="postal_code"
              inputMode="numeric"
              autoComplete="off"
              value={werte.postal_code}
              error={fehler.postal_code}
              onChange={(event) => onChange('postal_code', event.target.value)}
            />
            <Field
              label="Ort"
              name="city"
              autoComplete="off"
              value={werte.city}
              error={fehler.city}
              onChange={(event) => onChange('city', event.target.value)}
            />
          </div>
        </Feldgruppe>
      </Section>

      <Section
        titel="Versorgung"
        hinweis="Organisatorische Angaben der Praxis. Sie sind für Patientenzugänge nicht sichtbar. Befunde, Diagnosen und Behandlungsverlauf gehören in die Behandlungsdokumentation, nicht hierher."
      >
        <Feldgruppe>
          <Select
            label="Feste Therapeut:in"
            name="primary_therapist_staff_member_id"
            hint="Vorbelegung für die Terminplanung. Sie schränkt den Zugriff auf die Akte nicht ein."
            value={werte.primary_therapist_staff_member_id}
            error={fehler.primary_therapist_staff_member_id}
            onChange={(event) => onChange('primary_therapist_staff_member_id', event.target.value)}
          >
            <option value="">Keine feste Zuordnung</option>
            {therapeutinnen.map((person) => (
              <option key={person.staff_member_id} value={person.staff_member_id}>
                {person.display_name}
              </option>
            ))}
          </Select>
          <TextArea
            label="Zugangshinweis Hausbesuch"
            name="home_visit_access_note"
            rows={3}
            hint="Etage, Klingelname, Schlüssel, Hund, Abstellplatz fürs Rad."
            value={werte.home_visit_access_note}
            error={fehler.home_visit_access_note}
            onChange={(event) => onChange('home_visit_access_note', event.target.value)}
          />
          <TextArea
            label="Besonderheit"
            name="special_note"
            rows={2}
            hint="Was vor dem Besuch bekannt sein muss, organisatorisch."
            value={werte.special_note}
            error={fehler.special_note}
            onChange={(event) => onChange('special_note', event.target.value)}
          />
          <TextArea
            label="Bemerkung"
            name="remark"
            rows={3}
            value={werte.remark}
            error={fehler.remark}
            onChange={(event) => onChange('remark', event.target.value)}
          />
        </Feldgruppe>
      </Section>
    </>
  );
}
