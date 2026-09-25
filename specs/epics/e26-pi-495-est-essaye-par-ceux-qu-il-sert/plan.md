# Plan du chantier e26 — Pi-495 est essayé par ceux qu'il sert

Le chantier traite la croissance comme une expérience : acquisition, conversion, apprentissage,
réallocation de l'effort. Il ne publie pas un message par jour. Chaque campagne est une expérience
enregistrée, et le résultat attendu n'est pas un nombre de stars mais la combinaison qui fait essayer
Pi-495. Le but, la règle et l'activation sont dans `epic.yaml`.

## 1. Ce qui est mesuré

Pour chaque fenêtre de 48 h :

| Variable | Signification | Source |
|---|---|---|
| `V` | visiteurs uniques du dépôt | `gh api repos/jeanjerome/pi-495/traffic/views` |
| `S` | nouvelles stars | `gh api repos/jeanjerome/pi-495/stargazers` avec l'en-tête `Accept: application/vnd.github.star+json`, qui date chaque star |
| `T` | essais : téléchargements npm | `https://api.npmjs.org/downloads/range/<début>:<fin>/pi-495` |
| `C` | clones, relevés sans entrer dans `Q` | `gh api repos/jeanjerome/pi-495/traffic/clones` |
| `I` | interactions qualifiées : issue, discussion, PR, retour détaillé | relevé à la main |
| `H` | heures consacrées à la campagne | déclaré par le propriétaire |

Pi installe Pi-495 depuis npm : un essai ne passe pas par un clone. Et les clones ne viennent pas de
visiteurs — le 2026-09-25, le dépôt comptait 146 clones uniques pour un seul visiteur depuis sa
création. Le téléchargement npm tient donc lieu d'essai ; il compte aussi les miroirs et les
automates, mais leur débit régulier tombe dans la ligne de base du §2.

GitHub ne garde le trafic que quatorze jours. Les mesures se relèvent à chaque activation, au
lancement de chaque campagne et 48 h après, avant que la fenêtre ne les efface.

npm publie ses téléchargements avec plusieurs jours de retard : le 2026-09-25, l'API s'arrêtait au
2026-09-21, et répondait « package not found » pour un paquet publié après cette date. À 48 h, `T`
n'est donc pas encore connu. Le relevé de 48 h note `V`, `S`, `C` et `I` ; `T` se relève dès que
l'API couvre la fin de la fenêtre, et `Q` ne se calcule qu'ensuite.

L'indicateur :

$$Q = 100 \times \frac{S + 2T + 5I}{V}$$

Les coefficients ne prétendent pas être scientifiques. Ils disent une préférence : une interaction
réelle vaut plus qu'un essai, qui vaut plus qu'une star. Cinq stars et trois essais valent plus que
quinze stars passives.

## 2. Attribution

GitHub donne des référents et des totaux, pas l'origine d'une star. D'où une règle : **une seule
action d'acquisition importante toutes les 36 à 48 h**. On compare ensuite la fenêtre à la ligne de
base des sept jours précédents :

$$Lift_X = X_{48h} - 2 \times \mathrm{médiane}(X/\mathrm{jour}_{7j})$$

pour `X` = `V`, `S`, `T`. L'attribution n'est pas causale, mais elle est exploitable.

## 3. Canaux

| Canal | Pourquoi |
|---|---|
| Écosystème Pi | audience exactement ciblée ; le catalogue compte plusieurs milliers de paquets, y figurer ne suffit pas |
| Reddit, r/LocalLLaMA | agents, modèles locaux, harnais — le choix d'un harnais y est un sujet actif |
| Hacker News, Show HN | développeurs et auteurs d'outils |
| LinkedIn | génie logiciel, architecture, IA |
| Bluesky et Mastodon | développeurs open source et IA |

L'écosystème Pi est le premier canal testé, pas le gagnant présumé.

## 4. Angles

On ne republie pas trente fois « I've built Pi-495 ». On teste des hypothèses de valeur :

| Angle | Accroche |
|---|---|
| A — Trust | *Don't let the coding agent decide whether its own code is correct.* |
| B — Freeze | *Freeze the verification protocol before the agent writes code.* |
| C — Evidence | *From request to verified change, with evidence at every gate.* |
| D — Model independence | *The model produces the change. The model doesn't decide whether the change is accepted.* |
| E — Local models | *Can a local model produce trustworthy changes if the harness — rather than the model — decides acceptance?* |

L'angle E est taillé pour r/LocalLLaMA.

## 5. Phases

Les jours se comptent depuis l'activation. Une activation reprend à la phase où la précédente s'est
arrêtée.

### J1 à J3 — mesurer et convertir avant de parler

- **J1.** Relever l'état de départ : stars, visiteurs et vues sur 14 jours, clones, référents,
  contenus consultés, téléchargements npm, issues, PR. Aucune campagne n'est publiée sans être
  enregistrée dans `growth.csv`.
- **J2.** Activer GitHub Discussions, avec les catégories Announcements, Ideas, Q&A et Show and tell,
  et y ouvrir : *What would make you trust an AI-generated change?* C'est la question de recherche de
  495, pas un argument de vente.
- **J3.** Vérifier : l'aperçu social du dépôt est la bannière de Pi-495 (1280×640) ; le dépôt est
  épinglé sur le profil ; le README se comprend en moins de quinze secondes ; une démonstration est
  visible avant la partie technique ; l'installation se copie en une commande.

### J4 à J13 — exploration

Chaque canal est testé ; aucun n'est préféré d'avance.

| Jour | Canal | Angle |
|---|---|---|
| J4 | Écosystème Pi | B — Freeze |
| J6 | LinkedIn | C — Evidence |
| J8 | r/LocalLLaMA | E — Local models |
| J10 | Bluesky et Mastodon | A — Trust |
| J12 | une communauté de génie logiciel pertinente | D — Model independence |

J5, J7, J9, J11 et J13 ne publient rien : ils servent à répondre. Un commentaire détaillé apprend plus
qu'une impression de plus.

### J14 — sélection

Pour chaque campagne :

$$SR = \frac{Lift_S}{Lift_V} \qquad Q = 100 \times \frac{Lift_S + 2\,Lift_T + 5I}{Lift_V}$$

Le classement porte sur le couple canal × angle, pas sur le canal seul : « LocalLLaMA × modèles
locaux » peut être excellent et « LocalLLaMA × Evidence » moyen.

Une campagne n'est jugée qu'après au moins 25 visiteurs de plus que la ligne de base :

- **Amplifier** si `Q > 1,25 × médiane(Q)` : le couple est réutilisé.
- **Garder** si `0,75 × médiane(Q) ≤ Q ≤ 1,25 × médiane(Q)` : nouvelle expérience, autre accroche.
- **Abandonner** si `Q < 0,75 × médiane(Q)` sur deux expériences successives : on cesse d'y consacrer
  du temps. C'est le couple canal × message qui s'arrête, pas le canal.

### J15 et J16 — Show HN

Pas avant que quatre conditions tiennent : l'installation est vérifiée, quelques vrais utilisateurs
existent, une démonstration est prête, une ou deux remarques d'utilisateurs ont été intégrées.

> **Show HN: Pi-495 – Coding agents produce the code, evidence decides acceptance**

Show HN demande un projet que l'auteur a construit, que les lecteurs peuvent essayer, et un auteur
présent pour répondre ; un projet jeune y est admis. **Aucune demande de vote** : les règles de Show
HN l'interdisent. J16 est réservé aux réponses.

### J17 à J23 — exploitation

Sur trois campagnes, deux reprennent les meilleurs couples observés et une teste un couple nouveau.
Un canal n'est pas maintenu parce qu'« il faudrait y être ».

### J24 à J27 — seconde boucle

On reprend le meilleur couple du mois et on change **une seule** variable — par exemple le texte seul
contre une capture de terminal de 45 secondes. Si `Q` monte, la variante est gardée ; sinon on revient
au format précédent.

### J28 à J30 — conclusion

Le résultat est un tableau, par couple canal × angle : campagnes, visiteurs, stars, essais,
interactions, `Q`. À ce point on sait qui intéresser, avec quel problème, quelle preuve, sous quelle
forme et sur quel canal.

## 6. Diagnostic

| Observation | Action |
|---|---|
| beaucoup de visiteurs, peu de stars | améliorer le positionnement du dépôt et le README |
| peu de visiteurs, bonne conversion | améliorer la diffusion, pas le README |
| beaucoup d'essais, peu de stars | chercher pourquoi ceux qui essaient ne restent pas |
| beaucoup de discussions ou d'issues | privilégier cette audience, même si elle donne moins de stars |

## 7. Routine

À chaque jour actif : relever les mesures ; pour chaque campagne close, calculer les `Lift`, les
interactions et `Q` ; ne lancer aucune campagne importante si la précédente a moins de 48 h ; choisir
un couple non testé jusqu'à J13, puis deux fois sur trois un des deux meilleurs couples et une fois un
couple nouveau ; appliquer le §5 J14 et le §6.

## 8. Chaque vague montre une preuve nouvelle

On ne peut pas dire quinze fois que Pi-495 existe. Chaque vague montre ce que la précédente n'a pas
montré :

1. **Le mécanisme** : le protocole est gelé, puis le changement est produit, puis la preuve décide.
2. **Une exécution réelle enregistrée** : demande, exigences, vérification gelée, candidat, preuves,
   acceptation.
3. **Deux modèles, un protocole** : la même demande et le même protocole de vérification, sous un
   modèle local et sous un modèle hébergé. La question n'est pas lequel code le mieux, mais si le
   même protocole de preuve s'applique aux deux.
4. **Ce que Pi-495 a refusé** : *Pi-495 rejected this AI-generated change. Here is why.* Une telle
   preuve porte plus qu'une annonce de version.

Ces preuves sortent des recettes des chantiers d'implémentation ; c'est ce qui fait d'une recette un
moment clé (`epic.yaml`, `moments_cles`).
