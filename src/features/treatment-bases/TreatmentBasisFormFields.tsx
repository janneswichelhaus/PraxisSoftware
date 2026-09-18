import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Feldgruppe, Section } from '@/components/ui/Section';
import {
  BAUARTEN,
  bauartDatumsBeschriftung,
  bauartLabels,
  istVerordnung,
  prescriberLabel,
  type Bauart,
  type Heilmittelposition,
  type Prescriber,
  type TreatmentBasisFeld,
} from './api';
import { HEILMITTEL, istBestand } from './heilmittel';
import { grundlageFeldId } from './grundlagenfelder';

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
 * `docs/development/VER-EPIC-002.md`): Heilmittel als beschriftete Kästchen
 * statt Dropdown und freier Positionsliste, daneben die **Anzahl möglicher
 * Termine** als eigenes Feld, danach Diagnose und Anmerkungen. „Genutzt",
 * „Position hinzufügen", Therapieziel und das zweite Bemerkungsfeld sind
 * weggefallen; die Empfehlung gibt es nicht als manuelle Eingabe
 * (ANN-064, ANN-065, ANN-066 — ANN-014 bleibt für den Bestandstext gültig).
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
            hint="Eine Verordnung liegt als Rezept vor; ein Selbstzahler vereinbart die Behandlungen mit der Praxis."
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
            <Select
              label="Verordner:in *"
              name="prescriber_id"
              feldId={grundlageFeldId('prescriber_id')}
              required
              value={werte.prescriber_id}
              error={fehler.prescriber_id}
              hint={
                <>
                  Fehlt die Praxis?{' '}
                  <Link
                    to={verordnerAnlegenZiel}
                    onClick={onVerordnerAnlegenKlick}
                    className="text-accent hover:underline"
                  >
                    Verordner:in anlegen
                  </Link>
                </>
              }
              onChange={(event) => onChange('prescriber_id', event.target.value)}
            >
              <option value="">Bitte auswählen</option>
              {verordnerinnen.map((verordner) => (
                <option key={verordner.id} value={verordner.id}>
                  {prescriberLabel(verordner)}
                </option>
              ))}
            </Select>
          ) : null}
          <Field
            label={`${bauartDatumsBeschriftung[bauart]} *`}
            name="issued_on"
            feldId={grundlageFeldId('issued_on')}
            type="date"
            required
            value={werte.issued_on}
            error={fehler.issued_on}
            onChange={(event) => onChange('issued_on', event.target.value)}
          />
          <Field
            label="Frequenz"
            name="frequency_note"
            feldId={grundlageFeldId('frequency_note')}
            autoComplete="off"
            hint={
              verordnung
                ? 'So, wie sie auf dem Rezept steht — etwa „2x pro Woche".'
                : 'Wie vereinbart — etwa „1x pro Woche".'
            }
            value={werte.frequency_note}
            error={fehler.frequency_note}
            onChange={(event) => onChange('frequency_note', event.target.value)}
          />
        </Feldgruppe>
      </Section>

      {/* Heilmittel und Terminzahl stehen zusammen und oben: Sie sind das,
          was die Praxis vom Rezept abschreibt. Beide beantworten verschiedene
          Fragen - was wird behandelt, und wie oft (ANN-064). */}
      <Section
        titel="Heilmittel und Termine"
        hinweis={
          verordnung
            ? 'Anhaken, was auf dem Rezept steht. Mehrere zugleich sind möglich.'
            : 'Anhaken, was vereinbart ist. Mehrere zugleich sind möglich.'
        }
      >
        <Feldgruppe>
          <fieldset>
            <legend className="text-ink text-sm font-medium">Heilmittel *</legend>
            <div className="mt-2 flex flex-col gap-1">
              {HEILMITTEL.map((heilmittel, index) => (
                <Checkbox
                  key={heilmittel.remedy}
                  // Nur das erste Kästchen trägt die feste Kennung: Die
                  // Fehlerzusammenfassung springt an den Anfang der Gruppe.
                  feldId={index === 0 ? grundlageFeldId('items') : undefined}
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
            {positionsFehler ? <p className="text-danger mt-1 text-sm">{positionsFehler}</p> : null}
          </fieldset>

          <Field
            label="Anzahl möglicher Termine *"
            name="appointment_count"
            feldId={grundlageFeldId('appointment_count')}
            inputMode="numeric"
            required
            hint={
              verordnung
                ? 'Wie viele Behandlungstermine das Rezept hergibt. Mehrere Heilmittel erzeugen keine zusätzlichen Termine.'
                : 'Wie viele Behandlungstermine vereinbart sind. Mehrere Heilmittel erzeugen keine zusätzlichen Termine.'
            }
            value={werte.appointment_count}
            error={fehler.appointment_count}
            onChange={(event) => onChange('appointment_count', event.target.value)}
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

      <Section titel="Anmerkungen">
        <Feldgruppe>
          <TextArea
            label="Anmerkungen"
            name="note"
            feldId={grundlageFeldId('note')}
            rows={3}
            hint={
              verordnung
                ? 'Ein Feld für alles, was zur Verordnung zu sagen ist — der Hinweis vom Rezept ebenso wie „Rezept liegt im Ordner". Für alle Praxisrollen sichtbar.'
                : 'Ein Feld für alles, was zur Vereinbarung zu sagen ist. Für alle Praxisrollen sichtbar.'
            }
            value={werte.note}
            error={fehler.note}
            onChange={(event) => onChange('note', event.target.value)}
          />

          {/* ANN-014 bleibt gültig: Die Anwendung erzeugt keine Empfehlung. Sie
              zeigt nur, was vor VER-EPIC-002 jemand selbst geschrieben hat -
              und nimmt dafür keine neue Eingabe mehr entgegen. */}
          {bestandstexte.length > 0 ? (
            <div className="border-line rounded-card border p-4">
              <p className="text-ink text-sm font-medium">Aus dem Bestand</p>
              <p className="text-ink-subtle mt-1 text-sm">
                Diese Angaben stammen aus der Zeit vor der Umstellung. Sie werden nicht mehr erfasst
                und bleiben beim Speichern unverändert stehen.
              </p>
              <dl className="mt-3 flex flex-col gap-2">
                {bestandstexte.map((eintrag) => (
                  <div key={eintrag.feld}>
                    <dt className="text-ink-muted text-sm">{eintrag.feld}</dt>
                    <dd className="text-ink text-sm whitespace-pre-line">{eintrag.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </Feldgruppe>
      </Section>
    </>
  );
}
