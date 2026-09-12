# Neural dla 3–5 graczy — raport zbiorczy, 12 września 2026

**Cel — bot potwierdzony jako silniejszy od Hardcore przy każdej liczbie graczy — nie został jeszcze osiągnięty.** Działa już eksperymentalna sieć dla 3, 4 i 5 osób. Ukończono 1032 pełne partie w głównych seriach, 2562 mocniejsze analizy pozycji i pięć prób treningowych. Najnowsze uczenie wartości daje obiecujący sygnał dla 4–5 osób, lecz ten model nie został jeszcze sprawdzony w turnieju.

## Wynik najważniejszego turnieju

Kandydat grał przeciw pozostałym Hardcore; kontrola to Hardcore zajmujący jego miejsce w osobnej partii. Każda konfiguracja miała 10 nowych losowań początkowych i pełne rotacje miejsc. Wszystkie boty dostały taki sam limit 650 ms na decyzję wyszukiwania i maksymalnie 1500 iteracji. Nie zmieniano modeli w trakcie testu.

| Graczy | Wybrana polityka | Zwycięstwa kandydata | Kontrola Hardcore | Różnica | Sparowany przedział 95% |
|---|---|---:|---:|---:|---|
| 3 | Q | 15/30 — 50% | 13/30 — 43,3% | +6,7 pp | [−16,7; +36,7] pp |
| 4 | wizyty | 13/40 — 32,5% | 14/40 — 35% | −2,5 pp | [−25; +17,5] pp |
| 5 | wizyty + pierwotna wartość | 11/50 — 22% | 10/50 — 20% | +2 pp | [−14; +20] pp |

**Wszystkie przedziały obejmują zero: nie ma wystarczającego potwierdzenia przewagi.** Wcześniejszy pilot 100 ms wskazywał dużo większe zyski (8/12 vs 3/12, 8/16 vs 2/16, 8/20 vs 5/20), ale służył wyborowi modeli na tylko czterech losowaniach. Jego wyników nie udało się odtworzyć przy pełnym czasie.

Pierwotna sieć wartości zachowała zerową wyuczoną korektę. Jej użycie w wariancie pięcioosobowym dodawało obliczenia, lecz wyników nie wolno przypisywać nowej umiejętności oceny pozycji.

Dane: confirmation-result.json, confirmation-plan.json, confirmation-audit.json.

## MCTS kontra testowany wariant 1-ply

Na nowych losowaniach, przy 650 ms, wariant 1-ply z dotychczasową siecią dla 3 osób uzyskał **3/30**, a kontrola **13⅓/30** kredytu zwycięstwa. Kontrola miała 13 samodzielnych zwycięstw i udział ⅓ w remisie. Różnica −34,44 pp, przedział 95% [−47,78; −21,11] pp; średnia marża punktów gorsza o 5,03.

Ta wersja rozdzielała symulacje równomiernie między pierwsze decyzje, ze wspólnymi losowaniami alternatyw i horyzontem dwóch rund. Mieściła średnio 187 symulacji na wyszukiwanie wobec 303 kontroli. **Ten konkretny wariant odrzucam; zachowuję MCTS jako główny kierunek.** Nie jest to dowód przeciw wszystkim możliwym algorytmom 1-ply. Korzystny wynik małego screeningu 24 iteracji nie utrzymał się w rzeczywistym budżecie czasu.

Dane: flat-confirmation-result.json, flat-confirmation-plan.json, flat-confirmation-audit.json.

## Co zmieniło się w sieci

- Nowy opis pozycji: 543 cechy publiczne, do pięciu wysp, maski nieobecnych miejsc, liczba graczy, pojemności statków oraz rozróżnienie obu kart Poszukiwacza.
- Polityka 543 → 64 → 101 rodzajów akcji. Stare wagi przeniesiono po nazwach cech; legalne ruchy są maskowane. Przy 4–5 osobach nowy adapter naprawdę wywołuje sieć. Wersja wydana wcześniej w tych konfiguracjach przechodziła na Hardcore.
- 108 ukończonych partii dostarczyło 2562 pozycji ponownie ocenionych po 512 iteracji. Porównano uczenie z liczby wizyt i z ocen Q.
- Polityki poprawiły dopasowanie do nauczyciela na walidacji, ale nie zapewniły potwierdzonego wzrostu liczby zwycięstw. Nauczyciel nadal korzysta z oceny Hardcore i horyzontu dwóch rund; sama liczba epok nie usuwa tego ograniczenia.

## Nowa liga self-play i działająca korekta wartości

Po turniejach ukończono kolejne **180 partii**, po 60 dla każdej liczebności, przy stałych 64 iteracjach: 60 partii Hardcore, 60 mieszanych Hardcore/Q/wizyty oraz 60 self-play zamrożonych polityk. Zebrano 4320 przykładów oceniania zwycięzcy na granicach ról.

144 nowe gry dołączyły do dawnych 87 treningowych. Dawne 21 walidacyjnych służyło do wyboru epoki i jednej z dwóch zaplanowanych szybkości uczenia. **36 nowych całych partii, po 12 na liczebność, odłożono do niezależnej oceny dopiero po zapisaniu wyboru modelu.**

Limit generowania zadań upłynął tuż przed treningiem. Nie zmieniono starego eksperymentu: uruchomiono osobną kontynuację samego treningu na wszystkich gotowych danych, bez dodatkowych partii i bez zmian parametrów uczenia. Obie próby treningowe zakończyły się o 17:50. Wybrano szybkość 0,0001 i epokę 3. Strata na walidacji spadła z 1,1819 do 1,1649; korekta sieci jest tym razem rzeczywiście niezerowa.

| Graczy | Nowe partie odłożone do testu | Błąd oceny Hardcore | Błąd nowej sieci | Zmiana błędu |
|---|---:|---:|---:|---:|
| 3 | 12 | 0,9119 | 0,9333 | +2,35% — gorzej |
| 4 | 12 | 1,1462 | 1,0789 | −5,88% — lepiej |
| 5 | 12 | 1,5336 | 1,4644 | −4,51% — lepiej |

Błąd to entropia krzyżowa przewidywania zwycięzcy; mniej oznacza lepiej. **Te procenty nie są wzrostem odsetka wygranych.** Próba pozostaje niewielka, po 12 niezależnych partii; dla 4 osób sparowany przedział różnicy błędu sięga zera, dla 5 jest ujemny. To wskazówka do kolejnego turnieju, a nie podstawa publikacji.

Krzywe uczenia pokazują też, dlaczego samo wydłużenie treningu szkodziło: błąd na danych treningowych nadal malał, ale po kilku epokach wynik walidacji pogarszał się. Więcej i bardziej różnorodnych partii pomogło bardziej niż kolejne epoki na małej bazie.

Dane: value-league-audit.json, value-retrain-result.json, value-retrain-audit.json, value-retrain-plan.json. Wybrany model: models/league-value.json; SHA-256 738c62b2b62452784776a77553a52c4d068eea315a079d21018b7b20fca71b01.

## Bilans i weryfikacja

| Etap | Pełne partie |
|---|---:|
| Screening różnych metod | 204 |
| Pierwsze dane treningowe | 108 |
| Pilot 100 ms | 240 |
| Niezależne potwierdzenie 650 ms | 240 |
| Osobny test 1-ply 650 ms | 60 |
| Nowa liga danych | 180 |
| **Łącznie** | **1032** |

Nie wliczam krótkich prób technicznych ani gier uruchamianych w testach jednostkowych. Mocniejsze etykiety 512-iteracyjne nie są dodatkowymi pełnymi partiami.

506 testów w 44 plikach przeszło przy wdrażaniu modułów dla 3–5 osób, w tym 17 nowych testów. Sprawdzenia typów aplikacji i wszystkich nowych sterowników zakończyły się powodzeniem. Weryfikacja źródeł potwierdza zachowanie silnika, produkcyjnego Hardcore i interfejsu. Osobno sprawdzono kompletność zapisów obu turniejów, punktację, remisy, wywołania sieci i limity iteracji. Końcowy trening ma zweryfikowane 148 skrótów źródeł, 288 plików danych oraz rozłączne zbiory treningowe/walidacyjne/testowe.

**Nie wdrożono eksperymentalnych modeli na Cloudflare ani do menu gry.** Kod i modele w tym katalogu są materiałem badawczym. Historia prac znajduje się w dziennik.md.

## Dalszy kierunek

1. Sprawdzić nową sieć wartości w MCTS przy 4 i 5 graczach, osobno porównując tę samą politykę z wyuczoną oceną i bez niej, plus kontrolę Hardcore. Użyć nowych losowań i równego czasu.
2. Dla 3 osób zachować politykę Q jako kandydata, ale nie dokładać gorszej oceny wartości. Poprawiać nauczyciela i cel uczenia, również przez próbę dłuższego horyzontu jako osobne badanie.
3. Rozbudować ligę różnorodnych przeciwników i badać generalizację całymi partiami. Większa sieć ma niższy priorytet niż lepsze etykiety i dane.
4. Zmiany heurystyki robotników, handlu czy statków testować osobno, gdy diagnostyka wskaże konkretną słabość.

Nie osiągnęliśmy dowiedzionego sufitu sieci. **Nie ma też gwarancji, że samo dalsze trenowanie da mocniejszego bota.** Dzisiejszy wynik zawęził kierunek: MCTS z lepszą wyuczoną oceną, szczególnie dla 4–5 osób, jest bardziej uzasadniony niż testowany płaski 1-ply.
