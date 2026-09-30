import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { fetchDayPlan, rufnummern } from '@/features/today/api';
import { BEREICHE } from '@/lib/begriffe';
import { mitRueckweg } from '@/lib/rueckweg';
import { dayKey, recordNoShow, type Appointment } from './api';

/**
 * Das Protokoll aus Hausbesuch-Szenario 2 (CAL-018, ADR-018 Fassung 3
 * Punkt 9), in der Reihenfolge, in der es vor der Tür abläuft: klingeln,
 * warten, anrufen. Drei Schritte, die nur gemeinsam gelten - und die
 * deshalb einzeln bestätigt werden, denn aus ihnen entsteht eine Forderung
 * gegen eine Patientin.
 */
const PROTOKOLLSCHRITTE = [
  { id: 'geklingelt', label: 'An der Tür geklingelt' },
  { id: 'gewartet', label: '15 Minuten vor Ort gewartet' },
  { id: 'angerufen', label: 'Telefonisch angerufen' },
] as const;

/** Wo das Ausfallhonorar erfasst wird (TER-10). */
const HONORAR_ERFASSUNG = `Wird unter ${BEREICHE.abrechnung.label} → Leistungen erfasst.`;

/**
 * Die Rufnummern der Patient:in für den dritten Schritt (UX-005b).
 *
 * Der Termin selbst trägt keine Rufnummer - die Sicht ist organisatorisch
 * knapp gehalten. Die Tagesliste (`list_day_plan`, UX-001) hat sie, und zwar
 * genau für diesen Zweck: den Besuch, der an der Tür zu scheitern droht.
 * Gelesen wird sie erst, wenn der Ablauf offen ist, und unter demselben
 * Schlüssel wie in der Übersicht - wer von dort kommt, wartet nicht.
 */
function Rufnummern({ appointment }: { appointment: Appointment }) {
  const tag = dayKey(appointment.starts_at, appointment.organization_time_zone);
  const { data, isPending, isError } = useQuery({
    queryKey: ['day-plan', tag, appointment.staff_member_id],
    queryFn: () => fetchDayPlan(tag, appointment.staff_member_id),
    retry: false,
  });

  if (isPending) {
    return <span className="text-ink-muted text-sm">Rufnummer wird geladen …</span>;
  }
  const eintrag = data?.find((termin) => termin.id === appointment.id);
  const nummern = eintrag ? rufnummern(eintrag) : [];
  if (isError || nummern.length === 0) {
    return (
      <span className="text-ink-muted text-sm">
        {isError ? 'Die Rufnummer konnte nicht geladen werden. ' : 'Keine Rufnummer hinterlegt. '}
        {appointment.patient_id ? (
          <Textlink to={`/patienten/${appointment.patient_id}/stammdaten`}>
            Zu den Stammdaten
          </Textlink>
        ) : null}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-2">
      {nummern.map((nummer) => (
        <a key={nummer.label} href={nummer.href} className={kartenAktionKlassen()}>
          <span className="text-ink-muted">{nummer.label}</span>
          <span className="tabular-nums">{nummer.anzeige}</span>
        </a>
      ))}
    </span>
  );
}

/**
 * „Niemand öffnet?" - der geführte Ablauf am Hausbesuch (UX-005b, CAL-018).
 *
 * ADR-018 Fassung 3 Punkt 9 verlangt, dass die Oberfläche **erklärend** durch
 * die Szenarien führt: welcher Fall vorliegt, was daraus folgt, welche Angabe
 * fehlt. Bis UX-005b stand dafür ein Kasten mit vier Fällen samt Erklärung
 * offen auf jeder Hausbesuchsseite - auch dann, wenn die Tür wie fast immer
 * aufging. Jannes: „Der gesamte Block kann erstmal minimiert werden. Ein
 * Button könnte genügen. Dahinter ein Flussdiagramm, das durch die Schritte
 * führt."
 *
 * Genau das: Der Regelfall ist der Hauptknopf „Dokumentieren und abschließen"
 * daneben. Dieser Knopf öffnet den Ablauf für den Fall, dass niemand
 * aufmacht - drei Schritte in ihrer Reihenfolge, die Rufnummer beim dritten,
 * dann der Vermerk mit seiner Folge. Darunter die beiden anderen Fälle mit je
 * einem Satz: die geöffnete Tür ohne Behandlung und die Absage vorher.
 *
 * Der Vermerk verlangt alle drei Schritte (Pflichtangabe nach ADR-018 Punkt
 * 9); ohne sie schreibt die Seite nichts und sagt, was fehlt. Eine weitere
 * Rückfrage gibt es nicht mehr: Die drei Haken sind die Bestätigung, und ein
 * Irrtum lässt sich über „Termin wieder öffnen" zurücknehmen. Verbindlich
 * prüft der Server (`record_no_show`, ADR-004).
 */
export function HomeVisitFlow({
  appointment,
  eingehend,
  darfDokumentieren,
  melden,
}: {
  appointment: Appointment;
  /** Der Rückweg der Seite - für den Abschluss ohne Behandlung. */
  eingehend: string;
  darfDokumentieren: boolean;
  melden: (text: string) => void;
}) {
  const queryClient = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [schritte, setSchritte] = useState<Record<string, boolean>>({});
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const bereichId = useId();

  const vermerken = useMutation({
    mutationFn: () => recordNoShow(appointment.id, appointment.updated_at, true),
    onSuccess: () => {
      for (const queryKey of [['appointment', appointment.id], ['appointments'], ['day-plan']]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      melden('Als „nicht angetroffen“ vermerkt – das Ausfallhonorar ist vorgemerkt.');
    },
  });

  function absenden() {
    if (!PROTOKOLLSCHRITTE.every((schritt) => schritte[schritt.id])) {
      setFehler('Bitte alle drei Schritte des Protokolls bestätigen.');
      return;
    }
    setFehler(undefined);
    if (vermerken.isPending) return;
    vermerken.mutate();
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        aria-expanded={offen}
        aria-controls={bereichId}
        onClick={() => setOffen((bisher) => !bisher)}
      >
        Niemand öffnet?
      </Button>

      {offen ? (
        <section
          id={bereichId}
          aria-label="Niemand öffnet?"
          // Ein Kasten wie die Rückfrage: eine Karte, keine Schaltfläche
          // (DS-001), über die ganze Breite unter der Knopfreihe.
          className="border-line-strong bg-surface-sunken rounded-card order-last w-full border p-5"
        >
          <p className="text-ink text-sm">
            Drei Schritte, jeder bestätigt. Danach gilt der Termin als „nicht angetroffen“ und löst
            ein Ausfallhonorar aus.
          </p>

          {/* Die Schritte als Reihe: Nummer, Schritt, Haken. Die Nummer ist
              Bild, die Reihenfolge steht in der Liste selbst. */}
          <ol className="mt-3 flex flex-col gap-1">
            {PROTOKOLLSCHRITTE.map((schritt, index) => (
              <li key={schritt.id} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="bg-accent text-surface rounded-pill mt-2.5 inline-flex size-6 shrink-0 items-center justify-center text-xs font-bold"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Checkbox
                    label={schritt.label}
                    checked={schritte[schritt.id] ?? false}
                    onChange={(e) => {
                      setSchritte((bisher) => ({ ...bisher, [schritt.id]: e.target.checked }));
                      setFehler(undefined);
                    }}
                  />
                  {schritt.id === 'angerufen' ? (
                    <div className="mb-2 ml-8">
                      <Rufnummern appointment={appointment} />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          {fehler ? (
            <Statusmeldung ton="fehler" className="mt-2">
              {fehler}
            </Statusmeldung>
          ) : vermerken.isError ? (
            <Statusmeldung ton="fehler" className="mt-2">
              {vermerken.error.message}
            </Statusmeldung>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" disabled={vermerken.isPending} onClick={absenden}>
              {vermerken.isPending ? 'Wird vermerkt …' : 'Als „nicht angetroffen“ vermerken'}
            </Button>
            <span className="text-ink-muted text-sm">
              Keine Behandlung, keine Dokumentation, keine verbrauchte Leistung. {HONORAR_ERFASSUNG}
            </span>
          </div>

          {/* Die beiden anderen Fälle, je mit ihrer Folge (ADR-018 Punkt 9):
              Wer hier steht, hat die Tür vor sich - die Frage ist nur, was
              dahinter passiert ist. */}
          <div className="border-line mt-4 border-t pt-3">
            <p className="text-ink text-sm font-medium">Tür geöffnet, aber keine Behandlung?</p>
            <p className="text-ink-muted mt-1 max-w-prose text-sm">
              Dann gilt der Termin als durchgeführt und wird normal abgerechnet; ein Ausfallhonorar
              entsteht nicht. Die Dokumentation trägt dazu einen Pflichtvermerk.
            </p>
            {darfDokumentieren ? (
              <div className="mt-2">
                <ButtonLink
                  to={mitRueckweg(
                    `/termine/${appointment.id}/abschluss?ohne-behandlung=1`,
                    eingehend,
                  )}
                  variant="secondary"
                  groesse="kompakt"
                >
                  Ohne Behandlung abschließen
                </ButtonLink>
              </div>
            ) : null}
            <p className="text-ink-muted mt-3 max-w-prose text-sm">
              Vorher abgesagt? Dann „Termin absagen“ – bei einem Eingang unter 24 Stunden merkt die
              Anwendung das Ausfallhonorar von selbst vor.
            </p>
          </div>
        </section>
      ) : null}
    </>
  );
}
