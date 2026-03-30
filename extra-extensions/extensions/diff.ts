import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, Key, matchesKey, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";

interface FileInfo {
	status: string;
	statusLabel: string;
	file: string;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("diff", {
		description: "Show git changes and open in VS Code diff view",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("No UI available", "error");
				return;
			}

			const result = await pi.exec("git", ["status", "--porcelain"], { cwd: ctx.cwd });

			if (result.code !== 0) {
				ctx.ui.notify(`git status failed: ${result.stderr}`, "error");
				return;
			}

			if (!result.stdout || !result.stdout.trim()) {
				ctx.ui.notify("No changes in working tree", "info");
				return;
			}

			const lines = result.stdout.split("\n");
			const files: FileInfo[] = [];

			for (const line of lines) {
				if (line.length < 4) continue;

				const status = line.slice(0, 2);
				const file = line.slice(2).trimStart();

				let statusLabel: string;
				if (status.includes("M")) statusLabel = "M";
				else if (status.includes("A")) statusLabel = "A";
				else if (status.includes("D")) statusLabel = "D";
				else if (status.includes("?")) statusLabel = "?";
				else if (status.includes("R")) statusLabel = "R";
				else if (status.includes("C")) statusLabel = "C";
				else statusLabel = status.trim() || "~";

				files.push({ status: statusLabel, statusLabel, file });
			}

			if (files.length === 0) {
				ctx.ui.notify("No changes found", "info");
				return;
			}

			const WINDOWS_UNSAFE_CMD_CHARS_RE = /[&|<>^%\r\n]/;
			const quoteCmdArg = (value: string) => `"${value.replace(/"/g, '""')}"`;

			const openWithCode = async (file: string) => {
				if (process.platform === "win32") {
					if (WINDOWS_UNSAFE_CMD_CHARS_RE.test(file)) {
						ctx.ui.notify(
							`Refusing to open ${file}: path contains Windows cmd metacharacters (& | < > ^ % or newline).`,
							"error",
						);
						return null;
					}
					const commandLine = `code -g ${quoteCmdArg(file)}`;
					return pi.exec("cmd", ["/d", "/s", "/c", commandLine], { cwd: ctx.cwd });
				}
				return pi.exec("code", ["-g", file], { cwd: ctx.cwd });
			};

			const openSelected = async (fileInfo: FileInfo): Promise<void> => {
				try {
					if (fileInfo.status === "?") {
						const openResult = await openWithCode(fileInfo.file);
						if (!openResult) return;
						if (openResult.code !== 0) {
							const openStderr = openResult.stderr.trim();
							ctx.ui.notify(
								`Failed to open ${fileInfo.file} (exit ${openResult.code})${openStderr ? `: ${openStderr}` : ""}`,
								"error",
							);
						}
						return;
					}

					const diffResult = await pi.exec("git", ["difftool", "-y", "--tool=vscode", fileInfo.file], {
						cwd: ctx.cwd,
					});
					if (diffResult.code !== 0) {
						const diffStderr = diffResult.stderr.trim();
						ctx.ui.notify(
							`Failed to show diff with vscode for ${fileInfo.file} (exit ${diffResult.code})${diffStderr ? `: ${diffStderr}` : ""}`,
							"error",
						);
						ctx.ui.notify(
							"Troubleshooting: check git difftool config (e.g. `git config --get difftool.vscode.cmd`).",
							"info",
						);

						const openResult = await openWithCode(fileInfo.file);
						if (!openResult) return;
						if (openResult.code !== 0) {
							const openStderr = openResult.stderr.trim();
							ctx.ui.notify(
								`Failed to open ${fileInfo.file} (exit ${openResult.code})${openStderr ? `: ${openStderr}` : ""}`,
								"error",
							);
						}
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`Failed to open ${fileInfo.file}: ${message}`, "error");
				}
			};

			await ctx.ui.custom<void>((tui, theme, _kb, done) => {
				const container = new Container();
				container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
				container.addChild(new Text(theme.fg("accent", theme.bold(" Select file to diff")), 0, 0));

				const items: SelectItem[] = files.map((f) => {
					let statusColor: string;
					switch (f.status) {
						case "M":
							statusColor = theme.fg("warning", f.status);
							break;
						case "A":
							statusColor = theme.fg("success", f.status);
							break;
						case "D":
							statusColor = theme.fg("error", f.status);
							break;
						case "?":
							statusColor = theme.fg("muted", f.status);
							break;
						default:
							statusColor = theme.fg("dim", f.status);
					}
					return {
						value: f,
						label: `${statusColor} ${f.file}`,
					};
				});

				const visibleRows = Math.min(files.length, 15);
				let currentIndex = 0;

				const selectList = new SelectList(items, visibleRows, {
					selectedPrefix: (t) => theme.fg("accent", t),
					selectedText: (t) => t,
					description: (t) => theme.fg("muted", t),
					scrollInfo: (t) => theme.fg("dim", t),
					noMatch: (t) => theme.fg("warning", t),
				});
				selectList.onSelect = (item) => {
					void openSelected(item.value as FileInfo);
				};
				selectList.onCancel = () => done();
				selectList.onSelectionChange = (item) => {
					currentIndex = items.indexOf(item);
				};
				container.addChild(selectList);

				container.addChild(
					new Text(theme.fg("dim", " ↑↓ navigate • ←→ page • enter open • esc close"), 0, 0),
				);

				container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

				return {
					render: (w) => container.render(w),
					invalidate: () => container.invalidate(),
					handleInput: (data) => {
						if (matchesKey(data, Key.left)) {
							currentIndex = Math.max(0, currentIndex - visibleRows);
							selectList.setSelectedIndex(currentIndex);
						} else if (matchesKey(data, Key.right)) {
							currentIndex = Math.min(items.length - 1, currentIndex + visibleRows);
							selectList.setSelectedIndex(currentIndex);
						} else {
							selectList.handleInput(data);
						}
						tui.requestRender();
					},
				};
			});
		},
	});
}
