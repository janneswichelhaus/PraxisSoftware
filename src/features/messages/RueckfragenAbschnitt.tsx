import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/Feedback';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { fetchRueckfragen, rueckfragenKey, type Verhaeltnisart } from './api';
import { RueckfragenListe } from './RueckfragenListe';

/**
 * Rückfragen an der Akte bzw. am Trainingsverhältnis (KOM-002, KOM-003): die
 * Vorgänge dieses einen Verhältnisses, erledigte eingeschlossen. Die Akte
 * und das Trainingsverhältnis haben je einen eigenen Abschnitt, nie einen
 * gemeinsamen (§4.8, DSN-001 Abschnitt 6).
 */
export function RueckfragenAbschnitt({
  art,
  verhaeltnisId,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
}) {
  return (
    <Section
      titel="Rückfragen"
      hinweis="Fragen über die Plattform. Öffnen zeigt den Verlauf und die Antwort."
    >
      <RueckfragenListe
        art={art}
        verhaeltnisId={verhaeltnisId}
        mitErledigten
        mitName={false}
        leer="Noch keine Rückfrage über die Plattform."
      />
    </Section>
  );
}

/** Der Bereich als Wort und das Ziel seiner Liste. */
const BEREICH: Record<Verhaeltnisart, { wort: string; ziel: string }> = {
  treatment: { wort: 'Behandlung', ziel: '/rueckfragen' },
  // Im Training stehen sie bei den Trainingskund:innen (DSN-001 D1).
  training: { wort: 'Training', ziel: '/training' },
};

/**
 * „Rückfragen von der Plattform" in Offene Punkte (KOM-002, ANN-309): wie
 * viele offen sind und wie viele davon überfällig - die Zusage an die
 * Patient:innen wird hier überwacht, nicht durch eine Benachrichtigung. Je
 * Bereich, den die Rolle liest, eine Zeile, die zur Liste führt; ohne offene
 * Rückfrage keine Gruppe. Verbindlich zählt der Server. Die Zeilen nennen
 * keinen Namen und keinen Text - gelesen wird erst beim Öffnen (ADR-010).
 */
export function OffeneRueckfragen({ bereiche }: { bereiche: Verhaeltnisart[] }) {
  const { data, isError, refetch } = useQuery({
    queryKey: rueckfragenKey(null, null, false),
    queryFn: () => fetchRueckfragen(null),
    retry: false,
  });
  if (isError && !data) {
    return (
      <Section titel="Rückfragen von der Plattform">
        <ErrorState
          title="Die Rückfragen konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => refetch()}
        />
      </Section>
    );
  }
  if (!data) return null;
  const zeilen = bereiche
    .map((art) => {
      const offen = data.filter((z) => z.relationship_kind === art && z.status === 'open');
      return { art, offen: offen.length, ueberfaellig: offen.filter((z) => z.overdue).length };
    })
    .filter((zeile) => zeile.offen > 0);
  if (zeilen.length === 0) return null;

  return (
    <Listenabschnitt
      titel="Rückfragen von der Plattform"
      anzahl={zeilen.reduce((summe, zeile) => summe + zeile.offen, 0)}
    >
      {zeilen.map(({ art, offen, ueberfaellig }) => (
        <ListRow
          key={art}
          titel={BEREICH[art].wort}
          meta={`${offen} offen${ueberfaellig > 0 ? `, davon ${ueberfaellig} überfällig` : ''}.`}
          status={ueberfaellig > 0 ? <Badge ton="warnung">überfällig</Badge> : undefined}
          to={BEREICH[art].ziel}
        />
      ))}
    </Listenabschnitt>
  );
}

/**
 * Offene Rückfragen aus dem Training bei den Trainingskund:innen (KOM-003,
 * DSN-001 D1 b): Die Trainingsbetreuung öffnet „Offene Punkte" nicht, also
 * stehen sie hier - nur, wenn es welche gibt. Das Büro sieht alle (BEF-137)
 * und antwortet auf Termin, Rechnung und Sonstiges (ANN-311 Fassung 3);
 * verbindlich entscheidet der Server.
 */
export function TrainingRueckfragen() {
  const { data } = useQuery({
    queryKey: rueckfragenKey('training', null, false),
    queryFn: () => fetchRueckfragen('training'),
    retry: false,
  });
  if (!data || data.length === 0) return null;
  return (
    <div className="mb-6">
      <Section titel={`Rückfragen von der Plattform (${data.length})`}>
        <RueckfragenListe art="training" leer="" nurWennVorhanden />
      </Section>
    </div>
  );
}
