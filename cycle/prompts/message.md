Écris le message du commit unique sous lequel la branche `{{branche}}` de la story {{id}} arrive
sur `main`. Une ligne, en anglais, `<type>: <description>` avec `feat`, `fix`, `refactor`, `docs`,
`test`, `chore`, `perf` ou `ci`. Elle dit le comportement obtenu, en termes techniques, jamais le
processus : ni story, ni tour, ni session, ni attribution. Lis `git diff {{base}}...HEAD --stat` et
les sujets des commits de la branche, ci-dessous, pour la fonder ; ne modifie rien.

Sujets des commits :

{{commits}}

Story :

{{story}}
