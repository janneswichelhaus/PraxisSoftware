import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { fetchPatient, fullName } from '@/features/patients/api';
import { Patientensuche } from '@/features/patients/Patientensuche';
import { canWriteTreatmentBases, type CurrentUser } from '@/features/session/types';
import { grundlageBezeichnung } from '@/features/treatment-bases/api';
import {
  eindeutigeGrundlage,
  useVerordnungenDerAkte,
  zustandLabels,
  type VerordnungMitZahlen,
} from '@/features/treatment-bases/grundlagen';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import { leseTerminVorbelegung, schreibeTerminVorbelegung } from './api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Dauertermin aus dem Kalender, wenn die Zeit feststeht und die Person noch
 * nicht (BEF-042).
 *
 * Bis UX-002j war „Dauertermin" im Anlegen-Menü ausgegraut, solange der
 * Kalender nicht auf eine Patient:in gefiltert war — der neue Termin dagegen
 * fragte im Formular nach der Person. Jetzt gehen beide Wege gleich: Zeit
 * markieren, dann die Person, dann, wenn nötig, die Grundlage.
 *
 * Fachlich bleibt die Serie an einer Behandlungsgrundlage, weil deren
 * Kontingent die Anzahl vorgibt (CAL-007, ADR-020). Diese Seite ändert nur
 * die Reihenfolge der Fragen und führt dann auf die eine Serienseite — einen
 * zweiten Anlageweg gibt es nicht.
 *
 * **Person und Rückweg reisen mit (KAL-05).** Die behandelnde Person der
 * angetippten Spalte geht wie beim neuen Termin an die Serienseite, und der
 * Kalenderstand als Rückweg ebenso. Der Abstecher „Grundlage erfassen" kehrt
 * hierher zurück - samt Zeit und Person (VER-05).
 */
export function DauerterminStartPage({ user }: { user: CurrentUser }) {
  const [suche, setSuche] = useSearchParams();
  const ort = useLocation();
  const vorbelegung = leseTerminVorbelegung(suche);
  const gewaehlt = suche.get('patient');
  const patientId = gewaehlt && UUID.test(gewaehlt) ? gewaehlt : null;
  // Der Rückweg des Aufrufers - meist der Kalenderstand (KAL-05).
  const rueckweg = leseRueckweg(suche, '');

  // Tag, Beginn und die Person der Spalte reisen weiter; die Länge nicht, sie
  // steht beim Behandlungstermin im Terminfenster (wie auf der Serienseite).
  const anhang = schreibeTerminVorbelegung({
    ...(vorbelegung.datum ? { datum: vorbelegung.datum } : {}),
    ...(vorbelegung.beginn ? { beginn: vorbelegung.beginn } : {}),
    ...(vorbelegung.person ? { person: vorbelegung.person } : {}),
  });

  // Die gewählte Person steht in der Adresse: neu laden und Zurück behalten
  // sie, und „Andere Patient:in" ist nur ein Parameter weniger.
  function waehlePatient(id: string | null) {
    const naechste = new URLSearchParams(suche);
    if (id) naechste.set('patient', id);
    else naechste.delete('patient');
    setSuche(naechste);
  }

  // „Uhr" nur mit einem Beginn - ohne ihn stand „28.09.2026 Uhr" da (KAL-10).
  const zeit = vorbelegung.datum
    ? `${formatDate(vorbelegung.datum)}${vorbelegung.beginn ? `, ab ${vorbelegung.beginn} Uhr` : ''}`
    : vorbelegung.beginn
      ? `ab ${vorbelegung.beginn} Uhr`
      : null;

  return (
    <>
      {/* Der Weg zurück, meist in den Kalenderstand (KAL-19). */}
      <Rueckweg standard="/kalender" />

      <PageHeader
        title={`${BEGRIFFE.dauertermin} anlegen`}
        description="Zuerst die Patient:in, dann die Behandlungsgrundlage. Rhythmus und Anzahl folgen im nächsten Schritt."
      />

      {zeit ? (
        <Section titel="Aus dem Kalender übernommen">
          <DetailList>
            <DetailRow label="Erster Termin">{zeit}</DetailRow>
          </DetailList>
        </Section>
      ) : null}

      {patientId === null ? (
        <Section titel="Patient:in">
          <div className="max-w-md">
            <Patientensuche label="Patient:in suchen" labelSichtbar onAuswahl={waehlePatient} />
          </div>
        </Section>
      ) : (
        <Grundlagenwahl
          patientId={patientId}
          user={user}
          anhang={anhang}
          rueckweg={rueckweg}
          hierher={`${ort.pathname}${ort.search}`}
          zurueck={() => waehlePatient(null)}
        />
      )}
    </>
  );
}

/** Der zweite Schritt, sobald die Person feststeht. */
function Grundlagenwahl({
  patientId,
  user,
  anhang,
  rueckweg,
  hierher,
  zurueck,
}: {
  patientId: string;
  user: CurrentUser;
  anhang: string;
  /** Wohin die Serienseite nach dem Anlegen zurückführt (KAL-05). */
  rueckweg: string;
  /** Diese Seite samt Zeit und Person - Rückweg des Abstechers (VER-05). */
  hierher: string;
  zurueck: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    retry: false,
  });
  const { eintraege, isPending, zahlenGeladen, isError } = useVerordnungenDerAkte(patientId, user);
  const serie = (grundlageId: string) =>
    mitRueckweg(`/patienten/${patientId}/verordnungen/${grundlageId}/serie${anhang}`, rueckweg);

  // Erst mit den Zahlen entscheiden: Ohne sie gälte jede Grundlage als offen.
  const eindeutig = !isPending && zahlenGeladen ? eindeutigeGrundlage(eintraege) : null;

  // Steht die Grundlage fest, gibt es nichts zu fragen. `replace`, damit
  // Zurück nicht auf eine Seite führt, die sofort weiterleitet.
  useEffect(() => {
    if (eindeutig) void navigate(serie(eindeutig), { replace: true });
  }, [eindeutig, anhang, rueckweg, navigate]);

  const offen = eintraege.filter((eintrag) => eintrag.zustand === 'offen');
  const weitere = eintraege.filter((eintrag) => eintrag.zustand !== 'offen');

  // Die beiden Lesepfade der Akte noch einmal - dieselben Schlüssel wie in
  // `useVerordnungenDerAkte` (WRT-01, UIK-16).
  function erneutLaden() {
    return Promise.all(
      [
        ['patient-treatment-bases-clinical', patientId],
        ['patient-treatment-bases', patientId],
        ['patient-treatment-basis-slots', patientId],
      ].map((queryKey) => queryClient.refetchQueries({ queryKey })),
    );
  }

  return (
    <Section
      titel={patient.data ? `Grundlage für ${fullName(patient.data)}` : 'Grundlage'}
      aktion={
        <button
          type="button"
          onClick={zurueck}
          className="text-accent inline-flex min-h-11 items-center text-sm hover:underline"
        >
          Andere Patient:in
        </button>
      }
    >
      {isError ? (
        <ErrorState
          title="Die Behandlungsgrundlagen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={erneutLaden}
        />
      ) : isPending || !zahlenGeladen || eindeutig ? (
        <LoadingState label="Behandlungsgrundlagen werden geladen …" />
      ) : eintraege.length === 0 ? (
        // Der Weg zur Grundlage steht im Leerzustand selbst (UIK-16) - und
        // nur für die Rollen, die sie erfassen dürfen: Das Praxismanagement
        // wurde bisher ins Formular geführt und dort abgewiesen (VER-04,
        // ANN-011). Verbindlich prüft weiterhin die Datenbank.
        <EmptyState
          title="Keine Behandlungsgrundlage"
          description={
            canWriteTreatmentBases(user.roles)
              ? 'Eine Terminserie hängt an einer Verordnung oder Selbstzahler-Vereinbarung. Zuerst eine erfassen.'
              : 'Eine Terminserie hängt an einer Verordnung oder Selbstzahler-Vereinbarung. Behandlungsgrundlagen erfassen Praxisinhaber:in, Therapeut:innen und Teamleitung.'
          }
          aktion={
            canWriteTreatmentBases(user.roles) ? (
              <ButtonLink
                to={mitRueckweg(`/patienten/${patientId}/verordnungen/neu`, hierher)}
                variant="secondary"
              >
                Grundlage erfassen
              </ButtonLink>
            ) : null
          }
        />
      ) : (
        <>
          {offen.length > 0 ? (
            <Grundlagenliste eintraege={offen} ziel={serie} label="Offene Grundlagen" />
          ) : (
            <p className="text-ink-muted max-w-prose text-sm">
              Keine Grundlage hat noch etwas zu planen. Eine Serie darüber hinaus ist möglich; die
              nächste Seite zeigt, was ungedeckt bleibt.
            </p>
          )}
          {weitere.length > 0 ? (
            // Was selten gebraucht wird, steht eingeklappt (Bedienprinzipien,
            // UX-EPIC-002). Ohne offene Grundlage ist es das einzige Angebot
            // und steht deshalb offen. Der Aufklapper des Systems, mit Zeichen
            // und 44 px Kopf (RSP-07, UIK-07).
            <div className="mt-4">
              <Disclosure
                summary={`Verplante und ausgeschöpfte (${weitere.length})`}
                offen={offen.length === 0}
              >
                <Grundlagenliste
                  eintraege={weitere}
                  ziel={serie}
                  label="Verplante und ausgeschöpfte Grundlagen"
                />
              </Disclosure>
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}

function Grundlagenliste({
  eintraege,
  ziel,
  label,
}: {
  eintraege: readonly VerordnungMitZahlen[];
  ziel: (grundlageId: string) => string;
  label: string;
}) {
  return (
    <ul aria-label={label} className="divide-line border-line max-w-xl divide-y border-y">
      {eintraege.map(({ verordnung, kontingent, zustand }) => {
        const { bauart, praeposition } = grundlageBezeichnung(verordnung);
        const rest = kontingent?.remaining ?? 0;
        return (
          <li key={verordnung.id}>
            <Link
              to={ziel(verordnung.id)}
              className="hover:bg-surface-sunken flex min-h-11 flex-col justify-center px-1 py-2.5"
            >
              <span className="text-ink text-liste">
                {bauart} {praeposition} {formatDate(verordnung.issued_on)}
              </span>
              <span className="text-ink-muted text-sm">
                {[
                  verordnung.prescriber_name,
                  // Das Kontingent zählt Termine (ANN-064, VER-08).
                  zustand === 'offen'
                    ? `noch ${rest} ${rest === 1 ? 'Termin' : 'Termine'} zu planen`
                    : zustandLabels[zustand],
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
