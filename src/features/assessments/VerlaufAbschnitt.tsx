import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { fetchPatientAppointments, todayInTimeZone } from '@/features/appointments/api';
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
 * Der Verlauf im Befund (FRB-002e): Messwerte, Ereignisse, Termine.
 *
 * Die Termine kommen aus demselben Lesepfad wie der Terminbereich der Akte
 * (ohne Anschrift, ohne klinischen Inhalt), die letzten 50.
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
      titel="Verlauf"
      hinweis="Die Werte der abgeschlossenen Bögen als Punkte, ohne Linie und ohne Trend. Senkrechte Linien sind Ereignisse, Striche an der Zeitachse durchgeführte Termine."
    >
      {ereignisse.isError ? (
        <ErrorState title="Die Ereignisse im Verlauf konnten nicht geladen werden." />
      ) : (
        <div className="flex flex-col gap-6">
          {reihen.length === 0 ? (
            <p className="text-ink-muted text-sm">
              Noch kein abgeschlossener Bogen mit Skalenwerten.
            </p>
          ) : (
            reihen.map((reihe) => (
              <Messreihenbild
                key={`${reihe.instrument.meta.id}.${reihe.item.id}`}
                reihe={reihe}
                ereignisse={ereignisse.data ?? []}
                termine={termintage}
              />
            ))
          )}
          <div>
            <h3 className="text-ink mb-2 text-sm font-semibold">Ereignisse</h3>
            <Ereignisliste
              ereignisse={ereignisse.data ?? []}
              {...(darfSetzen
                ? { onEntfernen: (e: { id: string }) => entfernen.mutate(e.id) }
                : {})}
            />
            {entfernen.isError ? (
              <Statusmeldung ton="fehler">{entfernen.error.message}</Statusmeldung>
            ) : null}
          </div>
          {darfSetzen ? <EreignisSetzen patientId={patientId} zeitzone={zeitzone} /> : null}
        </div>
      )}
    </Section>
  );
}

function EreignisSetzen({ patientId, zeitzone }: { patientId: string; zeitzone: string | null }) {
  const queryClient = useQueryClient();
  const [datum, setDatum] = useState(zeitzone ? todayInTimeZone(zeitzone) : '');
  const [art, setArt] = useState<Ereignisart>('operation');
  const [notiz, setNotiz] = useState('');

  const setzen = useMutation({
    mutationFn: () => ereignisSetzen({ patientId, datum, art, notiz }),
    onSuccess: async () => {
      setNotiz('');
      await queryClient.invalidateQueries({ queryKey: ereignisseQueryKey(patientId) });
    },
  });

  function absenden(event: FormEvent) {
    event.preventDefault();
    if (setzen.isPending || datum === '') return;
    setzen.mutate();
  }

  return (
    <form onSubmit={absenden} noValidate className="flex max-w-xl flex-col gap-3">
      <h3 className="text-ink text-sm font-semibold">Ereignis vermerken</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Tag"
          type="date"
          value={datum}
          required
          onChange={(e) => setDatum(e.target.value)}
        />
        <Select label="Art" value={art} onChange={(e) => setArt(e.target.value as Ereignisart)}>
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
      <div>
        <Button type="submit" variant="secondary" disabled={setzen.isPending || datum === ''}>
          {setzen.isPending ? 'Wird gespeichert …' : 'Vermerken'}
        </Button>
      </div>
    </form>
  );
}
