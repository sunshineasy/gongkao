# Development checks

Current development stage is defined only in `CURRENT_STAGE`.

- Complete a small change by running the repository standard test command: `npm run test:all`.
- After tests pass, create a versioned commit in the form `type(CURRENT_STAGE): description`, then push. Never push when tests fail.
- Do not expand the requested milestone or scope without explicit direction.
- Only implement work within `CURRENT_STAGE`; do not enter a later stage without explicit direction.
- Do not make unrelated refactors, feature expansion, or architecture migration.
- If a safe fix requires crossing stages, stop and report it rather than expanding scope.
- Follow existing product and architecture decisions.
- When changing stages, edit only `CURRENT_STAGE`.
- After cloning, run `npm run hooks:install` once to enable all repository hooks.
