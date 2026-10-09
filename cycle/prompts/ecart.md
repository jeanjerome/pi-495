La story {{id}} est rouverte au rouge-vert par cet écart, trouvé à la recette et décidé :

{{ecart}}

Avant que le rouge-vert reparte, écris l'écart dans la story `{{chemin}}`, sur la branche
`{{branche}}`, pour que la relecture le juge : sans promesse écrite, un tour de relecture ne juge pas
le correctif. Ajoute :

1. un scénario (Gherkin, `Given` / `When` / `Then`) qui dit le comportement attendu, chaque `Then`
   nommant un artefact, un événement, un refus ou un message ;
2. la phrase de la section Sécurité qui change, quand une garantie est en jeu ;
3. une tâche de plus, à la suite des existantes, avec `Vérifie :` (la commande, écrite rouge),
   `Tient :` (le fichier de test et l'assertion) et `Rouge :` (ce que le code fait aujourd'hui qui la
   fait échouer). Lis le code avant d'écrire le rouge : il se vérifie, il ne se suppose pas ;
4. dans le hors-périmètre, ce que l'écart n'inclut pas.

Dis d'abord de quelle reprise il s'agit. **Un code qui viole une règle adoptée** est une correction de
code : la nouvelle tâche suffit, et la préparation de la story tient telle qu'elle a été examinée.
**Une erreur de la règle elle-même** — le modèle de `specs/formal/` ou la promesse est faux, un test
adopté contredit le besoin — est une révision de règle : quand la story a un compagnon de vérification
(même radical, `.verification.json`), donne à la nouvelle promesse son entrée et corrige le modèle s'il
est en cause ; la préparation changera d'identité et sera réexaminée avant le rouge-vert. Une
contradiction ne se règle jamais en affaiblissant en silence un scénario, une assertion ou un test
adopté. Si l'écart demande de modifier ou de retirer une promesse existante, le besoin du propriétaire
change : rends `bloque` en nommant ce choix, il attend sa décision.

Ne touche à rien d'autre : ni au code, ni aux tâches existantes, ni au registre. Lance
`npm run lint:story-format` et lis son code de sortie. Commite la story seule, avec son compagnon et
son modèle quand la révision les touche, en une ligne en anglais qui dit le comportement promis
(`docs: the story {{id}} promises …`). Ne pousse rien.

Ta sortie structurée : `status` (`fini` ou `bloque`), `message` (le message du commit), `resume`.

---

{{story}}
