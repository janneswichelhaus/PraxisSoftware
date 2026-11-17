import { Link } from 'react-router-dom';
import { Aufklappzeichen, Disclosure } from '@/components/ui/Card';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Zaehlmarke } from '@/components/ui/Zaehlmarke';
import { textlinkKlassen } from '@/components/ui/buttonStile';
import type { CurrentUser } from '@/features/core/session/types';
import { useTeamchatZaehler } from '@/features/teamchat/zaehler';
import { arbeitsbereiche, type Arbeitsbereich } from './navigation';

/**
 * Alle Arbeitsbereiche als Ziel von „Mehr" in der Tableiste: Auf schmalen Geräten passen nicht alle
 * in die Leiste. Je Bereich eine Karte; wer Reiter hat, klappt sie erst auf Tipp auf (Jannes
 * 2026-11-17), wer keine hat, führt direkt hin. Die Zahl steht am Bereich und am Reiter mit Neuem.
 */
export function BereichePage({ user }: { user: CurrentUser }) {
  const bereiche = arbeitsbereiche(user);
  const teamchatNeu = useTeamchatZaehler(user);
  const neu = (ziel: string) => (ziel === '/team' ? teamchatNeu : 0);

  return (
    <>
      <PageHeader title="Alle Bereiche" />

      <ul aria-label="Bereiche" className="flex flex-col gap-2">
        {bereiche.map((bereich) => (
          <li key={bereich.id}>
            {bereich.unterpunkte.length > 1 ? (
              <Disclosure
                inKarte
                zeichenAmEnde
                summary={<Bereichskopf bereich={bereich} neu={neu(bereich.to)} />}
              >
                <ListRows rahmen={false} beschriftung={`${bereich.label}: Seiten`}>
                  {bereich.unterpunkte.map((punkt) => (
                    <ListRow
                      key={punkt.to}
                      to={punkt.to}
                      titel={
                        <span className="inline-flex items-center gap-2 font-normal">
                          {punkt.label}
                          <Zaehlmarke anzahl={neu(punkt.to)} />
                        </span>
                      }
                      pfeil
                    />
                  ))}
                </ListRows>
              </Disclosure>
            ) : (
              <Link
                to={bereich.to}
                className="rounded-card border-line bg-surface hover:bg-surface-sunken flex min-h-13 items-center gap-2 border px-4 py-1 transition-colors"
              >
                <Bereichskopf bereich={bereich} neu={neu(bereich.to)} />
                <span className="text-ink-muted ml-auto inline-flex">
                  <Aufklappzeichen offen={false} />
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>

      {/* Vorschauen stehen in den Untermenüs; der Weg zum Protokoll steht jeder Rolle offen. */}
      <Kleingedrucktes className="mt-8">
        Vorschauen speichern nichts; was dort simuliert wurde, steht im{' '}
        <Link to="/vorschau/protokoll" className={textlinkKlassen()}>
          Vorschau-Protokoll
        </Link>
        .
      </Kleingedrucktes>
    </>
  );
}

function Bereichskopf({ bereich, neu }: { bereich: Arbeitsbereich; neu: number }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="text-ink-muted">{bereich.icon}</span>
      <span className="text-ink text-liste min-w-0 font-medium">{bereich.label}</span>
      <Zaehlmarke anzahl={neu} />
    </span>
  );
}
