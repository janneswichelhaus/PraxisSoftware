import { useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { Textlink } from '@/components/ui/Textlink';
import { FEEDBACK_NAMED_KEY, fetchNamedFeedback, type NamedFeedback } from './api';
import { monatUndJahr } from './fragen';
import { BAROMETER_PFAD, skalenZeile, textZeilen } from './inhalt';

/**
 * Die namentlichen Rückmeldungen für owner (§20.2 Nr. 3): jede als einzelne
 * Nachricht - Name, Monat, Inhalt, die neueste zuerst. Kein Filter nach
 * Person, keine Kurve, keine Zählung je Person; Antworten ohne Namen stehen
 * nur in der Summe unter „Barometer“.
 */
export function NamentlicheRueckmeldungen({ titel = 'Rückmeldungen' }: { titel?: string }) {
  const liste = useQuery({
    queryKey: FEEDBACK_NAMED_KEY,
    queryFn: fetchNamedFeedback,
    retry: false,
  });
  return (
    <Abfragezustand
      abfrage={liste}
      laden="Rückmeldungen werden geladen …"
      fehler="Die Rückmeldungen konnten nicht geladen werden."
    >
      {(eintraege) => (
        <Listenabschnitt
          titel={titel}
          anzahl={eintraege.length}
          aktion={
            <Textlink to={BAROMETER_PFAD} className="text-sm font-semibold">
              Barometer ohne Namen
            </Textlink>
          }
          leer={{ titel: 'Keine Rückmeldungen mit Namen' }}
        >
          {eintraege.map((eintrag) => (
            <ListRow
              key={eintrag.id}
              titel={`${eintrag.name ?? 'Unbekannt'} · ${
                eintrag.kind === 'barometer' ? 'Barometer' : 'Rückmeldung'
              }`}
              meta={<Inhalt eintrag={eintrag} />}
            />
          ))}
        </Listenabschnitt>
      )}
    </Abfragezustand>
  );
}

function Inhalt({ eintrag }: { eintrag: NamedFeedback }) {
  return (
    <>
      <span className="block">{monatUndJahr(eintrag.month)}</span>
      {eintrag.kind === 'barometer' ? (
        <>
          <span className="block">{skalenZeile(eintrag)}</span>
          {textZeilen(eintrag).map(({ kurz, text }) => (
            <span key={kurz} className="text-ink block break-words whitespace-pre-line">
              {`${kurz}: ${text}`}
            </span>
          ))}
        </>
      ) : (
        <span className="text-ink block break-words whitespace-pre-line">
          {eintrag.message_text}
        </span>
      )}
    </>
  );
}
