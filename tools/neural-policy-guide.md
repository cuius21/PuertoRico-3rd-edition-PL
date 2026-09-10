# Trening polityki ruchów Puerto Rico

Ta ścieżka rozwija sieć wybierającą ruchy, używaną razem z przeszukiwaniem
drzewa gry. Jest odrębna od starszych eksperymentów z neuronową oceną
wartości pozycji. Sieć nie aktualizuje wag podczas gry użytkownika.

## Co robi model

Model czyta 344 cechy publicznej pozycji, ma jedną warstwę ukrytą64 i99
semantycznych rodzajów akcji. Normalizuje prawdopodobieństwa wyłącznie
pośród legalnych ruchów. Wariant residual dodaje wyuczoną korektę do
priorytetów heurystycznych. Wynik symulacji nadal ocenia funkcja Hardcore.

Obecny schemat obsługuje podstawową grę trzyosobową. Wyuczone priorytety
i wybór ruchu w symulacji stosujemy w wyborze postaci, budowaniu, handlu
i wyborze plantacji. Kapitan, bonus zarządcy i rozmieszczanie robotników
korzystają z dotychczasowych reguł. Nie deklarować użycia sieci w4–5osób
ani z dodatkami: adapter `NeuralBot` zachowuje tam dokładnego Hardcore.

## Dlaczego samo zmniejszanie błędu nie wystarczyło

Pierwszy model polityki na102grach zmniejszył błąd cross-entropy z1,643
do1,488, ale zgodność z najlepszym ruchem nauczyciela spadła z65,52%
do58,62%. W turnieju wypadł słabiej. Odtwarzanie rozmytego rozkładu wizyt
nie było wystarczającym kryterium siły gry.

Cel treningu został zaostrzony: `normalize(visits ** 4)`, czyli temperatura
0,25. Transformacja nie zmienia najlepszej akcji nauczyciela. Jednocześnie
ograniczono użycie sieci do faz, w których walidacja wykazała poprawę.
W pilotażu trzeba oddzielić wpływ wag od zmiany losowości symulacji:
wariant `calm` ma taką samą eksplorację0,08 i nie używa wyuczonych wag.
Lepszy loss lub top1 nadal nie zastępuje niezależnego turnieju.

## Kolejność pracy

Polecenia uruchamia się z katalogu projektu. Przykłady poniżej opisują
istniejące eksperymenty; nie uruchamiać ich ponownie do tych samych plików
ani nie używać tych samych seedów jako nowych niezależnych testów.

1. Zbierz pełne partie nauczyciela. Stała liczba iteracji daje powtarzalne
   etykiety; nie jest to benchmark produkcyjnego limitu czasu.

   ```powershell
   node --import ./tools/register-typescript.mjs tools/collect-policy.ts --games 360 --iterations 96 --workers 4 --seed 27090903 --exploration 0.08 --output work/neural-policy/teacher-360-i96.dataset.json
   ```

2. Trenuj na rozłącznych całych partiach. `--resume` zachowuje poprzedni
   podział train/validation, architekturę, temperaturę oraz stan optymalizatora.
   Każde wyjście powinno mieć nową nazwę. Model do użycia nie zawiera stanu
   optymalizatora; plik `.checkpoint.json` służy do kolejnego treningu.

   ```powershell
   node --import ./tools/register-typescript.mjs tools/train-policy.ts --input work/neural-policy/teacher-360-i96.dataset.json --output work/neural-policy/policy-focused-360.json --resume work/neural-policy/policy-focused-expanded.json.checkpoint.json --epochs 30 --learning-rate 0.0005 --patience 6 --seed 27090911
   ```

   Gdy sieć działa tylko w części faz, można podać
   `--selection-phases roleSelection,builder,trader,settler`. Trening nadal
   obejmuje wszystkie przykłady, ale checkpoint i early stopping zależą
   od straty w wybranych fazach. Raport zachowuje osobno pełne metryki
   oraz `selectionTargetCrossEntropy`. Bez flagi nowy trening używa wszystkich
   faz, a resume dziedziczy zapisany wybór. `--selection-phases all` jawnie
   przywraca wszystkie fazy; zmiana kryterium przy resume jest zapisywana.

3. Zamroź model i sprawdź grę przeciw niezmienionemu Hardcore. `search-lab`
   zapisuje modelHash, hashe źródeł, konfigurację oraz pełne wyniki partii.
   `--games 90` oznacza90partii kandydata plus90kontroli, nie90łącznie.
   Rotacje miejsc współdzielą środowisko; przedział nie traktuje ich jako
   niezależnych obserwacji. Przy testach siły podawaj równy limit czasu,
   np.650ms, a stałe iteracje zostaw do diagnostyki i testów zgodności.

4. Zbierz kolejną ligę z modelem kierującym przeszukiwaniem. Tryb `mixed`
   równoważy partie z0/1/2/3sieciami oraz ich miejsca w cyklu12gier.
   To kolejny krok uczenia od przeszukiwania: model prowadzi symulacje,
   przeszukiwanie tworzy nowe rozkłady wizyt, a następna sieć uczy się ich
   na nowych pozycjach. Faktyczni nauczyciele i hash modelu są zapisani
   osobno dla każdej partii; historyczne `record.policies` tego nie opisuje.

   ```powershell
   node --import ./tools/register-typescript.mjs tools/collect-policy.ts --games 96 --iterations 96 --workers 2 --seed 38090947 --exploration 0.08 --teacher mixed --model work/neural-policy/policy-focused-expanded.json --output work/neural-policy/teacher-neural-league-96-i96.dataset.json
   ```

5. Łącz tylko kompletne, zgodne źródła. `merge-policy` odrzuca duplikaty
   seedów, różne schematy, sprzeczne pochodzenie nauczycieli oraz różne
   liczby iteracji. Zachowuje wartości i kolejność przykładów; nie usuwa
   cicho powtórek. Resume wymaga obecności wcześniejszych partii w wejściu.

   ```powershell
   node --import ./tools/register-typescript.mjs tools/merge-policy.ts --input work/neural-policy/teacher-360-i96.dataset.json --input work/neural-policy/teacher-neural-league-96-i96.dataset.json --output work/neural-policy/teacher-combined-456-i96.dataset.json
   ```

6. Ponownie trenuj, następnie wykonaj niezależne testy. Seedy użyte do
   doboru wariantu, treningu, walidacji i pilotaży nie mogą stać się nowym
   testem potwierdzającym. Zachowuj także nieudane wyniki. Przed końcowym
   testem zapisz jego zakres i kryterium; nie dopisuj partii aż do sukcesu.

## Bieżąca weryfikacja NN240

Zamknięty plan znajduje się w
`reports/neural-policy/policy-expanded-production-plan.md`. Obejmuje dwa
niezależne bloki po90+90partii przy650ms. Driver
`tools/finish-policy-confirmation.ts` jest specyficzny dla tego modelu,
hasha i seedów. Sprawdza zgodność źródeł, rozłączność środowisk i faktyczne
wywołania sieci; sam nie publikuje modelu. Nowsze modele wymagają osobnego
planu i świeżych danych testowych.

Raport100ms `policy-expanded-confirm-100ms.json` dał41,5/90kredytu zwycięstwa
wobec29/90kontroli. Przedział różnicy obejmuje zero, więc sam ten wynik
nie stanowi potwierdzenia przewagi. Wynik produkcyjny należy odczytać
z ukończonego `policy-expanded-production-result.json`, gdy powstanie.

Pierwsza seria 650 ms dała 35,5/90 wobec 33/90 kontroli, różnicę +2,78 pp
z przedziałem 95% [-8,89;13,89] pp. Również ten wynik nie potwierdza przewagi.
Druga seria jest wykonywana niezależnie od wyniku pierwszej.

## Oddzielny eksperyment z cache odczytów

`tools/policy-cache-lab.ts` porównuje ten sam model z tymczasowym cache
odczytów wysp oraz bez niego, z dodatkową kontrolą Hardcore. W ten sposób
nie zmienia kodu trwającego zamkniętego testu. `policyReadCache.ts` obejmuje
wyłącznie synchroniczne odczyty podczas pojedynczej inferencji w fazach
wyboru roli i budowania. Po wyjściu przywraca metody; nie można wewnątrz
wykonywać akcji ani modyfikować stanu gry.

Raport `policy-read-cache-verification.json` potwierdził identyczne wyniki
na 220 pozycjach i przyspieszenie obliczeń. To nie jest dowód silniejszej gry.
Turnieje wydajności muszą zachowywać jednakowy czas namysłu, a modele,
helper, kod bota i konfiguracja otrzymują osobne hashe w planie badania.

## Warunki wydania

Po pozytywnym teście siły adapter nowego poziomu musi zachować tę samą
politykę co turniej. Sprawdzamy też zapis/odczyt poziomu, rzeczywistego
workera przeglądarki, anulowanie, czas odpowiedzi i działanie offline.
Pomoc w menu ma uczciwie opisywać zakres sieci i fallback. Następnie
powstają nowe HTML/EXE i buildPages, a opublikowane pliki muszą przejść
weryfikację hashy oraz kontrolę interfejsu. Modele eksperymentalne, dane
treningowe i raporty nie trafiają do katalogu publikowanego na Pages.
