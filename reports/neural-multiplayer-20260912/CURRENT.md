# Stan po raporcie zbiorczym — 12 września 2026

Raport główny: reports/neural-multiplayer-20260912/raport.md. Historia: dziennik.md.

Wszystkie uruchomione obliczenia zakończone. Nie ma potwierdzonego bota silniejszego od Hardcore dla wszystkich liczebności i niczego nie wdrożono.

- nightly-v2 zakończony: 108 trajektorii, 2562 etykiety, 3 próby treningowe, pilot 240 i potwierdzenie 240.
- Potwierdzenie 650 ms: 3p Q 15/30 vs kontrola 13/30; 4p visits 13/40 vs 14/40; 5p visitsValue 11/50 vs 10/50. Wszystkie przedziały różnicy obejmują zero.
- flat-650-v1 zakończony: 3p flatNeural 3/30 vs kontrola 13⅓/30, wyraźnie słabszy. Nie rozszerzać testu dla korzystnego wyniku.
- value-league-v1 wygenerował 180/180 nowych gier i 4320 przykładów; jego deadline zatrzymał uruchomienie pierwszej epoki.
- value-retrain-v1 to ukończona kontynuacja wyłącznie treningu na tych samych 180 grach, z niezmienionymi, uprzednio ustalonymi parametrami. Sesja 89711 zakończona, oba treningi gotowe. Wybrana szybkość 0,0001, epoka 3, niezerowa korekta. Walidacja 1,1819 → 1,1649. Rozłączne zbiory: 231/21/36 całych gier.
- Na świeżym holdoucie błąd przewidywania zwycięzcy zmienił się o +2,35% dla 3 osób, −5,88% dla 4 i −4,51% dla 5. To nie są wyniki areny; nowej wartości nie wolno ogłaszać zwycięskim botem.
- 1032 pełne partie głównych serii. 506 wcześniej przechodzących testów; wszystkie nowe sterowniki po kontroli typów. Audyty w reports.
- Następny uzasadniony etap to oddzielna arena nowej wyuczonej wartości z MCTS dla 4/5, z tą samą polityką jako ablacją i Hardcore jako kontrolą. Dla 3 nowa wartość jest gorsza w tej próbie.
- Modele eksperymentalne skopiowano do reports/neural-multiplayer-20260912/models. Nie są importowane przez produkcyjną fabrykę botów.

Użytkownik prosił o jeden raport około 17:45. Po dostarczeniu raportu należy usunąć automatyzację poranny-raport-neural-puerto-rico, aby zakończyć cykliczne powiadomienia. Nie oznacza to osiągnięcia celu siły bota.
