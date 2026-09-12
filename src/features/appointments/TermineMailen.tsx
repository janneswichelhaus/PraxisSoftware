import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { fullName, type Patient } from '@/features/patients/api';
import { mitRueckweg } from '@/lib/rueckweg';
import { addAppointmentNotification, type AppointmentSlipEntry } from './api';
import { mailOeffnen, terminmailEntwurf, type Terminmail } from './terminmail';

/**
 * Die Termine per E-Mail zukommen lassen (CAL-013, ANN-041).
 *
 * **Die Anwendung verschickt nichts selbst.** Ein Klick öffnet die fertige
 * Nachricht im Mailprogramm der Praxis; gesendet wird sie dort von Hand. Der
 * Weg entsteht damit aus dem Postfach, das die Praxis ohnehin betreibt, und
 * nicht aus einem neuen Dienstleister (§3.5, B15).
 *
 * Drei Dinge, die diese Oberfläche leistet und die nicht Zierde sind:
 *
 *   1. **Sie zeigt den Text vorher.** Wer eine Nachricht mit Gesundheitsbezug
 *      auslöst, soll vorher lesen, was darin steht — nicht erst danach im
 *      Gesendet-Ordner.
 *   2. **Sie nennt das Risiko an der Stelle der Entscheidung.** Eine E-Mail
 *      ist unterwegs nicht verschlüsselt; die Aufsichtsbehörden lassen den
 *      Weg für Gesundheitsdaten nur auf den ausdrücklichen, aufgeklärten
 *      Wunsch der betroffenen Person zu (ANN-041). Der Satz steht deshalb
 *      neben dem Knopf und nicht in einem Hilfetext.
 *   3. **Sie behauptet nicht mehr, als sie weiß.** Die Anwendung sieht die
 *      Übergabe an das Mailprogramm, nicht den Versand — und fragt deshalb
 *      danach.
 *
 * **Übergeben und mitgeteilt sind zwei Schritte** (seit UX-012, ANN-041
 * Fassung 2). „E-Mail öffnen" übergibt den Entwurf und vermerkt **nichts**;
 * erst die Bestätigung danach hält fest, dass die Nachricht gesendet wurde.
 * Vorher vermerkte schon die Übergabe: Ein im Mailprogramm verworfener Entwurf
 * hinterließ eine Mitteilung, die nie stattgefunden hat. Der Vermerk ist ein
 * Nachweis, und ein Nachweis, der regelmäßig falsch ist, ist keiner.
 */
export function TermineMailen({
  patient,
  eintraege,
}: {
  patient: Patient;
  eintraege: readonly AppointmentSlipEntry[];
}) {
  // Die Adresse steht vor allem anderen: Ohne sie gibt es keinen Weg, und ein
  // abgeblendeter Knopf wäre nur ein Rätsel. Die Trennung in zwei Bauteile
  // hält zugleich den Typ sauber - der Entwurf bekommt eine Adresse, keine
  // vielleicht-Adresse.
  if (!patient.email) {
    return (
      <p className="text-ink-subtle max-w-prose text-xs leading-relaxed">
        Für eine E-Mail fehlt die Adresse — eintragen darf sie nur, wer sie von der Patient:in
        selbst hat.{' '}
        {/* Der Abstecher in die Stammdaten und zurück auf diese Seite (UX-012).
            Vorher stand hier nur, wo die Adresse hingehört. */}
        <Link
          to={mitRueckweg(
            `/patienten/${patient.id}/bearbeiten`,
            `/patienten/${patient.id}/terminzettel`,
          )}
          className="text-accent inline-flex min-h-11 items-center underline"
        >
          Adresse in den Stammdaten ergänzen
        </Link>
      </p>
    );
  }

  return <Mailentwurf patient={patient} adresse={patient.email} eintraege={eintraege} />;
}

function Mailentwurf({
  patient,
  adresse,
  eintraege,
}: {
  patient: Patient;
  adresse: string;
  eintraege: readonly AppointmentSlipEntry[];
}) {
  const queryClient = useQueryClient();
  const [entwurf, setEntwurf] = useState<Terminmail | null>(null);
  /** Der übergebene Entwurf, solange die Bestätigung aussteht. */
  const [uebergeben, setUebergeben] = useState<Terminmail | null>(null);

  const vermerken = useMutation({
    mutationFn: (mail: Terminmail) =>
      addAppointmentNotification(
        mail.enthalten.map((eintrag) => eintrag.id),
        'email',
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient-upcoming-appointments'] });
      setUebergeben(null);
    },
  });

  // Der Entwurf entsteht im Klickhandler, nicht beim Rendern: Die Anwendung
  // baut keine Nachricht auf Vorrat (ADR-019 Punkt 20, hier sinngemäß).
  function entwerfen() {
    vermerken.reset();
    setUebergeben(null);
    setEntwurf(terminmailEntwurf(fullName(patient), adresse, eintraege));
  }

  /** Übergibt den Entwurf und fragt danach, ob er gesendet wurde. */
  function uebergabeStarten(mail: Terminmail) {
    mailOeffnen(mail.url);
    setEntwurf(null);
    setUebergeben(mail);
  }

  return (
    <div className="flex flex-col gap-3">
      {entwurf === null ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={entwerfen}>
              Termine per E-Mail senden
            </Button>
            {vermerken.isSuccess ? (
              <Statusmeldung>
                Die Termine sind als „Per E-Mail mitgeteilt" vermerkt. Am Termin lässt sich der
                Vermerk zurücknehmen.
              </Statusmeldung>
            ) : null}
          </div>

          {/* Der zweite Schritt: Die Anwendung sieht die Übergabe, nicht den
              Versand - also fragt sie (ANN-041 Fassung 2). Die Frage bleibt
              stehen, bis sie beantwortet ist. */}
          {uebergeben ? (
            <div
              role="status"
              className="border-line-strong bg-surface-sunken rounded-card flex flex-col gap-3 border px-4 py-3"
            >
              <p className="text-ink text-[0.9375rem]">
                Die E-Mail ist im Mailprogramm geöffnet. Wurde sie gesendet? Nur dann gelten die
                Termine als mitgeteilt.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={vermerken.isPending}
                  onClick={() => vermerken.mutate(uebergeben)}
                >
                  {vermerken.isPending ? 'Wird vermerkt …' : 'Ja, als mitgeteilt vermerken'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setUebergeben(null)}>
                  Nein, nichts vermerken
                </Button>
                {vermerken.isError ? (
                  <Statusmeldung ton="fehler">
                    {vermerken.error.message} Es wurde nichts vermerkt.
                  </Statusmeldung>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="border-line bg-surface-sunken rounded-card max-w-prose border p-4">
          <h2 className="text-ink text-base font-semibold">E-Mail an die Patient:in</h2>

          <dl className="mt-3 text-sm">
            <div className="flex gap-2">
              <dt className="text-ink-muted">An</dt>
              <dd className="text-ink">{adresse}</dd>
            </div>
            <div className="mt-1 flex gap-2">
              <dt className="text-ink-muted">Betreff</dt>
              <dd className="text-ink">{entwurf.betreff}</dd>
            </div>
          </dl>

          <p className="text-ink border-line mt-3 border-t pt-3 text-[0.9375rem] whitespace-pre-line">
            {entwurf.text}
          </p>

          {entwurf.ausgelassen > 0 ? (
            <Statusmeldung ton="warnung" className="mt-3">
              {`Es passen nur die nächsten ${entwurf.enthalten.length} Termine in eine E-Mail. Die übrigen ${entwurf.ausgelassen} stehen auf dem Ausdruck und gelten danach als nicht mitgeteilt.`}
            </Statusmeldung>
          ) : null}

          <p className="text-ink-subtle mt-3 text-xs leading-relaxed">
            Eine E-Mail ist unterwegs nicht verschlüsselt. Senden Sie die Termine nur, wenn die
            Patient:in das ausdrücklich wünscht und weiß, dass die Nachricht unverschlüsselt geht.
            Die Anwendung verschickt nichts selbst: Sie öffnet die Nachricht in Ihrem Mailprogramm,
            gesendet wird sie dort von Ihnen.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => uebergabeStarten(entwurf)}>
              E-Mail öffnen
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEntwurf(null)}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
