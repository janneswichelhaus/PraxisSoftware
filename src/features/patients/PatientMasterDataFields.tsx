import { useState } from 'react';
import { Field } from '@/components/ui/Field';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import type { StammdatenFeld } from './api';
import { stammdatenFeldId } from './stammdatenfelder';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Disclosure } from '@/components/ui/Card';

/** Was die Anlage hinter „Weitere Angaben“ stellt (K11). */
const WEITERE: readonly StammdatenFeld[] = [
  'phone',
  'phone_work',
  'email',
  'institution',
  'primary_therapist_staff_member_id',
  'special_note',
  'remark',
];

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
 *
 * Ein Hinweis am Feld steht nur, wo er die Eingabe ändert oder sagt, wer die
 * Angabe sieht (DESIGN.md Regel 6, Design-Rollout B1): Was „Mobil“ ist, sagt
 * das Wort selbst.
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
  mitGeschaeftlichemTelefon = false,
  kurz = false,
}: {
  werte: Record<StammdatenFeld, string>;
  fehler: Partial<Record<StammdatenFeld, string>>;
  onChange: (feld: StammdatenFeld, wert: string) => void;
  therapeutinnen: readonly { staff_member_id: string; display_name: string }[];
  therapeutinnenStand?: TherapeutinnenStand;
  /**
   * BEF-140, ANN-340: „Telefon (geschäftlich)" erscheint nur noch, wenn der
   * gespeicherte Datensatz schon eine Nummer trägt - damit sie sich
   * berichtigen und leeren lässt. Maßgeblich ist der Stand beim Öffnen, nicht
   * der getippte Wert: Sonst verschwände das Feld beim Leeren unter dem
   * Finger.
   */
  mitGeschaeftlichemTelefon?: boolean;
  /**
   * Anzeigename der gespeicherten festen Therapeut:in. Fehlt sie in der
   * Liste - weil die Liste nicht geladen werden konnte -, bleibt sie so als
   * Auswahl stehen, statt still als „Keine feste Zuordnung" zu erscheinen.
   */
  bisherigeTherapeutin?: string | null;
  /**
   * Die Fassung der Anlage (K11): nur, was ein Hausbesuch braucht, offen;
   * der Rest hinter „Weitere Angaben“.
   */
  kurz?: boolean;
}) {
  const gewaehlt = werte.primary_therapist_staff_member_id;
  const fehltInListe =
    gewaehlt !== '' && !therapeutinnen.some((person) => person.staff_member_id === gewaehlt);

  const therapeutinHinweis =
    therapeutinnenStand === 'fehler'
      ? bisherigeTherapeutin
        ? 'Die Liste der Therapeut:innen ließ sich nicht laden – die bisherige Zuordnung bleibt erhalten.'
        : 'Die Liste der Therapeut:innen ließ sich nicht laden. Eine Zuordnung lässt sich später nachtragen.'
      : // Gekürzt (Sichtung 13.10.2026, A10); dass die Zuordnung kein Recht
        // ist, ändert, was man wählt - das bleibt.
        'Vorbelegung für die Terminplanung, kein Zugriffsrecht.';

  // Jedes Feld einmal, gesetzt wird es je Fassung (K11): Die Anlage am
  // Telefon zeigt nur, was ein Hausbesuch braucht; das Ändern alles.
  const feld = {
    given_name: (
      <Field
        label="Vorname *"
        name="given_name"
        enterKeyHint="next"
        feldId={stammdatenFeldId('given_name')}
        autoComplete="off"
        {...OHNE_AUTOKORREKTUR}
        maxLength={100}
        required
        value={werte.given_name}
        error={fehler.given_name}
        onChange={(event) => onChange('given_name', event.target.value)}
      />
    ),
    family_name: (
      <Field
        label="Nachname *"
        name="family_name"
        enterKeyHint="next"
        feldId={stammdatenFeldId('family_name')}
        autoComplete="off"
        {...OHNE_AUTOKORREKTUR}
        maxLength={100}
        required
        value={werte.family_name}
        error={fehler.family_name}
        onChange={(event) => onChange('family_name', event.target.value)}
      />
    ),
    date_of_birth: (
      <Field
        label="Geburtsdatum *"
        name="date_of_birth"
        enterKeyHint="next"
        feldId={stammdatenFeldId('date_of_birth')}
        type="date"
        min="1900-01-01"
        max={heute()}
        required
        value={werte.date_of_birth}
        error={fehler.date_of_birth}
        onChange={(event) => onChange('date_of_birth', event.target.value)}
      />
    ),
    phone_mobile: (
      <Field
        label="Mobil"
        name="phone_mobile"
        enterKeyHint="next"
        feldId={stammdatenFeldId('phone_mobile')}
        type="tel"
        autoComplete="off"
        value={werte.phone_mobile}
        error={fehler.phone_mobile}
        onChange={(event) => onChange('phone_mobile', event.target.value)}
      />
    ),
    phone: (
      <Field
        label="Telefon (privat)"
        name="phone"
        enterKeyHint="next"
        feldId={stammdatenFeldId('phone')}
        type="tel"
        autoComplete="off"
        value={werte.phone}
        error={fehler.phone}
        onChange={(event) => onChange('phone', event.target.value)}
      />
    ),
    phone_work: (
      <Field
        label="Telefon (geschäftlich)"
        name="phone_work"
        enterKeyHint="next"
        feldId={stammdatenFeldId('phone_work')}
        type="tel"
        autoComplete="off"
        value={werte.phone_work}
        error={fehler.phone_work}
        onChange={(event) => onChange('phone_work', event.target.value)}
      />
    ),
    email: (
      <Field
        label="E-Mail"
        name="email"
        enterKeyHint="next"
        feldId={stammdatenFeldId('email')}
        type="email"
        autoComplete="off"
        value={werte.email}
        error={fehler.email}
        onChange={(event) => onChange('email', event.target.value)}
      />
    ),
    institution: (
      <Field
        label="Einrichtung"
        name="institution"
        enterKeyHint="next"
        feldId={stammdatenFeldId('institution')}
        autoComplete="off"
        maxLength={200}
        hint="Pflegeheim, betreutes Wohnen oder Pflegedienst."
        value={werte.institution}
        error={fehler.institution}
        onChange={(event) => onChange('institution', event.target.value)}
      />
    ),
    street: (
      <Field
        label="Straße"
        name="street"
        enterKeyHint="next"
        feldId={stammdatenFeldId('street')}
        autoComplete="off"
        {...OHNE_AUTOKORREKTUR}
        value={werte.street}
        error={fehler.street}
        onChange={(event) => onChange('street', event.target.value)}
      />
    ),
    house_number: (
      <Field
        label="Hausnummer"
        name="house_number"
        enterKeyHint="next"
        feldId={stammdatenFeldId('house_number')}
        autoComplete="off"
        value={werte.house_number}
        error={fehler.house_number}
        onChange={(event) => onChange('house_number', event.target.value)}
      />
    ),
    postal_code: (
      <Field
        label="PLZ"
        name="postal_code"
        enterKeyHint="next"
        feldId={stammdatenFeldId('postal_code')}
        inputMode="numeric"
        autoComplete="off"
        value={werte.postal_code}
        error={fehler.postal_code}
        onChange={(event) => onChange('postal_code', event.target.value)}
      />
    ),
    city: (
      <Field
        label="Ort"
        name="city"
        enterKeyHint="next"
        feldId={stammdatenFeldId('city')}
        autoComplete="off"
        {...OHNE_AUTOKORREKTUR}
        value={werte.city}
        error={fehler.city}
        onChange={(event) => onChange('city', event.target.value)}
      />
    ),
    primary_therapist_staff_member_id: (
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
    ),
    home_visit_access_note: (
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
    ),
    special_note: (
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
    ),
    remark: (
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
    ),
  };

  // Vor- und Nachname, Straße und Hausnummer, PLZ und Ort gehören zusammen
  // und stehen ab 640 px nebeneinander (DESIGN.md, Formular).
  const name = (
    <div className="grid gap-4 sm:grid-cols-2">
      {feld.given_name}
      {feld.family_name}
    </div>
  );
  const strasse = (
    <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
      {feld.street}
      {feld.house_number}
    </div>
  );
  const ort = (
    <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
      {feld.postal_code}
      {feld.city}
    </div>
  );
  // UX-005e, Sichtung 13.10.2026 (A10): wer die Angaben sieht, als
  // Kleingedrucktes am Ende statt als Satz unter dem Titel (Regel 6).
  const sichtbarkeit = (
    <Kleingedrucktes className="mt-3">
      Hausbesuch und Praxisangaben sind für Patientenzugänge nicht sichtbar.
    </Kleingedrucktes>
  );

  // Einmal offen, bleibt offen: Ein Feld darf nicht unter dem Finger
  // zuklappen, wenn sein Fehler beim Tippen verschwindet.
  const [weitereOffen, setWeitereOffen] = useState(() => WEITERE.some((f) => werte[f] !== ''));
  if (kurz && !weitereOffen && WEITERE.some((f) => fehler[f] !== undefined)) {
    setWeitereOffen(true);
  }

  if (kurz) {
    // K11, Neuaufnahme am Telefon (ANN-543): Name, Geburtsdatum, Mobil,
    // Anschrift und Zugang offen; das Seltene eingeklappt (DESIGN.md
    // Grundsatz 4). Steht dort schon etwas oder ein Fehler, ist es offen -
    // die Fehlerzusammenfassung springt sonst in ein verborgenes Feld.
    return (
      <>
        <Section titel="Person">
          <Feldgruppe>
            {name}
            {feld.date_of_birth}
            {feld.phone_mobile}
          </Feldgruppe>
        </Section>
        <Section titel="Hausbesuch">
          <Feldgruppe>
            {strasse}
            {ort}
            {feld.home_visit_access_note}
          </Feldgruppe>
        </Section>
        <Disclosure
          key={weitereOffen ? 'offen' : 'zu'}
          summary="Weitere Angaben"
          offen={weitereOffen}
        >
          <Feldgruppe>
            {feld.phone}
            {mitGeschaeftlichemTelefon ? feld.phone_work : null}
            {feld.email}
            {feld.institution}
            {feld.primary_therapist_staff_member_id}
            {feld.special_note}
            {feld.remark}
          </Feldgruppe>
        </Disclosure>
        <Kleingedrucktes className="mt-3">
          Zugangshinweis, feste Therapeut:in, Besonderheit und Bemerkung sind für Patientenzugänge
          nicht sichtbar.
        </Kleingedrucktes>
      </>
    );
  }

  return (
    <>
      <Section titel="Person">
        <Feldgruppe>
          {name}
          {feld.date_of_birth}
        </Feldgruppe>
      </Section>

      <Section titel="Kontakt">
        <Feldgruppe>
          {feld.phone_mobile}
          {feld.phone}
          {mitGeschaeftlichemTelefon ? feld.phone_work : null}
          {feld.email}
        </Feldgruppe>
      </Section>

      <Section titel="Adresse">
        <Feldgruppe>
          {feld.institution}
          {strasse}
          {ort}
        </Feldgruppe>
      </Section>

      <Section titel="Hausbesuch und Praxisangaben">
        <Feldgruppe>
          {feld.primary_therapist_staff_member_id}
          {feld.home_visit_access_note}
          {feld.special_note}
          {feld.remark}
        </Feldgruppe>
        {sichtbarkeit}
      </Section>
    </>
  );
}
