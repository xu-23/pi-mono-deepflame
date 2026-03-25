import type { Component, TUI } from "@mariozechner/pi-tui";
import stripAnsi from "strip-ansi";
import { beforeAll, describe, expect, it } from "vitest";
import type { ExtensionContext } from "../src/core/extensions/types.js";
import type { KeybindingsManager } from "../src/core/keybindings.js";
import { allToolDefinitions, codingTools } from "../src/core/tools/index.js";
import { createQuestionToolDefinition, type QuestionToolInput } from "../src/core/tools/question.js";
import { initTheme, theme } from "../src/modes/interactive/theme/theme.js";

const TEST_WIDTH = 72;

beforeAll(() => {
	initTheme("dark");
});

function createMockKeybindings(): KeybindingsManager {
	const keyMap: Record<string, string[]> = {
		"tui.select.up": ["up"],
		"tui.select.down": ["down"],
		"tui.select.confirm": ["enter"],
		"tui.select.cancel": ["escape"],
		"tui.input.tab": ["tab"],
		"tui.editor.cursorLeft": ["left"],
		"tui.editor.cursorRight": ["right"],
	};

	return {
		matches(data: string, keybinding: string) {
			return (keyMap[keybinding] ?? []).includes(data);
		},
	} as unknown as KeybindingsManager;
}

interface SimulatedQuestionRun {
	result: Awaited<ReturnType<ReturnType<typeof createQuestionToolDefinition>["execute"]>>;
	renders: string[];
	resolvedKeyIndex: number | undefined;
}

async function runSimulatedQuestionFlow(input: QuestionToolInput, keys: string[]): Promise<SimulatedQuestionRun> {
	const tool = createQuestionToolDefinition();
	const renders: string[] = [];
	let resolvedKeyIndex: number | undefined;

	const context: ExtensionContext = {
		...createBaseContext(),
		hasUI: true,
		ui: {
			...createBaseContext().ui,
			custom: async <T>(
				factory: (
					tui: TUI,
					tuiTheme: typeof theme,
					keybindings: KeybindingsManager,
					done: (value: T) => void,
				) => Promise<Component & { dispose?(): void }> | (Component & { dispose?(): void }),
			) => {
				let resolved = false;
				let resolveDone: (value: T) => void;
				const donePromise = new Promise<T>((resolve) => {
					resolveDone = resolve;
				});
				const component = await factory(
					{ requestRender() {}, terminal: { rows: 24 } } as TUI,
					theme,
					createMockKeybindings(),
					(value: T) => {
						resolved = true;
						resolveDone(value);
					},
				);

				renders.push(stripAnsi(component.render(TEST_WIDTH).join("\n")));
				for (const [index, key] of keys.entries()) {
					component.handleInput?.(key);
					renders.push(stripAnsi(component.render(TEST_WIDTH).join("\n")));
					if (resolved) {
						resolvedKeyIndex = index;
						break;
					}
				}

				if (!resolved) {
					throw new Error("Question UI did not resolve after simulated key sequence.");
				}

				return await donePromise;
			},
		},
	};

	const result = await tool.execute("simulated-call", input, undefined, undefined, context);
	return { result, renders, resolvedKeyIndex };
}

const createBaseContext = (): ExtensionContext => ({
	ui: {
		select: async () => undefined,
		confirm: async () => false,
		input: async () => undefined,
		notify: () => {},
		onTerminalInput: () => () => {},
		setStatus: () => {},
		setWorkingMessage: () => {},
		setWidget: () => {},
		setFooter: () => {},
		setHeader: () => {},
		setTitle: () => {},
		custom: async <T>() => undefined as T,
		pasteToEditor: () => {},
		setEditorText: () => {},
		getEditorText: () => "",
		editor: async () => undefined,
		setEditorComponent: () => {},
		theme: {} as never,
		getAllThemes: () => [],
		getTheme: () => undefined,
		setTheme: () => ({ success: false, error: "ui unavailable" }),
		getToolsExpanded: () => false,
		setToolsExpanded: () => {},
	},
	hasUI: false,
	cwd: process.cwd(),
	sessionManager: {} as never,
	modelRegistry: {} as never,
	model: undefined,
	isIdle: () => true,
	abort: () => {},
	hasPendingMessages: () => false,
	shutdown: () => {},
	getContextUsage: () => undefined,
	compact: () => {},
	getSystemPrompt: () => "",
});

describe("question tool", () => {
	it("is registered as a built-in tool and enabled by default", () => {
		expect(allToolDefinitions.question).toBeDefined();
		expect(codingTools.some((tool) => tool.name === "question")).toBe(true);
	});

	it("guides the model to use multiple=true and avoid redundant fallback options", () => {
		const tool = createQuestionToolDefinition();
		expect(tool.promptGuidelines).toEqual(
			expect.arrayContaining([expect.stringContaining("multiple=true"), expect.stringContaining("Other")]),
		);
	});

	it("throws when interactive UI is unavailable", async () => {
		const tool = createQuestionToolDefinition();
		const input: QuestionToolInput = {
			questions: [
				{
					header: "Runtime",
					question: "Choose your runtime",
					options: [{ label: "Docker", description: "Use Docker" }],
				},
			],
		};

		await expect(tool.execute("call-1", input, undefined, undefined, createBaseContext())).rejects.toThrow(
			/UI support/,
		);
	});

	it("formats answers like opencode when the UI returns selections", async () => {
		const tool = createQuestionToolDefinition();
		const input: QuestionToolInput = {
			questions: [
				{
					header: "Runtime",
					question: "Choose your runtime",
					options: [
						{ label: "Docker", description: "Use Docker" },
						{ label: "Podman", description: "Use Podman" },
					],
				},
				{
					header: "Targets",
					question: "Choose target channels",
					multiple: true,
					options: [
						{ label: "CLI", description: "Command line" },
						{ label: "RPC", description: "RPC mode" },
					],
				},
			],
		};
		const context: ExtensionContext = {
			...createBaseContext(),
			hasUI: true,
			ui: {
				...createBaseContext().ui,
				custom: async <T>() => [["Podman"], ["CLI", "typed answer"]] as unknown as T,
			},
		};

		const result = await tool.execute("call-2", input, undefined, undefined, context);
		const textOutput = result.content[0]?.type === "text" ? result.content[0].text : undefined;

		expect(result.details.title).toBe("Asked 2 question(s)");
		expect(result.details.metadata.answers).toEqual([["Podman"], ["CLI", "typed answer"]]);
		expect(result.content[0]?.type).toBe("text");
		expect(textOutput).toBe(
			'User has answered your questions: "Choose your runtime"="Podman", "Choose target channels"="CLI, typed answer". You can now continue with the user\'s answers in mind.',
		);
	});

	it("uses space to select and enter to confirm single-select answers", async () => {
		const run = await runSimulatedQuestionFlow(
			{
				questions: [
					{
						header: "Runtime",
						question: "Choose your runtime",
						options: [
							{ label: "Docker", description: "Use Docker" },
							{ label: "Podman", description: "Use Podman" },
						],
					},
				],
			},
			["down", " ", "enter"],
		);

		expect(run.resolvedKeyIndex).toBe(2);
		expect(run.renders[0]).not.toContain("(multi-select)");
		expect(run.renders[2]).toContain("(x) 2. Podman");
		expect(run.result.details.metadata.answers).toEqual([["Podman"]]);
	});

	it("uses space to toggle multi-select answers and enter to confirm the question", async () => {
		const run = await runSimulatedQuestionFlow(
			{
				questions: [
					{
						header: "Targets",
						question: "Choose target channels",
						multiple: true,
						options: [
							{ label: "CLI", description: "Command line" },
							{ label: "RPC", description: "RPC mode" },
						],
					},
				],
			},
			[" ", "down", " ", "enter", "enter"],
		);

		expect(run.resolvedKeyIndex).toBe(4);
		expect(run.renders[0]).toContain("Choose target channels (multi-select)");
		expect(run.renders[1]).toContain("[x] 1. CLI");
		expect(run.renders[3]).toContain("[x] 1. CLI");
		expect(run.renders[3]).toContain("[x] 2. RPC");
		expect(run.result.details.metadata.answers).toEqual([["CLI", "RPC"]]);
	});

	it("filters redundant fallback options so only the built-in custom input entry remains", async () => {
		const run = await runSimulatedQuestionFlow(
			{
				questions: [
					{
						header: "Format",
						question: "Choose a format",
						options: [
							{ label: "Landing page", description: "Marketing page" },
							{ label: "Docs site", description: "Documentation site" },
							{ label: "Other", description: "Redundant fallback option" },
							{ label: "Custom answer", description: "Redundant custom option" },
						],
					},
				],
			},
			[" ", "enter"],
		);

		expect(run.renders[0]).not.toContain("Other");
		expect(run.renders[0]).not.toContain("Custom answer");
		expect(run.renders[0]).toContain("3. Type your own answer");
		expect(run.renders[0].match(/Type your own answer/g)?.length).toBe(1);
	});

	it("clears the prior single-select marker when switching to custom answer and waits for final enter", async () => {
		const run = await runSimulatedQuestionFlow(
			{
				questions: [
					{
						header: "Answer",
						question: "Need a custom answer",
						options: [{ label: "Use default", description: "Accept default answer" }],
					},
				],
			},
			[" ", "down", " ", "m", "y", "\r", "enter"],
		);

		expect(run.resolvedKeyIndex).toBe(6);
		expect(run.renders[1]).toContain("(x) 1. Use default");
		expect(run.renders[3]).not.toContain("(x) 1. Use default");
		expect(run.renders[3]).toContain("Type your own answer...");
		expect(run.result.details.metadata.answers).toEqual([["my"]]);
	});
});
