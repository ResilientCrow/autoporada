# 0069 — A report's place is read into the opening

Adds to ADR 0067 (the opening sentence reads the title). ADR 0061 (the
placeholder paragraph) stands.

## Context

The opening sentence of a report needs its place in the locative with a
preposition: „v areálu Smíchov v místnosti S205 proběhla …“. Only a bare room
code was fixed („S206“ → „v učebně S206“); anything else printed as typed, so
„místnost S205“ broke the sentence. A report started from an akce copies the
akce's place, which is typed in the nominative because the agenda prints it so
(„učebna S206“).

## Decision

1. `placePhrase` (`domain/cs/place`) reads the place at sentence time. The
   stored place stays as the author typed it; `openingSentence` prints
   `placePhrase(place).text`. First match wins:
   1. no letter or digit („-“, „?“): it names no place and the sentence goes
      without one;
   2. a room code: „v učebně S206“, „v učebně S 205“, „v učebně S201 nebo
      S202“; several: „v učebnách S201 a S202“, „v učebnách S201–S203“. It
      comes before the prepositions, since „S 205“ starts like „s“;
   3. it starts with a preposition („v aule“, „na Pražském hradě“, „U Fleků“)
      or is an adverb („online“, „venku“): printed as typed;
   4. an online tool („MS Teams“, „Zoom“): „v aplikaci …“;
   5. a noun phrase in the nominative, `[ordinal] [modifiers] head [rest]`:
      adjectives, possessives, „náš“/„naše“, „všechny“/„všechna“, „oba“/„obě“
      and all-caps modifiers („CAD“, and an abbreviation right before a noun:
      „v ČVUT menze“)
      are declined by the head's gender and must agree with it; the head is a
      listed word or name, a compound ending in a listed noun, or a safe
      ending (`-ovna -árna -írna -ebna -elna -tna -čna`, `-iště`, `-um`).
      Agreeing adjectives right after the head are declined too when they
      are possessive or typed in lowercase („na Univerzitě Karlově“, „na Vysoké
      škole ekonomické“); a capitalised one is a name and stays („na Základní
      škole Grafická“). A listed name is read only when nothing follows it but
      a comma, a number, a conjunction or a preposition („v Praze 5“, „v Ústí
      nad Labem“; not „Smíchov City“). A listed name and its quarters joined by
      a hyphen are each declined, in the name's preposition („v Praze-Smíchově“,
      „v Ostravě-Vítkovicích“); two towns are not („Praha-Brno“ is unread).
      After „a“, „i“, „nebo“, „či“ a second readable place is read too, and a
      capitalised one that is not read leaves the whole place unread. After a
      comma (and a „nebo“ or „případně“ after it) a common noun is read („v učebně
      S205, ve 2. patře“); a name, an address or anything else stays as typed
      („v Divadle Viola, Národní 7, Praha 1“, „na Smíchově, Praha 5“). There a
      capitalised noun is read only by its ending („v Brně, na Výstavišti“),
      since it may be a town spelled like a noun („…, Most“, „…, Malá Skála“);
   6. a noun phrase already in the locative („učebně S206“): only the
      preposition is added.
2. **Never guess.** Only listed words and the safe endings are declined. The
   lists (`place/words.ts`, common nouns and the indeclinable abbreviations
   of schools and institutions, „ZŠ“, „DDM“, „ČVUT“, by the gender of their
   noun; `place/names.ts`, towns, Prague quarters, trip destinations,
   countries) write out every form, so each can be proofread; a multi-word
   entry overrides its head's preposition („v botanické zahradě“, although
   „na zahradě“). A name that is also a common phrase is read as the name only
   with its capitals („v Černé Hoře“, but „na Černé hoře“, the mountain).
3. A place not read keeps its text and gets a lead-in by its form:
   - every word in capitals or digits: „v prostorách IKEM“ (a listed
     abbreviation is read: „na ČVUT“, „v DDM“);
   - a house number after the first word: „na adrese Národní 7, Praha 1“;
   - anything else: „v prostorách s názvem Makerspace“.
4. Capitals print as typed; „v“ becomes „ve“ by the first word printed after
   it („ve 2. patře“, „ve Vídni“, „ve Zlíně“). A word in capitals is spelled
   out, so only V, F and W give „ve“ („v DDM“, „v SPŠE“, „ve VR učebně“),
   unless it is a listed word with a vowel („ve ŠKOLE“) or an acronym said as
   a word („ve STEM učebně“).

## Consequences

- The opening is written when a draft is created or saved, so a draft saved
  before this change reads its place at its next save. An opening the author
  has edited is the author's text and is not rewritten.
- „třída“ after a capitalised adjective is an avenue („Dlouhá třída“, „na“)
  and is not read; „kmenová třída“ is a room. A word with a slash
  („aula/tělocvična“) is never declined by its ending.
- An unlisted name that declines regularly gets the lead-in until it is added
  to a list („v prostorách s názvem Ladronka“). A place typed without
  diacritics is not read.
- A town spelled like a listed noun reads as the noun when typed alone
  („Most“ → „na Mostě“); after a comma it stays as typed. A genitive list
  after a comma can read as nominative plurals („Prostory školy, tělocvičny
  a jídelny“).
- The akce's own place, the agenda line and the placeholder paragraph are
  unchanged, so a confirmed placeholder stays checked (ADR 0061).
