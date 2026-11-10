# Lista zadań po Lekcji 2

Stan: `main` (Lekcja 2 oddana). Szczegóły i uzasadnienia: `wyniki-testow/1-W1-W2-W3-log-testow.md` („Co można zrobić lepiej”) oraz `wyniki-testow/3-po-ulepszeniach-porownanie.md` („Uwagi / do poprawy”).

## Bezpieczeństwo
- [ ] Atak wieloetapowy: needs_review = true, jeśli wcześniejsze wiadomości klienta w rozmowie zawierały próbę zmiany cen lub zasad (dziś ostatnia odpowiedź bywa false).
- [ ] Historia rozmowy po stronie serwera (wersja 1.1 czatu) – model widzi też swoje odpowiedzi, przeglądarka wysyła tylko nową wiadomość.
- [ ] Testy z modelem-atrapą (`MockLanguageModelV4` z `ai/test`): sprawdzić, co dokładnie trafia do modelu.
- [ ] Zestaw ataków jako plik + skrypt (zamiast ręcznego wklejania), każdy atak 3–5 razy.
- [ ] Przy każdym ataku wiadomość kontrolna różniąca się jednym elementem.

## Treść odpowiedzi
- [ ] Opis firmy w faktach (czym zajmuje się Studio Nova, dla kogo są konsultacje) – do uzupełnienia przez właściciela.
- [ ] Szkic zawsze w 1. os. l.mn. („Rozumiemy”, nie „Rozumiem”).
- [ ] priority = high opiera się na faktach podanych przez klienta – do przemyślenia przy dodaniu kalendarza.

## Aplikacja
- [ ] Pole Analizy jako `textarea` (wiele linii).
- [ ] Czyszczenie pola po wysłaniu w Analizie.
- [ ] Osobny zapis prób manipulacji (statystyka).
- [ ] Każda przyszła operacja (wysyłka, płatność, kalendarz) tylko po decyzji człowieka, z testem „atak próbuje ją włączyć → nic się nie dzieje”.
