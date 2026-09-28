# La décision est écrite et la recette tenue par une exécution réelle

Story : e01s05
Epic : e01
Statut : versée

## 1. Ce que le lecteur gagne

Celui qui ouvre `specs/adr/` pour savoir ce que 495 fait d'une réponse humaine trouve aujourd'hui
`D-37` et `D-39`, écrites avant l'epic : elles disent comment une réponse rouvre la spécification et
comment G1 la refuse, pas ce que les quatre stories ont décidé depuis — la réouverture qui juge les
mêmes réponses que G1, l'arrêt d'une spécification qui ne progresse plus, la clôture réservée à
l'humain, la révocation. Les stories qui portaient ces décisions ne sont plus dans le dépôt : sans
une décision écrite, l'epic n'existe que dans le code et l'historique git.

Celui qui ouvre `specs/verifications/` pour savoir si un contrat décidé par le propriétaire atteint
les contrôles ne trouve aucune campagne réelle qui ait franchi G1 avec une réponse matérielle depuis
`D-37` : que le protocole gelé à G2 et les contrôles exécutés portent le contrat décidé n'a jamais
été mesuré. C'est le défaut qui a ouvert l'epic — un changement accepté en rendant 400 là où le
propriétaire avait décidé 422 — et rien ne montre encore, sur la cible Maven où il a été vu, qu'il
est fermé.

## 2. Promesses

Scenario: La décision de l'epic est lisible en un seul lieu
  Given le répertoire specs/adr/
  When le lecteur ouvre la décision qui porte l'epic e01
  Then elle dit que la réouverture juge toute réponse matérielle enregistrée que le rapport ne porte pas, qu'il ait posé la question ou non
  And elle dit qu'une spécification qui ne progresse plus arrête le changement avant G0 en nommant la réponse perdue, et que la reprise produit une nouvelle spécification
  And elle dit que seul l'humain clôt une question ou confirme qu'une réponse ne fixe rien d'observable
  And elle dit qu'une révocation repose la question et défait ce qui a été adopté sur sa foi, jusqu'à la décision sur le candidat
  And elle nomme D-37 et D-39 comme les décisions qu'elle complète, et la révision de D-38

Scenario: Une réponse qui contredit le premier rapport atteint le protocole gelé
  Given la cible Maven des campagnes java-* et un changement dont le premier rapport de spécification pose la question du statut d'erreur à côté d'une exigence écrite pour « 400 »
  When le propriétaire répond « 422 » à cette question, dans un vrai Pi
  Then la spécification est réécrite avec la réponse dans la demande
  And les exigences adoptées à G1 portent « 422 » dans leur bloc answers, liée à une exigence obligatoire
  And le protocole gelé à G2 porte une obligation pour cette exigence, avec un contrôle qualifié
  And le relevé nomme ce contrôle et dit s'il porte le contrat décidé

Scenario: La clôture et la révocation sont exercées dans Pi sur la cible Maven
  Given le même changement, arrêté sur une question matérielle
  When le propriétaire clôt la question par /495 close, puis révoque une réponse par /495 revoke
  Then le dossier porte la clôture avec son acteur, et la question reposée par la révocation avec ses trois issues
  And le relevé cite les événements du dossier, lus depuis SQLite

Scenario: Le contrôle négatif rejoue le défaut sur le code d'avant l'epic
  Given la construction d'avant e01s01
  When la même campagne y est conduite
  Then la réponse « 422 » n'atteint pas les exigences adoptées, ou le changement est perdu, et le relevé le montre par les événements du dossier

Scenario: Ce qui est feint se déclare
  Given les campagnes du relevé
  When le lecteur en lit une
  Then il sait quelles interventions un agent scripté a simulées, lesquelles un modèle réel a conduites, et ce que la campagne établit et n'établit pas

## 3. Sécurité

Sans objet : la story n'écrit aucun code et ne touche ni la provenance, ni le confinement, ni la
sortie de données ; elle exerce dans Pi les règles de provenance que e01s03 et e01s04 ont posées.

## 4. Tâches

### Tâche 1 — La décision de l'epic est écrite

`specs/adr/D-70` porte la décision : les quatre points du premier scénario, ce qu'elle complète
(`D-37`, `D-39`) et ce qu'elle révise (`D-38`), avec le motif de chacun, dans la forme des autres
décisions. Rien d'autre ne change dans `specs/adr/`.

- Vérifie à la main : lire `specs/adr/D-70-*.md` et y trouver les quatre points, les renvois, et un statut « Acceptée »
- Tient : la lecture de la décision, « elle dit ce que l'epic a décidé, en un seul lieu »
- Rouge : aucun fichier de `specs/adr/` ne porte la décision de l'epic ; `D-37` et `D-39` décrivent l'état d'avant

### Tâche 2 — La campagne Maven conduit une réponse contraire jusqu'au protocole gelé

Un banc sous `~/.495-campagnes/scripts/` (dérivé de `reprise-run.sh` et `reprise-drive.ts`)
conduit, sur la cible Maven `~/Projets/495-workspace/cibles/simple-demo-hexagonal-architecture` (celle des
campagnes `java-*`) et une construction de la tête de `main`, un changement dont le
premier rapport pose la question du statut d'erreur à côté d'une exigence écrite pour « 400 »,
puis la réponse « 422 » du propriétaire, jusqu'au protocole gelé. Le relevé `specs/verifications/e01s05/campagne-maven.md`
cite le dossier, les artefacts adoptés (exigences avec leur bloc answers, protocole avec son
obligation) et le contrôle qui porte le contrat.

- Vérifie à la main : conduire la campagne, puis lire le dossier depuis SQLite et le magasin d'objets et confronter le relevé aux artefacts
- Tient : le relevé et le dossier, « les exigences adoptées portent 422 lié à une exigence obligatoire, et le protocole gelé porte une obligation pour elle »
- Rouge : aucune campagne réelle n'a franchi G1 avec une réponse matérielle depuis D-37 ; aucun relevé ne le mesure

### Tâche 3 — La clôture et la révocation sont exercées dans Pi

Sur le même dossier, `/495 close` sur une question matérielle puis `/495 revoke` sur une réponse,
dans un vrai Pi ; le relevé cite les événements `question.closed`, `question.revoked` et la décision
IH-01 reposée, avec leurs acteurs.

- Vérifie à la main : conduire les deux commandes par le banc et lire les événements du dossier
- Tient : le relevé, « le dossier porte la clôture avec son acteur, et la question reposée avec ses trois issues »
- Rouge : la clôture et la révocation n'ont été exercées dans Pi que sur la cible JavaScript, jamais sur la cible Maven

### Tâche 4 — Le contrôle négatif tourne sur la construction d'avant l'epic

La même campagne sur `~/.495-campagnes/builds/e01s01-avant-bdebd23`, et le relevé montre par les
événements du dossier que la réponse n'atteint pas les exigences, ou que le changement est perdu.

- Vérifie à la main : conduire la campagne sur l'ancienne construction, que `get_commands` désigne, et lire son dossier
- Tient : le relevé, « sur le code d'avant l'epic, la réponse 422 n'atteint pas les exigences adoptées »
- Rouge : aucun contrôle négatif de l'epic n'existe sur la cible Maven

## 5. Hors périmètre

- Aucun code n'est écrit : un écart que la campagne trouve entre une promesse de l'epic et le noyau
  reçoit une fiche `specs/bugs/BUG-*.md` et son propre cycle.
- La reprise depuis une seconde session vivante (e09).
- Une cible Node conduite de bout en bout (e05).
- La révocation d'une décision autre qu'une réponse ou une clôture (hors périmètre de e01s04).
