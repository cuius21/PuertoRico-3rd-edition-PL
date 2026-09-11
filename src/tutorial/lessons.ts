import type { Action } from '../../actions/Action';
import type { GameState } from '../../state/GameState';
import { GoodType, PlantationType } from '../../core/types';
import { HUMAN, human, type ScenarioId } from './scenarios';

export type Facts = { produced: boolean; shipped: number };
export type ActionShape = {
  type: string;
  role?: string;
  good?: string;
  buildingId?: string;
  asForest?: boolean;
  asNoble?: boolean;
  choice?: { kind: string; index?: number };
  target?: {
    kind: string;
    buildingId?: string;
    slotIndex?: number;
    shipIndex?: number;
  };
};
export const shape = (a: Action) => a as unknown as ActionShape;
export interface LessonStep {
  kind: 'read' | 'inspect' | 'action' | 'watch' | 'quiz' | 'finish';
  title: string;
  text: string;
  hint?: string;
  target?: string | ((s: GameState) => string);
  focus?: string;
  accept?: (a: Action, s: GameState) => boolean;
  done?: (s: GameState, f: Facts) => boolean;
  flow?: { title: string; text: string }[];
  comparison?: { order: string; you: number; rival: number; result: string }[];
  answers?: { text: string; correct: boolean; explanation: string }[];
}
export interface Lesson {
  id: ScenarioId;
  title: string;
  description: string;
  group: 'basics' | 'practice' | 'expansions';
  minutes: number;
  steps: LessonStep[];
}
const read = (title: string, text: string): LessonStep => ({
  kind: 'read',
  title,
  text,
});
const finish = (text: string): LessonStep => ({
  kind: 'finish',
  title: 'Dobra robota!',
  text,
});
const role = (name: string, role: string, text: string): LessonStep => ({
  kind: 'action',
  title: 'Wybierz: ' + name,
  text,
  hint: 'Kliknij okrągłe „Akcje”, a potem kartę „' + name + '”.',
  target: 'actions',
  focus: 'central',
  accept: (a) => a.type === 'SELECT_ROLE' && shape(a).role === role,
});
const act = (
  title: string,
  text: string,
  target: LessonStep['target'],
  accept: NonNullable<LessonStep['accept']>,
  hint: string,
  done?: LessonStep['done'],
): LessonStep => ({
  kind: 'action',
  title,
  text,
  ...(target ? { target } : {}),
  accept,
  hint,
  ...(done ? { done } : {}),
});
const watch: LessonStep = {
  kind: 'watch',
  title: 'Teraz pozostali gracze',
  text: 'Ta sama rola dotyczy także innych graczy. Obejrzyj ich ruchy. Wybierający rolę zachowuje jej przywilej.',
};
const corn = (a: Action, s: GameState) =>
  a.type === 'TAKE_PLANTATION' &&
  shape(a).choice?.kind === 'revealed' &&
  s.supply.revealedPlantations[shape(a).choice!.index!]?.type ===
    PlantationType.Corn &&
  !shape(a).asForest;
const place = (a: Action) => a.type === 'PLACE_WORKER' && !shape(a).asNoble;
const cornTarget = (s: GameState) =>
  HUMAN +
  ':plantation:' +
  human(s)
    .island.getPlantationSlots()
    .findIndex((p) => p?.type === PlantationType.Corn);
const workDone = (s: GameState) =>
  human(s).pendingWorkers + human(s).pendingNobles === 0;
const produceBonus = act(
  'Odbierz dodatkowy towar',
  'Zarządca wyprodukował towary wszystkim działającym gospodarstwom. Jako wybierający bierzesz jeszcze jeden dostępny towar, który produkujesz.',
  'stock:' + HUMAN,
  (a) => a.type === 'CRAFTSMAN_BONUS',
  'Wybierz dodatkowy towar w dolnym panelu ruchów.',
);

const inspectStock = (text: string): LessonStep => ({
  kind: 'inspect',
  title: 'Sprawdź towary na nabrzeżu',
  text,
  target: 'stock:' + HUMAN,
  focus: HUMAN,
  hint: 'Kliknij skrzynki z napisem TOWARY przy pomoście na twojej wyspie. Możesz też otworzyć tabliczkę „Ty” → Skład towarów przy porcie.',
});

const endingRule =
  'Gra kończy się po zakończeniu rundy, gdy zadziała warunek końca: pełne miasto, wyczerpana pula punktów zwycięstwa (★) albo warunek wyczerpania pracowników. Wynik to żetony punktów zwycięstwa (★), punkty zwycięstwa (★) na budynkach i należne bonusy końcowe.';
export const LESSONS: Lesson[] = [
  {
    id: 'welcome',
    title: 'Poznaj wyspy i cel gry',
    description: 'Mapa, monety, punkty zwycięstwa (★) i podgląd wyspy.',
    group: 'basics',
    minutes: 1,
    steps: [
      read(
        'Witaj w San Juan!',
        'Rozwijaj wyspę, produkuj towary i zdobywaj punkty zwycięstwa (PZ), oznaczone gwiazdką ★. Monety służą przede wszystkim do kupowania budynków. To ćwiczenia na przygotowanych planszach — każdy rozdział można powtórzyć.',
      ),
      {
        kind: 'inspect',
        title: 'Otwórz swoją wyspę',
        text: 'Kliknij tabliczkę „Ty” albo swoją wyspę. Zobaczysz plantacje, towary, pracowników i pieniądze.',
        target: HUMAN,
        focus: HUMAN,
        hint: 'Twoja tabliczka jest pierwsza na liście graczy. Możesz też nacisnąć „Pokaż miejsce”.',
      },
      read(
        'Sterujesz kamerą',
        'Przeciągaj mapę lub używaj W, A, S, D. Kółko myszy i przyciski +/− zmieniają przybliżenie. Klikalne obiekty otwierają szczegóły. Animacje pogody są dekoracją.',
      ),
      {
        kind: 'quiz',
        title: 'Co decyduje o zwycięstwie?',
        text: 'Wybierz odpowiedź.',
        answers: [
          {
            text: 'Najwięcej punktów zwycięstwa',
            correct: true,
            explanation:
              'Tak. Pieniądze pomagają zbudować gospodarkę, ale nie zastępują punktów zwycięstwa (★).',
          },
          {
            text: 'Najwięcej monet',
            correct: false,
            explanation:
              'Monety służą do rozwoju. Zwycięzcę wyznacza przede wszystkim suma punktów zwycięstwa (★).',
          },
        ],
      },
      finish(
        'Gwiazdki na tabliczce pokazują zebrane żetony punktów zwycięstwa (★). Przy rozliczeniu dochodzą punkty zwycięstwa (★) na budynkach i bonusy aktywnych dużych budynków.',
      ),
    ],
  },
  {
    id: 'turns',
    title: 'Runda, role i gubernator',
    description: 'Kto wybiera, kto wykonuje akcję i kto dostaje przywilej.',
    group: 'basics',
    minutes: 3,
    steps: [
      read(
        'Gubernator rozpoczyna rundę',
        'Gubernator to gracz ze złotą literą G przy numerze na tabliczce. Jako pierwszy w rundzie wybiera kartę postaci — sam gubernator nie jest osobną rolą ani botem. Potem wybierają następni gracze w kolejności tabliczek od góry do dołu; po ostatnim wracamy do pierwszego.',
      ),
      read(
        'Twój wybór, wspólna akcja',
        'Gdy wybierzesz rolę, uruchamiasz jej fazę dla wszystkich. Zaczynasz ty, potem pozostali gracze korzystają z tej samej akcji, ale podejmują własne decyzje: mogą np. wybrać inne plantacje lub budynki. Tylko wybierający (w opisach: selektor) ma przywilej tej roli. To nie znaczy, że skopiują twój konkretny ruch.',
      ),
      {
        ...read(
          'Przykład całej rundy: trzech graczy',
          'Przykładowa kolejność: Ty → Inés → Mateo. Każda poniższa faza kończy się przed wyborem następnej roli. W rundzie każdy wybiera jedną kartę, lecz bierze udział także w akcjach wybranych przez rywali.',
        ),
        flow: [
          { title: 'Ty: Plantator', text: 'Jesteś gubernatorem. Ty, Inés i Mateo dobieracie plantacje. Tylko ty masz przywilej wzięcia kamieniołomu.' },
          { title: 'Inés: Budowniczy', text: 'Inés, Mateo i ty możecie kupić po budynku. Tylko Inés ma zniżkę roli: 1 monetę.' },
          { title: 'Mateo: Kupiec', text: 'Mateo, ty i Inés możecie sprzedać po towarze, jeśli pozwala targ. Tylko Mateo ma premię roli: 1 monetę.' },
        ],
      },
      read(
        'Kiedy zmienia się runda?',
        'Po akcji ostatniej wybranej roli runda się kończy. Przy 3 graczach są 3 wybory, przy 4 — 4, przy 5 — 5. Karty wracają do wspólnej puli; na niewybrane trafia po monecie z banku. Gubernator przechodzi do następnej osoby: w naszym przykładzie do Inés. Nową rundę rozpocznie więc Inés, potem wybiorą Mateo i ty.',
      ),
      read(
        'Wybór roli a wykonanie ruchu',
        'Rozegranie akcji rywala nie zużywa twojego wyboru roli. Wybrana karta jest zajęta do końca rundy; monety leżące na karcie bierze jej wybierający. Korzystasz z fazy tylko w granicach zasad i swoich zasobów. Zarządca produkuje automatycznie, a Kapitan może wymagać kilku kolejek załadunku. Wyjątki od wspólnej akcji to Poszukiwacz i Korsarz: działają tylko dla wybierającego.',
      ),
      {
        kind: 'quiz',
        title: 'Inés wybrała Budowniczego. Co robisz?',
        text: 'Masz pieniądze i wolne miejsce w mieście. Nie masz innych zniżek.',
        answers: [
          { text: 'Mogę kupić budynek, ale bez jej zniżki roli.', correct: true, explanation: 'Tak. Akcja jest wspólna, a przywilej roli należy do Inés. Twój wybór roli w tej rundzie pozostaje osobną sprawą.' },
          { text: 'Czekam — buduje tylko Inés.', correct: false, explanation: 'Budowniczy pozwala budować także pozostałym graczom. Każdy wybiera własny budynek.' },
          { text: 'Kupuję z taką samą zniżką roli jak Inés.', correct: false, explanation: 'Zniżkę roli dostaje tylko jej wybierający. Własne aktywne budynki i kamieniołomy to osobne źródła zniżek.' },
        ],
      },
      finish(
        'Zapamiętaj rytm: wybór roli → wspólna akcja → wybór kolejnej osoby. Po jednym wyborze każdego gracza kończy się runda i zmienia gubernator. W dalszych rozdziałach wykonasz te akcje na planszy, a pod koniec obejrzysz prawdziwą zmianę rundy.',
      ),
    ],
  },
  {
    id: 'plantation',
    title: 'Plantator: pierwsza kukurydza',
    description: 'Wybór roli i plantacji; wspólna akcja.',
    group: 'basics',
    minutes: 2,
    steps: [
      role(
        'Plantator',
        'settler',
        'Wybierasz rolę dla tej części rundy. Plantator pozwala graczom zdobyć plantację; wybierający może zamiast niej wziąć kamieniołom.',
      ),
      act(
        'Weź kukurydzę',
        'Kliknij plantacje w San Juan, a potem kukurydzę w otwartym oknie. W tym ćwiczeniu jest przygotowana w odkrytej puli.',
        'plantations',
        corn,
        'San Juan → Plantacje → Kukurydza.',
      ),
      watch,
      finish(
        'Plantacja pojawiła się na twojej wyspie, lecz jeszcze nie produkuje. Teraz potrzebuje pracownika. Przeciwnicy również skorzystali z roli Plantatora.',
      ),
    ],
  },
  {
    id: 'workers',
    title: 'Burmistrz: ludzie do pracy',
    description: 'Obsadzenie plantacji i pozostawienie rezerwy.',
    group: 'basics',
    minutes: 2,
    steps: [
      role(
        'Burmistrz',
        'mayor',
        'Burmistrz rozdziela ludzi z magistratu. Wybierający dostaje dodatkowego pracownika. Przy tej roli możesz ponownie rozmieścić także dotychczasową załogę.',
      ),
      act(
        'Obsadź kukurydzę',
        'Jeden robotnik wystarcza do uruchomienia jednej plantacji kukurydzy.',
        cornTarget,
        (a, s) =>
          place(a) &&
          shape(a).target?.kind === 'plantation' &&
          human(s).island.getPlantationSlots()[shape(a).target!.slotIndex!]
            ?.type === PlantationType.Corn,
        'Kliknij kukurydzę na swojej wyspie i wybierz przydział robotnika.',
      ),
      act(
        'Zostaw drugiego w rezerwie',
        'W tym ćwiczeniu nie ma drugiego miejsca pracy. Zakończ przydział. Niewykorzystani ludzie pozostaną przy tobie do następnego Burmistrza.',
        'actions',
        (a) => a.type === 'MAYOR_PASS',
        'W dolnym panelu wybierz zakończenie przydziału / pas.',
      ),
      watch,
      finish(
        'Pracownik na polu uruchamia plantację. Ludzie stojący na wyspie czekają w rezerwie. Liczba przy tabliczce pozwala sprawdzić, ilu jeszcze można wykorzystać.',
      ),
    ],
  },
  {
    id: 'production',
    title: 'Zarządca: pierwszy towar',
    description: 'Produkcja kukurydzy i przywilej Zarządcy.',
    group: 'basics',
    minutes: 1,
    steps: [
      read(
        'Plantacja jest już obsadzona',
        'W tej przygotowanej sytuacji na kukurydzy pracuje robotnik. Kukurydza jako jedyna nie wymaga zakładu produkcyjnego.',
      ),
      role(
        'Zarządca',
        'craftsman',
        'Zarządca uruchamia produkcję na wszystkich wyspach. Towary pojawią się jako skrzynki z licznikami przy pomostach.',
      ),
      produceBonus,
      watch,
      inspectStock(
        'Po produkcji i przywileju masz 2 kukurydze. Kliknij skład TOWARY przy swoim pomoście i sprawdź licznik. To twoje towary, a nie pula na wspólnej wyspie.',
      ),
      finish(
        'Towary są teraz w twoim zapasie. Możesz później sprzedać je za monety albo wysłać statkiem za punkty zwycięstwa (★). Większa produkcja wymaga dodatkowych obsadzonych pól i odpowiednich zakładów.',
      ),
    ],
  },
  {
    id: 'industry',
    title: 'Budowniczy: Mała Farbiarnia',
    description: 'Koszt, zniżka roli i zakup budynku.',
    group: 'basics',
    minutes: 2,
    steps: [
      read(
        'Indygo potrzebuje zakładu',
        'Na twojej wyspie jest plantacja indygo. Aby produkować indygo, potrzebujesz pracownika na plantacji i pracownika w farbiarni. Budynek na liście nazywa się „Mała Farbiarnia”; większy wariant to „Farbiarnia”. To zakład produkcji indygo. Skład TOWARY przy porcie przechowuje już wyprodukowane towary.',
      ),
      role(
        'Budowniczy',
        'builder',
        'Budowniczy pozwala graczom kupić budynek. Wybierający ma zniżkę jednej monety; kamieniołomy i niektóre budynki mogą zmieniać cenę.',
      ),
      act(
        'Kup Małą Farbiarnię',
        'Otwórz budynki w San Juan. W grupie za 1 monetę znajdź „Małą Farbiarnię” i zatwierdź zakup. Zobacz cenę po zniżce roli.',
        'market:smallIndigoPlant',
        (a) => a.type === 'BUILD' && shape(a).buildingId === 'smallIndigoPlant',
        'Budynki → Mała Farbiarnia → Zbuduj.',
      ),
      watch,
      finish(
        'Budynek zajmuje miejsce w mieście. Sam zakup nie uruchamia produkcji: najpierw przydziel pracowników. Punkty zwycięstwa (★) wydrukowane na kupionym budynku doliczają się do wyniku końcowego.',
      ),
    ],
  },
  {
    id: 'staffing',
    title: 'Uruchom cały łańcuch',
    description: 'Pracownicy na polach i w zakładzie.',
    group: 'basics',
    minutes: 2,
    steps: [
      role(
        'Burmistrz',
        'mayor',
        'Masz kukurydzę, indygo i Małą Farbiarnię. Rozmieść trzech robotników: po jednym w każdym z tych miejsc.',
      ),
      act(
        'Obsadź trzy miejsca',
        'Kolejność jest dowolna. Klikaj własne pola i zakład albo korzystaj z dostępnych ruchów pod mapą.',
        HUMAN,
        place,
        'Robotnik na kukurydzę, robotnik na indygo, robotnik do Małej Farbiarni.',
        workDone,
      ),
      watch,
      finish(
        'Produkcję indygo ogranicza zarówno liczba pracowników na plantacjach, jak i w zakładach. Brak jednego elementu zatrzymuje ten łańcuch. Kukurydza działa niezależnie.',
      ),
    ],
  },
  {
    id: 'indigo',
    title: 'Dwa rodzaje produkcji',
    description: 'Sprawdź działającą gospodarkę.',
    group: 'basics',
    minutes: 1,
    steps: [
      role(
        'Zarządca',
        'craftsman',
        'Wszystkie potrzebne miejsca są już obsadzone. Uruchom produkcję i porównaj dwa rodzaje towarów.',
      ),
      produceBonus,
      watch,
      {
        kind: 'quiz',
        title: 'Dlaczego indygo wymaga dwóch miejsc pracy?',
        text: 'Co musi działać jednocześnie?',
        answers: [
          {
            text: 'Plantacja i farbiarnia',
            correct: true,
            explanation:
              'Tak — możliwości obu części ograniczają ilość produkcji.',
          },
          {
            text: 'Wystarczy sam zakład',
            correct: false,
            explanation:
              'Zakład bez obsadzonej plantacji nie ma czego przetwarzać.',
          },
        ],
      },
      finish(
        'Masz działającą gospodarkę. Następna decyzja dotyczy przeznaczenia towarów: potrzebujesz pieniędzy na rozwój czy punktów zwycięstwa (★)?',
      ),
    ],
  },
  {
    id: 'trade',
    title: 'Kupiec: pieniądze na rozwój',
    description: 'Sprzedaż jednego towaru i ograniczenia targu.',
    group: 'basics',
    minutes: 2,
    steps: [
      role(
        'Kupiec',
        'trader',
        'W zapasie masz dwa indygo. Kupiec pozwala sprzedać jeden towar. Bazowe ceny: kukurydza 0, indygo 1, cukier 2, tytoń 3, kawa 4 monety. Wybierający Kupca dostaje +1 przy sprzedaży.',
      ),
      act(
        'Sprzedaj jedno indygo',
        'Kliknij drewniany szyld targowiska i wybierz sprzedaż indygo.',
        'trade',
        (a) => a.type === 'SELL_GOOD' && shape(a).good === 'indigo',
        'Targowisko → Sprzedaj indygo.',
      ),
      watch,
      inspectStock(
        'Z nabrzeża zniknęło jedno indygo, a monety trafiły do twojej puli. Otwórz skład — została 1 sztuka indygo.',
      ),
      finish(
        'Za tę sprzedaż otrzymujesz 2 monety: 1 ceny bazowej i 1 przywileju. Targ ma cztery miejsca i zwykle nie przyjmuje rodzaju towaru, który już na nim leży. Budynki mogą zmieniać te zasady.',
      ),
    ],
  },
  {
    id: 'shipping',
    title: 'Kapitan: zdobądź punkty zwycięstwa (★)',
    description: 'Ładowanie, pojemność i odpłynięcie statku.',
    group: 'basics',
    minutes: 2,
    steps: [
      role(
        'Kapitan',
        'captain',
        'Masz cztery kukurydze i pusty port. Za każdy wysłany towar otrzymasz żeton punktu zwycięstwa (★). Wybierający Kapitana dostaje dodatkowy punkt zwycięstwa (★) przy pierwszym załadunku.',
      ),
      act(
        'Załaduj najmniejszy statek',
        'Wybierz statek z czterema miejscami i wyślij kukurydzę. Ładujesz maksymalną ilość, która mieści się w ładowni.',
        'ship:0',
        (a) =>
          a.type === 'LOAD_SHIP' &&
          shape(a).target?.shipIndex === 0 &&
          shape(a).good === 'corn',
        'Port → Statek 1 (4 miejsca) → załaduj kukurydzę.',
      ),
      watch,
      inspectStock(
        'Całe 4 kukurydze opuściły twój skład. Otwórz nabrzeże i sprawdź, że zapas jest pusty. Załadunek przyniósł 5 punktów zwycięstwa (★).',
      ),
      finish(
        'Cztery towary i przywilej dają 5 punktów zwycięstwa (★). Jeden statek przewozi jeden rodzaj towaru, a tego samego rodzaju nie rozdzielasz między różne wspólne statki. Pełne statki są opróżniane dopiero po całej fazie Kapitana, więc nie można użyć ich ponownie w jej trakcie.',
      ),
    ],
  },
  {
    id: 'storage',
    title: 'Uważaj na niewysłane towary',
    description: 'Zapełniony port i utrata nadmiaru.',
    group: 'basics',
    minutes: 2,
    steps: [
      read(
        'Port nie pomieści wszystkiego',
        'W tym ćwiczeniu masz 1 kukurydzę i 3 kawy. W porcie są już inne towary. Jedno wolne miejsce przyjmie kukurydzę, ale kawa nie pasuje do żadnego statku.',
      ),
      role(
        'Kapitan',
        'captain',
        'Jeśli możesz ładować, musisz to zrobić. Po zakończeniu wysyłki bez magazynu zachowasz tylko jeden niewysłany towar.',
      ),
      act(
        'Wyślij kukurydzę',
        'Zapełnij ostatnie miejsce statku z kukurydzą. Potem obserwuj, co stanie się z kawą.',
        'ship:0',
        (a) => a.type === 'LOAD_SHIP' && shape(a).good === 'corn',
        'Kliknij pierwszy statek i załaduj kukurydzę.',
      ),
      watch,
      inspectStock(
        'Po załadunku i odrzuceniu nadwyżki na nabrzeżu została 1 kawa. Otwórz skład i porównaj go z początkowymi 3 kawami i 1 kukurydzą.',
      ),
      finish(
        'Została 1 kawa; 2 niewysłane kawy wróciły do puli. Magazyny pomagają zachowywać towary. Zanim wybierzesz Zarządcę lub Kapitana, sprawdź pojemność i rodzaje ładunków w porcie.',
      ),
    ],
  },
  {
    id: 'blockade',
    title: 'Zablokuj port rywalowi',
    description: 'Mniejszy zysk teraz, lepsza przewaga po całej fazie.',
    group: 'basics',
    minutes: 4,
    steps: [
      read(
        'Najpierw spójrz na rywala',
        'Masz 1 kukurydzę i 3 kawy. Inés ma 4 cukry; nikt nie ma magazynu ani własnego Nabrzeża. Statek 1 jest pusty, statek 2 wiezie indygo, a statek 3 kawę i ma 4 wolne miejsca. Tylko pusty statek może przyjąć nowy rodzaj towaru.',
      ),
      {
        kind: 'inspect',
        title: 'Sprawdź cztery cukry Inés',
        text: 'Otwórz skład Inés przy jej pomoście. Te 4 cukry oznaczają potencjalnie 4 punkty zwycięstwa (★), jeśli zdąży zająć pusty statek.',
        target: 'stock:player-1',
        focus: 'player-1',
        hint: 'Kliknij skrzynki TOWARY na wyspie Inés albo jej tabliczkę → Skład towarów przy porcie.',
      },
      {
        kind: 'quiz',
        title: 'Co wyślesz jako pierwsze?',
        text: 'Kapitan da ci dodatkowy 1 punkt zwycięstwa (★) przy pierwszym załadunku. Sama kawa daje większy zysk od razu, ale sprawdź kolejkę: po tobie ładuje Inés.',
        answers: [
          { text: 'Kukurydzę na jedyny pusty statek.', correct: true, explanation: 'Zajmiesz statek innym towarem. Dla cukru zabraknie miejsca, a twoja kawa nadal ma swój statek.' },
          { text: 'Trzy kawy — od razu dostanę więcej gwiazdek.', correct: false, explanation: 'Dostaniesz 4 punkty zwycięstwa (★) od razu, ale potem Inés wyśle 4 cukry pustym statkiem. Twoja kukurydza straci możliwość załadunku.' },
        ],
      },
      role('Kapitan', 'captain', 'Wybierz Kapitana teraz, zanim rywal sprzeda cukier lub zabezpieczy zapas. Najpierw zablokujesz pusty statek, a potem wyślesz kawę.'),
      act(
        'Zajmij pusty statek kukurydzą',
        'Wyślij 1 kukurydzę statkiem 1 (4 miejsca). Dostaniesz 2 punkty zwycięstwa (★): 1 za towar i 1 przywileju. Pozostałe miejsca na tym statku będą odtąd tylko na kukurydzę.',
        'ship:0',
        (a) => a.type === 'LOAD_SHIP' && shape(a).good === 'corn' && shape(a).target?.shipIndex === 0,
        'Port → Statek 1 → Załaduj Kukurydza.',
      ),
      read(
        'Inés nie ma dokąd załadować cukru',
        'Wszystkie statki mają już rodzaj ładunku: kukurydza, indygo i kawa. Inés nie może wysłać cukru, więc gra pomija jej załadunek. Cukier jeszcze leży na jej wyspie: nadwyżka znika dopiero po zakończeniu całej fazy. Teraz znowu możesz ładować ty.',
      ),
      act(
        'Teraz wyślij swoją kawę',
        'Statek 3 nadal ma miejsce na wszystkie 3 kawy. Dostaniesz kolejne 3 punkty zwycięstwa (★). Przywilej Kapitana nie powtarza się przy każdym załadunku.',
        'ship:2',
        (a) => a.type === 'LOAD_SHIP' && shape(a).good === 'coffee' && shape(a).target?.shipIndex === 2,
        'Port → Statek 3 z kawą → Załaduj Kawa.',
      ),
      watch,
      {
        kind: 'inspect',
        title: 'Zobacz, co zostało Inés',
        text: 'Faza się skończyła. Inés zachowała 1 cukier, a 3 wróciły do wspólnej puli. Nie zdobyła punktów zwycięstwa (★) za wysyłkę. Otwórz jej skład i sprawdź zmianę 4 → 1.',
        target: 'stock:player-1',
        focus: 'player-1',
        hint: 'Skład TOWARY na wyspie Inés → Cukier: 1.',
      },
      {
        ...read('Porównaj obie kolejności', 'To wynik całej fazy na tej przygotowanej planszy, z przywilejem Kapitana w twoim wyniku. Różnicę robi pierwszy załadunek.'),
        comparison: [
          { order: 'Najpierw kawa', you: 4, rival: 4, result: 'Inés wysyła cukier. Zachowujesz 1 niewysłaną kukurydzę.' },
          { order: 'Najpierw kukurydza', you: 5, rival: 0, result: 'Wysyłasz także kawę. Inés zachowuje 1 cukier, traci 3.' },
        ],
      },
      finish(
        'Nie zawsze warto brać największy zysk w pierwszym ruchu. Tutaj blokada była pilna, a kawę można było bezpiecznie wysłać później w tej samej fazie. Oceniaj całą kolejkę oraz korzyści rywali. Magazyn chroni zapas, własne Nabrzeże umożliwia wysyłkę, a inny gracz może zająć potrzebne miejsce — taki manewr nie zawsze zadziała.',
      ),
    ],
  },
  {
    id: 'round',
    title: 'Kto wybiera następną rolę?',
    description: 'Runda, gubernator i monety na kartach.',
    group: 'basics',
    minutes: 1,
    steps: [
      read(
        'Ostatni wybór tej rundy',
        'To przygotowana końcówka rundy. Inés i Mateo już wybrali postacie. Teraz ty wybierzesz trzecią, ostatnią rolę. Każdą dostępną kartę można wybrać tylko raz w rundzie.',
      ),
      role(
        'Kupiec',
        'trader',
        'Po tej akcji runda się zakończy. Sprzedaj indygo i obejrzyj zmianę gubernatora.',
      ),
      act(
        'Sprzedaj indygo',
        'Zarabiasz jak w poprzednim ćwiczeniu.',
        'trade',
        (a) => a.type === 'SELL_GOOD' && shape(a).good === 'indigo',
        'Targowisko → Sprzedaj indygo.',
      ),
      watch,
      finish(
        'Zakończyła się runda 4. Gubernator przeszedł z Inés do Mateo: to on pierwszy wybierze rolę w rundzie 5, potem ty, a następnie Inés. Karty znów są dostępne, a na niewybranych przybyło po monecie. Zmiana gubernatora zmienia pierwszeństwo w następnym zestawie wyborów.',
      ),
    ],
  },
  {
    id: 'ending',
    title: 'Koniec gry i pełny wynik',
    description: 'Dwunaste miejsce miasta i rozliczenie.',
    group: 'basics',
    minutes: 2,
    steps: [
      read(
        'Miasto jest prawie pełne',
        'To przygotowana końcówka partii: twoje miasto ma zajętych 11 z 12 pól, a ta rola zamknie rundę. Kup mały magazyn, aby zobaczyć prawdziwe zakończenie gry.',
      ),
      role(
        'Budowniczy',
        'builder',
        'Niektóre duże budynki zajmują dwa pola. Teraz wystarczy mały magazyn na ostatnie wolne pole.',
      ),
      act(
        'Wypełnij miasto',
        'Kup mały magazyn w San Juan.',
        'market:smallWarehouse',
        (a) => a.type === 'BUILD' && shape(a).buildingId === 'smallWarehouse',
        'Budynki → Mały magazyn → Zbuduj.',
      ),
      watch,
      finish(
        endingRule +
          ' Poniżej zobaczysz wynik tej przygotowanej partii. Bonusy dużych budynków wymagają ich aktywacji.',
      ),
    ],
  },
  {
    id: 'trial',
    title: 'Spróbuj bez strzałek',
    description: 'Samodzielnie uruchom produkcję i wyślij towar.',
    group: 'practice',
    minutes: 5,
    steps: [
      read(
        'Twoja pierwsza samodzielna próba',
        'Masz nieobsadzoną kukurydzę. Zorganizuj pracownika, doprowadź do produkcji i wyślij własny towar za punkty zwycięstwa (★). Przeciwnicy normalnie uczestniczą w rolach. W razie potrzeby użyj „Podpowiedz”.',
      ),
      act(
        'Wyprodukuj i wyślij towar',
        'Wybieraj dowolne legalne ruchy. Cel: działająca produkcja i przynajmniej jeden twój załadunek.',
        undefined,
        () => true,
        'Zwykle potrzebujesz Burmistrza, potem Zarządcy, a na końcu Kapitana. Z roli wybranej przez rywala też możesz skorzystać.',
        (_s, f) => f.produced && f.shipped > 0,
      ),
      finish(
        'Potrafisz już zamienić pracownika i plantację w towary oraz punkty zwycięstwa (★). Możesz rozpocząć zwykłą grę z opiekunem, który podpowiada przy twoich decyzjach, lub poznać dodatki.',
      ),
    ],
  },
  {
    id: 'forest',
    title: 'Nowe budynki: lasy',
    description: 'Przykład działania Szałasu.',
    group: 'expansions',
    minutes: 2,
    steps: [
      read(
        'Szałas zmienia wybór plantacji',
        'W tym ćwiczeniu masz aktywny Szałas. Pozwala położyć wybraną plantację jako las. Lasy nie produkują towarów; każde dwa pomagają obniżyć koszt budowy o monetę.',
      ),
      role(
        'Plantator',
        'settler',
        'Zobacz dodatkowy wariant w oknie plantacji.',
      ),
      act(
        'Posadź las',
        'Wybierz wariant „Las” zamiast zwykłej plantacji.',
        'plantations',
        (a) => a.type === 'TAKE_PLANTATION' && !!shape(a).asForest,
        'W oknie plantacji kliknij kafelek Las.',
      ),
      watch,
      finish(
        'Nowe budynki zmieniają konkretne reguły. Czytaj opis ich działania i pamiętaj o pracownikach. Samo posiadanie nieaktywnego budynku zwykle nie daje jego zdolności.',
      ),
    ],
  },
  {
    id: 'nobles',
    title: 'Szlachcic: inny pracownik',
    description: 'Przydział szlachcica i jego punkt zwycięstwa (★).',
    group: 'expansions',
    minutes: 2,
    steps: [
      role(
        'Burmistrz',
        'mayor',
        'W magistracie czeka również szlachcic. Może obsadzać dozwolone miejsca i daje punkt zwycięstwa (★) w końcowym rozliczeniu. Niektóre budynki mają różne efekty dla robotnika i szlachcica.',
      ),
      act(
        'Przydziel szlachcica do indygo',
        'Kliknij swoje pole indygo i wybierz przydział szlachcica.',
        HUMAN + ':plantation:0',
        (a) => a.type === 'PLACE_WORKER' && !!shape(a).asNoble,
        'Na polu indygo wybierz ruch ze szlachcicem, nie robotnikiem.',
      ),
      act(
        'Zakończ rozmieszczanie',
        'Pozostałych pracowników możesz zostawić w rezerwie.',
        'actions',
        (a) => a.type === 'MAYOR_PASS',
        'Zakończ przydział w dolnym panelu.',
      ),
      watch,
      finish(
        'Szlachcic pracuje na twojej wyspie i daje 1 punkt zwycięstwa (★) na koniec gry. W tym dodatku wyczerpanie robotników nie jest warunkiem zakończenia gry. Sprawdzaj oba warianty zdolności nowych budynków.',
      ),
    ],
  },
  {
    id: 'corsair',
    title: 'Korsarz: przejmij ładunek',
    description: 'Osobna rola i przykład piractwa.',
    group: 'expansions',
    minutes: 2,
    steps: [
      role(
        'Korsarz',
        'corsair',
        'Na statku czekają trzy kukurydze. Korsarz wykonuje swoją specjalną akcję. W tym ćwiczeniu poznasz piractwo; pozostałe możliwości opisuje karta tej roli.',
      ),
      act(
        'Przejmij ładunek',
        'Otwórz Korsarza na wyspie San Juan i wybierz piractwo na pierwszym statku.',
        'corsair',
        (a) => a.type === 'CORSAIR_PIRACY',
        'Korsarz → Piractwo na statku z kukurydzą.',
      ),
      watch,
      finish(
        'Piractwo opróżnia wybrany statek i pozwala zachować do 3 przejętych towarów. Żeton Korsarza ogranicza ponowny wybór tej roli — sprawdzaj dostępne akcje i opis karty.',
      ),
    ],
  },
  {
    id: 'festival',
    title: 'Festyn: wyścig po nagrodę',
    description: 'Wspólne zadanie na wyspie San Juan.',
    group: 'expansions',
    minutes: 2,
    steps: [
      {
        kind: 'inspect',
        title: 'Sprawdź zadania Festynu',
        text: 'Otwórz Festyn na wyspie San Juan. Przygotowane zadanie uprawy wymaga trzech plantacji kukurydzy. Masz już dwie.',
        target: 'festival',
        focus: 'central',
        hint: 'Kliknij Festyn w San Juan albo przycisk Festyn pod mapą.',
      },
      role(
        'Plantator',
        'settler',
        'Zdobądź trzecią plantację przed przeciwnikami.',
      ),
      act(
        'Weź trzecią kukurydzę',
        'Nagroda wynika ze spełnienia celu, nie z samego wybrania roli.',
        'plantations',
        corn,
        'Plantacje → Kukurydza.',
      ),
      watch,
      finish(
        'Zadanie jest oznaczone jako wykonane przez ciebie. Nagrodą uprawy są 3 robotnicy w rezerwie. Pozostałe cele Festynu dotyczą produkcji i budowy; ich wymagania sprawdzisz na wspólnej wyspie.',
      ),
    ],
  },
];
export function targetFor(step: LessonStep, state: GameState) {
  return typeof step.target === 'function'
    ? step.target(state)
    : (step.target ?? null);
}
