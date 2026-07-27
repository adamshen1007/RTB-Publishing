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
