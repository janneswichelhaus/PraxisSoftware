import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import {
  BAUARTEN,
  bauartDatumsBeschriftung,
  bauartLabels,
  istVerordnung,
  type Bauart,
  type Heilmittelposition,
  type Prescriber,
  type TreatmentBasisFeld,
} from './api';
import { HEILMITTEL, istBestand } from './heilmittel';
import { HEILMITTEL_FEHLER_ID, grundlageFeldId, spaetestesDatum } from './grundlagenfelder';
import { verordnerAuswahlname } from './verordnerfelder';

/**
 * Eingabefelder einer Behandlungsgrundlage.
 *
 * **Die Bauart steht zuerst** (GRD-001, ADR-020): Sie entscheidet, welche
 * Felder danach überhaupt kommen. Eine Verordnung verlangt eine Verordner:in
 * und trägt die Diagnose; ein Selbstzahler hat beides nicht — das Formular
 * fragt dort nicht danach, statt leere Felder anzubieten, die niemand ausfüllen
 * soll (ADR-020 Punkt 3 und 4).
 *
 * **Seit VER-EPIC-002 ist der Rest ein kurzer Weg** (Vorgaben in
 * `docs/development/archiv/VER-EPIC-002.md`): Heilmittel als beschriftete Kästchen
 * statt Dropdown und freier Positionsliste, daneben die **Anzahl möglicher
 * Termine** als eigenes Feld, danach Diagnose und Anmerkungen. „Genutzt",
 * „Position hinzufügen", Therapieziel und das zweite Bemerkungsfeld sind
 * weggefallen; die Empfehlung gibt es nicht als manuelle Eingabe
 * (ANN-064, ANN-065, ANN-066 — ANN-014 bleibt für den Bestandstext gültig).
 *
 * **Seit UXR-007 steht die Frequenz bei Heilmitteln und Anzahl** (VER-21): Alle
 * drei schreibt die Praxis vom Rezept ab, und der Blick soll dabei nicht
 * zwischen Rezeptblock und Formularanfang springen. Jeder Hinweis ist ein
 * kurzer Satz.
 *
 * Was ein Bestandsdatensatz mitbringt, verschwindet dadurch nicht: Ein
 * Heilmittel außerhalb des Katalogs steht als eigenes, angehaktes Kästchen
 * darunter, mit seiner Menge daneben.
 */
export function TreatmentBasisFormFields({
  werte,
  fehler,
  onChange,
  positionen,
  positionsFehler,
  onHeilmittelWechsel,
  verordnerinnen,
  verordnerAnlegenZiel,
  onVerordnerAnlegenKlick,
  bestandstexte,
}: {
  werte: Record<TreatmentBasisFeld, string>;
  fehler: Partial<Record<TreatmentBasisFeld, string>>;
  onChange: (feld: TreatmentBasisFeld, wert: string) => void;
  positionen: Heilmittelposition[];
  /** Fehler der Auswahl als Ganzes — „mindestens ein Heilmittel". */
  positionsFehler: string | undefined;
  onHeilmittelWechsel: (remedy: string, gewaehlt: boolean) => void;
  verordnerinnen: Prescriber[];
  verordnerAnlegenZiel: string;
  /** Merkt den Formularzustand, bevor die Seite zum Anlegen wechselt (VER-003). */
  onVerordnerAnlegenKlick: () => void;
  /** Texte aus der Zeit vor VER-EPIC-002 — nur Anzeige, nie überschrieben. */
  bestandstexte: { feld: string; text: string }[];
}) {
  const bauart = werte.treatment_basis_kind as Bauart;
  const verordnung = istVerordnung(bauart);

  const gewaehlt = (remedy: string) => positionen.some((position) => position.remedy === remedy);
  const bestandspositionen = positionen.filter((position) => istBestand(position.remedy));

  return (
    <>
      <Section titel="Behandlungsgrundlage">
        <Feldgruppe>
          <Select
            label="Art *"
            name="treatment_basis_kind"
            feldId={grundlageFeldId('treatment_basis_kind')}
            required
            hint="Eine Verordnung liegt als Rezept vor; bei Selbstzahler vereinbart die Person die Behandlungen mit der Praxis."
            value={werte.treatment_basis_kind}
            error={fehler.treatment_basis_kind}
            onChange={(event) => onChange('treatment_basis_kind', event.target.value)}
          >
            {BAUARTEN.map((wert) => (
              <option key={wert} value={wert}>
                {bauartLabels[wert]}
              </option>
            ))}
          </Select>
          {verordnung ? (
            <div className="flex flex-col gap-1">
              <Select
                label="Verordner:in *"
                name="prescriber_id"
                feldId={grundlageFeldId('prescriber_id')}
                required
                value={werte.prescriber_id}
                error={fehler.prescriber_id}
                onChange={(event) => onChange('prescriber_id', event.target.value)}
              >
                <option value="">Bitte wählen …</option>
                {verordnerinnen.map((verordner) => (
                  <option key={verordner.id} value={verordner.id}>
                    {verordnerAuswahlname(verordner)}
                  </option>
                ))}
              </Select>
              {/* Der Weg zur Verordner-Anlage als eigene Aktion unter dem Feld
                  (VER-12, RSP-06): 44 px hoch statt eines 18-px-Links im
                  Hinweissatz, der nur an der Farbe zu erkennen war. Die
                  Eingaben sichert der Entwurf, bevor die Seite wechselt. */}
              <p className="text-ink-muted flex flex-wrap items-center gap-x-2 text-sm">
                Verordner:in nicht in der Liste?
                <Link
                  to={verordnerAnlegenZiel}
                  onClick={onVerordnerAnlegenKlick}
                  className={kartenAktionKlassen('quiet')}
                >
                  Neue Verordner:in anlegen
                </Link>
              </p>
            </div>
          ) : null}
          <Field
            label={`${bauartDatumsBeschriftung[bauart]} *`}
            name="issued_on"
            feldId={grundlageFeldId('issued_on')}
            type="date"
            required
            // Die Zukunft bietet die Datumsauswahl gar nicht erst an (VER-15);
            // verbindlich prüft weiter das Schema.
            max={spaetestesDatum()}
            value={werte.issued_on}
            error={fehler.issued_on}
            onChange={(event) => onChange('issued_on', event.target.value)}
          />
        </Feldgruppe>
      </Section>

      {/* Heilmittel, Terminzahl und Frequenz stehen zusammen und oben: Sie
          sind das, was die Praxis vom Rezept abschreibt. Heilmittel und Zahl
          beantworten verschiedene Fragen - was wird behandelt, und wie oft
          (ANN-064). */}
      <Section
        titel="Heilmittel und Termine"
        hinweis={
          verordnung
            ? 'Anhaken, was auf dem Rezept steht – auch mehrere zugleich.'
            : 'Anhaken, was vereinbart ist – auch mehrere zugleich.'
        }
      >
        <Feldgruppe>
          {/* Der Fehler der Auswahl ist mit Gruppe und erstem Kästchen
              verbunden (VER-16): Die Fehlerzusammenfassung springt auf das
              Kästchen, und dort ist zu hören, was fehlt. */}
          <fieldset
            aria-describedby={positionsFehler ? HEILMITTEL_FEHLER_ID : undefined}
            aria-invalid={positionsFehler ? true : undefined}
          >
            <legend className="text-ink text-sm font-medium">Heilmittel *</legend>
            <div className="mt-2 flex flex-col gap-1">
              {HEILMITTEL.map((heilmittel, index) => (
                <Checkbox
                  key={heilmittel.remedy}
                  // Nur das erste Kästchen trägt die feste Kennung: Die
                  // Fehlerzusammenfassung springt an den Anfang der Gruppe.
                  feldId={index === 0 ? grundlageFeldId('items') : undefined}
                  {...(index === 0 && positionsFehler
                    ? { 'aria-describedby': HEILMITTEL_FEHLER_ID, 'aria-invalid': true }
                    : {})}
                  name={`heilmittel-${index}`}
                  label={heilmittel.beschriftung}
                  checked={gewaehlt(heilmittel.remedy)}
                  onChange={(event) => onHeilmittelWechsel(heilmittel.remedy, event.target.checked)}
                />
              ))}
              {/* Was ein Bestandsdatensatz mitbringt und der Katalog nicht
                  kennt: sichtbar, angehakt und mit seiner Menge. Abhaken
                  entfernt es - still umgedeutet wird es nie. */}
              {bestandspositionen.map((position) => (
                <Checkbox
                  key={position.id ?? position.remedy}
                  name={`heilmittel-bestand-${position.remedy}`}
                  label={position.remedy}
                  hint={
                    position.bestand
                      ? `Aus dem Bestand: ${position.bestand.genutzt} von ${position.bestand.verordnet} genutzt.`
                      : 'Aus dem Bestand.'
                  }
                  checked
                  onChange={(event) => onHeilmittelWechsel(position.remedy, event.target.checked)}
                />
              ))}
            </div>
            {/* Ohne `role="alert"` wie bei `Field` und `Select`: Die
                Fehlerzusammenfassung über dem Formular ist die eine Meldung,
                die Vorlesesoftware ansagen soll (UX-012). Zwei zugleich
                verdrängen einander. */}
            {positionsFehler ? (
              <p id={HEILMITTEL_FEHLER_ID} className="text-danger mt-1 text-sm">
                {positionsFehler}
              </p>
            ) : null}
          </fieldset>

          <Field
            label="Anzahl möglicher Termine *"
            name="appointment_count"
            feldId={grundlageFeldId('appointment_count')}
            inputMode="numeric"
            required
            hint={
              verordnung
                ? 'Wie viele Termine das Rezept hergibt – mehrere Heilmittel ergeben nicht mehr Termine.'
                : 'Wie viele Termine vereinbart sind – mehrere Heilmittel ergeben nicht mehr Termine.'
            }
            value={werte.appointment_count}
            error={fehler.appointment_count}
            onChange={(event) => onChange('appointment_count', event.target.value)}
          />

          <Field
            label="Frequenz"
            name="frequency_note"
            feldId={grundlageFeldId('frequency_note')}
            autoComplete="off"
            hint={
              verordnung
                ? 'So, wie sie auf dem Rezept steht – etwa „2x pro Woche“.'
                : 'Wie vereinbart – etwa „1x pro Woche“.'
            }
            value={werte.frequency_note}
            error={fehler.frequency_note}
            onChange={(event) => onChange('frequency_note', event.target.value)}
          />
        </Feldgruppe>
      </Section>

      {/* ADR-020 Punkt 4: Die Diagnose bleibt klinisch - und beim Selbstzahler
          leer. Sie wird hier nicht angeboten; was beim Wechsel der Bauart schon
          dastand, leert das Formular sichtbar (siehe TreatmentBasisFormPage). */}
      {verordnung ? (
        <Section
          titel="Klinische Angaben"
          hinweis="Der Behandlungsverlauf gehört in die Behandlungsdokumentation, nicht hierher."
        >
          <Feldgruppe>
            <TextArea
              label="Diagnose oder Leitsymptomatik"
              name="diagnosis"
              feldId={grundlageFeldId('diagnosis')}
              rows={3}
              value={werte.diagnosis}
              error={fehler.diagnosis}
              onChange={(event) => onChange('diagnosis', event.target.value)}
            />
          </Feldgruppe>
        </Section>
      ) : null}

      {/* „Weitere Angaben" statt „Anmerkungen" über dem gleichnamigen Feld
          (VER-21): Abschnitt und Feld hießen gleich. */}
      <Section titel="Weitere Angaben">
        <Feldgruppe>
          <TextArea
            label="Anmerkungen"
            name="note"
            feldId={grundlageFeldId('note')}
            rows={3}
            hint={
              verordnung
                ? 'Alles Weitere zur Verordnung, etwa „Rezept liegt im Ordner“ – sichtbar für alle Praxisrollen.'
                : 'Alles Weitere zur Vereinbarung – sichtbar für alle Praxisrollen.'
            }
            value={werte.note}
            error={fehler.note}
            onChange={(event) => onChange('note', event.target.value)}
          />
        </Feldgruppe>

        {/* ANN-014 bleibt gültig: Die Anwendung erzeugt keine Empfehlung. Sie
            zeigt nur, was vor VER-EPIC-002 jemand selbst geschrieben hat -
            und nimmt dafür keine neue Eingabe mehr entgegen. Auskunft, keine
            Eingabe: deshalb ein Unterabschnitt mit Rahmen (VER-19). */}
        {bestandstexte.length > 0 ? (
          <Section
            titel="Aus dem Bestand"
            ebene={3}
            hinweis="Diese Angaben stammen aus einer früheren Fassung des Formulars. Sie werden nicht mehr erfasst und bleiben beim Speichern unverändert stehen."
            rahmen
          >
            <dl className="flex flex-col gap-2">
              {bestandstexte.map((eintrag) => (
                <div key={eintrag.feld}>
                  <dt className="text-ink-muted text-sm">{eintrag.feld}</dt>
                  <dd className="text-ink text-sm whitespace-pre-line">{eintrag.text}</dd>
                </div>
              ))}
            </dl>
          </Section>
        ) : null}
      </Section>
    </>
  );
}
