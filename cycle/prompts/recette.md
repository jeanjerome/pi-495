/node

Pas 5 du cycle, la recette de la story {{id}}, sur la branche `{{branche}}` à `{{tete}}`. La
relecture est passée ; Preflight est verte à cette révision.

Une recette est une exécution réelle, pas une liste adossée à des tests :

1. Construis l'extension (`npm run build`) et charge-la depuis `dist/` dans un vrai Pi, comme le banc
   de `~/.495-campagnes/scripts/` le fait (`pi -ne --mode rpc --no-session -e <extension>`), sur une
   copie de dossier. Un modèle réel, ou l'agent scripté (`HARNESS495_SCRIPTED_AGENT`) déclaré comme
   tel dans ton compte rendu.
2. Conduis une campagne par scénario des promesses ci-dessous qu'une exécution peut montrer, jusqu'à
   son verdict, puis relis le dossier depuis SQLite et le magasin d'objets, jamais à travers un helper
   de test.
3. Conduis un contrôle négatif : la même campagne sur `main` ou sur la configuration privée de ce que
   la story ajoute, et montre le refus ou l'absence qu'elle produit.
4. Ce qui est feint se déclare : un fournisseur servi localement sous un autre nom, un agent scripté,
   une étape non exercée.

Les deux campagnes de référence (`npm run campagne -- npm` et `-- maven`), quand la branche touche ce
que 495 exécute, l'outil les a jouées lui-même à cette révision avant toi : ne les rejoue pas.

Ne modifie pas le code ; un écart entre une promesse et ce que tu observes est ton résultat, pas
quelque chose à corriger ici. Ne pousse rien.

Ta sortie structurée : `prete` quand chaque campagne montre sa promesse et le contrôle négatif tient,
`ecart` quand une promesse n'est pas tenue à l'exécution, `bloque` quand la recette n'a pas pu être
conduite ; les campagnes avec leur commande et leur verdict ; les écarts, chacun avec son scénario et
ce qui a été observé ; et un compte rendu en français simple pour le propriétaire, qui dit ce qui est
montré, ce qui est feint, et ce qu'il doit regarder pour accepter.

---

{{promesses}}
