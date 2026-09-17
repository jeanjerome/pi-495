# Transverse B — revues obligatoires de qualification

**État :** à faire
**Objet :** les six revues exigées par la conception de vérification, non réalisées
**Ne dépend d'aucun étage**

## Motif

`docs/amont/conception-verification.md` §11 rend six revues obligatoires à la qualification d'une
livraison : fonctionnelle, architecture, sécurité, UX et accessibilité, licences et distribution,
exploitation. La règle de décision de livraison du même document en fait une condition : les
constats bloquants doivent être clos, refusés explicitement par l'autorité compétente, ou couverts
par une dérogation autorisée.

Aucune n'a été réalisée. `STATUS.md` le dit, mais aucun travail n'était ouvert pour les conduire,
alors qu'elles bloquent la qualification du socle au même titre que les exigences absentes.

Une revue obligatoire n'est valide que si le reviewer dispose d'un mandat en lecture seule, du
candidat exact, des critères, des preuves nécessaires et d'un format de constat validé. Le
mécanisme existe déjà — rôle `review`, mandat en lecture seule, arbitrage — mais il n'a jamais été
exercé avec un reviewer humain ni avec un modèle réel.

## Prompt

```
Dans ~/Projets/495-pi-package, lis docs/amont/conception-verification.md sections 11 et 12,
puis la section « Ce qui n'est pas qualifié » de docs/STATUS.md.

Six revues sont obligatoires : fonctionnelle, architecture, sécurité, UX et accessibilité,
licences et distribution, exploitation. Aucune n'est faite.

Ce travail n'est pas d'écrire du code. Il consiste à rendre chaque revue conduisible, puis à
conduire celles qui ne demandent pas une autorité extérieure.

Pour chacune, produis le dossier que le reviewer doit recevoir : périmètre exact, critères
examinés, preuves disponibles, format de constat, et ce que le reviewer ne peut pas conclure
faute de preuve. Le rôle review et le mandat en lecture seule existent déjà dans le code ;
vérifie si le dossier peut être produit par l'export existant ou s'il y manque des pièces.

Trois revues sont conduisibles ici et maintenant sur le dépôt 495 lui-même : architecture
(frontières, dépendances, contrats, migrations), licences et distribution (dépendances,
notices, packaging Pi, SBOM), exploitation (reprise, diagnostics, ressources, export hors
ligne). Conduis-les et enregistre leurs constats.

Trois demandent une autorité ou un environnement absents : sécurité (reviewer indépendant du
producteur), UX et accessibilité (utilisateur représentatif, terminal réel), fonctionnelle
(responsable produit). Prépare leur dossier et déclare-les en attente, avec ce qui manque
nommé.

Une revue ne remplace pas un contrôle mécanique disponible et ne transforme pas un manque de
preuve en succès : un constat que le code pourrait vérifier doit devenir un contrôle, pas un
avis.

Critères d'acceptation :
- les six dossiers de revue existent avec leurs critères et leurs preuves ;
- les trois revues conduisibles sont conduites, leurs constats enregistrés et leurs bloquants
  soit clos, soit ouverts comme travail identifié ;
- les trois autres sont déclarées en attente avec l'autorité ou l'environnement manquant ;
- docs/STATUS.md reflète l'état réel de chacune.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Liste et objet des revues | `docs/amont/conception-verification.md` §11 |
| Condition de livraison | `docs/amont/conception-verification.md` §12, points 5 et 8 |
| Mandat de revue en lecture seule | rôle `review` de `context.ts`, profil d'exécution associé |
| Arbitrage de constats incompatibles | IH-08, G5 |
| Dossier remis au reviewer | `src/export/`, `export-service.ts` |

## Journal

_À compléter._
