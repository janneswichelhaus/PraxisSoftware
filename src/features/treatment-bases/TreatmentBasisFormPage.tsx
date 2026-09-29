import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { z } from 'zod';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hinweisfenster } from '@/components/ui/Dialogfenster';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { neueVorgangskennung } from '@/lib/abstecher';
import { alsFormularfehler } from '@/lib/formularfehler';
import { istInternerPfad, leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { useSession } from '@/features/auth/sessionContext';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import { fetchPatient, fullName } from '@/features/patients/api';
import { ordneScanZu } from '@/features/files/api';
import { ScanBesideForm } from './ScanBesideForm';
import { TreatmentBasisFormFields } from './TreatmentBasisFormFields';
import { GRUNDLAGE_BESCHRIFTUNG, GRUNDLAGE_REIHENFOLGE, grundlageFeldId } from './grundlagenfelder';
import { useDarfGrundlagenSchreiben } from './schreibrecht';
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
 * Der Grundlagenbereich der Akte und nicht ihre Übersicht: Dort steht, was
 * gerade entstanden ist (AKTE-002). Ziel, wenn kein Rückweg mitkam.
 */
function grundlagenbereich(patientId: string): string {
  return `/patienten/${patientId}/verordnungen`;
}

/** Derselbe Name wie der Reiter der Akte (VER-17). */
const RUECKWEG_TEXT = 'Zurück zu den Behandlungsgrundlagen';

/** Eine Kennung aus der Adresszeile, wie die Datenbank sie vergibt (PRX-011). */
const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Die Sätze des Schutzes vor Eingabeverlust (VER-03, ANN-046). */
const VERLUSTTEXTE: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungespeicherte Behandlungsgrundlage',
};

/** Die Felder des Formulars ohne die Heilmittelauswahl. */
const FELDER = Object.keys(leereGrundlage) as TreatmentBasisFeld[];

/** Dieselbe Auswahl in derselben Reihenfolge - vorhandene Positionen samt Kennung. */
function gleicheAuswahl(
  eine: readonly Heilmittelposition[],
  andere: readonly Heilmittelposition[],
): boolean {
  return (
    eine.length === andere.length &&
    eine.every(
      (position, stelle) =>
        position.id === andere[stelle]?.id && position.remedy === andere[stelle]?.remedy,
    )
  );
}

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

  /**
   * Wohin es nach Speichern, Löschen und „Abbrechen" geht (VER-05).
   *
   * Bisher immer in den Grundlagenbereich der Akte - auch wenn das Formular
   * aus der Terminplanung geöffnet war. Jetzt gilt derselbe Rückweg wie oben
   * links: aus der Adresszeile, geprüft wie überall, sonst der
   * Grundlagenbereich.
   */
  const [suche] = useSearchParams();
  const standardZiel = grundlagenbereich(patientId);
  const zurueck = leseRueckweg(suche, standardZiel);
  const verordnerRueckpfad = bestand
    ? `/patienten/${patientId}/verordnungen/${bestand.id}/bearbeiten`
    : `/patienten/${patientId}/verordnungen/neu`;

  // Die Vorgangskennung unterscheidet zwei Besuche derselben Seite (UX-009,
  // Restpunkt aus ANN-019). Sie kommt aus der Adresszeile, wenn wir gerade vom
  // Abstecher zurückkommen; für den nächsten Abstecher entsteht eine neue.
  const laufenderVorgang = suche.get('vorgang');

  // PRX-011: Aus den offenen Punkten kommt das Foto der Verordnung mit. Nur
  // beim Anlegen und nur als Kennung - ob sie zu dieser Person gehört, prüft
  // der Server beim Zuordnen.
  const scanParam = suche.get('scan');
  const scanId = !bestand && scanParam && KENNUNG.test(scanParam) ? scanParam : null;
  const [scanFehler, setScanFehler] = useState<string | null>(null);
  const [naechsterVorgang] = useState(() => neueVorgangskennung());

  // Ein Entwurf existiert nur direkt nach der Rückkehr vom Anlegen einer
  // Verordner:in (siehe verordnerAnlegen unten und PrescriberFormPage). Ohne
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

  // Der Stand auf dem Server - oder das leere Formular. Was davon abweicht,
  // ist ungespeichert, auch ein Entwurf aus dem Abstecher: Er liegt nur im
  // Arbeitsspeicher (VER-03).
  const [ausgang] = useState(() => ({
    werte: bestand ? treatmentBasisToFormValues(bestand) : leereGrundlage,
    positionen: bestand ? itemsToFormValues(bestand) : [],
  }));

  const [werte, setWerte] = useState<Record<TreatmentBasisFeld, string>>(() => {
    const basis = entwurf?.werte ?? ausgang.werte;
    // Die neu angelegte Verordner:in ist danach ausgewählt, ohne dass die
    // Person sie erneut suchen muss.
    return entwurf?.neuerVerordnerId
      ? { ...basis, prescriber_id: entwurf.neuerVerordnerId }
      : basis;
  });
  const [positionen, setPositionen] = useState<Heilmittelposition[]>(
    () => entwurf?.positionen ?? ausgang.positionen,
  );
  const [fehler, setFehler] = useState<Partial<Record<GrundlageFehlerfeld, string>>>({});

  /**
   * Schutz vor Eingabeverlust (VER-03, ZST-05, ANN-046).
   *
   * Wer ein Rezept abschreibt und in der Tableiste danebentippt, am Telefon
   * vom Rand wischt oder neu lädt, verlor bisher alles. Ohne Entwurfszustand
   * auf dem Server bietet die Rückfrage nur „Verwerfen und weitergehen" und
   * „Hier bleiben"; der Abstecher zur Verordner-Anlage sichert die Eingaben
   * selbst und fragt deshalb nicht.
   */
  const ungespeichert =
    FELDER.some((feld) => werte[feld] !== ausgang.werte[feld]) ||
    !gleicheAuswahl(positionen, ausgang.positionen);
  const { freigeben, schutz } = useTextverlustschutz({ ungespeichert, texte: VERLUSTTEXTE });

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
  // Ohne Namen fehlt der Schutz gegen die Falschzuordnung - dann wird das
  // gesagt und nicht gespeichert (VER-B02, §13).
  const personFehlt = patient.isError || patient.data === null;

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
        return { id: bestand.id, scanFehler: null };
      }
      const id = await createTreatmentBasis(patientId, values, positionen);
      // Die Grundlage steht; scheitert nur das Zuordnen, bleibt das Foto in
      // den offenen Punkten - und die Seite sagt es, statt still weiterzugehen.
      if (!scanId) return { id, scanFehler: null };
      try {
        await ordneScanZu(scanId, id);
        return { id, scanFehler: null };
      } catch (ursache) {
        return { id, scanFehler: (ursache as Error).message };
      }
    },
    onSuccess: async ({ id, scanFehler: fehlerBeimZuordnen }) => {
      await akteAuffrischen();
      if (bestand) await queryClient.invalidateQueries({ queryKey: ['treatment-basis', id] });
      await queryClient.invalidateQueries({ queryKey: ['open-points'] });
      await queryClient.invalidateQueries({ queryKey: ['patient-files', patientId] });
      // Gespeichert: Der eigene Weg zurück ist kein Verlust (ANN-046).
      freigeben();
      if (fehlerBeimZuordnen) {
        setScanFehler(fehlerBeimZuordnen);
        return;
      }
      void navigate(zurueck, { replace: true });
    },
  });

  const loeschen = useMutation({
    mutationFn: () => deleteTreatmentBasis(bestand!.id),
    onSuccess: async () => {
      await akteAuffrischen();
      freigeben();
      // Führte der Rückweg zu dieser Grundlage selbst, gibt es ihn nicht mehr.
      const ziel = bestand && zurueck.includes(bestand.id) ? standardZiel : zurueck;
      void navigate(ziel, { replace: true });
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

  /**
   * Der Abstecher zur Verordner-Anlage (VER-003) - der Link selbst wechselt
   * die Seite, das hier läuft davor.
   *
   * Der Formularzustand liegt danach unter der Kennung des nächsten
   * Abstechers; sie steht bereits im Rücksprungpfad des Links, und der Weg
   * zurück findet genau diesen Entwurf und keinen älteren. Die Grundlage wird
   * dadurch nicht geschrieben. Weil nichts verloren geht, gibt der Schutz
   * diesen einen Seitenwechsel frei.
   */
  function verordnerAnlegen() {
    if (!userId) return;
    entwurfAblegen(naechsterVorgang, userId, { werte, positionen });
    freigeben();
  }

  // Der Rückweg, mit dem dieses Formular geöffnet wurde, reist durch den
  // Abstecher mit - sonst endete der Weg aus der Terminplanung nach dem
  // Anlegen einer Verordner:in doch wieder in der Akte (VER-05). Wird der
  // Pfad dafür zu lang, bleibt er beim Abstecher zurück, der Entwurf nicht.
  const rueckkehr = `${verordnerRueckpfad}?vorgang=${naechsterVorgang}`;
  const rueckkehrMitHerkunft = mitRueckweg(rueckkehr, zurueck === standardZiel ? null : zurueck);
  const verordnerAnlegenZiel = mitRueckweg(
    '/verordner/neu',
    istInternerPfad(rueckkehrMitHerkunft) ? rueckkehrMitHerkunft : rueckkehr,
  );

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
      <Rueckweg standard={standardZiel} beschriftung={RUECKWEG_TEXT} />

      <PageHeader
        title={bestand ? 'Grundlage bearbeiten' : 'Grundlage erfassen'}
        description={
          patient.data
            ? `Für ${fullName(patient.data)}. Mit * markierte Felder sind erforderlich.`
            : 'Mit * markierte Felder sind erforderlich.'
        }
      />

      {scanFehler ? (
        <Hinweisfenster
          titel="Grundlage gespeichert"
          onSchliessen={() => void navigate(zurueck, { replace: true })}
        >
          {scanFehler}
        </Hinweisfenster>
      ) : null}

      <div
        className={
          scanId ? 'grid gap-6 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] lg:items-start' : ''
        }
      >
        {scanId ? (
          <div className="lg:order-2">
            <ScanBesideForm fileId={scanId} />
          </div>
        ) : null}
        <form onSubmit={absenden} noValidate className="max-w-xl lg:order-1">
          {personFehlt ? (
            <Statusmeldung ton="warnung" className="mb-6">
              Für wen diese Grundlage ist, ließ sich nicht laden. Bitte aus der Akte neu öffnen.
            </Statusmeldung>
          ) : null}

          {/* Ein Speicherfehler als Fenster über dem Formular (VER-02, ZST-10,
            ANN-058): Wer am Seitenende auf „Speichern" tippt, sieht einen
            Kasten am Formularanfang nicht. Der Satz sagt, was zu tun ist -
            ohne Einzelheiten aus der Datenbank (§13). */}
          {speichern.isError ? (
            <Hinweisfenster
              titel="Die Behandlungsgrundlage konnte nicht gespeichert werden."
              onSchliessen={() => speichern.reset()}
            >
              Die Eingaben stehen noch im Formular. Bitte die Verbindung prüfen und erneut
              speichern.
            </Hinweisfenster>
          ) : null}
          {verordner.isError ? (
            <div className="mb-6">
              <ErrorState
                title="Die Verordner:innen konnten nicht geladen werden."
                description="Bitte die Verbindung prüfen und erneut versuchen."
                onErneut={() => void verordner.refetch()}
              />
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
            verordnerAnlegenZiel={verordnerAnlegenZiel}
            onVerordnerAnlegenKlick={verordnerAnlegen}
          />

          {/* Rückfrage und Hinweise des Schutzes, dort, wo gearbeitet wird. */}
          {schutz}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button type="submit" disabled={speichern.isPending || !patient.data}>
              {speichern.isPending
                ? 'Wird gespeichert …'
                : bestand
                  ? 'Änderungen speichern'
                  : 'Grundlage speichern'}
            </Button>
            {/* Ein Seitenwechsel und deshalb ein Link (UIK-13) - der Schutz
              fragt bei ungespeicherten Eingaben wie bei jedem anderen Weg. */}
            <ButtonLink to={zurueck} variant="secondary">
              Abbrechen
            </ButtonLink>
          </div>
        </form>
      </div>

      {/* Löschen ist der Weg für eine Grundlage, die in der falschen Akte
          gelandet ist (Art. 16 DSGVO). Bewusst mit Rückfrage und außerhalb des
          Formulars, damit kein versehentliches Absenden sie auslöst. Scheitert
          es, steht der Grund aus api.ts da - etwa ein Therapiebericht an der
          Grundlage, samt Ausweg (ZST-13, VER-15). */}
      {bestand ? (
        <div className="border-line mt-10 flex border-t pt-6">
          <Rueckfrage
            ausloeser="Grundlage löschen"
            bezeichnung="Grundlage endgültig löschen"
            bestaetigen="Ja, Grundlage löschen"
            bestaetigenLaeuft="Wird gelöscht …"
            fehler={loeschen.error?.message}
            laeuft={loeschen.isPending}
            onBestaetigen={() => loeschen.mutateAsync()}
          >
            Die Grundlage wird endgültig entfernt, samt ihren Heilmitteln. Der Vorgang wird
            protokolliert. Für eine falsch zugeordnete Grundlage ist das der richtige Weg; für eine
            abgelaufene nicht – sie gehört in die Akte.
          </Rueckfrage>
        </div>
      ) : null}

      <p className="text-ink-muted mt-10 max-w-prose text-xs leading-relaxed">
        Anlegen, Ändern und Löschen einer Behandlungsgrundlage werden protokolliert.
      </p>
    </>
  );
}

/**
 * Statt des Formulars, wenn die Rolle keine Grundlagen schreibt (VER-04).
 *
 * Das Büro wird aus der Terminplanung hierher geführt, darf aber nicht
 * speichern (ANN-011). Es erfährt das jetzt, bevor es Diagnose und Heilmittel
 * abgeschrieben hat - mit dem Weg zurück. Verbindlich bleibt die Datenbank.
 */
function OhneSchreibrecht({ patientId, titel }: { patientId: string; titel: string }) {
  return (
    <>
      <Rueckweg standard={grundlagenbereich(patientId)} beschriftung={RUECKWEG_TEXT} />
      <PageHeader title={titel} />
      <ErrorState
        title="Nicht freigegeben"
        description="Behandlungsgrundlagen erfasst das Praxisteam."
      />
    </>
  );
}

export function NewTreatmentBasisPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const darfSchreiben = useDarfGrundlagenSchreiben();

  if (!patientId) return null;
  if (darfSchreiben === false)
    return <OhneSchreibrecht patientId={patientId} titel="Grundlage erfassen" />;
  return <GrundlagenFormular patientId={patientId} bestand={null} />;
}

export function EditTreatmentBasisPage() {
  const { patientId, grundlageId } = useParams<{
    patientId: string;
    grundlageId: string;
  }>();
  const darfSchreiben = useDarfGrundlagenSchreiben();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['treatment-basis', grundlageId],
    queryFn: () => fetchTreatmentBasis(grundlageId!),
    // Ohne Schreibrecht wird nicht geladen: Der Aufruf legt klinischen Inhalt
    // offen und wird protokolliert (ADR-010) - für ein Formular, das diese
    // Person nicht absenden darf.
    enabled: Boolean(grundlageId) && darfSchreiben !== false,
    retry: false,
  });

  if (!patientId) return null;
  if (darfSchreiben === false) {
    return <OhneSchreibrecht patientId={patientId} titel="Grundlage bearbeiten" />;
  }
  if (isPending) return <LoadingState label="Behandlungsgrundlage wird geladen …" />;
  if (data) return <GrundlagenFormular patientId={patientId} bestand={data} />;

  // Ohne Formular bleibt der Weg zurück - und ein Satz, was zu tun ist (VER-15).
  return (
    <>
      <Rueckweg standard={grundlagenbereich(patientId)} beschriftung={RUECKWEG_TEXT} />
      <PageHeader title="Grundlage bearbeiten" />
      {isError ? (
        <ErrorState
          title="Die Behandlungsgrundlage konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => void refetch()}
        />
      ) : (
        <ErrorState
          title="Nicht gefunden"
          description="Diese Grundlage gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben. Bitte aus den Behandlungsgrundlagen der Akte neu öffnen."
        />
      )}
    </>
  );
}
