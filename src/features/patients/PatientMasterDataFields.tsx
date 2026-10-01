import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import type { AssignableTherapist } from '@/features/appointments/api';
import type { StammdatenFeld } from './api';
import { stammdatenFeldId } from './stammdatenfelder';
import { Feldgruppe, Section } from '@/components/ui/Section';

/**
 * Eingabefelder der organisatorischen Stammdaten.
 *
 * Anlegen und Ändern erfassen dieselben Felder. Die Felder liegen deshalb an
 * einer Stelle; Absenden, Fehlerbanner und Navigation bleiben bei der
 * jeweiligen Seite, weil sie sich fachlich unterscheiden.
 *
 * Der Abschnitt „Hausbesuch und Praxisangaben" (PAT-005) erfasst interne
 * Angaben der Praxis. Er heißt so wie in der Anzeige der Stammdaten, damit
 * „Versorgung" dort nur Beginn, Status und Abschluss meint (PAT-07). Die
 * Angaben sind ausdrücklich organisatorisch: klinische Inhalte gehören in die
 * Behandlungsdokumentation, wo sie versioniert und nachvollziehbar sind
 * (PROJECT_PRINCIPLES.md §5, ADR-016). Der Hinweistext sagt das, damit hier
 * keine zweite, unversionierte Akte entsteht.
 *
 * Die Reihenfolge der Kontaktfelder ist die der Anzeige - Mobil zuerst, weil
 * dort eine Verspätung angekündigt wird (PAT-07).
 */

/**
 * Namen und Anschrift sind keine Wörter aus dem Wörterbuch: Die
 * Autokorrektur des Telefons „verbessert" sonst Nachnamen und Straßen
 * (PAT-12). Groß beginnt trotzdem jedes Wort.
 */
const OHNE_AUTOKORREKTUR = {
  spellCheck: false,
  autoCorrect: 'off',
  autoCapitalize: 'words',
} as const;

/**
 * Heute als JJJJ-MM-TT in der Zeitzone des Geräts - dieselbe Grenze, die das
 * Schema für das Geburtsdatum zieht („nicht in der Zukunft").
 */
function heute(): string {
  const jetzt = new Date();
  const monat = String(jetzt.getMonth() + 1).padStart(2, '0');
  const tag = String(jetzt.getDate()).padStart(2, '0');
  return `${jetzt.getFullYear()}-${monat}-${tag}`;
}

/**
 * Stand der Liste der Therapeut:innen (PAT-20).
 *
 * Die Auswahl hängt an einer eigenen Abfrage. Solange sie läuft oder wenn sie
 * scheitert, stand bisher „Keine feste Zuordnung" im Feld - auch bei einer
 * Person, die eine feste Therapeut:in hat. Gespeichert wurde weiter die alte
 * Kennung, gezeigt aber etwas anderes.
 */
export type TherapeutinnenStand = 'laedt' | 'fehler' | 'bereit';

export function PatientMasterDataFields({
  werte,
  fehler,
  onChange,
  therapeutinnen,
  therapeutinnenStand = 'bereit',
  bisherigeTherapeutin = null,
}: {
  werte: Record<StammdatenFeld, string>;
  fehler: Partial<Record<StammdatenFeld, string>>;
  onChange: (feld: StammdatenFeld, wert: string) => void;
  therapeutinnen: AssignableTherapist[];
  therapeutinnenStand?: TherapeutinnenStand;
  /**
   * Anzeigename der gespeicherten festen Therapeut:in. Fehlt sie in der
   * Liste - weil die Liste nicht geladen werden konnte -, bleibt sie so als
   * Auswahl stehen, statt still als „Keine feste Zuordnung" zu erscheinen.
   */
  bisherigeTherapeutin?: string | null;
}) {
  const gewaehlt = werte.primary_therapist_staff_member_id;
  const fehltInListe =
    gewaehlt !== '' && !therapeutinnen.some((person) => person.staff_member_id === gewaehlt);

  const therapeutinHinweis =
    therapeutinnenStand === 'fehler'
      ? bisherigeTherapeutin
        ? 'Die Liste der Therapeut:innen ließ sich nicht laden – die bisherige Zuordnung bleibt erhalten.'
        : 'Die Liste der Therapeut:innen ließ sich nicht laden. Eine Zuordnung lässt sich später nachtragen.'
      : 'Vorbelegung für die Terminplanung. Sie schränkt den Zugriff auf die Akte nicht ein.';

  return (
    <>
      <Section titel="Person">
        <Feldgruppe>
          <Field
            label="Vorname *"
            name="given_name"
            feldId={stammdatenFeldId('given_name')}
            autoComplete="off"
            {...OHNE_AUTOKORREKTUR}
            maxLength={100}
            required
            value={werte.given_name}
            error={fehler.given_name}
            onChange={(event) => onChange('given_name', event.target.value)}
          />
          <Field
            label="Nachname *"
            name="family_name"
            feldId={stammdatenFeldId('family_name')}
            autoComplete="off"
            {...OHNE_AUTOKORREKTUR}
            maxLength={100}
            required
            value={werte.family_name}
            error={fehler.family_name}
            onChange={(event) => onChange('family_name', event.target.value)}
          />
          {/* Grenzen für den Wähler am Telefon (PAT-12): Er beginnt sonst beim
              heutigen Monat und bietet Tage in der Zukunft an, die erst beim
              Absenden scheitern. */}
          <Field
            label="Geburtsdatum *"
            name="date_of_birth"
            feldId={stammdatenFeldId('date_of_birth')}
            type="date"
            min="1900-01-01"
            max={heute()}
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
            label="Mobil"
            name="phone_mobile"
            feldId={stammdatenFeldId('phone_mobile')}
            type="tel"
            autoComplete="off"
            hint="Die Nummer, unter der eine Verspätung angekündigt wird."
            value={werte.phone_mobile}
            error={fehler.phone_mobile}
            onChange={(event) => onChange('phone_mobile', event.target.value)}
          />
          <Field
            label="Telefon (privat)"
            name="phone"
            feldId={stammdatenFeldId('phone')}
            type="tel"
            autoComplete="off"
            value={werte.phone}
            error={fehler.phone}
            onChange={(event) => onChange('phone', event.target.value)}
          />
          <Field
            label="Telefon (geschäftlich)"
            name="phone_work"
            feldId={stammdatenFeldId('phone_work')}
            type="tel"
            autoComplete="off"
            value={werte.phone_work}
            error={fehler.phone_work}
            onChange={(event) => onChange('phone_work', event.target.value)}
          />
          <Field
            label="Telefax"
            name="fax"
            feldId={stammdatenFeldId('fax')}
            type="tel"
            autoComplete="off"
            value={werte.fax}
            error={fehler.fax}
            onChange={(event) => onChange('fax', event.target.value)}
          />
          <Field
            label="E-Mail"
            name="email"
            feldId={stammdatenFeldId('email')}
            type="email"
            autoComplete="off"
            value={werte.email}
            error={fehler.email}
            onChange={(event) => onChange('email', event.target.value)}
          />
        </Feldgruppe>
      </Section>

      <Section titel="Adresse">
        <Feldgruppe>
          <Field
            label="Einrichtung"
            name="institution"
            feldId={stammdatenFeldId('institution')}
            autoComplete="off"
            maxLength={200}
            hint="Pflegeheim, betreutes Wohnen oder Pflegedienst, falls vorhanden."
            value={werte.institution}
            error={fehler.institution}
            onChange={(event) => onChange('institution', event.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field
              label="Straße"
              name="street"
              feldId={stammdatenFeldId('street')}
              autoComplete="off"
              {...OHNE_AUTOKORREKTUR}
              value={werte.street}
              error={fehler.street}
              onChange={(event) => onChange('street', event.target.value)}
            />
            <Field
              label="Hausnummer"
              name="house_number"
              feldId={stammdatenFeldId('house_number')}
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
              feldId={stammdatenFeldId('postal_code')}
              inputMode="numeric"
              autoComplete="off"
              value={werte.postal_code}
              error={fehler.postal_code}
              onChange={(event) => onChange('postal_code', event.target.value)}
            />
            <Field
              label="Ort"
              name="city"
              feldId={stammdatenFeldId('city')}
              autoComplete="off"
              {...OHNE_AUTOKORREKTUR}
              value={werte.city}
              error={fehler.city}
              onChange={(event) => onChange('city', event.target.value)}
            />
          </div>
        </Feldgruppe>
      </Section>

      {/* UX-005e: Auf das Wesentliche gekürzt - geblieben ist, was die
          Eingabe betrifft: wer die Angaben sieht (ANN-010, ADR-004). */}
      <Section titel="Hausbesuch und Praxisangaben" hinweis="Für Patientenzugänge nicht sichtbar.">
        <Feldgruppe>
          <Select
            label="Feste Therapeut:in"
            name="primary_therapist_staff_member_id"
            feldId={stammdatenFeldId('primary_therapist_staff_member_id')}
            hint={therapeutinHinweis}
            disabled={therapeutinnenStand === 'laedt'}
            value={gewaehlt}
            error={fehler.primary_therapist_staff_member_id}
            onChange={(event) => onChange('primary_therapist_staff_member_id', event.target.value)}
          >
            {therapeutinnenStand === 'laedt' ? (
              // Solange die Liste lädt, steht genau das im Feld - und nicht
              // „Keine feste Zuordnung". Der Wert bleibt der gespeicherte.
              <option value={gewaehlt}>Wird geladen …</option>
            ) : (
              <>
                <option value="">Keine feste Zuordnung</option>
                {fehltInListe && bisherigeTherapeutin ? (
                  <option value={gewaehlt}>{bisherigeTherapeutin}</option>
                ) : null}
                {therapeutinnen.map((person) => (
                  <option key={person.staff_member_id} value={person.staff_member_id}>
                    {person.display_name}
                  </option>
                ))}
              </>
            )}
          </Select>
          <TextArea
            label="Zugangshinweis"
            name="home_visit_access_note"
            feldId={stammdatenFeldId('home_visit_access_note')}
            rows={3}
            maxLength={1000}
            hint="Etage, Klingelname, Schlüssel, Hund, Abstellplatz fürs Rad."
            value={werte.home_visit_access_note}
            error={fehler.home_visit_access_note}
            onChange={(event) => onChange('home_visit_access_note', event.target.value)}
          />
          <TextArea
            label="Besonderheit"
            name="special_note"
            feldId={stammdatenFeldId('special_note')}
            rows={2}
            maxLength={1000}
            hint="Was vor dem Besuch bekannt sein muss, organisatorisch."
            value={werte.special_note}
            error={fehler.special_note}
            onChange={(event) => onChange('special_note', event.target.value)}
          />
          <TextArea
            label="Bemerkung"
            name="remark"
            feldId={stammdatenFeldId('remark')}
            rows={3}
            maxLength={2000}
            value={werte.remark}
            error={fehler.remark}
            onChange={(event) => onChange('remark', event.target.value)}
          />
        </Feldgruppe>
      </Section>
    </>
  );
}
