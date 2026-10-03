import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Feldgruppe } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { BEGRIFFE, BEREICHE } from '@/lib/begriffe';
import {
  TERMINFENSTER_OPTIONEN,
  appointmentTypeLabels,
  istRegellaenge,
  type AppointmentFormField,
  type AppointmentType,
  type AssignableTherapist,
  type Location,
} from './api';
import { Listenfehler } from './Rueckmeldungen';
import { DAUER_AUSWAHL_ID, TERMINFELD_IDS } from './terminformular';

/**
 * Zustand einer Auswahlliste, die das Formular nachlädt (ZST-07).
 *
 * Bis UXR-005 stand dort nur `data ?? []`: Scheiterte die Liste, blieb die
 * Auswahl leer - das Formular sah bedienbar aus und ließ sich doch nicht
 * füllen, und eine bestehende Zuordnung sah aus wie keine.
 */
export interface Listenzustand {
  laedt: boolean;
  fehlgeschlagen: boolean;
  erneut: () => void;
}

/**
 * Eingabefelder eines Termins.
 *
 * Von der Anlage und der Bearbeitung gemeinsam genutzt: beide Formulare
 * erfassen dieselben Felder mit derselben Ortslogik. Was sich unterscheidet -
 * der Hinweis zur Hausbesuchsadresse -, wird von der jeweiligen Seite
 * hineingereicht.
 *
 * Jedes Feld trägt seine feste Kennung aus `TERMINFELD_IDS`: Die
 * Fehlerzusammenfassung der Seite springt dorthin (UIK-02).
 *
 * Die Prüfung hier ist Bedienkomfort. Verbindlich prüft und normalisiert die
 * Serverfunktion (ADR-004).
 */
export function AppointmentFormFields({
  werte,
  fehler,
  onChange,
  therapeuten,
  personenListe,
  personBeschriftung = 'Behandelnde Person *',
  nurPerson = false,
  standorte,
  standortListe,
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
  /** Lädt die Personenliste noch, oder ist sie gescheitert? (ZST-07) */
  personenListe?: Listenzustand | undefined;
  /**
   * Beschriftung der Personenauswahl.
   *
   * An einem Ereignis behandelt niemand - dort steht die beteiligte Person
   * (CAL-016).
   */
  personBeschriftung?: string | undefined;
  /**
   * Nur die Person ist änderbar (TER-01).
   *
   * Die Teilnahme an einer Fehlzeit tauscht nur die beteiligte Person; Zeit,
   * Art und Ort gelten für alle Beteiligten und weist der Server an dieser
   * Stelle ab (ANN-051). Die Seite zeigt sie deshalb als Auskunft, nicht als
   * Feld.
   */
  nurPerson?: boolean;
  standorte: Location[];
  /** Lädt die Standortliste noch, oder ist sie gescheitert? (ZST-07) */
  standortListe?: Listenzustand | undefined;
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

  const personenAuswahl = (
    <div className="flex flex-col gap-2">
      <Select
        label={personBeschriftung}
        feldId={TERMINFELD_IDS.staff_member_id}
        value={werte.staff_member_id}
        error={fehler.staff_member_id}
        onChange={(e) => onChange('staff_member_id', e.target.value)}
      >
        <option value="">{personenListe?.laedt ? 'Wird geladen …' : 'Bitte wählen …'}</option>
        {therapeuten.map((t) => (
          <option key={t.staff_member_id} value={t.staff_member_id}>
            {t.display_name}
          </option>
        ))}
      </Select>
      {personenListe?.fehlgeschlagen ? (
        <Listenfehler
          text="Die Personen konnten nicht geladen werden."
          onErneut={personenListe.erneut}
        />
      ) : null}
    </div>
  );

  if (nurPerson) return <Feldgruppe>{personenAuswahl}</Feldgruppe>;

  return (
    // Feldabstand wie in jedem anderen Formular (TOK-15): 16 px über die
    // Feldgruppe statt eigener 20 px.
    <Feldgruppe>
      {personenAuswahl}

      <Select
        label="Terminart *"
        feldId={TERMINFELD_IDS.appointment_type}
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
        feldId={TERMINFELD_IDS.date}
        value={werte.date}
        error={fehler.date}
        min={minDatum}
        onChange={(e) => onChange('date', e.target.value)}
      />

      {/* items-start: Die Dauerwahl kann ein zweites Feld aufklappen (CAL-020);
          am oberen Rand ausgerichtet bleibt der Beginn stehen, wo er war. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
        <Field
          label="Beginn *"
          type="time"
          feldId={TERMINFELD_IDS.start_time}
          value={werte.start_time}
          error={fehler.start_time}
          // step rechnet in Sekunden ab 00:00 - also genau in Minuten seit
          // Mitternacht, wie das Praxisraster. Nur der Beginn ist gebunden;
          // verbindlich prueft der Server (CAL-005). Kein Hinweis „Praxisraster:
          // N Minuten" mehr: Er erklärte das System, nicht die Eingabe; die
          // Fehlermeldung bei einem Beginn außerhalb des Rasters bleibt (UX-005g).
          step={rasterMinuten ? rasterMinuten * 60 : undefined}
          onChange={(e) => onChange('start_time', e.target.value)}
        />
        {/* Das Ende bleibt eine Ableitung, kein Feld (CAL-010a) - gewählt wird
            die Länge, nicht der Zeitpunkt. Ohne Beginn gibt es kein Ende und
            damit auch keinen Hinweis darauf (TER-06). */}
        <div>
          {onFensterMinuten ? (
            <Dauerwahl
              minuten={fensterMinuten}
              rasterMinuten={rasterMinuten}
              endeHinweis={werte.end_time ? `Ende: ${werte.end_time} Uhr` : undefined}
              fehler={fehler.end_time}
              onMinuten={onFensterMinuten}
            />
          ) : (
            <>
              <p className="text-ink-muted text-sm">Ende</p>
              <p className="text-ink text-liste mt-1 font-medium">
                {werte.end_time ? `${werte.end_time} Uhr` : '—'}
              </p>
              <p className="text-ink-muted mt-1 text-xs leading-relaxed">
                {laengeHinweis ??
                  `Terminfenster: ${fensterMinuten} Minuten, Dokumentation eingeschlossen.`}
              </p>
              {/* Ein Fehler hier hat kein Feld, an dem er stehen könnte: als
                  Meldung mit Rolle, in der Größe der Feldfehler (UIK-02). */}
              {fehler.end_time ? (
                <Statusmeldung ton="fehler" className="mt-1">
                  {fehler.end_time}
                </Statusmeldung>
              ) : null}
            </>
          )}
        </div>
      </div>

      {art === 'practice' ? (
        <div className="flex flex-col gap-2">
          <Select
            label="Standort *"
            feldId={TERMINFELD_IDS.location_id}
            value={werte.location_id}
            error={fehler.location_id}
            onChange={(e) => onChange('location_id', e.target.value)}
          >
            <option value="">{standortListe?.laedt ? 'Wird geladen …' : 'Bitte wählen …'}</option>
            {standorte.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          {standortListe?.fehlgeschlagen ? (
            <Listenfehler
              text="Die Standorte konnten nicht geladen werden."
              onErneut={standortListe.erneut}
            />
          ) : null}
        </div>
      ) : null}

      {art === 'home_visit' ? hausbesuch : null}

      {art === 'video' ? (
        <div className="border-line bg-surface-sunken rounded-card border p-4">
          <p className="text-ink text-sm">Für Videotermine wird noch kein Videolink erzeugt.</p>
        </div>
      ) : null}
    </Feldgruppe>
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
  /** „Ende: 10:00 Uhr" - ohne Beginn kein Ende und damit kein Hinweis. */
  endeHinweis: string | undefined;
  /**
   * Fehler der Seite zur Dauer. Er steht am Minutenfeld, denn nur dort kann
   * die Dauer ungültig sein (TER-06); die Auswahl der Regellängen ist es nie.
   */
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
        feldId={DAUER_AUSWAHL_ID}
        value={frei ? FREIE_LAENGE : String(minuten)}
        hint={endeHinweis}
        // Nur, falls ein Fehler ohne offenes Minutenfeld ankommt - sonst
        // stünde er an einer richtig gewählten Regellänge.
        error={frei ? undefined : fehler}
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
          feldId={TERMINFELD_IDS.end_time}
          min={rasterMinuten ?? 1}
          step={rasterMinuten ?? 1}
          value={text}
          error={eingabeFehler ?? fehler}
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
  onErgaenzen,
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
  /**
   * Läuft beim Tipp auf den Abstecher, vor dem Seitenwechsel. Trägt der
   * Rückweg alle Eingaben mit, gibt die Seite hier ihren Verlustschutz für
   * diesen einen Wechsel frei (TER-05) - es geht dabei nichts verloren.
   */
  onErgaenzen?: (() => void) | undefined;
}) {
  const strasse = [street, houseNumber].filter(Boolean).join(' ');
  const ort = [postalCode, city].filter(Boolean).join(' ');
  const vollstaendig = Boolean(street && houseNumber && postalCode && city);

  return (
    <div className="border-line bg-surface-sunken rounded-card border p-4">
      <p className="text-ink-muted text-sm">{ueberschrift}</p>
      {vollstaendig ? (
        // Nur die Adresse - der Satz, dass sie aus den Stammdaten kommt und am
        // Termin festgehalten bleibt, erklärte das System, nicht die Daten (UX-005g).
        <p className="text-ink text-liste">{[strasse, ort].filter(Boolean).join(', ')}</p>
      ) : (
        <p className="text-danger text-sm">
          Für einen Hausbesuch fehlt eine vollständige Adresse (Straße, Hausnummer, PLZ und Ort).{' '}
          {ergaenzenZiel ? (
            <Link
              to={ergaenzenZiel}
              onClick={onErgaenzen}
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
 * Bestätigung passiert nichts. Seit FIX-016 ein Fenster über dem Formular
 * (BEF-016): Wer am Ende der Seite abschickt, sieht die Frage sofort - und
 * „Zurück zum Formular" lässt die Eingaben stehen.
 */
export function ArbeitszeitRueckfrage({
  onBestaetigen,
  onAbbrechen,
  laeuft,
  beschriftung,
  arbeitszeit = true,
  vergangenheit = false,
}: {
  onBestaetigen: () => void;
  /** Zurück ins Formular, ohne etwas zu schreiben; setzt den Fehler zurück. */
  onAbbrechen: () => void;
  laeuft: boolean;
  beschriftung: string;
  /** Der Zeitraum liegt außerhalb der Arbeitszeit (CAL-005). */
  arbeitszeit?: boolean;
  /**
   * Der Tag liegt in der Vergangenheit (FIX-019, ANN-057) - derselbe Kasten,
   * damit nie zwei Fenster hintereinander kommen, wenn beides zutrifft.
   */
  vergangenheit?: boolean;
}) {
  const titel =
    arbeitszeit && vergangenheit
      ? 'Vergangenheit und Arbeitszeit'
      : vergangenheit
        ? 'Termin in der Vergangenheit'
        : 'Außerhalb der Arbeitszeit';
  return (
    <Dialogfenster titel={titel} onSchliessen={onAbbrechen}>
      {vergangenheit ? (
        <p className="text-ink text-sm">
          Der Tag liegt in der Vergangenheit. Der Termin wird nachgetragen.
        </p>
      ) : null}
      {arbeitszeit ? (
        <>
          <p className={`text-ink text-sm ${vergangenheit ? 'mt-2' : ''}`}>
            Dieser Zeitraum liegt außerhalb der hinterlegten Arbeitszeit der behandelnden Person.
          </p>
          <p className="text-ink-muted mt-2 text-xs leading-relaxed">
            Ist für die Person an diesem Tag keine Arbeitszeit hinterlegt, gilt der Termin ebenfalls
            als außerhalb. {BEGRIFFE.arbeitszeiten} pflegen Sie unter {BEREICHE.betrieb.label} →{' '}
            {BEGRIFFE.arbeitszeiten}.
          </p>
        </>
      ) : null}
      <p className="text-ink-muted mt-2 text-xs">Der Termin wurde noch nicht gespeichert.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" disabled={laeuft} data-autofocus onClick={onBestaetigen}>
          {laeuft ? 'Wird gespeichert …' : beschriftung}
        </Button>
        <Button type="button" variant="quiet" disabled={laeuft} onClick={onAbbrechen}>
          Zurück zum Formular
        </Button>
      </div>
    </Dialogfenster>
  );
}
