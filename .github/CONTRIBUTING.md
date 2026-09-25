# Contributing to Pi-495

Pi-495 is in early development. The most useful contribution today is a report from a real Maven or
Node project: what you asked for, where 495 stopped, and what you expected instead.

## Ask, suggest, report

| You want to | Go to |
| --- | --- |
| Ask how something works | [Discussions → Q&A](https://github.com/jeanjerome/pi-495/discussions/categories/q-a) |
| Suggest a capability or a change of behavior | [Discussions → Ideas](https://github.com/jeanjerome/pi-495/discussions/categories/ideas) |
| Report a defect | [a bug report](https://github.com/jeanjerome/pi-495/issues/new?template=bug_report.yml) |
| Report a vulnerability | [a private security report](SECURITY.md), never a public issue |

A bug report is actionable when it gives the request, the command used, the observed stop reason and
the expected behavior. `/495 status` shows the phase, the gates and the next action.

Review exported content before attaching it. `/495 export --redact` masks recognized secret
patterns, but pattern matching does not guarantee that every sensitive value was removed.

## Change the code

You need Node.js 24 or later.

```bash
npm ci
npm run build
npm run check
```

`npm run check` is Preflight: typecheck, tests and every lint control. A pull request is reviewed
only when Preflight is green.

Read [CONVENTIONS.md](../CONVENTIONS.md) and [AGENTS.md](../AGENTS.md) before changing code. They
set the layer order, the commit message format (`<type>: <description>`, one line, in English) and
the checks each kind of change has to pass. The [specification index](../specs/README.md) links the
architecture, the decisions and the qualification records; [contracts/v1](../contracts/v1) holds
the JSON schemas used at boundaries.

## Conduct

Everyone who takes part follows the [code of conduct](CODE_OF_CONDUCT.md).
