import type { Katalogeintrag } from '../typen';

/**
 * Gruppe AT: Atmung.
 *
 * Atemtechniken und atemerleichternde Stellungen. Die Atmung selbst - Bauch,
 * Flanken, Lippen, Luftstrom - kann die Figur nicht zeigen. Eine Bewegung
 * haben deshalb nur die Übungen, deren Stellung oder Armbewegung das
 * Wesentliche ist: AT-01 (Lage und Hände), AT-03 und AT-04 (Kutschersitz,
 * Torwartstellung), AT-06 (Armheben) und AT-07 (Seitneigung von vorn).
 * AT-02, AT-05, AT-08, AT-09, AT-10 und AT-11 zeigen nur die
 * Ausgangsstellung (ANN-480): aufrecht im Sitz, bei AT-05 von vorn mit den
 * Händen an den Flanken und locker hängenden Schultern, bei AT-11 von der
 * Seite mit den Armen vor der Brust - die Vorderansicht ließe die Unterarme
 * im Rumpf verschwinden, und die Drehung um die Längsachse zeigt keine der
 * beiden Ansichten (den Strohhalm kennt der Zeichner nicht). Die Unterarme
 * stehen dafür mit Winkeln vor der Brust: Der Griff `brust` legte die
 * Ellbogen nach hinten wie beim Rudern. Ein Atemzug zählt als Wiederholung.
 * Inhalt KI-erstellt und bis zur Durchsicht durch die Praxis ungeprüft
 * (ANN-386); Vorsicht steht nur unter `hinweise_praxis`.
 */
export const EINTRAEGE: readonly Katalogeintrag[] = [
  {
    schluessel: 'AT-01',
    version: '1.0.0',
    name: 'Zwerchfellatmung',
    alltagsname: 'In den Bauch atmen',
    region: 'rumpf',
    ziel: 'atmung',
    ausgangsstellung: 'rueckenlage',
    hilfsmittel: ['kissen'],
    niveau: 1,
    dosierung: { wiederholungen: 10, taeglich: 3 },
    anleitung: [
      'Legen Sie sich bequem auf den Rücken, ein Kissen unter dem Kopf, und stellen Sie die Beine an.',
      'Legen Sie eine Hand auf den Bauch und die andere auf die Brust.',
      'Atmen Sie langsam durch die Nase ein, sodass sich die Hand auf dem Bauch hebt und die Hand auf der Brust ruhig bleibt.',
      'Atmen Sie langsam und locker durch den Mund aus, der Bauch senkt sich dabei wieder.',
    ],
    fehler: [
      'Die Brust und die Schultern heben sich beim Einatmen, der Bauch bleibt flach.',
      'Es wird zu schnell und zu tief geatmet, der Person wird schwindelig.',
      'Der Bauch wird aktiv herausgedrückt, statt sich mit dem Atem zu heben.',
    ],
    hinweise_praxis:
      'Wird der Person schwindelig, einige normale Atemzüge einschieben. Später auch im Sitz üben.',
    bild: {
      v: 1,
      basis: 'rueckenlage_angestellt',
      unterlage: 'bett',
      start: { haende: ['bauch', 'brust'] },
      ende: { haende: ['bauch', 'brust'] },
      hilfsmittel: [{ art: 'kissen', an: 'kopf' }],
    },
  },
  {
    schluessel: 'AT-02',
    version: '1.0.0',
    name: 'Lippenbremse',
    alltagsname: 'Durch locker geschlossene Lippen ausatmen',
    region: 'rumpf',
    ziel: 'atmung',
    ausgangsstellung: 'sitz',
    hilfsmittel: [],
    niveau: 1,
    dosierung: { wiederholungen: [5, 10] },
    anleitung: [
      'Setzen Sie sich bequem hin und lassen Sie die Schultern locker.',
      'Atmen Sie ruhig durch die Nase ein.',
      'Legen Sie die Lippen locker aufeinander und lassen Sie die Luft langsam durch den schmalen Spalt ausströmen, als wollten Sie eine Kerzenflamme nur zum Flackern bringen.',
      'Atmen Sie etwa doppelt so lange aus wie ein und wiederholen Sie das in Ruhe.',
    ],
    fehler: [
      'Die Wangen blähen sich auf.',
      'Die Luft wird kräftig herausgepresst.',
      'Das Einatmen wird hastig und tief.',
    ],
    hinweise_praxis:
      'Bei Bedarf einsetzen, etwa bei Atemnot beim Treppensteigen oder nach Anstrengung; gut kombinierbar mit Kutschersitz und Torwartstellung.',
    bild: { v: 1, basis: 'sitz', start: {}, ende: {} },
  },
  {
    schluessel: 'AT-03',
    version: '1.0.0',
    name: 'Kutschersitz',
    alltagsname: 'Unterarme auf die Oberschenkel stützen',
    region: 'rumpf',
    ziel: 'atmung',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['stuhl'],
    niveau: 1,
    dosierung: { dauer_s: 120 },
    anleitung: [
      'Setzen Sie sich vorn auf einen stabilen Stuhl und stellen Sie die Füße etwas weiter als hüftbreit auf.',
      'Neigen Sie den Oberkörper nach vorn und legen Sie die Unterarme auf die Oberschenkel.',
      'Lassen Sie Schultern, Nacken und Hände locker.',
      'Atmen Sie ruhig durch die Nase ein und mit der Lippenbremse langsam aus, bis der Atem ruhiger wird.',
    ],
    fehler: [
      'Die Schultern werden zu den Ohren hochgezogen.',
      'Der Oberkörper sinkt so weit zusammen, dass der Bauch eingeengt wird.',
    ],
    hinweise_praxis:
      'Atemerleichternde Stellung, bei Bedarf einzusetzen, etwa nach dem Treppensteigen. Startwert 2 Minuten, üblich sind 1 bis 3 Minuten.',
    bild: {
      v: 1,
      basis: 'sitz',
      start: {},
      ende: {
        rumpf: 40,
        huefte: [127, 127],
        schulter: [30, 30],
        ellbogen: [70, 70],
      },
      bewegung: ['schulter'],
    },
  },
  {
    schluessel: 'AT-04',
    version: '1.0.0',
    name: 'Torwartstellung',
    alltagsname: 'Im Stehen auf die Oberschenkel stützen',
    region: 'rumpf',
    ziel: 'atmung',
    ausgangsstellung: 'stand',
    hilfsmittel: [],
    hilfsmittel_optional: ['tisch'],
    niveau: 1,
    dosierung: { dauer_s: 120 },
    anleitung: [
      'Stellen Sie die Füße etwas weiter als hüftbreit auseinander und beugen Sie die Knie leicht.',
      'Neigen Sie den Oberkörper mit geradem Rücken nach vorn und stützen Sie die Hände oberhalb der Knie auf die Oberschenkel.',
      'Alternativ stützen Sie die Unterarme auf eine Arbeitsplatte oder Fensterbank.',
      'Lassen Sie die Schultern locker und atmen Sie ruhig mit der Lippenbremse aus, bis der Atem ruhiger wird.',
    ],
    fehler: [
      'Die Schultern werden hochgezogen.',
      'Die Knie werden ganz durchgedrückt.',
      'Der Kopf hängt tief, der Rücken wird stark rund.',
    ],
    hinweise_praxis:
      'Atemerleichternde Stellung für unterwegs, bei Bedarf einzusetzen. Startwert 2 Minuten, üblich sind 1 bis 3 Minuten.',
    bild: {
      v: 1,
      basis: 'stand',
      start: {},
      ende: {
        rumpf: 38,
        huefte: [50, 50],
        knie: [22, 22],
        haende: ['oberschenkel', 'oberschenkel'],
      },
      bewegung: ['schulter'],
    },
  },
  {
    schluessel: 'AT-05',
    version: '1.0.0',
    name: 'Flankenatmung',
    alltagsname: 'Gegen die Hände in die Seiten atmen',
    region: 'rumpf',
    ziel: 'atmung',
    ausgangsstellung: 'sitz',
    hilfsmittel: [],
    niveau: 1,
    dosierung: { wiederholungen: 10, taeglich: 2 },
    anleitung: [
      'Setzen Sie sich aufrecht hin, die Füße stehen fest auf dem Boden.',
      'Legen Sie die Hände seitlich an die unteren Rippen, die Daumen zeigen nach hinten.',
      'Atmen Sie langsam durch die Nase ein und lenken Sie den Atem gegen Ihre Hände, sodass sich die Rippen zur Seite weiten.',
      'Atmen Sie langsam mit der Lippenbremse aus und spüren Sie, wie die Rippen wieder nach innen sinken.',
    ],
    fehler: [
      'Die Schultern heben sich beim Einatmen.',
      'Es wird zu schnell geatmet, der Person wird schwindelig.',
    ],
    hinweise_praxis:
      'Ein leichter Druck der Hände zu Beginn der Einatmung gibt eine Rückmeldung; die Fachperson kann die Hände am Anfang selbst anlegen.',
    bild: {
      v: 1,
      basis: 'sitz_front',
      start: { arm: [40, 40], ellbogen: [-110, -110] },
      ende: { arm: [40, 40], ellbogen: [-110, -110] },
    },
  },
  {
    schluessel: 'AT-06',
    version: '1.0.0',
    name: 'Atemvertiefung mit Armheben',
    alltagsname: 'Beim Einatmen die Arme heben',
    region: 'rumpf',
    ziel: 'atmung',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['stuhl'],
    niveau: 1,
    dosierung: { saetze: 2, wiederholungen: 10, taeglich: 2 },
    anleitung: [
      'Setzen Sie sich aufrecht auf einen Stuhl, die Hände liegen auf den Oberschenkeln.',
      'Heben Sie beim Einatmen durch die Nase beide Arme langsam nach vorn und so weit nach oben, wie es angenehm geht.',
      'Senken Sie die Arme beim Ausatmen durch den Mund langsam wieder ab.',
      'Lassen Sie sich Zeit und machen Sie nach jedem Atemzug eine kleine Pause.',
    ],
    fehler: [
      'Die Arme werden schneller bewegt, als der Atem fließt.',
      'Der Rücken geht beim Armheben ins Hohlkreuz.',
      'Die Schultern werden zu den Ohren hochgezogen.',
    ],
    hinweise_praxis:
      'Bei eingeschränkter Schulterbeweglichkeit nur so weit heben, wie es schmerzfrei geht, oder einen Arm nach dem anderen.',
    bild: {
      v: 1,
      basis: 'sitz',
      start: {},
      ende: { schulter: [165, 165], ellbogen: [6, 6] },
      bewegung: ['hand_nah'],
    },
  },
  {
    schluessel: 'AT-07',
    version: '1.0.0',
    name: 'Halbmond-Dehnlagerung im Sitz',
    alltagsname: 'Seitlich neigen, in die Flanke atmen',
    region: 'rumpf',
    ziel: 'dehnung',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['stuhl'],
    niveau: 2,
    dosierung: { wiederholungen: 5, je_seite: true, taeglich: 1 },
    anleitung: [
      'Setzen Sie sich aufrecht auf einen Stuhl und stützen Sie eine Hand neben sich auf die Sitzfläche.',
      'Heben Sie den anderen Arm über den Kopf und neigen Sie den Oberkörper langsam zur Seite der stützenden Hand.',
      'Neigen Sie sich nur so weit, bis Sie eine Dehnung in der oberen Flanke spüren.',
      'Atmen Sie in dieser Stellung ruhig und tief in die gedehnte Seite und kommen Sie nach den Atemzügen zur Mitte zurück.',
      'Wechseln Sie danach die Seite.',
    ],
    fehler: [
      'Der Oberkörper dreht sich nach vorn, statt sich zur Seite zu neigen.',
      'Das Gesäß der gedehnten Seite hebt vom Stuhl ab.',
      'Die Luft wird in der Dehnung angehalten.',
    ],
    hinweise_praxis:
      'Bei frischen Narben an Brustkorb oder Bauch die Dehnung nur nach Rücksprache mit der behandelnden Ärztin oder dem Arzt.',
    bild: {
      v: 1,
      basis: 'sitz_front',
      start: { haende: ['sitz', null] },
      ende: {
        rumpf: -18,
        knie: [62, 90],
        bein: [24, -12],
        arm: [10, 160],
        ellbogen: [6, 20],
        haende: ['sitz', null],
      },
      bewegung: ['hand_fern'],
    },
  },
  {
    schluessel: 'AT-08',
    version: '1.0.0',
    name: 'Huffing (forcierte Exspiration)',
    alltagsname: 'Mit offenem Mund kräftig aushauchen',
    region: 'rumpf',
    ziel: 'atmung',
    ausgangsstellung: 'sitz',
    hilfsmittel: [],
    niveau: 1,
    dosierung: { wiederholungen: [2, 3], taeglich: 2 },
    anleitung: [
      'Setzen Sie sich aufrecht hin und atmen Sie einige Male ruhig ein und aus.',
      'Atmen Sie etwas tiefer als sonst ein.',
      'Hauchen Sie die Luft mit weit geöffnetem Mund kräftig, aber ohne zu pressen aus, als wollten Sie einen Spiegel beschlagen.',
      'Atmen Sie danach wieder einige Male ruhig; löst sich Schleim, husten Sie ihn ab und spucken ihn in ein Taschentuch.',
    ],
    fehler: [
      'Statt zu hauchen wird gehustet oder gepresst.',
      'Die Pausen mit ruhiger Atmung fehlen, ein Hustenreiz entsteht.',
      'Der Mund ist beim Aushauchen fast geschlossen.',
    ],
    hinweise_praxis:
      'Ein Zyklus ist ruhiges Atmen, einige tiefere Atemzüge und ein bis zwei Huffs. Bei Blut im Auswurf, Fieber oder zunehmender Atemnot ärztlich abklären lassen.',
    bild: { v: 1, basis: 'sitz', start: {}, ende: {} },
  },
  {
    schluessel: 'AT-09',
    version: '1.0.0',
    name: 'Schnüffelatmung',
    alltagsname: 'Mehrmals kurz durch die Nase einatmen',
    region: 'rumpf',
    ziel: 'atmung',
    ausgangsstellung: 'sitz',
    hilfsmittel: [],
    niveau: 1,
    dosierung: { wiederholungen: 10, taeglich: 2 },
    anleitung: [
      'Setzen Sie sich aufrecht hin und atmen Sie zuerst ruhig aus.',
      'Atmen Sie in zwei bis drei kurzen Zügen durch die Nase ein, als würden Sie an einer Blume schnuppern.',
      'Atmen Sie danach langsam mit der Lippenbremse aus.',
      'Machen Sie nach jedem Atemzug eine kleine Pause mit normaler Atmung.',
    ],
    fehler: [
      'Es wird zu schnell hintereinander geatmet, der Person wird schwindelig.',
      'Die Schultern werden beim Einatmen hochgezogen.',
    ],
    hinweise_praxis:
      'Wird der Person schwindelig, die Übung unterbrechen und normal weiteratmen lassen.',
    bild: { v: 1, basis: 'sitz', start: {}, ende: {} },
  },
  {
    schluessel: 'AT-10',
    version: '1.0.0',
    name: 'Ausatmen gegen Widerstand (Strohhalm)',
    alltagsname: 'Durch einen Strohhalm ausatmen',
    region: 'rumpf',
    ziel: 'atmung',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['alltagsgegenstand'],
    niveau: 2,
    dosierung: { wiederholungen: 10, taeglich: 2 },
    anleitung: [
      'Setzen Sie sich aufrecht hin und nehmen Sie einen Strohhalm locker zwischen die Lippen.',
      'Atmen Sie ruhig durch die Nase ein.',
      'Atmen Sie langsam und gleichmäßig durch den Strohhalm aus, ohne die Wangen aufzublasen.',
      'Atmen Sie zwischen den Atemzügen einige Male normal und hören Sie bei Schwindel auf.',
    ],
    fehler: [
      'Die Wangen blähen sich auf.',
      'Es wird mit viel Kraft gepresst.',
      'Durch den Strohhalm wird auch eingeatmet.',
    ],
    hinweise_praxis:
      'Eigenen Strohhalm verwenden, nicht teilen. Ein dünnerer Strohhalm gibt mehr Widerstand.',
    bild: { v: 1, basis: 'sitz', start: {}, ende: {} },
  },
  {
    schluessel: 'AT-11',
    version: '1.0.0',
    name: 'Thoraxrotation mit Atmung',
    alltagsname: 'Beim Ausatmen den Oberkörper drehen',
    region: 'bws',
    ziel: 'mobilitaet',
    ausgangsstellung: 'sitz',
    hilfsmittel: ['stuhl'],
    niveau: 1,
    dosierung: { wiederholungen: 10, je_seite: true, taeglich: 1 },
    anleitung: [
      'Setzen Sie sich aufrecht auf einen Stuhl, die Füße stehen fest und die Arme sind vor der Brust verschränkt.',
      'Atmen Sie durch die Nase ein und machen Sie sich dabei groß.',
      'Drehen Sie beim Ausatmen den Oberkörper langsam zu einer Seite, das Becken bleibt ruhig sitzen.',
      'Kommen Sie beim nächsten Einatmen zur Mitte zurück und drehen Sie beim Ausatmen zur anderen Seite.',
    ],
    fehler: [
      'Das Becken und die Knie drehen mit.',
      'Die Drehung kommt nur aus dem Kopf.',
      'Die Luft wird angehalten.',
    ],
    bild: {
      v: 1,
      basis: 'sitz',
      start: { schulter: [28, 24], ellbogen: [145, 150] },
      ende: { schulter: [28, 24], ellbogen: [145, 150] },
    },
  },
];
