import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Patientensuche } from '@/features/patients/Patientensuche';
import { mitRueckweg } from '@/lib/rueckweg';
import { appointmentTypeLabels, leseTerminVorbelegung, schreibeTerminVorbelegung } from './api';

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

  /**
   * Der Rückweg für den Abstecher „Patient:in anlegen" (UX-012).
   *
   * Er ist diese Seite **samt Vorbelegung** — Datum, Zeit und behandelnde
   * Person stehen darin. Das Anlegen führt hierher zurück und hängt die neue
   * Kennung an; damit ist keine der Angaben verloren, die der Tap auf die
   * freie Stelle im Kalender mitgebracht hat.
   */
  const hierher = `/termine/neu${anhang}`;

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
      void navigate(`/patienten/${neuerPatient}/termine/neu${anhang}`, { replace: true });
    }
  }, [neuerPatient, anhang, navigate]);

  const zeit =
    vorbelegung.beginn && vorbelegung.ende
      ? `${vorbelegung.beginn}–${vorbelegung.ende} Uhr`
      : (vorbelegung.beginn ?? null);

  return (
    <>
      <PageHeader
        title="Termin anlegen"
        description="Zuerst die Patient:in wählen. Zeit und behandelnde Person sind schon vorbelegt."
      />

      <Section titel="Vorbelegung">
        <DetailList>
          <DetailRow label="Datum">{vorbelegung.datum ?? 'noch offen'}</DetailRow>
          <DetailRow label="Zeit">{zeit ?? 'noch offen'}</DetailRow>
          <DetailRow label="Terminart">
            {vorbelegung.art ? appointmentTypeLabels[vorbelegung.art] : 'noch offen'}
          </DetailRow>
        </DetailList>
        <p className="text-ink-subtle mt-3 max-w-prose text-xs leading-relaxed">
          Alles davon lässt sich im nächsten Schritt ändern. Verbindlich geprüft werden Raster,
          Arbeitszeit und Überschneidung erst beim Speichern.
        </p>
      </Section>

      <Section titel="Patient:in">
        <div className="max-w-md">
          <Patientensuche
            label="Patient:in suchen"
            labelSichtbar
            onAuswahl={(patientId) => void navigate(`/patienten/${patientId}/termine/neu${anhang}`)}
          />
        </div>
        {/* Der häufigste Grund für einen leeren Treffer: Die Person ist neu.
            Vorher war das hier eine Sackgasse - Kartei öffnen, anlegen,
            zurückfinden, von vorn beginnen (UX-012). */}
        <p className="text-ink-muted mt-3 max-w-prose text-sm">
          Noch nicht in der Kartei?{' '}
          <Link
            to={mitRueckweg('/patienten/neu', hierher)}
            className="text-accent inline-flex min-h-11 items-center hover:underline"
          >
            Patient:in anlegen
          </Link>{' '}
          — Datum, Zeit und behandelnde Person bleiben dabei erhalten.
        </p>
      </Section>
    </>
  );
}
