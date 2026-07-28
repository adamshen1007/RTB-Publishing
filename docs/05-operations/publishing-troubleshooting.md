# Publishing Troubleshooting

## `brew: command not found`

Install Homebrew from [brew.sh](https://brew.sh/) and run the shell-path commands
printed at the end of its installer. Open a new Terminal and verify with
`brew --version`.

## Pandoc or Vale Is Missing

```bash
brew install pandoc vale
pandoc --version
vale --version
```

RTB Publishing requires major version 3 or newer for both tools.

## Mermaid Cannot Launch a Browser

First reinstall project dependencies:

```bash
pnpm install --force
```

On restricted or sandboxed systems, headless Chromium may require permission to
launch. Run the command from a normal Terminal session. The project passes a
no-sandbox configuration for CI and controlled local rendering.

## A Link Check Reports a Network Warning

The checker distinguishes confirmed broken links from inconclusive remote
responses. Authentication failures, rate limits, server errors, and transient
network failures are warnings. HTTP 404 and 410 responses fail the gate.

Retry once from a stable network. If a source is permanently unavailable,
replace it with an authoritative accessible source rather than suppressing it.

## Citation Validation Fails

Every book chapter requires a `## Sources` section containing at least one
public Markdown link. Remove placeholders such as `TODO`, `TBD`, `citation
needed`, and `add sources`.

## Build Outputs Are Missing

Run the full sequence:

```bash
pnpm check
pnpm build
pnpm verify:outputs
```

The build stops on its first failed conversion. Read the error immediately
above the final nonzero exit status.

## Preview Reports That No Build Exists

Run `pnpm build` before `pnpm preview`.

Preview intentionally reads only the generation named by
`dist/books/.current/<project-id>.json`. It does not serve an older
`dist/books/<project-id>/` directory. If the pointer is missing, malformed, or
names a missing generation, run a fresh build; do not edit the pointer.

## A Stale Writer Lock Is Reported

RTB does not automatically delete a lock whose recorded process appears dead.
An automatic path-based handoff cannot safely distinguish a stale owner from a
rapid replacement by another writer.

1. Stop Creator Studio, preview, builds, publishing commands, and every other
   RTB Publishing process using this workspace.
2. Confirm no RTB Publishing process is still running.
3. Preserve the reported `writer.lock` or `workspace-output.lock` as incident
   evidence by moving it to a separate backup directory outside `.rtb-state`.
4. Start exactly one command and verify that it creates and later releases a
   new lock normally.

If you cannot prove that every writer is stopped, leave the lock unchanged and
recover the workspace with an operator who can inspect the running processes.

## Port 4173 Is Already in Use

Choose another port:

```bash
PORT=4174 pnpm preview
```

Then open <http://127.0.0.1:4174>.

## Clean Rebuild

```bash
pnpm clean
pnpm check
pnpm build
```

This removes only generated `build/` and `dist/` content. Canonical Markdown is
not affected.
