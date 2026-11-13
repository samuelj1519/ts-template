# Collaborate with coding agents

Start with a bounded task, explicit acceptance, and a runnable check. The same engineering rules apply to people and coding agents.

## Start a task

1. Confirm the repository, branch, worktree, existing changes, project standard, and task authorization.
2. Record the exact base, goal, allowed paths, writer, public interfaces, acceptance, and stopping conditions in the task or review record.
3. Read the relevant architecture and verification guidance. Identify the source, synthetic fixtures, build output, and running service.
4. Choose a small verifiable change and assign an independent reviewer for nontrivial work.

Keep current decisions in the relevant project guide and task progress in the task record.

## Run independent work in parallel

Split tasks along independent ownership and interfaces. Each writer uses a separate branch and worktree, installed dependencies, output directories, and ports. Confirm active ownership before using a worktree.

From the task's exact base:

```sh
git worktree add -b task/text-preview ../text-preview-worktree <full-base-commit>
```

Check existing names first, then install dependencies from the lockfile in that worktree. Keep its source, dependency tree, and server separate from other active tasks.

Assign one owner to each shared contract, manifest, lockfile, check configuration, and generated artifact. Agree on interfaces before parallel implementation. Route shared changes and disputed boundaries through that owner.

## Review and integrate

The author runs the required checks. An independent reviewer checks the requirements and critical public behavior. The integrator verifies the exact combined tree with the full checks before integration.

Stage owned paths, review the staged diff, and run normal hooks. Each commit describes one reviewable result. Follow the task authorization defined in `AGENTS.md` for version-control and release operations.

At task completion or transfer, record the directory, branch, base and candidate, writer, committed and uncommitted changes, evidence, remaining issues, and next step. Query an unknown operation result before repeating it. Retain necessary evidence and confirm resource ownership before cleanup.

## Use Herdr when available

Herdr manages terminal workspaces and agent sessions. Check its installed version and current help before issuing commands. For an existing pane, confirm `HERDR_ENV=1`, read that version's operating instructions, and verify the workspace, pane, session, recipient, and input mode. Use the existing session rather than starting a nested one.

Keep one input writer, send the task reference once, verify receipt, and release that writer's ownership. If delivery is unknown, inspect the original operation and pane before further input. Confirm completion from the session and its result. Verify automated dispatch and recovery through an end-to-end test.

## References

- [Herdr agent guide](https://github.com/herdrdev/herdr/blob/master/distribution/agent-guide.md)
- [Git worktrees in Cursor](https://prod.cursor.com/docs/configuration/worktrees)
- [Repository guidance and executable architecture checks](https://openai.com/index/harness-engineering/)
