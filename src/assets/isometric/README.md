# Grafiki izometryczne

Wygenerowane wbudowanym narzędziem image_gen w dniu 2026-09-10. Oryginalne pliki PNG z kanałem alpha; bez programowego usuwania tła. Przezroczystość została zweryfikowana przez odczyt pikseli. Pixi i CSS wybierają ramki podczas wyświetlania.

- atlas-a.png: 15 budynków produkcyjnych i podstawowych użytkowych, 5 × 3.
- atlas-b.png: 15 dalszych budynków podstawowych i dodatku I, 5 × 3.
- atlas-c.png: 15 budynków dodatków I i II, 5 × 3.
- atlas-d.png: pięć upraw, kamieniołom, las, palma, statki, Festyn, Magistrat, postacie, 5 × 3. Komórkę market zastępuje osobny plik.
- market.png: osobny budynek targu na San Juan.
- walkers.png: cykl chodu, 4 × 2; pierwszy rząd robotnik, drugi szlachcic.

Pełna kolejność obiektów: src/presentation/assets/registry.ts.

Styl atlasu A: 15 osobnych izometrycznych budynków tropikalnego Puerto Rico w równych komórkach 5 × 3, żywe kolory, kremowe ściany, dachówki, spójna kamera i światło z lewej góry, przezroczyste tło, bez podpisów. Pozostałe zachowane prompty znajdują się w generation-prompts.json.

- idle-workers.png: 8 stojących postaci (robotnik/szlachcic × 4 pozy), 1536 × 1024. Wbudowane image_gen, prawdziwy RGBA; pusty pas między rzędami y=483–489, renderer dzieli przy y=486. Ręce skrzyżowane, odpoczynek, ziewanie; subtelne kołysanie i pochylanie w rendererze. Prompt: idle-workers-prompt.txt. Każda stojąca miniatura odpowiada jednemu oczekującemu żetonowi; spacerowicze pozostają dekoracją.
