# Extra Extensions

This directory contains optional plugins for this fork.

Install `pi` first:

```bash
./scripts/dev-install-pi.sh
```

Then copy the plugin folders you want into `~/.pi/agent/extensions/`.

## Available Plugins

### question

Structured question tool.

```bash
mkdir -p ~/.pi/agent/extensions
cp -R extra-extensions/extensions/question ~/.pi/agent/extensions/question
```

### research-agent

Research workflow agent with `/research` command and `research` tool.

```bash
mkdir -p ~/.pi/agent/extensions
cp -R extra-extensions/extensions/research-agent ~/.pi/agent/extensions/research-agent
cd ~/.pi/agent/extensions/research-agent
npm install
```

### diff.ts

Shows git changes and opens selected files in VS Code diff view.

```bash
mkdir -p ~/.pi/agent/extensions
cp extra-extensions/extensions/diff.ts ~/.pi/agent/extensions/diff.ts
```

### files.ts

Shows files that the current session has read, written, or edited.

```bash
mkdir -p ~/.pi/agent/extensions
cp extra-extensions/extensions/files.ts ~/.pi/agent/extensions/files.ts
```

### prompt-url-widget.ts

Adds a widget for GitHub PR and issue prompts and improves session naming.

```bash
mkdir -p ~/.pi/agent/extensions
cp extra-extensions/extensions/prompt-url-widget.ts ~/.pi/agent/extensions/prompt-url-widget.ts
```

### redraws.ts

Adds `/tui` to show TUI redraw statistics.

```bash
mkdir -p ~/.pi/agent/extensions
cp extra-extensions/extensions/redraws.ts ~/.pi/agent/extensions/redraws.ts
```

### tps.ts

Shows token throughput notifications after an agent run completes.

```bash
mkdir -p ~/.pi/agent/extensions
cp extra-extensions/extensions/tps.ts ~/.pi/agent/extensions/tps.ts
```

Restart `pi` or run `/reload` after copying new plugin files or folders.
