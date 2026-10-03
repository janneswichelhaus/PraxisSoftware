import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { todayInTimeZone } from '@/features/appointments/api';
import { ordneScanZu } from '@/features/files/api';
import type { CurrentUser } from '@/features/session/types';
import {
  createTreatmentBasis,
  fetchPrescribers,
  fetchTreatmentBasis,
  ICD10_MUSTER,
  icd10Normalisiert,
  prescriberLabel,
  setTreatmentBasisIcd10,
  treatmentBasisFormSchema,
  updateTreatmentBasis,
  type Heilmittelposition,
  type TreatmentBasisDetail,
} from './api';
import { HAUSBESUCH, HEILMITTEL } from './heilmittel';
import { usePosNummern } from './posNummern';
import { ScanBesideForm } from './ScanBesideForm';

/** Eine Zeile unter „Positionen für die Rechnung". */
interface Zeile {
  /** Vorhandene Position, oder `null` bei einer neuen. */
  id: string | null;
  remedy: string;
  anzahl: string;
}

/** Wofür das Fenster offen ist: ein Foto ohne Daten oder eine Verordnung. */
export type Uebertragung =
  | { art: 'foto'; fileId: string; fotoVom: string | null }
  | { art: 'grundlage'; grundlageId: string };

const POSITIONEN_OHNE_HAUSBESUCH = HEILMITTEL.filter((h) => h.remedy !== HAUSBESUCH);

/**
 * „Daten übertragen" (Akte entschlacken, 2026-10-03): die Verordnung vom Foto
 * abtippen - oder die Daten einer Verordnung ändern.
 *
 * Die Daten gehen in die Rechnung: Diagnose, Verordnungsdatum, verordnende
 * Ärzt:in und die Positionen. Das Foto ist nur die Quelle zum Abtippen und
 * erscheint erst auf Tipp (ADR-017 Punkte 15 und 20, `ScanBesideForm`). Die
 * Preise kommen aus der Preisliste, nie vom Rezept; die Pos.-Nr. steht nur zur
 * Orientierung daneben (`usePosNummern`).
 *
 * Geschrieben wird über die bestehenden Wege (`create_`/`update_treatment_basis`,
 * `assign_prescription_scan`) und den ICD-10-Code über seine eigene Funktion;
 * verbindlich prüft der Server. Selbstzahler und eine neue Verordner:in
 * gehen weiter über das ausführliche Formular.
 */
export function DatenUebertragenFenster({
  patientId,
  user,
  uebertragung,
  onSchliessen,
}: {
  patientId: string;
  user: CurrentUser;
  uebertragung: Uebertragung;
  onSchliessen: () => void;
}) {
  const bestandId = uebertragung.art === 'grundlage' ? uebertragung.grundlageId : null;
  const bestand = useQuery({
    queryKey: ['treatment-basis', bestandId],
    queryFn: () => fetchTreatmentBasis(bestandId!),
    enabled: Boolean(bestandId),
    retry: false,
  });

  const titel = 'Daten übertragen';
  return (
    <Dialogfenster titel={titel} onSchliessen={onSchliessen} breit>
      {uebertragung.art === 'foto' && uebertragung.fotoVom ? (
        <p className="text-ink-muted -mt-2 mb-3 text-sm">Foto vom {uebertragung.fotoVom}</p>
      ) : null}
      {bestandId && bestand.isPending ? <LoadingState label="Grundlage wird geladen …" /> : null}
      {bestandId && bestand.isError ? (
        <ErrorState
          title="Die Grundlage konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => void bestand.refetch()}
        />
      ) : null}
      {!bestandId || bestand.data ? (
        <Formular
          patientId={patientId}
          user={user}
          fileId={uebertragung.art === 'foto' ? uebertragung.fileId : null}
          bestand={bestand.data ?? null}
          onSchliessen={onSchliessen}
        />
      ) : null}
    </Dialogfenster>
  );
}

function startzeilen(bestand: TreatmentBasisDetail | null): Zeile[] {
  if (!bestand) return [{ id: null, remedy: '', anzahl: '' }];
  const ohneHausbesuch = bestand.items.filter((item) => item.remedy !== HAUSBESUCH);
  return ohneHausbesuch.length > 0
    ? ohneHausbesuch.map((item) => ({
        id: item.id,
        remedy: item.remedy,
        anzahl: String(item.prescribed_quantity),
      }))
    : [{ id: null, remedy: '', anzahl: '' }];
}

function Formular({
  patientId,
  user,
  fileId,
  bestand,
  onSchliessen,
}: {
  patientId: string;
  user: CurrentUser;
  fileId: string | null;
  bestand: TreatmentBasisDetail | null;
  onSchliessen: () => void;
}) {
  const queryClient = useQueryClient();
  const heute = user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : '';
  const posNummern = usePosNummern(heute);
  const verordner = useQuery({ queryKey: ['prescribers'], queryFn: fetchPrescribers });

  const hausbesuchBestand = bestand?.items.find((item) => item.remedy === HAUSBESUCH) ?? null;
  const [issuedOn, setIssuedOn] = useState(bestand?.issued_on ?? '');
  const [prescriberId, setPrescriberId] = useState(bestand?.prescriber_id ?? '');
  const [kind, setKind] = useState<string>(
    bestand && bestand.treatment_basis_kind !== 'self_pay' ? bestand.treatment_basis_kind : '',
  );
  const [icd, setIcd] = useState(bestand?.diagnosis_icd10 ?? '');
  const [diagnose, setDiagnose] = useState(bestand?.diagnosis ?? '');
  const [zeilen, setZeilen] = useState<Zeile[]>(() => startzeilen(bestand));
  const [hausbesuch, setHausbesuch] = useState(Boolean(hausbesuchBestand));
  const [termine, setTermine] = useState(bestand ? String(bestand.appointment_count) : '');
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [hinweis, setHinweis] = useState<string | null>(null);

  // ANN-227: Ohne eigene Angabe ist die Zahl der Termine die größte Anzahl
  // einer Position - auf einer Verordnung über 10 × KG sind es 10 Termine.
  const groessteAnzahl = Math.max(0, ...zeilen.map((z) => Number(z.anzahl) || 0));
  const terminzahl = termine.trim() === '' ? String(groessteAnzahl || '') : termine;

  const speichern = useMutation({
    mutationFn: async () => {
      const pruefung = treatmentBasisFormSchema.safeParse({
        prescriber_id: prescriberId,
        treatment_basis_kind: kind,
        issued_on: issuedOn,
        appointment_count: terminzahl,
        frequency_note: bestand?.frequency_note ?? '',
        note: bestand?.note ?? '',
        diagnosis: diagnose,
      });
      const neueFehler: Record<string, string> = {};
      if (!pruefung.success) {
        for (const issue of pruefung.error.issues) {
          const feld = String(issue.path[0] ?? '');
          neueFehler[feld] ??= issue.message;
        }
      }
      const code = icd10Normalisiert(icd);
      if (code !== '' && !ICD10_MUSTER.test(code)) {
        neueFehler.icd = 'Bitte einen ICD-10-Code wie G20.00 oder M54.5 eingeben.';
      }
      const gefuellt = zeilen.filter((z) => z.remedy !== '');
      if (gefuellt.length === 0 && !hausbesuch) {
        neueFehler.positionen = 'Bitte mindestens eine Position wählen.';
      }
      for (const z of gefuellt) {
        const n = Number(z.anzahl);
        if (!Number.isInteger(n) || n < 1 || n > 500) {
          neueFehler.positionen = 'Jede Anzahl muss eine ganze Zahl zwischen 1 und 500 sein.';
        }
      }
      setFehler(neueFehler);
      if (Object.keys(neueFehler).length > 0 || !pruefung.success) return null;

      const positionen: Heilmittelposition[] = gefuellt.map((z) => ({
        id: z.id,
        remedy: z.remedy,
        bestand: null,
        menge: Number(z.anzahl),
      }));
      if (hausbesuch) {
        positionen.push({
          id: hausbesuchBestand?.id ?? null,
          remedy: HAUSBESUCH,
          bestand: null,
          menge: Number(pruefung.data.appointment_count),
        });
      }

      let id: string;
      if (bestand) {
        await updateTreatmentBasis(bestand.id, pruefung.data, positionen);
        id = bestand.id;
      } else {
        id = await createTreatmentBasis(patientId, pruefung.data, positionen);
      }
      if (code !== (bestand?.diagnosis_icd10 ?? '')) await setTreatmentBasisIcd10(id, code);
      if (fileId) {
        try {
          await ordneScanZu(fileId, id);
        } catch (ursache) {
          return { hinweis: (ursache as Error).message };
        }
      }
      return { hinweis: null };
    },
    onSuccess: async (ergebnis) => {
      if (!ergebnis) return;
      for (const queryKey of [
        ['patient-treatment-bases', patientId],
        ['patient-treatment-bases-clinical', patientId],
        ['patient-treatment-basis-slots', patientId],
        ['patient-files', patientId],
        ['open-points'],
      ]) {
        await queryClient.invalidateQueries({ queryKey });
      }
      if (bestand)
        await queryClient.invalidateQueries({ queryKey: ['treatment-basis', bestand.id] });
      if (ergebnis.hinweis) {
        setHinweis(ergebnis.hinweis);
        return;
      }
      onSchliessen();
    },
  });

  function zeileAendern(index: number, teil: Partial<Zeile>) {
    setZeilen((bisher) => bisher.map((z, i) => (i === index ? { ...z, ...teil } : z)));
  }

  const formularweg = bestand
    ? `/patienten/${patientId}/verordnungen/${bestand.id}/bearbeiten`
    : `/patienten/${patientId}/verordnungen/neu${fileId ? `?scan=${fileId}` : ''}`;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        speichern.mutate();
      }}
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {fileId ? (
          <div className="min-w-0">
            <ScanBesideForm fileId={fileId} />
          </div>
        ) : null}
        <div className={`flex min-w-0 flex-col gap-4 ${fileId ? '' : 'md:col-span-2'}`}>
          <Field
            label="Ausstellungsdatum"
            type="date"
            value={issuedOn}
            max={heute || undefined}
            error={fehler.issued_on}
            onChange={(e) => setIssuedOn(e.target.value)}
          />
          <Select
            label="Art"
            value={kind}
            error={fehler.treatment_basis_kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">Bitte wählen …</option>
            <option value="first">Erstverordnung</option>
            <option value="follow_up">Folgeverordnung</option>
          </Select>
          <Select
            label="Verordnende Ärzt:in"
            value={prescriberId}
            error={fehler.prescriber_id}
            hint={
              <>
                Nicht dabei?{' '}
                <Textlink to={formularweg}>Im ausführlichen Formular erfassen</Textlink>
              </>
            }
            onChange={(e) => setPrescriberId(e.target.value)}
          >
            <option value="">Bitte wählen …</option>
            {(verordner.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {prescriberLabel(v)}
              </option>
            ))}
          </Select>
          <Field
            label="Diagnose (ICD-10)"
            value={icd}
            autoComplete="off"
            maxLength={12}
            error={fehler.icd}
            onChange={(e) => setIcd(e.target.value)}
          />
          <Field
            label="Diagnose oder Leitsymptomatik"
            value={diagnose}
            maxLength={2000}
            error={fehler.diagnosis}
            onChange={(e) => setDiagnose(e.target.value)}
          />

          <fieldset className="flex flex-col gap-3">
            <legend className="text-ink-muted tracking-label mb-1 text-xs font-semibold uppercase">
              Positionen für die Rechnung
            </legend>
            {zeilen.map((zeile, index) => (
              <div
                key={index}
                className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-end gap-2"
              >
                <Select
                  label="Heilmittel"
                  value={zeile.remedy}
                  onChange={(e) => zeileAendern(index, { remedy: e.target.value })}
                >
                  <option value="">Bitte wählen …</option>
                  {POSITIONEN_OHNE_HAUSBESUCH.map((h) => (
                    <option key={h.remedy} value={h.remedy}>
                      {posNummern.get(h.remedy)
                        ? `${h.beschriftung} · Pos. ${posNummern.get(h.remedy)}`
                        : h.beschriftung}
                    </option>
                  ))}
                  {zeile.remedy &&
                  !POSITIONEN_OHNE_HAUSBESUCH.some((h) => h.remedy === zeile.remedy) ? (
                    <option value={zeile.remedy}>{zeile.remedy}</option>
                  ) : null}
                </Select>
                <Field
                  label="Anzahl"
                  inputMode="numeric"
                  value={zeile.anzahl}
                  onChange={(e) => zeileAendern(index, { anzahl: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Position ${index + 1} entfernen`}
                  className="text-ink-muted hover:text-ink flex size-11 items-center justify-center text-xl"
                  onClick={() => setZeilen((bisher) => bisher.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>
            ))}
            <Checkbox
              label="Hausbesuch je Termin"
              checked={hausbesuch}
              onChange={(e) => setHausbesuch(e.target.checked)}
            />
            <div>
              <button
                type="button"
                className="text-accent min-h-11 text-sm font-semibold underline underline-offset-4"
                onClick={() =>
                  setZeilen((bisher) => [...bisher, { id: null, remedy: '', anzahl: '' }])
                }
              >
                + Position hinzufügen
              </button>
            </div>
            {fehler.positionen ? (
              <Statusmeldung ton="fehler">{fehler.positionen}</Statusmeldung>
            ) : null}
          </fieldset>

          <Field
            label="Termine"
            inputMode="numeric"
            value={termine}
            placeholder={groessteAnzahl ? String(groessteAnzahl) : ''}
            hint="Ohne Angabe die größte Anzahl einer Position."
            error={fehler.appointment_count}
            onChange={(e) => setTermine(e.target.value)}
          />
          {bestand ? (
            <p className="text-ink-muted text-sm">
              Frequenz und Anmerkungen stehen im{' '}
              <Textlink to={formularweg}>ausführlichen Formular</Textlink>.
            </p>
          ) : null}
        </div>
      </div>

      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}
      {hinweis ? (
        <Statusmeldung ton="warnung" className="mt-4">
          {hinweis}
        </Statusmeldung>
      ) : null}

      <div className="border-line mt-6 flex flex-wrap justify-end gap-3 border-t pt-4">
        <Button type="button" variant="quiet" onClick={onSchliessen}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={speichern.isPending}>
          {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
      </div>
    </form>
  );
}
