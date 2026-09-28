# Exploration, J4 à J13 — les cinq messages

Activation le 2026-09-25, à la publication de pi-495 0.2.1. Les jours suivent `plan.md` §5 ; les
règles communes à tous les messages sont au §4. Le propriétaire publie ; chaque campagne s'inscrit
dans `growth.csv` avant de partir, et ses mesures se relèvent au lancement puis 48 h après.

| Jour | Date | Canal | Angle | Langue | Star demandée |
|---|---|---|---|---|---|
| J4 | 2026-09-28 | Écosystème Pi — Discord de Pi | B — Freeze | anglais | non |
| J6 | 2026-09-30 | LinkedIn | F — Harness | français | oui, en second |
| J8 | 2026-10-02 | r/LocalLLaMA | E — Local models | anglais | non |
| J10 | 2026-10-04 | Bluesky et Mastodon | A — Trust | anglais | oui, en second |
| J12 | 2026-10-06 | une communauté de génie logiciel | D — Model independence | anglais | non |

Chaque chiffre cité vient d'un relevé du dépôt : la démonstration du README (Claude Sonnet 5, 86 s,
G0 à G5), et `specs/verifications/e23-deux-fournisseurs.md` pour la paire local et hébergé.

## J4 — Discord de Pi · B — Freeze

> **pi-495: freeze the tests before the agent writes the code**
>
> I've published pi-495, a Pi package that takes a change through gated phases. It is built around one
> rule: the verification protocol is frozen before implementation starts.
>
> ```
> /495 start add a retry with backoff to the upload client
> ```
>
> - the request becomes requirements with observable acceptance criteria;
> - a separate step writes the tests — they must run, and fail on the current code, before they are
>   adopted;
> - the tests are frozen; the implementing agent works in an isolated copy and cannot edit them;
> - the checks run, and acceptance is computed from their results — not from what the agent says.
>
> It uses the model you selected with `/model`, local or hosted. `/495 decide`, `/495 review` and
> `/495 report` bring the decisions, the diff and the verdicts into Pi's terminal.
>
> Early stage (0.2.1): macOS on Apple Silicon, target projects on Maven/Surefire or `node --test` —
> Jest and Vitest are not supported yet.
>
> ```
> pi install npm:pi-495
> ```
>
> An 86-second real run with Claude Sonnet 5 is at the top of the README:
> https://github.com/jeanjerome/pi-495
>
> If you try it on a small change, tell me where it stops — that is what I need most right now.

Joindre le GIF de démonstration (`.github/assets/demo.gif`).

## J6 — LinkedIn · F — Harness

> D'abord, on a soigné les prompts. Puis on a empaqueté le savoir-faire en skills et en contexte. Il
> reste une couche, et c'est elle qui décide : le harnais.
>
> Un agent de code sait produire un changement. En revue, la question n'est pas « a-t-il écrit du
> code ? », mais « qui a décidé que ce code était bon ? ». Si la réponse est l'agent lui-même, rien
> n'a été vérifié.
>
> C'est l'idée de Pi-495, une extension open source pour l'agent de code Pi, publiée en version
> 0.2.1 :
>
> → la demande devient des exigences, chacune avec des critères observables ;  
> → les tests sont écrits et gelés avant la première ligne d'implémentation, et ne sont adoptés que
> s'ils échouent sur le code actuel ;  
> → l'agent implémente dans une copie isolée et ne peut pas toucher aux tests protégés ;  
> → l'acceptation se calcule sur les résultats exécutés ; l'humain tranche ce qui demande un
> jugement.  
>
> Le prompt et les skills disent à l'agent comment travailler. Le harnais dit ce qui compte comme
> terminé.
>
> Prévu, pas encore livré : assembler skills, gabarits de prompts et documentation selon le rôle, la
> phase et les capacités du modèle.
>
> Le projet est jeune : macOS sur Apple Silicon, projets Maven ou Node (`node --test`). La démo
> montre une exécution réelle de 86 secondes avec Claude Sonnet 5.
>
> Si vous l'essayez sur un petit changement, dites-moi où il s'arrête. Et si l'idée vous parle, une
> étoile sur le dépôt l'aide à être trouvé.
>
> https://github.com/jeanjerome/pi-495
>
> #HarnessEngineering #AgenticCoding #IA #GénieLogiciel #TDD #OpenSource

Joindre la vidéo de démonstration (`.github/assets/demo.mp4`), que LinkedIn lit en ligne.

## J8 — r/LocalLLaMA · E — Local models

**Titre :** Same frozen test protocol, a local Qwen3.8-27B vs Claude Sonnet 5: both changes accepted,
same output file byte-for-byte

> I'm building pi-495, an extension for the Pi coding agent. It asks one question: can a local model
> produce a change you can trust if the harness — not the model — decides whether the change is
> accepted?
>
> The harness turns the request into requirements, has the tests written and frozen before any code
> exists (they must fail on the current code to be adopted), lets the model implement in an isolated
> copy where the tests are protected, then runs the checks and decides.
>
> I ran the same request, on the same small target, twice: once with Qwen3.8-27B (an MLX quant
> served by oMLX on my Apple Silicon Mac), once with Claude Sonnet 5.
>
> | | local Qwen3.8-27B | Claude Sonnet 5 |
> |---|---|---|
> | outcome | accepted, gates G0–G5 pass | accepted, gates G0–G5 pass |
> | attempts | 1 of 3 | 1 of 3 |
> | model time (specify + prepare + implement) | 248 s | 60 s |
> | tool calls | 19 | 16 |
> | tokens | 55,525 | 78,615 |
>
> Both wrote the same `src/greet.js`, byte for byte. Nothing required that — the harness compares
> gates and check verdicts, not the text.
>
> Limits, before anyone asks: it's a tiny contract case (a four-file target), the two runs used
> different builds of the harness, and it qualifies nothing beyond that case. The full record is in
> the repo, in French: `specs/verifications/e23-deux-fournisseurs.md`.
>
> A model must pass a small tool-call probe before it gets work; a model that answers without
> calling the tool is refused before anything runs.
>
> Local OpenAI-compatible endpoints configured in Pi are admitted when their tool calls work. It's early
> (0.2.1): macOS on Apple Silicon only, targets on Maven or `node --test`.
>
> https://github.com/jeanjerome/pi-495 — `pi install npm:pi-495`
>
> If you run local models on a Mac and try it, I'd like to know which ones pass the probe and which
> ones stall.

Pas de lien raccourci, pas d'appel au vote. Rester présent dans les commentaires à J8 et J9.

## J10 — Bluesky et Mastodon · A — Trust

### Bluesky — fil de trois messages, 300 caractères chacun au plus

> **1/** Vibe-coding speed, senior-dev discipline.
>
> Pi-495 lets a coding agent write the change, but not grade it: the tests are written and frozen
> before the code exists, and the change is accepted on their results.
>
> Open source, early stage, for the Pi coding agent. 🧵

> **2/** A real 86 s run with Claude Sonnet 5: request → requirements → frozen tests → code in an
> isolated copy → accepted, gates G0 to G5 passed.
>
> macOS on Apple Silicon, Maven or node --test projects.
>
> pi install npm:pi-495

> **3/** Try it on a small change and tell me where it stops. A ⭐ helps others find it:
> github.com/jeanjerome/pi-495

Joindre le GIF au message 2.

### Mastodon — un message, 500 caractères au plus

> Vibe-coding speed, senior-dev discipline.
>
> Pi-495 lets a coding agent write a change but not grade it: tests are written and frozen before
> the code exists, the agent works in an isolated copy, and the change is accepted on the test
> results.
>
> Open source, early stage: macOS on Apple Silicon, Maven or node --test projects.
>
> Try it on a small change and tell me where it stops. A ⭐ helps it get found.  
> https://github.com/jeanjerome/pi-495
>
> #AI #LLM #OpenSource #TDD

## J12 — communauté de génie logiciel · D — Model independence

Le lieu reste à choisir ; lire ses règles sur l'autopromotion avant d'y publier.

**Titre :** The model produces the change. It shouldn't decide whether the change is accepted.

> Most coding agents close their own loop: they write the code, run the tests they wrote, and report
> success. I'm building pi-495, an extension for the Pi coding agent, to separate the two roles.
>
> A change goes through seven gates: mandate, requirements, a frozen verification protocol, design,
> an isolated candidate, model-free checks, local integration. A few rules hold throughout:
>
> - each check must first show a passing case, a failing case and a tool failure before it can
>   decide anything;
> - tests for new behavior are written in a separate step, must fail on the current code, and then
>   cannot be edited by the implementing agent;
> - on Maven projects, surviving mutants on changed lines and new violations of declared Java import
>   boundaries block acceptance; findings the code already had are reported, not blamed on the
>   change;
> - `/495 verify` reruns the frozen checks without calling any model;
> - the dossier keeps artifacts and hash-chained events, and exports with an offline verifier that
>   runs with Node alone.
>
> The report states each adopted requirement with the verdicts its checks gave the candidate.
>
> The model is whatever you configured in Pi, local or hosted, and it is never silently substituted.
> The same small request reached acceptance under a local Qwen3.8-27B and under Claude Sonnet 5.
>
> It's early (0.2.1): macOS on Apple Silicon, Maven or `node --test` targets.  
> https://github.com/jeanjerome/pi-495
>
> I've opened a discussion on the question underneath all this — what would make you trust an
> AI-generated change? https://github.com/jeanjerome/pi-495/discussions/1
