# Writing a technology for 495

A technology tells 495 how to judge a project of one kind: how to recognise it, which commands check it, how
to read what those commands leave. This directory holds one, written against the published interface alone,
with a project it recognises:

- `fict.ts` — the technology: a project that holds `fict.toml`, whose tests are `cases/*.case`, each line
  `<path>=<expected>` passing when the file at `<path>` holds `<expected>`;
- `project/` — a sample project it recognises;
- `conformance.ts` — the conformance test of the technology on that project.

It imports nothing of 495 but `pi-495/stack`, and the modules of Node.

## Where a technology lives

A technology joins the repository of 495: one directory, `src/adapters/stacks/<technology>/`, which implements
`StackPlugin`, and its place in the list `src/extension/runtime.ts` mounts. 495 loads no technology from
anywhere else. Inside the repository it imports the modules of `src/` directly; outside, as here, the same types
come from `pi-495/stack`. `CONVENTIONS.md` § Structure says how the directory is laid out, one subdirectory per
capability.

`pi-495/stack` follows the version of the package. While the package is at 0.x, a minor version may change it.

## What the common layer asks, and what it does with the answer

The common layer of 495 (`src/application/stacks/`) asks a technology everything, on a copy of the project, and
assembles the answers once for every technology. A technology reads the project only through the `ProjectView`
it is handed: paths relative to the copy, nothing written, nothing run. A path that leads out of the copy, or a
file past the read bound, throws, and the technology concludes nothing on what it did not read.

Every capability but `workspace` and `install` is asked with the same `CapabilityQuestion`: the model the
recognition returned, the view, the requirements its controls judge, the Node binary that runs a control
spawning nothing of its own, the packages an adopted quality referential installed in the copy, and the
architecture map the owner adopted, which is never read from the copy.

### Recognition

`recognise(view)` returns the model of the project the capabilities share, or `null` when the project is not
one of its own. The list of `src/extension/runtime.ts` is asked in order, and the first technology that
recognises the project judges it. When none does, the change stops on a missing capability, and the message
names the `signal_files` each technology expected. `facts(question)`, when declared, is recorded with the
detection for whoever reads it back.

### Readers

`readers` are the readers of the report formats only this technology writes. A control names its reader by
`parser`; the runner hands the reader what the run left — the observation, the reports at `report_path`
(bounded, never followed out of the copy), the introduced lines — and the reader returns a verdict with its
facts and failures. A reader that has nothing to read, or a report past the read bound, answers
`INDETERMINATE`, never `PASS`: a reader that concludes on what it did not read lets a change through on no
evidence. The formats several technologies write have their readers in `pi-495/stack`: `EXIT_CODE_READER`,
`JUNIT_READER` and `lcovReader`. `fict.ts` declares `fict-lines`.

### Tests

The one capability every technology offers. `offer(question)` returns, available, the controls that run the
suite; missing or refused, with the reason, and the change stops there: a protocol without the suite would judge
nothing of the behaviour. Each control is a `ControlDefinition`: the command as an array, never a shell; the
variables, network and writable paths it gets in the sandbox; the reader of what it leaves; the paths a candidate
may not touch.

Before any control judges a change, it is qualified on copies of the project. `positiveWitness(question)` writes
a passing test: every control must give `PASS` there. `negativeWitness(question)` adds a failing one: every
control must give `FAIL` there, unless its capability gives it a witness of its own (`own_negative_witness`).
A runner that cannot start must give `INDETERMINATE`. A control that misses one of the three is not
qualified, and the change cannot freeze its protocol on it.

`preparationPaths(question)` are the directories a preparation intervention may write tests into, before the
change is implemented. `isTestFile(path)` says which files of the project are tests, which the diagnosis counts.
`mirroredResource(path)`, when declared, names the production resource a test resource may carry byte for
byte. `measuredCodeWitness(question)`, when declared, is a module a test calls and asserts on in full: the
controls that judge only the introduced lines must let it through.

### Coverage, mutation, quality, structure

Each is optional, and each `offer(question)` answers in the same shape as the tests:

- **available**, with its controls, the negative witness of each control the shared one does not prove,
  `reference_positive`, the controls whose positive witness is the reference alone because the shared one
  carries what they detect, and `short_of`, what of the capability is still not offered;
- **missing**, with the reason and, when there is one, the recommendation that would give it — a package to
  install or a file edit, which the owner may adopt;
- **refused**, with the reason.

A capability that is not available is named a blind spot in the diagnosis, in the same words for every
technology. Its controls run in this order: the suite, coverage, structure, mutation, then quality, each after
the controls that write the reports it reads (`provides` and `requires`). Coverage and mutation controls whose
reader judges only the introduced lines (`differential`) make the common layer ask for the measured-code
witness. `quality.referential(question)`, when declared, proposes the owner a quality referential to adopt —
its rules, what its analysers read and leave aside, the packages that bring them — or says why none is
proposed.
`structure.architecture(question)`, when declared, is asked once the owner adopted an architecture map: it
recommends the analyser that verifies the rules of the map and the edit that declares it in a copy, with the
`declarations` of the other files of the copy the verification is declared in, or says why none is offered; once
a copy carries those declarations, `structure.offer` adds the controls of the map.

### Workspace

`workspace` says what the technology puts in a copy that is not a change. `outputs` are what its tools write
there, left out of the reference and of every candidate. `installed_dependencies` is the directory it installs
dependencies in: every control protects it, a candidate cannot add a file under it, the integration never indexes
it. `env` names the variables of the session its controls read, beyond `PATH`, `HOME`, `TMPDIR`, `LANG` and
`LC_ALL`; no other variable reaches a control. `versions` names the tools whose version enters the identity of
the environment, each with the command that prints it.

### Install

`install` says how the package manager of the technology brings a complement into a copy. `plan` decides,
from the files of the reference alone, the command to run, or why it cannot run. The install runs in a copy
with the network open for that step alone; `inspect` then compares the copy before and after and accepts the
files to keep and the packages added, or refuses. `outside_write`, when declared, asks the manager, offline,
the one directory it writes outside the copy. `phrases` are what the owner reads of the adoption, in French
and in English. The conformance test does not judge this capability: the tests of each technology do.

## The conformance test

`stackConformance(technology, { projects })` judges a technology on sample projects of its own, and says what
does not hold. For each project it:

- recognises it by that technology alone — a project it does not recognise is a finding;
- qualifies each control an available capability offers by its witnesses, as a change does — a control not
  qualified is a finding that names it, with what its witnesses gave;
- runs each reader of the technology, through the first control that names it with a report, on a copy
  without report and on a copy whose report passes the read bound — a reader that concludes there is a finding.

It runs the commands of the technology, witnesses included, under the sandbox of the platform (Seatbelt on
macOS, bubblewrap on Linux), with the network and the writable paths each control declares, in copies of the
project, which it never writes. Where the sandbox is not qualified, it refuses with `CAPABILITY_MISSING` and
runs nothing; there is no option to run unconfined.

```ts
import { stackConformance } from "pi-495/stack";
import { FICT_PLUGIN } from "./fict.ts";

const report = await stackConformance(FICT_PLUGIN, { projects: ["examples/fictitious-technology/project"] });
// report.findings is empty when the technology holds; report.projects says what was judged
```

From the root of the repository, after `npm run build`:

```sh
node examples/fictitious-technology/conformance.ts
```

It prints the report and exits non-zero when the report carries a finding. Give it projects that exercise each
capability the technology offers: a capability a project does not get offered is not judged on it.
