import type { Katalogeintrag } from '../typen';

/**
 * Gruppe AU: Ausdauer.
 *
 * Gehen, Marschieren, Treppe und Bewegungstrainer - Ausdauer im Alltag der
 * Wohnung, ohne Geräte. Die Dauer ist ein vorsichtiger Startwert; ein Bereich
 * der Liste („5 bis 10 Minuten") steht als unterer Wert in der Dosierung und
 * als Spanne unter `hinweise_praxis`. Inhalt KI-erstellt und bis zur Durchsicht
 * durch die Praxis ungeprüft (ANN-386). Keine Diagnose als Auswahlkriterium
 * (ADR-006 Punkt 10) - eine Vorsicht steht als Satz unter `hinweise_praxis`.
 * Ohne Zeichnung (ANN-539): Die Anleitung erklärt die Übung allein.
 */
export const EINTRAEGE: readonly Katalogeintrag[] = [
  {
    schluessel: 'AU-01',
    version: '1.0.0',
    name: 'Gehen in der Wohnung nach Zeit',
    alltagsname: 'In der Wohnung gehen',
    region: 'ganzkoerper',
    ziel: 'ausdauer',
    ausgangsstellung: 'gehen',
    hilfsmittel: [],
    hilfsmittel_optional: ['gehhilfe'],
    niveau: 1,
    dosierung: { dauer_s: 300, taeglich: 2 },
    anleitung: [
      'Räumen Sie Teppichkanten und andere Stolperfallen aus dem Weg und nehmen Sie Ihre Gehhilfe, wenn Sie eine benutzen.',
      'Gehen Sie in ruhigem, gleichmäßigem Tempo durch die Wohnung, etwa vom Flur in die Küche und zurück.',
      'Gehen Sie so zügig, dass Sie dabei noch gut sprechen können.',
      'Gehen Sie so lange, wie es im Plan steht, und setzen Sie sich bei Bedarf zwischendurch hin.',
    ],
    fehler: [
      'Das Tempo ist so hoch, dass die Person außer Atem kommt.',
      'Der Blick geht dauerhaft auf die Füße, der Oberkörper sinkt nach vorn.',
      'Die Gehhilfe bleibt stehen, obwohl sie sonst gebraucht wird.',
    ],
    hinweise_praxis:
      'Intensität so wählen, dass sich die Person dabei noch unterhalten kann. Startwert 5 Minuten; die Dauer bis 10 Minuten im Plan anpassen.',
  },
  {
    schluessel: 'AU-02',
    version: '1.0.0',
    name: 'Spaziergang mit Zeitsteigerung',
    alltagsname: 'Draußen spazieren gehen',
    region: 'ganzkoerper',
    ziel: 'ausdauer',
    ausgangsstellung: 'gehen',
    hilfsmittel: [],
    hilfsmittel_optional: ['gehhilfe'],
    niveau: 2,
    dosierung: { dauer_s: 1200 },
    anleitung: [
      'Ziehen Sie feste Schuhe an und nehmen Sie Ihre Gehhilfe mit, wenn Sie eine benutzen.',
      'Wählen Sie einen ebenen Weg mit Bänken zum Ausruhen, am besten eine Runde, die Sie kennen.',
      'Gehen Sie zügig, aber so, dass Sie sich dabei noch unterhalten können.',
      'Gehen Sie so lange, wie es im Plan steht, und machen Sie eine Pause, wenn Sie sie brauchen.',
    ],
    fehler: [
      'Das Tempo ist so hoch, dass die Person außer Atem kommt.',
      'Die Runde ist zu lang für den Rückweg, die Person kommt erschöpft zurück.',
      'Bei Glätte oder Dunkelheit wird trotzdem gegangen.',
    ],
    hinweise_praxis:
      'Intensität so wählen, dass sich die Person dabei noch unterhalten kann. Startwert 20 Minuten an etwa fünf Tagen der Woche; die Dauer bis 30 Minuten im Plan anpassen.',
  },
  {
    schluessel: 'AU-03',
    version: '1.0.0',
    name: 'Marschieren im Sitz',
    alltagsname: 'Im Sitz auf der Stelle marschieren',
    region: 'ganzkoerper',
    ziel: 'ausdauer',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['stuhl'],
    niveau: 1,
    dosierung: { saetze: 3, dauer_s: 60, taeglich: 1 },
    anleitung: [
      'Setzen Sie sich aufrecht auf einen stabilen Stuhl, die Füße stehen hüftbreit auf dem Boden.',
      'Heben Sie abwechselnd das rechte und das linke Knie an, als würden Sie im Sitzen gehen.',
      'Schwingen Sie die Arme gegengleich mit und finden Sie einen gleichmäßigen Takt.',
      'Marschieren Sie so lange, wie es im Plan steht, und machen Sie zwischen den Durchgängen eine kurze Pause.',
    ],
    fehler: [
      'Der Oberkörper lehnt sich nach hinten an die Lehne.',
      'Die Füße heben kaum vom Boden ab.',
      'Die Luft wird angehalten.',
    ],
    hinweise_praxis:
      'Intensität so wählen, dass sich die Person dabei noch unterhalten kann. Startwert 1 Minute je Durchgang; bis 2 Minuten im Plan anpassen.',
  },
  {
    schluessel: 'AU-04',
    version: '1.0.0',
    name: 'Marschieren im Stand mit Halt',
    alltagsname: 'Auf der Stelle marschieren',
    region: 'ganzkoerper',
    ziel: 'ausdauer',
    ausgangsstellung: 'stand',
    hilfsmittel: ['tisch'],
    niveau: 2,
    dosierung: { saetze: 3, dauer_s: 60, taeglich: 1 },
    anleitung: [
      'Stellen Sie sich vor die Arbeitsplatte und halten Sie sich mit beiden Händen leicht fest.',
      'Heben Sie abwechselnd das rechte und das linke Knie an, als würden Sie auf der Stelle gehen.',
      'Setzen Sie die Füße leise und ganz auf und finden Sie einen gleichmäßigen Takt.',
      'Marschieren Sie so lange, wie es im Plan steht, und machen Sie zwischen den Durchgängen eine kurze Pause.',
    ],
    fehler: [
      'Die Hände tragen das Gewicht, statt nur Halt zu geben.',
      'Der Oberkörper schwankt zur Seite des Standbeins.',
      'Die Füße werden schwer auf den Boden gestampft.',
    ],
    hinweise_praxis:
      'Intensität so wählen, dass sich die Person dabei noch unterhalten kann. Startwert 1 Minute je Durchgang; bis 2 Minuten im Plan anpassen.',
  },
  {
    schluessel: 'AU-05',
    version: '1.0.0',
    name: 'Bewegungstrainer im Sitz',
    alltagsname: 'Im Sitz am Pedaltrainer radeln',
    region: 'ganzkoerper',
    ziel: 'ausdauer',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['stuhl', 'pedaltrainer'],
    niveau: 1,
    dosierung: { dauer_s: 600, taeglich: 1 },
    anleitung: [
      'Stellen Sie den Bewegungstrainer auf eine rutschfeste Unterlage vor einen stabilen Stuhl ohne Rollen.',
      'Setzen Sie sich aufrecht hin und stellen Sie beide Füße auf die Pedale, die Knie sind dabei leicht gebeugt.',
      'Treten Sie in ruhigem, gleichmäßigem Tempo, als würden Sie gemütlich Rad fahren.',
      'Treten Sie so lange, wie es im Plan steht, und lassen Sie die Bewegung am Ende langsam auslaufen.',
    ],
    fehler: [
      'Der Stuhl steht zu weit weg, die Knie werden ganz durchgestreckt.',
      'Der Widerstand ist so hoch, dass die Person außer Atem kommt.',
      'Der Oberkörper rutscht nach hinten in die Lehne.',
    ],
    hinweise_praxis:
      'Intensität so wählen, dass sich die Person dabei noch unterhalten kann. Startwert 10 Minuten; bis 20 Minuten im Plan anpassen. Den Widerstand des Geräts bei Bedarf als Last eintragen.',
  },
  {
    schluessel: 'AU-06',
    version: '1.0.0',
    name: 'Treppensteigen als Ausdauertraining',
    alltagsname: 'Mehrere Etagen steigen',
    region: 'ganzkoerper',
    ziel: 'ausdauer',
    ausgangsstellung: 'stand',
    hilfsmittel: ['stufe'],
    niveau: 3,
    dosierung: { wiederholungen: [2, 4] },
    anleitung: [
      'Stellen Sie sich unten an die Treppe und halten Sie sich mit einer Hand am Geländer fest.',
      'Steigen Sie im Wechselschritt in ruhigem, gleichmäßigem Tempo eine Etage hinauf.',
      'Gehen Sie ebenso ruhig wieder hinunter, die Hand bleibt am Geländer.',
      'Jede Wiederholung ist eine Etage hinauf und wieder hinunter; machen Sie Pausen, wann immer Sie sie brauchen.',
    ],
    fehler: [
      'Das Tempo ist so hoch, dass die Person oben außer Atem ankommt.',
      'Die Person zieht sich mit dem Arm am Geländer hoch.',
      'Beim Hinuntergehen wird gehastet.',
    ],
    hinweise_praxis:
      'Intensität so wählen, dass sich die Person dabei noch unterhalten kann. Zuerst gemeinsam im Hausbesuch üben, mit sicherem Geländer und gutem Licht.',
  },
  {
    schluessel: 'AU-07',
    version: '1.0.0',
    name: 'Boxen im Sitz',
    alltagsname: 'Im Sitz in die Luft boxen',
    region: 'schulter',
    ziel: 'ausdauer',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['stuhl'],
    niveau: 1,
    dosierung: { saetze: 3, dauer_s: 30, taeglich: 1 },
    anleitung: [
      'Setzen Sie sich aufrecht auf einen stabilen Stuhl, die Füße stehen fest auf dem Boden.',
      'Ballen Sie locker die Fäuste und halten Sie sie vor die Brust.',
      'Boxen Sie abwechselnd mit der rechten und der linken Faust nach vorn in die Luft und ziehen Sie die Faust jedes Mal zurück.',
      'Boxen Sie in gleichmäßigem Takt so lange, wie es im Plan steht, und atmen Sie dabei weiter.',
    ],
    fehler: [
      'Der Ellbogen wird ruckartig ganz durchgestreckt.',
      'Der Oberkörper schaukelt mit, statt aufrecht zu bleiben.',
      'Die Luft wird angehalten.',
    ],
    hinweise_praxis: 'Startwert 30 Sekunden je Durchgang; bis 60 Sekunden im Plan anpassen.',
  },
];
