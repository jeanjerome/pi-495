# Transverse A — complétude de la matrice de traçabilité

**État :** à faire
**Objet :** `docs/TRACEABILITY.md` doit porter une ligne par exigence `[P0]`, couverte ou non
**Ne dépend d'aucun étage**

## Motif

`docs/README.md` confie à la matrice un rôle précis : elle est le pont entre l'amont et le suivi,
et elle **nomme les exigences qui ne sont pas couvertes**. Une exigence absente de la matrice n'y
est donc pas neutre : elle est indistinguable d'une exigence satisfaite.

Dix-huit exigences `[P0]` étaient dans ce cas. La matrice porte désormais une ligne pour chacune,
mais dans cinq cas l'état a été établi par lecture du code et non par un contrôle exécuté :
`CTX-04`, `UX-05`, `EXT-02`, `IMP-05` et `NFR-06` sont marqués « non qualifié » sur la partie de
leur recette qu'aucun test n'exerce. Ce chantier ferme ces cinq écarts et installe le contrôle qui
empêche le trou de se reformer.

Un second écart est structurel : le décompte. L'expression de besoins porte 85 exigences
fonctionnelles `[P0]` en titre `####` et 8 exigences non fonctionnelles `NFR-01` à `NFR-08` `[P0]`
en titre `###`. Un décompte qui ne lit qu'un niveau de titre en oublie huit, dont `NFR-05`
(portabilité qualifiée) et `NFR-06`, toutes deux non couvertes.

## Prompt

```
Dans ~/Projets/495-pi-package, lis docs/README.md (rôle de la matrice) puis
docs/TRACEABILITY.md.

Deux travaux.

1. Un contrôle de complétude. Écris un script, sur le modèle de scripts/check-layers.ts,
   qui extrait de docs/amont/expression-besoins.md tous les identifiants portant [P0] — aux
   deux niveaux de titre, #### pour les exigences fonctionnelles et ### pour NFR-01..08 — et
   qui échoue si l'un d'eux n'apparaît ni dans la table des couvertes ni dans la table des non
   couvertes de docs/TRACEABILITY.md. Les notations de plage utilisées par la matrice
   (« ARC-01..04 », « UX-06..UX-10 ») doivent être développées, sans quoi le contrôle criera au
   loup. Branche-le sur npm run check.

2. Les cinq recettes non exercées. Chacune est marquée « non qualifié » dans la matrice avec
   ce qui manque :
   - CTX-04 : forcer une compaction ou ouvrir une nouvelle session et vérifier que les mêmes
     révisions normatives et les budgets restants sont restitués ;
   - UX-05 : recharger l'extension et bifurquer une conversation pendant un changement, sans
     qu'un contrôle ou une intégration s'exécute deux fois — operations.idempotency_key est
     unique en base, c'est la propriété à éprouver ;
   - EXT-02 : changer une version de composant et vérifier que l'empreinte d'environnement
     change et invalide les qualifications dépendantes ;
   - IMP-05 : le rapport sépare observations mécaniques, jugements et risques résiduels ;
   - NFR-06 : une exécution instrumentée ne contacte aucun endpoint de télémétrie.

Le contrôle de l'étape 1 doit passer avant et après l'étape 2 : c'est lui le livrable durable.

Critères d'acceptation :
- retirer une ligne de docs/TRACEABILITY.md fait échouer npm run check ;
- ajouter une exigence [P0] dans l'amont sans ligne de matrice fait échouer npm run check ;
- les cinq recettes ci-dessus sont exercées par un test, et la mention « non qualifié »
  disparaît de leur ligne ;
- npm run check passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Précédent de contrôle sur le dépôt | `scripts/check-layers.ts` |
| Source des identifiants | `docs/amont/expression-besoins.md`, titres `####` et `###` portant `[P0]` |
| Cible du contrôle | `docs/TRACEABILITY.md`, deux tables |
| Unicité des opérations | `operations.idempotency_key`, contrainte `UNIQUE` dans `schema.ts` |
| Empreinte d'environnement | `environment_digest` dans `runtime.ts` et le protocole |

## Journal

_À compléter._
