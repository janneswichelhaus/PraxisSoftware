import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { fetchPatientAppointments, todayInTimeZone } from '@/features/appointments/api';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import type { Erhebung } from './api';
import { Ereignisliste, Messreihenbild } from './Messreihenbild';
import type { ScoreDefinition } from './schema';
import {
  EREIGNISARTEN,
  NOTIZ_MAX,
  ereignisartTexte,
  ereignisEntfernen,
  ereignisseQueryKey,
  ereignisSetzen,
  fetchEreignisse,
  messreihen,
  type Ereignisart,
} from './verlauf';

/** Zustände eines Termins, an dem behandelt wurde. */
const DURCHGEFUEHRT = new Set(['completed', 'documented', 'invoiced']);

/**
 * Der Messverlauf im Befund (FRB-002e): Messwerte, Ereignisse, Termine.
 *
 * „Messverlauf" und nicht „Verlauf" (BEF-16): Der Aktenbereich mit der
 * Dokumentation heißt „Behandlungsverlauf", und wer die Schmerzwerte über
 * die Zeit sucht, soll nicht dort landen.
 *
 * Die Termine kommen aus demselben Lesepfad wie der Terminbereich der Akte
 * (ohne Anschrift, ohne klinischen Inhalt), die letzten 50.
 *
 * Gesagt wird nur, was geladen ist (BEF-13, ZST-09): Während die Ereignisse
 * laden, steht kein „Noch kein Ereignis vermerkt."; fehlen die Termine, steht
 * das da, statt dass die Striche an der Zeitachse still ausbleiben.
 */
export function VerlaufAbschnitt({
  patientId,
  erhebungen,
  instrumente,
  darfSetzen,
  zeitzone,
}: {
  patientId: string;
  erhebungen: readonly Erhebung[];
  instrumente: readonly ScoreDefinition[];
  darfSetzen: boolean;
  zeitzone: string | null;
}) {
  const ereignisse = useQuery({
    queryKey: ereignisseQueryKey(patientId),
    queryFn: () => fetchEreignisse(patientId),
  });
  const termine = useQuery({
    queryKey: ['verlauf-termine', patientId],
    queryFn: () => fetchPatientAppointments(patientId, { kuenftig: false, limit: 50 }),
    retry: false,
  });

  const queryClient = useQueryClient();
  const entfernen = useMutation({
    mutationFn: (id: string) => ereignisEntfernen(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ereignisseQueryKey(patientId) }),
  });

  const reihen = messreihen(erhebungen, instrumente);
  const termintage = (termine.data ?? [])
    .filter((t) => DURCHGEFUEHRT.has(t.status))
    .map((t) =>
      zeitzone ? todayInTimeZone(zeitzone, new Date(t.starts_at)) : t.starts_at.slice(0, 10),
    );

  return (
    <Section
      titel="Messverlauf"
      hinweis="Die Werte der abgeschlossenen Bögen als Punkte, ohne Linie und ohne Trend. Senkrechte Linien sind Ereignisse, Striche an der Zeitachse durchgeführte Termine."
    >
      {ereignisse.isPending ? (
        <LoadingState label="Ereignisse werden geladen …" />
      ) : ereignisse.data === undefined ? (
        <ErrorState
          title="Die Ereignisse im Verlauf konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => ereignisse.refetch()}
        />
      ) : (
        <>
          {ereignisse.isError ? (
            <Statusmeldung ton="warnung" className="mb-4">
              Die Ereignisse konnten nicht aktualisiert werden; gezeigt wird der zuletzt geladene
              Stand.
            </Statusmeldung>
          ) : null}
          {termine.isError ? (
            <Statusmeldung ton="warnung" className="mb-4">
              Die Termine konnten nicht geladen werden; die Striche an der Zeitachse fehlen.
            </Statusmeldung>
          ) : null}
          {reihen.length === 0 ? (
            <p className="text-ink-muted text-sm">
              Noch kein abgeschlossener Bogen mit Skalenwerten.
            </p>
          ) : (
            // Ab 1024 px zwei Bilder nebeneinander (BEF-20): Einspaltig blieb
            // am Bildschirm rechts die halbe Breite leer.
            <div className="grid gap-6 lg:grid-cols-2">
              {reihen.map((reihe) => (
                <Messreihenbild
                  key={`${reihe.instrument.meta.id}.${reihe.item.id}`}
                  reihe={reihe}
                  ereignisse={ereignisse.data}
                  termine={termintage}
                />
              ))}
            </div>
          )}
          <Section ebene={3} titel="Ereignisse">
            <Ereignisliste
              ereignisse={ereignisse.data}
              onEntfernen={darfSetzen ? (e) => entfernen.mutateAsync(e.id) : undefined}
            />
          </Section>
          {darfSetzen ? (
            <Section ebene={3} titel="Ereignis vermerken">
              <EreignisSetzen patientId={patientId} zeitzone={zeitzone} />
            </Section>
          ) : null}
        </>
      )}
    </Section>
  );
}

/** Der Verlustschutz des kleinen Formulars (ZST-05): ohne Entwurf nur Verwerfen oder Bleiben. */
const EREIGNISTEXTE: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungespeichertes Ereignis',
};

/**
 * Ein Ereignis vermerken.
 *
 * **Ohne Vorauswahl der Art (BEF-14).** Bis UXR-009 stand das Feld auf
 * „Operation", und wer nur Tag und Notiz ausfüllte, legte eine Operation an,
 * die es nie gab - genau die Falschangabe, die die Seitenwahl (ANN-129) und
 * der Bericht (ANN-122) durch fehlende Vorauswahl verhindern. Fehlen Tag oder
 * Art, sagt das Feld es, statt dass „Vermerken" stumm gesperrt bleibt.
 */
function EreignisSetzen({ patientId, zeitzone }: { patientId: string; zeitzone: string | null }) {
  const queryClient = useQueryClient();
  const [heute] = useState(() => (zeitzone ? todayInTimeZone(zeitzone) : ''));
  const [datum, setDatum] = useState(heute);
  const [art, setArt] = useState<Ereignisart | ''>('');
  const [notiz, setNotiz] = useState('');
  const [fehler, setFehler] = useState<{ datum?: string | undefined; art?: string | undefined }>(
    {},
  );

  const ungespeichert = art !== '' || notiz.trim() !== '' || datum !== heute;
  const { schutz } = useTextverlustschutz({ ungespeichert, texte: EREIGNISTEXTE });

  const setzen = useMutation({
    mutationFn: (gewaehlt: Ereignisart) =>
      ereignisSetzen({ patientId, datum, art: gewaehlt, notiz }),
    onSuccess: async () => {
      setDatum(heute);
      setArt('');
      setNotiz('');
      await queryClient.invalidateQueries({ queryKey: ereignisseQueryKey(patientId) });
    },
  });

  function absenden(event: FormEvent) {
    event.preventDefault();
    if (setzen.isPending) return;
    const neu = {
      ...(datum === '' ? { datum: 'Bitte den Tag angeben.' } : {}),
      ...(art === '' ? { art: 'Bitte die Art wählen.' } : {}),
    };
    setFehler(neu);
    if (art === '' || datum === '') return;
    setzen.mutate(art);
  }

  return (
    <form onSubmit={absenden} noValidate className="flex max-w-xl flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Tag"
          type="date"
          value={datum}
          required
          error={fehler.datum}
          onChange={(e) => {
            setDatum(e.target.value);
            setFehler((bisher) => ({ ...bisher, datum: undefined }));
          }}
        />
        <Select
          label="Art"
          value={art}
          required
          error={fehler.art}
          onChange={(e) => {
            setArt(e.target.value as Ereignisart | '');
            setFehler((bisher) => ({ ...bisher, art: undefined }));
          }}
        >
          <option value="">Bitte wählen</option>
          {EREIGNISARTEN.map((a) => (
            <option key={a} value={a}>
              {ereignisartTexte[a]}
            </option>
          ))}
        </Select>
      </div>
      <Field
        label="Notiz (optional)"
        hint="Kurz, etwa „Knie-TEP rechts“ oder „zwei Wochen Grippe“."
        maxLength={NOTIZ_MAX}
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
      />
      {setzen.isError ? <Statusmeldung ton="fehler">{setzen.error.message}</Statusmeldung> : null}
      {schutz}
      <div>
        <Button type="submit" variant="secondary" disabled={setzen.isPending}>
          {setzen.isPending ? 'Wird vermerkt …' : 'Vermerken'}
        </Button>
      </div>
    </form>
  );
}
