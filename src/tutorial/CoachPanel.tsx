import { useState } from 'react';
import type { GameState } from '../../state/GameState';
import { ProductionBuilding } from '../../domain/buildings/ProductionBuilding';
import { PlantationType } from '../../core/types';

export function coachAdvice(state: GameState) {
  const p = state.getCurrentPlayer(),
    phase = state.getCurrentPhase().type;
  const goods = p.getTotalStoredGoods();
  const ready =
    p.island.countActivePlantations(PlantationType.Corn) > 0 ||
    p.island
      .getBuildings()
      .some(
        (b) =>
          b instanceof ProductionBuilding &&
          b.isActive() &&
          p.island.countActivePlantations(
            b.produces as unknown as PlantationType,
          ) > 0,
      );
  if (phase === 'roleSelection')
    return {
      title: goods
        ? 'Masz towary. Co z nimi zrobisz?'
        : 'Zaplanuj następny etap rozwoju',
      text: goods
        ? 'Skrzynki przy twoim pomoście pokazują zapas. Kupiec daje monety za sprzedaż, Kapitan punkty zwycięstwa (★) za wysyłkę. Sprawdź wolne miejsca na targu i statkach.'
        : ready
          ? 'Masz obsadzone miejsca produkcji. Zarządca może dać towary, jeśli są dostępne w puli.'
          : 'Sprawdź brakujący element: plantację, zakład lub pracownika. Plantator, Budowniczy i Burmistrz pomagają rozwinąć wyspę.',
      detail:
        'Gubernator zaczyna rundę; potem każdy wybiera jedną dostępną kartę. Wspólną akcję wykonują także rywale, lecz przywilej ma tylko wybierający. Sprawdź ich zapasy: czasem warto zająć ostatni pusty statek, zanim wyślą nim swój towar. Na niewybranych kartach gromadzą się monety.',
    };
  const tips: Record<string, { title: string; text: string; detail: string }> =
    {
      settler: {
        title: 'Dobierz plantację do swoich możliwości',
        text: 'Kukurydza potrzebuje tylko pracownika. Indygo wymaga także obsadzonej Małej Farbiarni lub Farbiarni. Cukier, tytoń i kawa mają własne zakłady.',
        detail:
          'Kamieniołomy dają zniżki na budowę. Wybierający Plantatora może wziąć kamieniołom dzięki przywilejowi. Liczba pól na wyspie jest ograniczona.',
      },
      mayor: {
        title: 'Obsadź działający łańcuch',
        text: 'Ludzi z magistratu gra rozdała po jednym od wybierającego Burmistrza; jemu dodała przywilej z puli. Licznik obejmuje też twoich dotychczasowych pracowników i rezerwę. Teraz wskaż im miejsca pracy.',
        detail:
          'Przykład podstawowego podziału: 8 ludzi i 3 graczy daje 3, 3, 2 od wybierającego; z jego dodatkowym robotnikiem jest 4, 3, 2. Po fazie magistrat dostanie tylu robotników, ile pustych miejsc pracy w budynkach wszystkich graczy, minimum liczbę graczy, w granicach puli. Plantacji nie liczymy. Niewykorzystani pracownicy zostają w twojej rezerwie.',
      },
      builder: {
        title: 'Kup budynek, który wykorzystasz',
        text: 'Zobacz cenę po zniżkach oraz potrzebnych pracowników. Sam zakup zwykle nie uruchamia zdolności budynku.',
        detail:
          'Podstawowe punkty zwycięstwa (★) na budynkach liczą się także bez obsady. Bonusy końcowe dużych budynków wymagają aktywacji. Pełne miasto może zakończyć grę po rundzie.',
      },
      craftsman: {
        title: 'Sprawdź wynik produkcji',
        text: 'Towary pojawiają się w składzie przy pomoście. Powstają z obsadzonych plantacji i zakładów, w granicach wspólnej puli. Wybierający Zarządcę może odebrać dodatkowy dostępny towar.',
        detail:
          'Przed kolejną produkcją pomyśl o sprzedaży lub wysyłce. Duży zapas może się zmarnować, jeśli w porcie nie będzie miejsca.',
      },
      trader: {
        title: 'Sprzedajesz jeden towar',
        text: 'Cena bazowa i przywilej Kupca mogą dać pieniądze na kolejny budynek. Targ ma cztery miejsca i zwykle nie przyjmuje powtórzonego rodzaju.',
        detail:
          'Kukurydza ma cenę bazową 0. Indygo 1, cukier 2, tytoń 3, kawa 4. Uwzględnij bonus roli i aktywne budynki; ceny na legendzie są bazowe.',
      },
      captain: {
        title: state.captainStoragePending
          ? 'Wybierz towary do przechowania'
          : 'Punkty zwycięstwa (★) za wysłane towary',
        text: state.captainStoragePending
          ? 'Twój magazyn pozwala zachować określone rodzaje towarów. Sprawdź wybór, zanim zatwierdzisz.'
          : 'Gdy możesz ładować, musisz wykonać załadunek. Jeden statek mieści jeden rodzaj towaru; ładujesz maksymalną możliwą ilość.',
        detail:
          'Załadunek daje zwykle 1 punkt zwycięstwa (★) za towar. Zajęcie ostatniego pustego statku może zablokować inny rodzaj towaru rywala. Bez magazynu po całej fazie zachowuje on tylko 1 sztukę niewysłanego towaru. Sprawdź jego Nabrzeże i magazyny, zanim zaplanujesz blokadę.',
      },
    };
  return (
    tips[phase] ?? {
      title: 'Sprawdź kartę bieżącej postaci',
      text: 'Otwórz Akcje i pytajnik przy podświetlonej roli. Dostępne ruchy zależą od bieżącego gracza i sytuacji na planszy.',
      detail:
        'Szczegóły wspólnych komponentów i dodatków znajdziesz na wyspie San Juan.',
    }
  );
}
export function CoachPanel({ state }: { state: GameState }) {
  const [more, setMore] = useState(false),
    tip = coachAdvice(state);
  return (
    <section className="pr-coach-panel" aria-label="Opiekun gry">
      <span className="pr-tutor-eyebrow">
        OPIEKUN · {state.getCurrentPlayer().name}
      </span>
      <h2>{tip.title}</h2>
      <p>{tip.text}</p>
      {more && <p>{tip.detail}</p>}
      <button onClick={() => setMore((v) => !v)}>
        {more ? 'Zwiń' : 'Dlaczego?'}
      </button>
      <small>Podpowiedź zasad i możliwości — decyzja należy do ciebie.</small>
    </section>
  );
}
