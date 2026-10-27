import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Patientenauswahl } from '@/features/patients/Patientenauswahl';
import { WaitlistMatches } from '@/features/calendar/waitlist/WaitlistMatches';
import { formatDate } from '@/lib/datum';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import { fetchAssignableTherapists } from '@/features/workforce/staff/api';
import {
  appointmentTypeHint,
  leseTerminVorbelegung,
  schreibeTerminVorbelegung,
} from '@/lib/termin';

/** Beim Termin anlegen zählt von den Karteileichen nur diese (B1, B10). */
const NUR_TERMINE_FEHLEN = ['termine_fehlen'] as const;

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
  // Vorher eine Sackgasse - Kartei öffnen, anlegen, zurückfinden, von vorn
  // beginnen (UX-012). Ohne den Nachsatz, dass die Vorbelegung erhalten
  // bleibt: Sie bleibt es ohnehin (UX-005g).
  const anlegen = mitRueckweg('/patienten/neu', hierher);
  const anlegenKnopf = (
    <ButtonLink to={anlegen} variant="secondary" groesse="kompakt">
      Patient:in anlegen
    </ButtonLink>
  );

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
    ? null
    : (personName ?? (personen.isPending ? 'Wird geladen …' : 'Steht im Terminformular'));

  // Eine Zeile aus dem, was wirklich vorbelegt ist (KAL-10) - keine Tabelle
  // mit „noch offen" und kein Satz, dass sich alles noch ändern lässt. Der
  // Hausbesuch als Regelfall trägt kein Wort (ANN-192, UX-005g).
  const vorbelegt = [
    vorbelegung.datum ? formatDate(vorbelegung.datum) : null,
    zeit,
    person,
    vorbelegung.art ? appointmentTypeHint(vorbelegung.art) : null,
  ].filter((teil): teil is string => teil !== null);

  return (
    <>
      {/* Der Weg zurück, meist in den Kalenderstand (KAL-19). */}
      <Rueckweg standard="/kalender" />

      {/* Der häufigste Grund, die Gesuchte nicht zu finden: Sie ist neu. Der
          Abstecher steht im Kopf und unter „Keine Treffer“, nicht als Satz
          unter der Liste (Design-Review A, Befund 6; UX-012). */}
      <PageHeader
        title="Termin anlegen"
        description="Zuerst die Patient:in wählen."
        actions={
          <ButtonLink to={anlegen} variant="secondary">
            Patient:in anlegen
          </ButtonLink>
        }
      />

      {vorbelegt.length > 0 ? (
        <p className="text-ink text-liste mb-8 font-medium">{vorbelegt.join(' · ')}</p>
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
        {/* B10 (BEF-160): die Liste zum Filtern und Sortieren statt der Suche
            ab drei Zeichen - zuletzt behandelt zuerst. Eine Zeile führt ins
            Terminformular. Von den Karteileichen zählt hier nur „Termine
            fehlen“; der Rest gehört in die Kartei. */}
        <Patientenauswahl
          ziel={formular}
          wahlenNur={NUR_TERMINE_FEHLEN}
          leer={{ titel: 'Noch keine Patient:innen', aktion: anlegenKnopf }}
          anlegen={anlegenKnopf}
        />
      </Section>
    </>
  );
}
