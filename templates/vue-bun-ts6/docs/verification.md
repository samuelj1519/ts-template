# Verification

Quality limits and source inclusions are defined in the checked-in configurations. Preserve established limits and obtain approval for policy changes.

## Run the checks

Install dependencies with `npm ci` and prepare Chromium as described in README.md. Security checks use current registry advisory data.

| Command                   | Scope                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`           | Formatting, typed lint, TypeScript, architecture, and spelling.                                                                       |
| `npm run check:full`      | Fast checks, policy tests, unit coverage, production build, browser tests, unused code, security, and production dependency licenses. |
| `npm run check:milestone` | Full checks, mutation testing, and duplicate-source checks.                                                                           |

Use individual scripts for diagnosis and `npm run format` to apply formatting. The optional pre-commit hook runs the fast checks; delivery and integration require the full checks.

## Validate measurements

The initial application requires 100% coverage for its configured counters, 100% mutation score for the preview model, and zero duplicate source in the configured scope. Review scope changes together with policy changes.

Architecture reports must contain application modules. Coverage reports must match the canonical application source set and contain consistent, nonzero counters. Zod validates report data. Keep tests, dependencies, and tooling outside application measurements. Missing, empty, incompatible, or contaminated reports fail validation.

Compare the same measurement object under the same source, dependencies, configuration, and environment. Record the first measurement as its baseline. Critical negative probes must compile and then fail the intended behavior assertion. Report killed, surviving, invalid, and unexecuted mutations separately.

## Verify the running interface

Browser tests build the application and start a private server for that invocation. Use isolated ports, browser contexts, fixtures, and outputs. Drive real pointer and keyboard input, wait for observable completion, and retain screenshots or traces for failures.

The starter covers empty preview, normalization, reset, keyboard order and focus, narrow layout, light and dark themes, reduced motion, accessible names, and automated accessibility checks.

For new UI, apply the project interface standard to first use, empty, error, loading, narrow, dark, keyboard, and accessibility states. Targets are at least 24 CSS pixels, text contrast at least 4.5:1, and meaningful non-text contrast at least 3:1. Use semantic colors and visible focus. Test Escape, focus return, and next-Tab behavior for overlays. AI actions require clear capability labels and appropriate preview, confirmation, or undo.

Record browser, screen-reader, native IME, native-shell, real-service, and installed-package acceptance separately. Mark required checks as passed, failed, or `not_run`; use `N/A` with a reason for checks outside the feature's scope.

## Review and retain evidence

For nontrivial work, an independent reviewer receives the requirements, exact base and candidate, complete diff, inputs, and logs. The reviewer runs critical public paths and examines test changes and exceptions.

Before integration, verify the exact combined tree with the full checks and applicable acceptance. At milestones, review architecture, test strength, duplication, complexity, documentation, exceptions, and regression data. Report measurements from actual evidence.

Record commands, directory, versions, exits, original failures, reruns, evidence, remaining acceptance, and next owner in the task or review record. Store logs and build output in artifact directories and retain required evidence before cleanup.
