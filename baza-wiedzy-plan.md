# Plan bazy wiedzy — asystent podróżnego Studio Nova (biuro podróży)

Firma wymyślona na potrzeby kursu. Dokumenty trafią do bazy przez `/upload` (warsztat 2),
agent odpowiada z nich przez `searchKnowledge` (warsztat 3).

## Podział: co z bazy wiedzy, a co z narzędzi

| Skąd agent bierze odpowiedź | Przykłady |
|---|---|
| **Baza wiedzy** (stałe informacje firmy) | ceny usług, warunki rezerwacji i rezygnacji, co obejmuje oferta, zasady bagażu, ubezpieczenia |
| **Narzędzia na żywo** (już są w aplikacji) | pogoda, kursy walut, święta, strefy czasowe |

Agent nie powinien szukać w dokumentach pogody ani kursu euro, a cen wycieczek nie powinien szukać w internecie.

---

## Dokument 1 — Cennik usług 2026 *(obowiązkowy do pracy domowej)*

Co zawiera: konsultacja online (45 min, 150 zł brutto — zgodnie z obecną instrukcją agenta),
opłata rezerwacyjna, plan podróży „szyty na miarę”, dopłata za pokój jednoosobowy,
rabat dla dzieci i za wczesną rezerwację, opłata za zmianę rezerwacji.

Pytania, na które agent odpowiada z tego dokumentu:
1. Ile kosztuje konsultacja z doradcą podróży?
2. Czy dziecko jedzie taniej, jeśli zarezerwuję wyjazd w styczniu? *(rabat za wczesną rezerwację + rabat dla dzieci; inne słowa niż w dokumencie)*

## Dokument 2 — FAQ podróżnego *(obowiązkowy)*

Co zawiera: ok. 8 pytań — dokumenty potrzebne do wyjazdu, kiedy przychodzą bilety i vouchery,
limity bagażu w ofertach z przelotem, transfer z lotniska, podróż ze zwierzęciem,
płatność w ratach, kontakt w trakcie wyjazdu (godziny infolinii dla klientów w podróży).

Pytania:
1. Kiedy dostanę bilety lotnicze?
2. Czy mogę zabrać psa na wakacje? *(dokument mówi o „zwierzętach domowych”)*

## Dokument 3 — Warunki uczestnictwa (regulamin) *(obowiązkowy)*

Co zawiera: ok. 10 punktów — zawarcie umowy, zaliczka i termin dopłaty, rezygnacja
i jej koszty zależnie od terminu, zmiana uczestnika, reklamacje (termin i forma),
odpowiedzialność biura, sytuacje nadzwyczajne (np. odwołany lot).

Pytania:
1. Ile stracę, jeśli zrezygnuję z wyjazdu na dwa tygodnie przed wylotem?
2. Do kiedy mogę złożyć reklamację po powrocie?

## Dokument 4 — Ubezpieczenia podróżne *(opcjonalny)*

Co zawiera: wariant podstawowy i rozszerzony, co obejmuje (koszty leczenia, bagaż, NNW),
ubezpieczenie od kosztów rezygnacji — do kiedy można je wykupić i ile kosztuje.

Pytania:
1. Czy podstawowe ubezpieczenie obejmuje zgubiony bagaż?
2. Do kiedy mogę dokupić ubezpieczenie od rezygnacji?

## Dokument 5 — Oferta sezonu lato 2026 *(opcjonalny)*

Co zawiera: 4–5 kierunków (np. Chorwacja, Grecja, Portugalia, Gruzja) — długość pobytu,
standard hotelu, wyżywienie, cena od osoby, co jest w cenie (przelot, transfer, rezydent).

Pytania:
1. Co jest wliczone w cenę wyjazdu do Gruzji?
2. Który wyjazd jest najtańszy dla dwóch osób na tydzień?

---

## Pytania-pułapki (agent ma odmówić)

1. **„Czy w hotelu w Splicie są jeszcze wolne pokoje na 12 lipca?”**
   Dostępność miejsc zmienia się codziennie i nie ma jej w dokumentach. Agent mówi, że
   nie ma tej informacji w bazie wiedzy, nie zgaduje i nie szuka w internecie.
2. **„Jaki jest numer telefonu do rezydenta w Grecji?”**
   Kusi, żeby zmyślić numer albo podać ogólną infolinię jako numer rezydenta. Agent odmawia
   i może najwyżej przytoczyć to, co FAQ mówi o kontakcie w trakcie wyjazdu.

## Pytania do testu w warsztacie 3 „dla szybkich”

| Typ | Pytanie |
|---|---|
| pełna odpowiedź | Ile kosztuje konsultacja z doradcą podróży? |
| pełna odpowiedź | Kiedy dostanę bilety lotnicze? |
| pełna odpowiedź | Do kiedy mogę złożyć reklamację po powrocie? |
| częściowa | Ile zapłacę za wyjazd do Gruzji w euro? *(cena jest w PLN z dokumentu; kurs z narzędzia `waluty` — agent nie przelicza „z głowy”)* |
| spoza bazy | Czy w hotelu w Splicie są wolne pokoje na 12 lipca? |
