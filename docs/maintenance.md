# Maintaining this fork

The branch starts at upstream `0.9.9.2`, matching the installed version from
which the local customizations were recovered. `upstream` points to
`https://codeberg.org/anametologin/Krohnkite.git`. `origin` points to
`git@github.com:flowrange/krohnkite.git`; the maintained branch is `main`.

Keep changes to split behavior, driver fixes, packaging and documentation in
separate commits. Work in TypeScript and QML under `src/` and `res/`; do not edit
the generated `krohnkite.js` or the installed package as the source of truth.

For a future upstream update:

1. Fetch `upstream` and review its release changes. Create a temporary integration
   branch from the fork. Choose the upstream tag or commit deliberately.
2. Merge that upstream revision into the integration branch. Resolve changes to
   `TileLayout`, the driver focus/event path, layout lifetime and shortcut APIs
   against the tests. Preserve `krohnkite-flowrange` as the package identity.
3. Run `npm ci --ignore-scripts`, `npm test`, `npm run package` and, on a compatible
   Plasma installation, `npm run test:kwin`.
4. Review the diff and test desktop behavior before moving the maintained branch
   or installing an updated package. Retain a working package for rollback.

The local customizations have their own commits; merging upstream does not
silently discard them, but conflicts and API changes still require review.
Avoid rewriting published commits when a merge will preserve shared history.

## Commit identity

Use the existing identity `flowrange <flowrange67@gmail.com>`. When Codex assisted
with a change, include the same trailer used in the other flowrange forks:

```text
Co-authored-by: Codex <codex@openai.com>
```

The cryptographic signature belongs to flowrange; the trailer credits Codex as
coauthor. Sign with a key explicitly selected by the owner. For GitHub to verify
an SSH signature, that public key must be registered on the account as a signing
key. Authentication keys and signing keys are separate registrations.
Keep private keys in the agent or owner's vault, never in this repository.
