# Arena botów

Uruchamiaj polecenia w katalogu gry. Arena domyślnie gra jednym kandydatem
Hardcore przeciw pozostałym botom MCTS, w podstawową grę bez rozszerzeń.

Krótki test ze stałą liczbą iteracji (powtarzalny przebieg):

~~~powershell
npx tsx tools/arena.ts --games 6 --players 3 --seed 42 --iterations 16 --opponents greedy --output reports/smoke.json
~~~

Porównanie przy jednakowym deklarowanym czasie na decyzję:

~~~powershell
npx tsx tools/arena.ts --games 300 --players 3 --seed 1001 --budget-ms 100 --opponents mcts --output reports/hardcore-vs-mcts.json
~~~

Kontrola wpływu miejsca przy stole, bez nowego bota:

~~~powershell
npx tsx tools/arena.ts --games 30 --players 3 --seed 1001 --candidate greedy --opponents greedy --output reports/greedy-control.json
~~~

Rozszerzenia trzeba wybrać jawnie:

~~~powershell
npx tsx tools/arena.ts --games 5 --players 5 --iterations 8 --opponents greedy --expansions all --output reports/expansions-smoke.json
~~~

Jeżeli środowisko blokuje proces pomocniczy tsx, dostępny jest lokalny loader:

~~~powershell
node --import ./tools/register-typescript.mjs tools/arena.ts --games 3 --players 3 --iterations 8 --opponents greedy
~~~

--games oznacza łączną liczbę partii, nie liczbę zestawów. Dla każdego ziarna
ustawienia początkowego kandydat kolejno gra ze wszystkich miejsc. Dlatego
wybieraj wielokrotność liczby graczy. Kolejność botów w trybie mixed pozostaje
stała względem kandydata: greedy, mcts, hardcore, greedy. Domyślnie istnieje
dokładnie jedno miejsce kandydata. --candidate służy porównaniom kontrolnym.

--iterations zastępuje limit czasu tylko dla Hardcore. Stary MCTS korzysta
z czasu --budget-ms, więc połączenie tych opcji z przeciwnikami MCTS nie jest
porównaniem przy tym samym budżecie obliczeń. Raport wyraźnie zaznacza tę różnicę.
Przy limicie czasu obciążenie komputera zmienia liczbę symulacji i potencjalnie
ruchy; samo ustawienie ziarna tego nie eliminuje.

Raport zawiera:

- Każdą partię: ziarno, miejsce kandydata, polityki graczy, liczbę ruchów, wynik,
  czas namysłu osobno dla każdego gracza i skrót przebiegu do kontroli odtwarzania.
- Liczbę ukończonych, przerwanych limitem ruchów i niepoprawnych partii.
  Przerwane partie nie dostają wyniku końcowego i nie są liczone jako porażki.
- Wygrane samodzielne, dzielone oraz sumę udziałów w zwycięstwach.
  Przy pełnym remisie dwóch zwycięzców otrzymuje po 0,5; decyduje aktualny
  ScoreCalculator silnika, wraz z jego rozstrzyganiem remisów.
- Średnią różnicę PZ względem najlepszego przeciwnika. Wygrana po rozstrzyganiu
  remisu może mieć różnicę PZ równą zero.
- Przedziały Wilsona dla samodzielnych wygranych osobno na każdym miejscu.
  Dla ogólnego udziału w zwycięstwach losowane są całe grupy wspólnego ziarna
  (bootstrap 2000 prób), bo rotacje miejsc dla tego samego ustawienia są zależne.

Małe próby służą wykrywaniu błędów. Nie dowodzą przewagi bota.
Do oceny siły stosuj nowe ziarna, wiele pełnych rotacji, różne liczby graczy
i porównywalne budżety; rozszerzenia oceniaj osobno.
Kod wyjścia 2 oznacza, że co najmniej jedna partia nie została poprawnie ukończona.

Kod tools/arena-core.ts udostępnia synchroniczne hooki onDecision oraz
onComplete. Generator danych może w nich kodować pozycje i później przypisać
wynik końcowy. scores jest posortowane według rankingu i zawiera identyfikator
gracza; winCredits i czasy namysłu mają kolejność miejsc przy stole.
Do treningu należy wykorzystywać wyłącznie rekordy ze statusem completed.

Eksperymentalny model wartości można przekazać przez --model ścieżka.json
oraz --model-weight 0.25. Model otrzymuje wyłącznie kandydat Hardcore,
a raport zapisuje skrót SHA-256 modelu. Szczegóły treningu i porównań
znajdują się w tools/neural-guide.md. Sam trening nie zmienia bota w menu.
