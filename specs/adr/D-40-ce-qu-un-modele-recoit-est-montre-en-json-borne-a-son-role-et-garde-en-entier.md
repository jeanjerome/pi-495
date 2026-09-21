# D-40: Ce qu'un modèle reçoit est montré en JSON, borné à son rôle, et gardé en entier

**Status:** Acceptée

**Décision.** Trois changements sur ce que le harnais dit à une intervention et sur ce qu'il en
conserve.

Le contrat de sortie est **montré comme une réponse valide**, sérialisée depuis une valeur, et non
comme une esquisse de types : `{"objective": string, …}` n'est pas du JSON, et le demander ainsi
revient à montrer autre chose que ce qu'on attend. Un test vérifie chaque exemple contre le schéma
qu'il illustre, donc l'exemple ne peut pas dériver. L'instruction dit aussi **ce que coûte un bloc
absent** — l'intervention entière est jetée et le changement s'arrête —, parce qu'un modèle qui
l'ignore n'a aucune raison de traiter la clôture comme portante.

L'instruction qui demande de laisser le workspace dans un état qui compile n'est plus remise qu'aux
rôles qui écrivent. `specify`, `review` et `observe` ont pour outils `read`, `ls`, `find`, `grep`,
ne sont jamais repris sur un workspace, et la recevaient en contradiction avec celle qui leur
interdit d'écrire.

Le manifeste de contexte porte `prompt_digest`, qui adresse dans le magasin d'objets **le texte
exact remis au modèle** — invite système et invite —, et les extraits du projet y sont écrits sous
les empreintes que le manifeste nommait déjà.

**Motif.** Sur la campagne `java-flashnext-L2`, un rapport de spécification a été refusé faute de
bloc délimité alors que son objet JSON était complet et valide, et trois des cinq rapports de cette
famille de campagnes sont morts sur leur forme. L'analyse de ce qui avait été remis au modèle a buté
sur le dossier : les instructions et l'objectif y sont en clair, soit 2 302 caractères, tandis que
les douze extraits du projet — 24 224 octets, le gros de ce que le modèle a lu — n'étaient nommés
que par une empreinte absente du magasin, le workspace étant supprimé après l'intervention. Moins
d'un dixième du prompt était donc lisible, et le texte assemblé ne l'était pas du tout.

**Conséquence.** `ContextManifest` porte un champ de plus ; un manifeste écrit avant ce changement
ne le porte pas et se lit comme absent. Le dossier grossit du texte des invites et des extraits :
sur cette campagne, cinq interventions partageant les mêmes douze extraits, l'ajout est de l'ordre
de 150 Ko, dédupliqués par empreinte pour ce qui se répète. Les extraits sont du texte du projet
cible, qui entre ainsi dans le dossier exporté — c'est ce qui permet de dire ce qu'une intervention
a lu, et cela relève de l'expurgation déclarée à l'export, pas d'un refus d'enregistrer.
