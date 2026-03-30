# Extra Extensions

This directory contains optional plugins for this fork.

Install `pi` first:

```bash
./scripts/dev-install-pi.sh
```

Then copy the plugin you want into `~/.pi/agent/extensions/`. For example, to install `question`:

```bash
mkdir -p ~/.pi/agent/extensions
cp -r extra-extensions/extensions/question ~/.pi/agent/extensions/question
```

## Available Plugins

| Name | Description |
|------|-------------|
| `question` | Structured question tool with multi-select and custom answers. |
| `research-agent` | Research workflow agent with `/research` command and `research` tool. Requires `npm install` after copying. |
| `diff.ts` | Shows git changes and opens selected files in VS Code diff view. |
| `files.ts` | Shows files that the current session has read, written, or edited. |
| `prompt-url-widget.ts` | Adds a widget for GitHub PR and issue prompts and improves session naming. |
| `redraws.ts` | Adds `/tui` to show TUI redraw statistics. |
| `tps.ts` | Shows token throughput notifications after an agent run completes. |

Restart `pi` or run `/reload` after copying new plugin files or folders.
