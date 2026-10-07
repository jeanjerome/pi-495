/node

Correction de Preflight, pour la story {{id}} sur la branche `{{branche}}`, au pas {{pas}}. La session
précédente a rendu sa sortie ; l'outil a lancé Preflight (`npm run check`) à `{{tete}}` et l'a lue
rouge. Tu es là pour la rendre verte, et pour rien d'autre.

Tests en échec que l'outil a lus (vide quand l'échec vient d'un contrôle qui n'est pas un test) :

{{echecs}}

Trouve la cause en lançant ce qui échoue, et seulement cela : `node --test <fichier>` pour un test,
`npm run typecheck`, `npm run lint:code`, `npm run lint:layers`, `npm run lint:architecture`,
`npm run lint:exports`, `npm run lint:distribution` ou `npm run lint:story-format` pour un contrôle,
après `npm run build` quand `dist/` est en cause. **Ne lance pas `npm run check`** : l'outil le relance
après toi.

Corrige sur la branche, en commits, sans changer ce que la story promet : un test ne s'affaiblit pas pour
passer, et une assertion ne disparaît pas. Un échec que la branche n'a pas causé et qui demande une
décision se nomme dans ta sortie, sans correctif. Ne pousse rien.

Ta sortie structurée dit `fini` quand tu as corrigé ce que tu as lu, `bloque` quand tu ne peux pas, et
résume en une ou deux phrases la cause et le correctif.

---

{{story}}
