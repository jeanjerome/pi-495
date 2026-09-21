# D-02: Tests avec `node:test` et exécution directe des `.ts`

**Status:** Acceptée

**Décision.** Les tests utilisent le runner intégré `node --test` et s'exécutent directement sur les
sources TypeScript (type stripping natif de Node 24). `tsc` sert au typage strict et à la
construction de `dist/`. `fast-check` est utilisé pour les tests de propriétés.
**Motif.** Aucune dépendance de test à qualifier ni à distribuer ; la contrainte
`erasableSyntaxOnly` interdit `enum`, `namespace` et les propriétés de paramètres, ce qui garde
le code compatible avec jiti (chargeur de Pi) et avec le type stripping.
**Conséquence.** Les imports relatifs portent l'extension `.ts` ; `rewriteRelativeImportExtensions`
produit des `.js` dans `dist/`.
