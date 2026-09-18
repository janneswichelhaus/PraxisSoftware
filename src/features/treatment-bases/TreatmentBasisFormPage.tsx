import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { z } from 'zod';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { neueVorgangskennung } from '@/lib/abstecher';
import { alsFormularfehler } from '@/lib/formularfehler';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { useSession } from '@/features/auth/sessionContext';
import { fetchPatient, fullName } from '@/features/patients/api';
import { TreatmentBasisFormFields } from './TreatmentBasisFormFields';
import { GRUNDLAGE_BESCHRIFTUNG, GRUNDLAGE_REIHENFOLGE, grundlageFeldId } from './grundlagenfelder';
import {
  bestandstexte,
  createTreatmentBasis,
  deleteTreatmentBasis,
  istVerordnung,
  entwurfAblegen,
  entwurfAnsehen,
  entwurfEntfernen,
  fetchPrescribers,
  fetchTreatmentBasis,
  itemsToFormValues,
  leereGrundlage,
  treatmentBasisFormSchema,
  treatmentBasisToFormValues,
  updateTreatmentBasis,
  type Bauart,
  type GrundlageFehlerfeld,
  type Heilmittelposition,
  type TreatmentBasisDetail,
  type TreatmentBasisFeld,
} from './api';

/**
 * Formular für das Anlegen und Ändern einer Behandlungsgrundlage (VER-003,
 * GRD-001).
 *
 * Anlegen und Ändern erfassen dieselben Felder; getrennt sind nur Überschrift,
 * Rücksprungziel und der Schreibvorgang. Die Prüfung hier ist Bedienkomfort —
 * verbindlich prüfen `create_treatment_basis` und `update_treatment_basis`,
 * einschließlich der Rollen (ADR-004, ANN-011).
 */
function GrundlagenFormular({
  patientId,
  bestand,
}: {
  patientId: string;
  bestand: TreatmentBasisDetail | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  // In den Grundlagenbereich der Akte und nicht auf ihre Übersicht: Dort
  // steht, was gerade entstanden ist (AKTE-002).
  const zurueck = `/patienten/${patientId}/verordnungen`;
  const verordnerRueckpfad = bestand
    ? `/patienten/${patientId}/verordnungen/${bestand.id}/bearbeiten`
    : `/patienten/${patientId}/verordnungen/neu`;

  // Die Vorgangskennung unterscheidet zwei Besuche derselben Seite (UX-009,
  // Restpunkt aus ANN-019). Sie kommt aus der Adresszeile, wenn wir gerade vom
  // Abstecher zurückkommen; für den nächsten Abstecher entsteht eine neue.
  const [suche] = useSearchParams();
  const laufenderVorgang = suche.get('vorgang');
  const [naechsterVorgang] = useState(() => neueVorgangskennung());

  // Ein Entwurf existiert nur direkt nach der Rückkehr vom Anlegen einer
  // Verordner:in (siehe entwurfSichern unten und PrescriberFormPage). Ohne
  // Kennung in der Adresszeile ist das ein unabhängiger neuer Besuch - dann
  // wird gar nicht erst gesucht. Lesen und Entfernen sind bewusst getrennt
  // (api.ts, entwurfAnsehen): ein Zustands-Initialisierer muss wiederholbar
  // bleiben, React StrictMode ruft ihn im Entwicklungsmodus zweimal auf.
  const [entwurf] = useState(() =>
    userId && laufenderVorgang ? entwurfAnsehen(laufenderVorgang, userId) : undefined,
  );
  useEffect(() => {
    // Nur beim Einhängen: der Entwurf ist ausschließlich für diesen einen
    // Wiederaufbau gedacht.
    if (userId && laufenderVorgang) entwurfEntfernen(laufenderVorgang, userId);
  }, []);

  const [werte, setWerte] = useState<Record<TreatmentBasisFeld, string>>(() => {
    const basis =
      entwurf?.werte ?? (bestand ? treatmentBasisToFormValues(bestand) : leereGrundlage);
    // Die neu angelegte Verordner:in ist danach ausgewählt, ohne dass die
    // Person sie erneut suchen muss.
    return entwurf?.neuerVerordnerId
      ? { ...basis, prescriber_id: entwurf.neuerVerordnerId }
      : basis;
  });
  const [positionen, setPositionen] = useState<Heilmittelposition[]>(
    () => entwurf?.positionen ?? (bestand ? itemsToFormValues(bestand) : []),
  );
  const [fehler, setFehler] = useState<Partial<Record<GrundlageFehlerfeld, string>>>({});

  const verordner = useQuery({
    queryKey: ['prescribers'],
    queryFn: fetchPrescribers,
    retry: false,
  });

  /**
   * Für wen wird hier geschrieben? (UX-012)
   *
   * Das Formular nannte die Person nirgends — weder im Titel noch im Kopf.
   * Eine Verordnung enthält Diagnose und Therapieziel; sie in der falschen
   * Akte zu erfassen, ist der teuerste Irrtum dieses Formulars. Die
   * Dokumentationsseiten tragen den Namen aus genau diesem Grund
   * (`PageHeader`, `kompakt`); hier fehlte er.
   *
   * Derselbe Schlüssel wie in der Akte: Wer von dort kommt, hat die Abfrage
   * schon im Zwischenspeicher und sieht den Namen ohne zweite Runde.
   */
  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    retry: false,
  });

  async function akteAuffrischen() {
    await queryClient.invalidateQueries({ queryKey: ['patient-treatment-bases', patientId] });
    await queryClient.invalidateQueries({
      queryKey: ['patient-treatment-bases-clinical', patientId],
    });
  }

  const speichern = useMutation({
    mutationFn: async (values: z.output<typeof treatmentBasisFormSchema>) => {
      if (bestand) {
        await updateTreatmentBasis(bestand.id, values, positionen);
        return bestand.id;
      }
      return createTreatmentBasis(patientId, values, positionen);
    },
    onSuccess: async (id) => {
      await akteAuffrischen();
      if (bestand) await queryClient.invalidateQueries({ queryKey: ['treatment-basis', id] });
      void navigate(zurueck, { replace: true });
    },
  });

  const loeschen = useMutation({
    mutationFn: () => deleteTreatmentBasis(bestand!.id),
    onSuccess: async () => {
      await akteAuffrischen();
      void navigate(zurueck, { replace: true });
    },
  });

  /**
   * Beim Wechsel auf „Selbstzahler" fallen Verordner:in und Diagnose
   * (ADR-020 Punkt 3 und 4).
   *
   * Sie werden **sichtbar geleert**, nicht stillschweigend beim Absenden
   * weggelassen: Wer die Bauart wechselt, sieht, was er damit aufgibt, und
   * findet beim Zurückwechseln ein leeres Feld statt eines Werts, den er nicht
   * mehr erwartet hat. Die Felder selbst blendet das Formular danach aus.
   *
   * Die drei Bestandstexte stehen hier nicht mehr: Sie sind keine Eingabe mehr
   * (VER-EPIC-002). Beim Wechsel auf „Selbstzahler" räumt sie der Server ab,
   * nicht das Formular — dieselbe Regel, eine Stelle tiefer (ADR-020 Punkt 4).
   */
  const NUR_VERORDNUNG: TreatmentBasisFeld[] = ['prescriber_id', 'diagnosis'];

  function setzen(feld: TreatmentBasisFeld, wert: string) {
    setWerte((bisher) => {
      const naechste = { ...bisher, [feld]: wert };
      if (feld === 'treatment_basis_kind' && !istVerordnung(wert as Bauart)) {
        for (const leer of NUR_VERORDNUNG) naechste[leer] = '';
      }
      return naechste;
    });
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
    if (feld === 'treatment_basis_kind' && !istVerordnung(wert as Bauart)) {
      setFehler((bisher) => {
        const naechste = { ...bisher };
        for (const leer of NUR_VERORDNUNG) delete naechste[leer];
        return naechste;
      });
    }
  }

  /**
   * Ein Heilmittel an- oder abhaken (VER-EPIC-002).
   *
   * Abhaken entfernt **alle** Positionen mit diesem Heilmittel: Ein
   * Bestandsdatensatz kann dieselbe Bezeichnung zweimal tragen, und eine davon
   * stehen zu lassen wäre ein Rest, den niemand sieht. Anhaken legt eine neue
   * Position ohne Menge an — die vergibt der Server aus der Terminzahl.
   */
  function heilmittelWechsel(remedy: string, gewaehlt: boolean) {
    setPositionen((bisher) =>
      gewaehlt
        ? [...bisher, { id: null, remedy, bestand: null }]
        : bisher.filter((position) => position.remedy !== remedy),
    );
    if (gewaehlt && fehler.items) {
      setFehler((bisher) => {
        const naechste = { ...bisher };
        delete naechste.items;
        return naechste;
      });
    }
  }

  // Läuft beim Klick auf "Verordner:in anlegen" - vor dem eigentlichen
  // Seitenwechsel, den der Link selbst auslöst. Die Grundlage wird dadurch
  // nicht geschrieben, nur ihr Formularzustand für die Rückkehr gemerkt.
  /**
   * Legt den Formularzustand unter der Kennung des nächsten Abstechers ab.
   *
   * Sie steht bereits im Rücksprungpfad des Links daneben - der Weg zurück
   * findet damit genau diesen Entwurf und keinen älteren.
   */
  function entwurfSichern() {
    if (userId) entwurfAblegen(naechsterVorgang, userId, { werte, positionen });
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Schutz gegen mehrfaches Absenden: solange ein Vorgang läuft, wird kein
    // zweiter gestartet.
    if (speichern.isPending) return;

    const kopf = treatmentBasisFormSchema.safeParse(werte);
    const gefunden: Partial<Record<GrundlageFehlerfeld, string>> = {};
    if (!kopf.success) {
      for (const problem of kopf.error.issues) {
        const feld = problem.path[0] as TreatmentBasisFeld | undefined;
        if (feld && !gefunden[feld]) gefunden[feld] = problem.message;
      }
    }

    // Die Auswahl ist Pflicht: Eine Grundlage ohne Heilmittel weist auch der
    // Server ab - hier steht es, damit der Hinweis an der Gruppe erscheint.
    if (positionen.length === 0) {
      gefunden.items = 'Bitte mindestens ein Heilmittel auswählen.';
    }

    setFehler(gefunden);
    if (Object.keys(gefunden).length > 0 || !kopf.success) return;

    speichern.mutate(kopf.data);
  }

  return (
    <>
      <Rueckweg standard={zurueck} beschriftung="Zurück zu den Behandlungsgrundlagen" />

      <PageHeader
        title={bestand ? 'Grundlage bearbeiten' : 'Grundlage erfassen'}
        description={
          patient.data
            ? `Für ${fullName(patient.data)}. Mit * markierte Felder sind erforderlich.`
            : 'Mit * markierte Felder sind erforderlich.'
        }
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {speichern.isError ? (
          <div className="mb-6">
            <ErrorState
              title="Die Behandlungsgrundlage konnte nicht gespeichert werden."
              description="Bitte erneut versuchen. Sind Sie noch angemeldet und berechtigt?"
            />
          </div>
        ) : null}
        {verordner.isError ? (
          <div className="mb-6">
            <ErrorState title="Die Verordner:innen konnten nicht geladen werden." />
          </div>
        ) : null}

        <Fehlerzusammenfassung
          fehler={alsFormularfehler(
            GRUNDLAGE_REIHENFOLGE,
            GRUNDLAGE_BESCHRIFTUNG,
            fehler,
            grundlageFeldId,
          )}
        />

        <TreatmentBasisFormFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          positionen={positionen}
          positionsFehler={fehler.items}
          onHeilmittelWechsel={heilmittelWechsel}
          bestandstexte={bestand ? bestandstexte(bestand) : []}
          verordnerinnen={verordner.data ?? []}
          verordnerAnlegenZiel={`/verordner/neu?zurueck=${encodeURIComponent(
            `${verordnerRueckpfad}?vorgang=${naechsterVorgang}`,
          )}`}
          onVerordnerAnlegenKlick={entwurfSichern}
        />

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={speichern.isPending}>
            {speichern.isPending
              ? 'Wird gespeichert …'
              : bestand
                ? 'Änderungen speichern'
                : 'Grundlage speichern'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
            Abbrechen
          </Button>
        </div>
      </form>

      {/* Löschen ist der Weg für eine Grundlage, die in der falschen Akte
          gelandet ist (Art. 16 DSGVO). Bewusst mit Rückfrage und außerhalb des
          Formulars, damit kein versehentliches Absenden sie auslöst. */}
      {bestand ? (
        <div className="border-line mt-10 flex border-t pt-6">
          <Rueckfrage
            ausloeser="Grundlage löschen"
            bezeichnung="Grundlage endgültig löschen"
            bestaetigen="Ja, Grundlage löschen"
            bestaetigenLaeuft="Wird gelöscht …"
            abbrechen="Nicht löschen"
            fehler={loeschen.isError ? 'Die Grundlage konnte nicht gelöscht werden.' : undefined}
            laeuft={loeschen.isPending}
            onBestaetigen={() => loeschen.mutateAsync()}
          >
            Die Grundlage wird endgültig entfernt, samt ihren Positionen. Der Vorgang wird
            protokolliert. Für eine falsch zugeordnete Grundlage ist das der richtige Weg; für eine
            abgelaufene nicht — sie gehört in die Akte.
          </Rueckfrage>
        </div>
      ) : null}

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Anlegen, Ändern und Löschen einer Behandlungsgrundlage werden protokolliert.
      </p>
    </>
  );
}

export function NewTreatmentBasisPage() {
  const { patientId } = useParams<{ patientId: string }>();
  if (!patientId) return null;
  return <GrundlagenFormular patientId={patientId} bestand={null} />;
}

export function EditTreatmentBasisPage() {
  const { patientId, grundlageId } = useParams<{
    patientId: string;
    grundlageId: string;
  }>();

  const { data, isPending, isError } = useQuery({
    queryKey: ['treatment-basis', grundlageId],
    queryFn: () => fetchTreatmentBasis(grundlageId!),
    enabled: Boolean(grundlageId),
    retry: false,
  });

  if (!patientId) return null;

  return (
    <>
      {isPending ? <LoadingState label="Behandlungsgrundlage wird geladen …" /> : null}
      {isError ? (
        <ErrorState title="Die Behandlungsgrundlage konnte nicht geladen werden." />
      ) : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Datensatz existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}
      {data ? <GrundlagenFormular patientId={patientId} bestand={data} /> : null}
    </>
  );
}
