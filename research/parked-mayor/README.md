# Zaparkowany prototyp planowania Burmistrza

To archiwum źródeł badawczych, nie funkcja działającej gry. Nie jest objęte konfiguracją kompilacji aplikacji ani wzorcem uruchamiania testów. Nie włączać bez wznowienia prac przez użytkownika.

Katalog `files/` zachowuje docelowe ścieżki siedmiu przygotowanych plików. Przed integracją trzeba przejrzeć je i skopiować do odpowiadających katalogów głównego projektu. Po integracji uruchomić zwykłe testy oraz kontrolę zapisanych pozycji, a dopiero potem osobny test siły. Archiwum nie zawiera implementacji pozostałych modułów silnika, do których prowadzą importy względne.

Stan: kontrola typów TypeScript 5.9.3 bez diagnostyk. Testy jednostkowe, kontrola pozycji i partie prototypu NIE zostały uruchomione. Nie ma dowodu poprawności wykonania ani przewagi nad Hardcore.

Prototyp porównuje pełne rozmieszczenia pracowników z planem zamrożonego Hardcore. Ocenia plany na wspólnych losowaniach i wybiera wynik wyłącznie po kompletnych równych seriach symulacji. Przy błędzie lub braku ukończonej serii wraca do planu bazowego. Zachowuje plan między kolejnymi ruchami rozmieszczania robotników.

Lokalny plik `work/mayor-search/snapshots-baseline-i24.json` zawiera 36 pozycji z 9 partii Hardcore. SHA-256: `6415b10462e23f24a6180f7cfe22d5252c0c5cfe347eb670b5e8dcd9a6ef965e`. To materiał funkcjonalny, nie wynik kandydata.

Podsumowanie badań i wyniki wydanego Neural: [NEURAL-STATUS.md](../../NEURAL-STATUS.md).
