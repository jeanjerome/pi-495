Pas 2 du cycle, le rouge-vert, pour la story {{id}} sur la branche `{{branche}}` (base `{{base}}`).
La story est ci-dessous ; ses tâches se font dans l'ordre, une par une.

Pour chaque tâche :
1. Écris d'abord le test que la ligne `Tient :` nomme, avec l'assertion dans les mots de la story.
2. Lance la commande `Vérifie :` et lis le rouge : le test doit échouer sur cette assertion, comme la
   ligne `Rouge :` l'annonce. Un fichier absent, une erreur d'import ou de type, ou un rouge obtenu en
   mettant du code de côté n'est pas ce rouge. Si le code d'aujourd'hui ne fait pas échouer
   l'assertion, dis-le dans ta sortie au lieu de forcer un rouge.
3. Commite le test seul : `test: <ce que le test tient, en anglais>`. Ce commit ne touche que `test/`.
4. Écris le code minimal qui fait passer le test, relance la commande, puis commite :
   `feat|fix|refactor: <le comportement obtenu, en anglais>`.
5. Une tâche `Vérifie à la main :` se fait à la main, et ta sortie dit ce qui a été fait et observé.

À la fin, `npm run check` doit être vert ; ne pipe pas sa sortie, lis son code de sortie. Un échec
reproductible rencontré en chemin se corrige dans son propre commit (cycle/README.md § Preflight et
défauts découverts). Ne pousse rien.

Le contrôle qui suit cette session rejoue chaque commit de test seul dans un arbre détaché et lit
quels tests y échouent, puis lance chaque commande `Vérifie :` sur la tête de la branche, puis
Preflight. Ta sortie structurée dit, pour chaque tâche, le commit rouge, le commit vert et le message
d'échec lu au rouge.

---

{{story}}
