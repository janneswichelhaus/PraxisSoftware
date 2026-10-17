import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Aktionsleiste } from '@/components/ui/Aktionsleiste';
import { Button } from '@/components/ui/Button';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { TextArea } from '@/components/ui/TextArea';
import { PERSONEN_KEY, TEAMCHAT_KEY, fetchPersonen, sendeNachricht, type Person } from './api';
import { NACHRICHT_MAX, erwaehnte } from './erwaehnung';

/**
 * Entwürfe je Gespräch, nur im Arbeitsspeicher dieser Sitzung: Wer am Rad
 * unterbrochen wird und zurückkommt, findet den Text wieder; auf dem Gerät
 * bleibt nichts liegen (ANN-612).
 */
const entwuerfe = new Map<string, string>();

/**
 * Die Eingabe unten im Gespräch (Seitentyp Arbeitsseite, `Aktionsleiste`):
 * das Feld, „@“ für eine Erwähnung und „Senden“ rechts im Daumenbereich.
 * „@“ zeigt sofort das ganze Team - bei drei bis acht Personen ein Tipp statt
 * Tippen (Referenzabgleich TEAM-001).
 */
export function Eingabe({
  kanalId,
  threadId = null,
  beschriftung,
  gesperrt,
}: {
  kanalId: string;
  threadId?: string | null;
  beschriftung: string;
  /** Satz statt Eingabe - archiviert oder die andere Person ist fort. */
  gesperrt?: string | null;
}) {
  const schluessel = `${kanalId}/${threadId ?? ''}`;
  const queryClient = useQueryClient();
  const feld = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(() => entwuerfe.get(schluessel) ?? '');
  const [auswahlOffen, setAuswahlOffen] = useState(false);
  const personen = useQuery({ queryKey: PERSONEN_KEY, queryFn: fetchPersonen, staleTime: 300_000 });

  function aendern(neu: string) {
    setText(neu);
    if (neu) entwuerfe.set(schluessel, neu);
    else entwuerfe.delete(schluessel);
  }

  const senden = useMutation({
    mutationFn: () =>
      sendeNachricht({
        kanalId,
        threadId,
        text,
        erwaehnt: erwaehnte(text, personen.data ?? []),
      }),
    onSuccess: async () => {
      aendern('');
      await queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY });
    },
  });

  function absenden(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || senden.isPending) return;
    senden.mutate();
  }

  function erwaehnen(person: Person) {
    const davor = text === '' || text.endsWith(' ') || text.endsWith('\n') ? '' : ' ';
    aendern(`${text}${davor}@${person.name} `);
    setAuswahlOffen(false);
    feld.current?.focus();
  }

  if (gesperrt) {
    return (
      <Aktionsleiste>
        <p className="text-ink-muted text-liste py-2">{gesperrt}</p>
      </Aktionsleiste>
    );
  }

  // Das Feld wächst mit dem Text, bis sechs Zeilen; darüber rollt es.
  const zeilen = Math.min(6, Math.max(1, text.split('\n').length));
  return (
    <form onSubmit={absenden} aria-label={beschriftung}>
      <Aktionsleiste
        oben={
          <div className="flex flex-col gap-1 px-4 pt-2 sm:px-6 lg:px-8">
            {auswahlOffen ? (
              <ListRows beschriftung="Erwähnen">
                {(personen.data ?? []).map((person) => (
                  <ListRow
                    key={person.staff_member_id}
                    dicht
                    titel={person.name}
                    onClick={() => erwaehnen(person)}
                  />
                ))}
              </ListRows>
            ) : null}
            {senden.isError ? (
              <p role="alert" className="text-danger text-sm">
                {senden.error.message}
              </p>
            ) : null}
            <p className="text-ink-muted text-kleingedruckt">
              Befunde und Diagnosen gehören in die Akte, nicht hierher.
            </p>
          </div>
        }
      >
        <Symbolknopf
          beschriftung="Jemanden erwähnen"
          variant={auswahlOffen ? 'primary' : 'quiet'}
          aria-expanded={auswahlOffen}
          onClick={() => setAuswahlOffen(!auswahlOffen)}
        >
          @
        </Symbolknopf>
        <div className="min-w-0 flex-1">
          <TextArea
            ref={feld}
            label={beschriftung}
            labelVersteckt
            placeholder="Nachricht"
            value={text}
            maxLength={NACHRICHT_MAX}
            rows={zeilen}
            className="resize-none py-2.5"
            onChange={(e) => aendern(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) absenden();
            }}
          />
        </div>
        <Button type="submit" disabled={!text.trim() || senden.isPending}>
          {senden.isPending ? 'Wird gesendet …' : 'Senden'}
        </Button>
      </Aktionsleiste>
    </form>
  );
}
