# Security policy

## Supported versions

Pi-495 is in early development. Only the latest release published on
[npm](https://www.npmjs.com/package/pi-495) receives security fixes.

## Report a vulnerability

Report it privately, through
[**Security → Report a vulnerability**](https://github.com/jeanjerome/pi-495/security/advisories/new).
Do not open a public issue or discussion.

Include the Pi-495, Pi, Node.js and macOS versions, the steps that reproduce the problem, and what
an attacker gains. The report stays private between you and the maintainer until a fix is
published.

## What counts

Pi-495 runs model-produced code and the target project's own commands. A vulnerability is any way
to break one of the boundaries it claims, for example:

- a candidate or a control that escapes its sandbox, or reaches the network or the filesystem
  outside its confinement profile;
- a change accepted without the frozen evidence, or a protected test altered by the coding agent;
- a dossier whose integrity verifier passes although its content or event chain was altered;
- a secret that `/495 export --redact` leaves in clear although it matches a recognized pattern.

The Linux `bubblewrap` backend is unqualified and refuses productive work; a way to make it run
unconfined is a vulnerability.
