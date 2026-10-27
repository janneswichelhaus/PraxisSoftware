import { useQuery } from '@tanstack/react-query';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { StatusMark } from '@/components/ui/StatusMark';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { abfragen } from './eingang';
import type { Trainingswiderruf } from './training-withdrawals-api';

/**
 * „Trainingsvertrag widerrufen" in Offene Punkte (KND-004). Die Praxis wickelt
 * ab – Paket entfernen oder stornieren, zurückzahlen, Vertrag beenden
 * (ANN-290). Der Widerruf bleibt, bis das Paket entfernt ist, mindestens
 * 14 Tage (BEF-129, ANN-341). Ohne Widerruf steht hier nichts.
 */
export function TrainingWithdrawals() {
  const { data } = useQuery(abfragen.trainingswiderrufe());
  if (!data || data.length === 0) return null;
  return (
    <Listenabschnitt
      titel="Trainingsvertrag widerrufen"
      anzahl={data.length}
      mehr={
        <Kleingedrucktes>
          Über die Plattform widerrufen. Bitte Paket und Zahlung abwickeln. Ein Widerruf bleibt
          hier, bis sein Paket entfernt ist, mindestens 14 Tage.
        </Kleingedrucktes>
      }
    >
      {data.map((w) => (
        <Zeile key={w.contract_id} widerruf={w} />
      ))}
    </Listenabschnitt>
  );
}

function Zeile({ widerruf: w }: { widerruf: Trainingswiderruf }) {
  const name = [w.family_name, w.given_name].filter(Boolean).join(', ') || 'Unbekannte Person';
  const von =
    w.withdrawn_access_kind === 'legal_representative' && w.withdrawn_representative_name
      ? `von ${w.withdrawn_representative_name} (rechtliche Vertretung)`
      : 'von der Person selbst';
  return (
    <ListRow
      titel={name}
      meta={
        <>
          {w.package_label}: widerrufen am {formatDate(w.withdrawn_on)}, {von}
          <span className="mt-0.5 block">
            {/* Das noch bestehende Paket ist die offene Arbeit (BEF-129):
                Zeichen und Wort; das entfernte steht leise. */}
            {w.package_open ? (
              <StatusMark ton="warnung">Paket besteht noch</StatusMark>
            ) : (
              'Paket entfernt'
            )}
          </span>
        </>
      }
      to={mitRueckweg(`/training/${w.training_relationship_id}`, '/offen')}
    />
  );
}
