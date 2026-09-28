import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hinweisfenster } from '@/components/ui/Dialogfenster';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { vorgangAusPfad } from '@/lib/abstecher';
import { alsFormularfehler } from '@/lib/formularfehler';
import { leseRueckweg } from '@/lib/rueckweg';
import { useSession } from '@/features/auth/sessionContext';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import { PrescriberFormFields } from './PrescriberFormFields';
import { VERORDNER_BESCHRIFTUNG, VERORDNER_REIHENFOLGE, verordnerFeldId } from './verordnerfelder';
import {
  VerordnerBereitsVorhanden,
  createPrescriber,
  entwurfVerordnerNachtragen,
  fetchPrescriber,
  leereVerordnerdaten,
  prescriberName,
  prescriberSchemaForm,
  prescriberToFormValues,
  updatePrescriber,
  type Prescriber,
  type PrescriberFeld,
  type PrescriberValues,
} from './api';

/** Die Kartei der Verordner:innen - das Ziel, wenn kein gültiger Rückweg mitkam. */
const KARTEI = '/verordner';

/**
 * Der Feldfehler am Nachnamen, wenn es die Verordner:in schon gibt (VER-02).
 *
 * Der Eindeutigkeitsindex ist die eine Regel, gegen die man beim Anlegen
 * versehentlich läuft (api.ts, `VerordnerBereitsVorhanden`). Die Meldung steht
 * deshalb am Feld und in der Fehlerzusammenfassung - und sagt, was zu tun ist.
 */
const DOPPELT =
  'Diese Verordner:in gibt es schon. Praxis ergänzen oder die vorhandene in der Liste wählen.';

/** Die Sätze des Schutzes vor Eingabeverlust (VER-03, ANN-046). */
const VERLUSTTEXTE: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungespeicherte Angaben zur Verordner:in',
};

/**
 * Der Rückweg aus der Adresszeile (VER-11, NAV-03) - geprüft wie überall.
 *
 * Er ist veränderbar und deshalb nur als Pfad innerhalb der Anwendung
 * zulässig. Bis UXR-007 prüfte diese Seite selbst (`/…`, aber nicht `//…`)
 * und ließ `/\fremder.host` durch - Browser lesen das als fremde Adresse, ein
 * Tipp auf „Zurück" oder „Abbrechen" verließ die Anwendung (offene
 * Weiterleitung). `leseRueckweg` schließt auch Backslash, Steuerzeichen und
 * Überlänge aus; alles andere fällt still auf die Kartei zurück.
 */
function useRueckweg(): string {
  const [params] = useSearchParams();
  return leseRueckweg(params, KARTEI);
}

/** Das Grundlagenformular, aus dem der Abstecher zur Verordner-Anlage kommt (VER-003). */
const GRUNDLAGENFORMULAR = /^\/patienten\/[^/]+\/verordnungen\/(?:neu|[^/]+\/bearbeiten)$/;

/**
 * Beschriftung des Rückwegs, wo der aus dem Pfad abgeleitete Name nicht
 * trifft (VER-11, NAV-16).
 *
 * Aus dem Grundlagenformular geht es dorthin zurück, nicht „zur Akte"; aus der
 * Kartei „zu den Verordner:innen", wie der Eintrag im Untermenü heißt. Jedes
 * andere Ziel - etwa der Kalender, wenn die Kopfsuche die Seite geöffnet hat -
 * benennt der Baustein selbst.
 */
function rueckwegText(zurueck: string): string | undefined {
  const pfad = zurueck.split('?')[0] ?? zurueck;
  if (pfad === KARTEI) return 'Zurück zu den Verordner:innen';
  if (GRUNDLAGENFORMULAR.test(pfad)) return 'Zurück zur Grundlage';
  return undefined;
}

/**
 * Der Rückweg oben links - der Baustein, kein eigener Link mehr.
 *
 * `standard` ist das schon geprüfte Ziel: Der Baustein liest dieselbe
 * Adresszeile mit derselben Prüfung und kommt zum selben Ergebnis. Damit gilt
 * die Beschriftung genau für dieses Ziel, und „Zurück", „Abbrechen" und der
 * Weg nach dem Speichern führen an dieselbe Stelle.
 */
function Rueckwegzeile({ zurueck }: { zurueck: string }) {
  const text = rueckwegText(zurueck);
  return <Rueckweg standard={zurueck} {...(text ? { beschriftung: text } : {})} />;
}

/**
 * Gemeinsames Formular für Anlegen und Ändern einer Verordner:in.
 *
 * Anders als bei den Patientenstammdaten sind die beiden Vorgänge hier bis auf
 * Überschrift und Rücksprungziel gleich; eine zweite Seite wäre eine Kopie
 * ohne eigenen Inhalt. Die Berechtigung prüft in beiden Fällen der Server
 * (ADR-004).
 */
function VerordnerFormular({ bestand, zurueck }: { bestand: Prescriber | null; zurueck: string }) {
  // Der Ausgangsstand: Was davon abweicht, ist noch nicht gespeichert (VER-03).
  const [ausgang] = useState<Record<PrescriberFeld, string>>(() =>
    bestand ? prescriberToFormValues(bestand) : leereVerordnerdaten,
  );
  const [werte, setWerte] = useState(ausgang);
  const [fehler, setFehler] = useState<Partial<Record<PrescriberFeld, string>>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;

  /**
   * Schutz vor Eingabeverlust (VER-03, ZST-05, ANN-046).
   *
   * Tableiste, Seitenleiste, Suche, Rückweg, Browser-Zurück und Neuladen
   * verwarfen zwölf Felder bisher still. Ohne Entwurfszustand bietet die
   * Rückfrage nur „Verwerfen und weitergehen" und „Hier bleiben".
   */
  const ungespeichert = VERORDNER_REIHENFOLGE.some((feld) => werte[feld] !== ausgang[feld]);
  const { freigeben, schutz } = useTextverlustschutz({ ungespeichert, texte: VERLUSTTEXTE });

  const mutation = useMutation({
    mutationFn: async (values: PrescriberValues) => {
      if (bestand) {
        await updatePrescriber(bestand.id, values);
        return bestand.id;
      }
      return createPrescriber(values);
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['prescribers'] });
      if (bestand) {
        await queryClient.invalidateQueries({ queryKey: ['prescriber', bestand.id] });
      } else if (userId) {
        // Kommt die Anlage aus dem Verordnungsformular (VER-003), trägt der
        // Rücksprungpfad die Kennung des Abstechers - darunter liegt der
        // Entwurf, und die neue Verordner:in wird darin nachgetragen. Ohne
        // Kennung (Aufruf direkt aus der Verordnerkartei) ändert sich nichts.
        const vorgang = vorgangAusPfad(zurueck);
        if (vorgang) entwurfVerordnerNachtragen(vorgang, userId, id);
      }
      // Gespeichert: Der eigene Weg zurück ist kein Verlust (ANN-046).
      freigeben();
      void navigate(zurueck, { replace: true });
    },
    onError: (error) => {
      if (error instanceof VerordnerBereitsVorhanden) setFehler({ family_name: DOPPELT });
    },
  });

  function setzen(feld: PrescriberFeld, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Schutz gegen mehrfaches Absenden: solange ein Vorgang läuft, wird kein
    // zweiter gestartet.
    if (mutation.isPending) return;

    const ergebnis = prescriberSchemaForm.safeParse(werte);
    if (!ergebnis.success) {
      const gefunden: Partial<Record<PrescriberFeld, string>> = {};
      for (const problem of ergebnis.error.issues) {
        const feld = problem.path[0] as PrescriberFeld | undefined;
        if (feld && !gefunden[feld]) gefunden[feld] = problem.message;
      }
      setFehler(gefunden);
      return;
    }

    setFehler({});
    mutation.mutate(ergebnis.data);
  }

  const doppelt = mutation.error instanceof VerordnerBereitsVorhanden;

  return (
    <>
      <Rueckwegzeile zurueck={zurueck} />

      <PageHeader
        title={bestand ? 'Verordner:in bearbeiten' : 'Neue:r Verordner:in'}
        description={
          bestand
            ? `${prescriberName(bestand)} · Mit * markierte Felder sind erforderlich.`
            : 'Nur der Nachname ist erforderlich; alles Weitere hilft bei der Folgeverordnung.'
        }
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {/* Ein Speicherfehler als Fenster über dem Formular (VER-02, ZST-10,
            ANN-058): Wer am Seitenende auf „Speichern" tippt, sieht einen
            Kasten am Formularanfang nicht. Die Dublette ist kein solcher
            Fehler - sie steht am Nachnamen und in der Zusammenfassung. */}
        {mutation.isError && !doppelt ? (
          <Hinweisfenster
            titel="Die Verordner:in konnte nicht gespeichert werden."
            onSchliessen={() => mutation.reset()}
          >
            Die Eingaben stehen noch im Formular. Bitte die Verbindung prüfen und erneut speichern.
          </Hinweisfenster>
        ) : null}

        <Fehlerzusammenfassung
          fehler={alsFormularfehler(
            VERORDNER_REIHENFOLGE,
            VERORDNER_BESCHRIFTUNG,
            fehler,
            verordnerFeldId,
          )}
        />

        <PrescriberFormFields werte={werte} fehler={fehler} onChange={setzen} />

        {/* Rückfrage und Hinweise des Schutzes, dort, wo gearbeitet wird. */}
        {schutz}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending
              ? 'Wird gespeichert …'
              : bestand
                ? 'Änderungen speichern'
                : 'Verordner:in anlegen'}
          </Button>
          {/* Ein Seitenwechsel und deshalb ein Link (UIK-13) - der Schutz
              fragt bei ungespeicherten Eingaben wie bei jedem anderen Weg. */}
          <ButtonLink to={zurueck} variant="secondary">
            Abbrechen
          </ButtonLink>
        </div>
      </form>

      <p className="text-ink-muted mt-10 max-w-prose text-xs leading-relaxed">
        Erfasst werden ausschließlich berufliche Kontaktdaten. Kassenmerkmale wie die Arztnummer
        werden nicht gespeichert.
      </p>
    </>
  );
}

export function NewPrescriberPage() {
  // Wer aus dem Verordnungsformular kommt, soll dorthin zurückkehren.
  const zurueck = useRueckweg();
  return <VerordnerFormular bestand={null} zurueck={zurueck} />;
}

export function EditPrescriberPage() {
  const { prescriberId } = useParams<{ prescriberId: string }>();
  const zurueck = useRueckweg();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['prescriber', prescriberId],
    queryFn: () => fetchPrescriber(prescriberId!),
    enabled: Boolean(prescriberId),
    retry: false,
  });

  if (isPending) return <LoadingState label="Verordner:in wird geladen …" />;
  if (data) return <VerordnerFormular bestand={data} zurueck={zurueck} />;

  // Ohne Formular bleibt der Weg zurück - und ein Satz, was zu tun ist (VER-15).
  return (
    <>
      <Rueckwegzeile zurueck={zurueck} />
      <PageHeader title="Verordner:in bearbeiten" />
      {isError ? (
        <ErrorState
          title="Die Verordner:in konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => void refetch()}
        />
      ) : (
        <ErrorState
          title="Nicht gefunden"
          description="Diese Verordner:in gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben. Bitte in der Liste der Verordner:innen neu wählen."
        />
      )}
    </>
  );
}
