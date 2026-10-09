# Témoins de qualification du contrôle TLC

Trois modèles finis qualifient `scripts/check-formal.ts` et le lecteur de la sortie de TLC
(`src/adapters/formal/tlc.ts`). Chacun est un dossier : le modèle `Compteur.tla`, sa configuration
`Compteur.cfg` et le manifeste `manifest.json` qui les approuve par leur sha256, nomme les propriétés
que l'exploration doit vérifier, le TLC approuvé et le budget d'une exécution.

| Témoin | Ce qu'il est | Ce que le contrôle rend |
|---|---|---|
| `valide/` | un compteur qui monte de 0 à `Max = 3` puis s'arrête ; sûreté `Borne`, issue valide atteignable `Termine` | `completed`, sortie 0 : `Borne` et `Termine` vérifiées sur le modèle borné |
| `mutant/` | le même modèle avec une transition fautive (`x' = x + 2`) ; il s'analyse comme le valide | `counterexample`, sortie 1 : `Borne` violée, la trace `x = 0`, `x = 2`, `x = 4` conservée |
| `incident/` | le même modèle avec `Max = 100000000` sous un budget de 3 s | `inconclusive`, sortie 2 : l'exploration est arrêtée au budget, rien n'est vérifié |

Le PASS du témoin valide porte sur le modèle sous ses bornes, jamais sur le programme qu'il décrit.

## Commande locale

```sh
node scripts/check-formal.ts specs/formal/fixtures/tlc/valide/manifest.json --jar <tla2tools.jar> [--java <java>] [--store <dossier>]
```

Sortie : 0 `completed`, 1 `counterexample`, 2 `inconclusive`, 3 `error`. Les sorties brutes de TLC et le
rapport normalisé vont dans l'object store de `--store` (`~/.495/formal/objects` par défaut) ; la
commande imprime leurs empreintes. `node --test test/v4-platform/tlc-qualification.test.ts` exécute les
trois témoins et vérifie ces trois issues.

## Outillage de développement requis

Rien n'est téléchargé ni installé par le contrôle : l'outillage est celui du poste.

- `tla2tools.jar` de TLC 2.19 of 08 August 2024 (rev 5a47802), sha256
  `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88` : le jar autonome de la
  publication v1.7.4 de `tlaplus/tlaplus`, qui tourne sur une JVM native ARM ou x86. Le jar embarqué
  dans l'application TLA+ Toolbox a une autre empreinte. Un autre jar est refusé (`capability missing`) :
  approuver une autre version, c'est mettre à jour `tool` dans les manifestes après l'avoir qualifiée
  sur ces témoins.
- Un runtime Java sur le `PATH`, ou nommé par `--java`. Mesuré sur la machine de référence : OpenJDK
  25.0.4.1 (GraalVM CE 25.3.4.1).

Le test de qualification lit le jar dans `TLA2TOOLS_JAR`, sinon dans
`~/.local/share/tlaplus/tla2tools.jar`, et se déclare sauté, avec la raison, quand le jar ou Java manque.
