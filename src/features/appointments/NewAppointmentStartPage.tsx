import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Textlink } from '@/components/ui/Textlink';
import { Patientensuche } from '@/features/patients/Patientensuche';
import { WaitlistMatches } from '@/features/waitlist/WaitlistMatches';
import { formatDate } from '@/lib/datum';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import {
  appointmentTypeLabels,
  fetchAssignableTherapists,
  leseTerminVorbelegung,
  schreibeTerminVorbelegung,
} from './api';

/** „Datum, Zeit und Terminart" - eine Aufzählung im Satz. */
function aufzaehlung(teile: readonly string[]): string {
  if (teile.length <= 1) return teile.join('');
  return `${teile.slice(0, -1).join(', ')} und ${teile.at(-1)!}`;
}

/** Eine Kennung aus der Adresszeile, wie sie die Patientenanlage zurückgibt. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Termin anlegen, wenn die Zeit schon feststeht und die Person noch nicht
 * (UX-005).
 *
 * Der Einstieg über die Akte kennt den Patienten und fragt nach der Zeit. Der
 * Tap auf eine freie Stelle im Kalender kennt die Zeit und fragt nach dem
 * Patienten - dieselbe Aufgabe von der anderen Seite. Deshalb eine eigene,
 * sehr kleine Seite und kein zweiter Modus im Terminformular: Was hier
 * passiert, ist eine einzige Auswahl.
 *
 * Danach geht es in dasselbe Formular wie sonst, mit derselben Vorbelegung in
 * der Adresszeile. Es gibt bewusst keinen zweiten Anlageweg - `create_appointment`
 * bleibt die eine Serverfunktion, und das Formular bleibt die eine Stelle, an
 * der Raster, Arbeitszeit und Ortslogik zusammenkommen.
 */
export function NewAppointmentStartPage() {
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const vorbelegung = leseTerminVorbelegung(suche);
  const anhang = schreibeTerminVorbelegung(vorbelegung);
  // Der Rückweg des Aufrufers (der Kalender) reist mit ins Formular der
  // gewählten Person, damit das Anlegen dort landet, wo es begann (BEF-016).
  const rueckweg = leseRueckweg(suche, '');
  const formular = (patientId: string) =>
    mitRueckweg(`/patienten/${patientId}/termine/neu${anhang}`, rueckweg || null);

  /**
   * Der Rückweg für den Abstecher „Patient:in anlegen" (UX-012).
   *
   * Er ist diese Seite **samt Vorbelegung** — Datum, Zeit und behandelnde
   * Person stehen darin. Das Anlegen führt hierher zurück und hängt die neue
   * Kennung an; damit ist keine der Angaben verloren, die der Tap auf die
   * freie Stelle im Kalender mitgebracht hat.
   */
  const hierher = mitRueckweg(`/termine/neu${anhang}`, rueckweg || null);

  /**
   * Zurück aus der Patientenanlage: direkt weiter ins Terminformular.
   *
   * Wer gerade eine Person angelegt hat, will keinen zweiten Schritt „jetzt
   * noch auswählen" — sie ist die gesuchte. Die Vorbelegung reist über
   * `anhang` weiter; der Parameter `patient` bleibt dabei von selbst zurück,
   * weil `schreibeTerminVorbelegung` nur die Terminfelder schreibt.
   */
  const neuerPatient = suche.get('patient');
  useEffect(() => {
    if (neuerPatient && UUID.test(neuerPatient)) {
      void navigate(formular(neuerPatient), { replace: true });
    }
  }, [neuerPatient, anhang, rueckweg, navigate]);

  const zeit =
    vorbelegung.beginn && vorbelegung.ende
      ? `${vorbelegung.beginn}–${vorbelegung.ende} Uhr`
      : (vorbelegung.beginn ?? null);

  /**
   * Wer vorbelegt ist, steht mit Namen da (KAL-10): Ein Tipp in die
   * Nachbarspalte fiel bisher erst im Formular auf. Der Name kommt aus dem
   * bestehenden Lesepfad der zuordenbaren Personen.
   */
  const personen = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    enabled: Boolean(vorbelegung.person),
    retry: false,
  });
  const personName = personen.data?.find(
    (t) => t.staff_member_id === vorbelegung.person,
  )?.display_name;
  const person = !vorbelegung.person
    ? 'noch offen'
    : (personName ?? (personen.isPending ? 'Wird geladen …' : 'Steht im Terminformular'));

  // Die Beschreibung sagt nur, was wirklich vorbelegt ist - bisher versprach
  // sie Zeit und Person auch dann, wenn beides fehlte (KAL-10).
  const vorbelegt = [
    vorbelegung.datum ? 'Datum' : null,
    zeit ? 'Zeit' : null,
    vorbelegung.person ? 'behandelnde Person' : null,
    vorbelegung.art ? 'Terminart' : null,
  ].filter((teil): teil is string => teil !== null);
  const vorbelegtSatz = aufzaehlung(vorbelegt);
  const beschreibung =
    vorbelegt.length === 0
      ? 'Zuerst die Patient:in wählen.'
      : `Zuerst die Patient:in wählen. ${vorbelegtSatz.charAt(0).toUpperCase()}${vorbelegtSatz.slice(1)} ${
          vorbelegt.length === 1 ? 'ist' : 'sind'
        } schon vorbelegt.`;

  return (
    <>
      {/* Der Weg zurück, meist in den Kalenderstand (KAL-19). */}
      <Rueckweg standard="/kalender" />

      <PageHeader title="Termin anlegen" description={beschreibung} />

      {vorbelegt.length > 0 ? (
        <Section titel="Aus dem Kalender übernommen">
          <DetailList>
            <DetailRow label="Datum">
              {vorbelegung.datum ? formatDate(vorbelegung.datum) : 'noch offen'}
            </DetailRow>
            <DetailRow label="Zeit">{zeit ?? 'noch offen'}</DetailRow>
            <DetailRow label="Behandelnde Person">{person}</DetailRow>
            <DetailRow label="Terminart">
              {vorbelegung.art ? appointmentTypeLabels[vorbelegung.art] : 'noch offen'}
            </DetailRow>
          </DetailList>
          <p className="text-ink-muted mt-3 max-w-prose text-xs leading-relaxed">
            Alles davon lässt sich im nächsten Schritt ändern. Verbindlich geprüft werden Raster,
            Arbeitszeit und Überschneidung erst beim Speichern.
          </p>
        </Section>
      ) : null}

      {/* Nachrücken (PRX-004): An einer freien Stelle mit Person, Tag und
          Zeit zeigt die Warteliste, wer darauf passt. */}
      {vorbelegung.person && vorbelegung.datum && vorbelegung.beginn && vorbelegung.ende ? (
        <div className="mb-8">
          <WaitlistMatches
            slot={{
              staffMemberId: vorbelegung.person,
              date: vorbelegung.datum,
              start: vorbelegung.beginn,
              end: vorbelegung.ende,
            }}
            back={rueckweg || hierher}
          />
        </div>
      ) : null}

      <Section titel="Patient:in">
        <div className="max-w-md">
          <Patientensuche
            label="Patient:in suchen"
            labelSichtbar
            onAuswahl={(patientId) => void navigate(formular(patientId))}
          />
        </div>
        {/* Der häufigste Grund für einen leeren Treffer: Die Person ist neu.
            Vorher war das hier eine Sackgasse - Kartei öffnen, anlegen,
            zurückfinden, von vorn beginnen (UX-012). */}
        <p className="text-ink-muted mt-3 max-w-prose text-sm">
          Noch nicht in der Kartei?{' '}
          {/* Im Satz unterstrichen, nicht nur an der Farbe erkennbar (TOK-12). */}
          <Textlink alleinstehend to={mitRueckweg('/patienten/neu', hierher)}>
            Patient:in anlegen
          </Textlink>{' '}
          – Datum, Zeit und behandelnde Person bleiben dabei erhalten.
        </p>
      </Section>
    </>
  );
}
