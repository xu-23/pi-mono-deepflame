<!-- OSS_WEEKEND_START -->
# 🏖️ OSS Weekend

**Issue tracker reopens Monday, March 30, 2026.**

OSS weekend runs Sunday, March 22, 2026 through Monday, March 30, 2026. New issues are auto-closed during this time. For support, join [Discord](https://discord.com/invite/3cU7Bz4UPx).
<!-- OSS_WEEKEND_END -->

---

<p align="center">
  <a href="https://shittycodingagent.ai">
    <img src="https://shittycodingagent.ai/logo.svg" alt="pi logo" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
	<a href="https://github.com/LuneZhang/pi-mono-deepflame/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/LuneZhang/pi-mono-deepflame/ci.yml?style=flat-square&branch=main" /></a>
</p>
<p align="center">
  <a href="https://pi.dev">pi.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>

# Pi Monorepo

> **Looking for the pi coding agent?** See **[packages/coding-agent](packages/coding-agent)** for installation and usage.

Tools for building AI agents and managing LLM deployments.

## Packages

| Package | Description |
|---------|-------------|
| **[@mariozechner/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@mariozechner/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@lunezhang/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@mariozechner/pi-mom](packages/mom)** | Slack bot that delegates messages to the pi coding agent |
| **[@mariozechner/pi-tui](packages/tui)** | Terminal UI library with differential rendering |
| **[@mariozechner/pi-web-ui](packages/web-ui)** | Web components for AI chat interfaces |
| **[@mariozechner/pi-pods](packages/pods)** | CLI for managing vLLM deployments on GPU pods |

## Install This Fork

```bash
git clone https://github.com/LuneZhang/pi-mono-deepflame.git
cd pi-mono-deepflame
./scripts/dev-install-pi.sh
pi
```

The install script builds and installs the `pi` CLI from this fork. It does not auto-install any optional extensions.

## Install Optional Extensions

Create the global extension directory if needed:

```bash
mkdir -p ~/.pi/agent/extensions
```

Install the structured question tool:

```bash
cp -R extra-extensions/extensions/question ~/.pi/agent/extensions/question
```

Install the research agent package:

```bash
cp -R extra-extensions/extensions/research-agent ~/.pi/agent/extensions/research-agent
cd ~/.pi/agent/extensions/research-agent
npm install
```

Install the other optional helper plugins by copying their single-file extensions:

```bash
cp extra-extensions/extensions/diff.ts ~/.pi/agent/extensions/diff.ts
cp extra-extensions/extensions/files.ts ~/.pi/agent/extensions/files.ts
cp extra-extensions/extensions/prompt-url-widget.ts ~/.pi/agent/extensions/prompt-url-widget.ts
cp extra-extensions/extensions/redraws.ts ~/.pi/agent/extensions/redraws.ts
cp extra-extensions/extensions/tps.ts ~/.pi/agent/extensions/tps.ts
```

Restart `pi` or run `/reload` after copying new plugin files or folders. See `extra-extensions/README.md` for the full plugin list.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).

## Development

```bash
npm install          # Install all dependencies
npm run build        # Build all packages
npm run check        # Lint, format, and type check
./scripts/dev-install-pi.sh # Build and install pi from this fork
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh         # Run pi from sources (must be run from repo root)
```

> **Note:** `npm run check` requires `npm run build` to be run first. The web-ui package uses `tsc` which needs compiled `.d.ts` files from dependencies.

## License

MIT
