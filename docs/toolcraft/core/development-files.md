# Development Files

Read this module before creating working attachments, screenshots, temporary files, or changing file cleanup and template copying. Follow [workflow](../workflow.md) for the surrounding task.

## Ownership And Location

| File kind | Owner and location | Lifetime |
| --- | --- | --- |
| User uploads through runtime controls | Runtime binary repository in browser IndexedDB; metadata references in workspace persistence | Reachability includes current state, history, persistence and active work. Ordinary upload does not copy files into the project. |
| Saved application defaults | Host writes `src/app/app-defaults.json` and `public/toolcraft-defaults/` | Product assets. See [Save App Defaults](setup-export.md#save-app-defaults) for ownership and cleanup. |
| Agent browser diagnostics | `.toolcraft/browser-artifacts/`, or the browser tool's external storage | Disposable; never put working screenshots or traces in source, `public`, or the project root. |
| Agent test inputs, exploratory exports and other scratch files | `.toolcraft/scratch/` | Disposable. Use a task-specific subdirectory. Promote a needed fixture into `e2e/fixtures/` and document its purpose. |
| Authored product assets and documentation images | Product's referenced asset paths; intentional documentation images in `docs/assets/` | Durable; never delete by extension or infer obsolescence from a filename. |
| Motion-reference evidence | `src/app/reference-studies/<studyId>/evidence.json` and `contact-sheet.png` | Durable reference evidence. Reference-study tooling owns regeneration and `.toolcraft/tmp/` transactions. |
| Change and command history | `docs/agent-journal/` and `.toolcraft/journal/` | Text-only; preserve attempts and retries. No automatic age-based deletion. |
| Verification receipts and other `.toolcraft` state | Their existing framework owners | Never remove as generic scratch. Ignored by Git does not mean disposable. |

Do not create screenshots just to fill a worklog. The text journal requires no screenshots, recordings or traces. Existing browser tests retain their configured failure traces separately.

## Check And Clean

After adding development files, run `pnpm files:check`. It reports common diagnostic names such as `screenshot.png`, `public/debug.png`, and stray `.tmp`/`.bak` files. It does not infer an arbitrary image's purpose from its contents. Correct the placement or give an intentional product asset a meaningful product name. Authored documentation images, test fixtures, and motion-reference evidence have explicit durable locations.

`pnpm ai:check` includes the same placement check. CLI starter copying, npm template packaging and template import use the same transient-file exclusions and reject misplaced diagnostics. They preserve product assets, fixtures and reference evidence. The CLI loads its built-in policy, never policy code supplied by an imported template.

Use `pnpm files:clean` to preview eligible paths and byte counts. `pnpm files:clean -- --apply` removes only unchanged regular files that have been unmodified for at least 24 hours under `.toolcraft/browser-artifacts/` and `.toolcraft/scratch/`. It checks the complete candidate set before deletion, rejects symlinks and special files, and rechecks file identity before unlinking. Run it when the corresponding work has finished. It leaves directories and every other storage owner intact.

There is no background cleanup timer. Repeated cleanup is an explicit maintenance operation, not an extra delivery or performance gate. Do not run a recursive delete on `.toolcraft` or substitute a broad extension-based cleanup script. This command never cleans external tool storage.
