import { Command, CommanderError } from "commander";
import { registerAuthCommands } from "./commands/auth";
import { registerStatusCommand, registerToolCommands } from "./commands/tools";
import { registerUploadCommand } from "./commands/upload";
import { CLI_BIN, CLI_VERSION, resolveBaseUrl } from "./constants";
import { failure, setOutputMode, setVerbose, usageError } from "./lib/envelope";
import { loadManifest } from "./lib/manifest";
import {
	getLocale,
	resolveLocale,
	SUPPORTED_LOCALES,
	setLocale,
	t,
} from "./messages";
import { peekFlagBool, peekFlagValue } from "./utils/argv";
import { loadConfig, saveConfig } from "./utils/config";

/** 会吃掉下一个 argv 的全局选项 */
const VALUE_TAKING_FLAGS = new Set(["--api-key", "--base-url", "-l", "--lang"]);

/** 不依赖工具清单的命令：跑它们时不拉清单，离线也能用 */
const STATIC_COMMANDS = new Set([
	"auth",
	"login",
	"logout",
	"upload",
	"status",
]);

/** Levenshtein 距离，用于命令拼错时给建议 */
function editDistance(a: string, b: string): number {
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const curr = [i];
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr.push(
				Math.min(
					(curr[j - 1] ?? 0) + 1,
					(prev[j] ?? 0) + 1,
					(prev[j - 1] ?? 0) + cost,
				),
			);
		}
		prev = curr;
	}
	return prev[b.length] ?? 0;
}

function suggestCommands(
	candidate: string,
	commands: readonly Command[],
): string[] {
	const cand = candidate.toLowerCase();
	const threshold = Math.max(2, Math.floor(candidate.length / 2));
	return commands
		.map((cmd) => cmd.name())
		.map((name) => {
			const lower = name.toLowerCase();
			const score =
				lower.includes(cand) || cand.includes(lower)
					? 0
					: editDistance(lower, cand);
			return { name, score };
		})
		.filter((s) => s.score <= threshold)
		.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
		.slice(0, 3)
		.map((s) => s.name);
}

/**
 * 第一个位置参数（候选子命令名），跳过全局选项及其取值。先自己判断命令是否存在：
 * 否则 `tufty <拼错> -h` 会被 commander 当成根命令的 -h，打出全局帮助，掩盖了
 * 命令不存在这件事。
 */
function findFirstPositional(args: readonly string[]): string | undefined {
	for (let i = 0; i < args.length; i++) {
		const a = args[i] as string;
		if (a.startsWith("--") && a.includes("=")) continue;
		if (VALUE_TAKING_FLAGS.has(a)) {
			i++;
			continue;
		}
		if (a.startsWith("-")) continue;
		return a;
	}
	return undefined;
}

function createProgram(): Command {
	const msgs = t().cli;
	const program = new Command();
	program
		.name(CLI_BIN)
		.description(msgs.description)
		.version(CLI_VERSION)
		// 必须在注册子命令前设置，子命令会继承：参数错误不直接退出，而是转成 JSON 信封
		.exitOverride()
		.option("--api-key <key>", msgs.apiKeyOption)
		.option("--base-url <url>", msgs.baseUrlOption)
		.option("--verbose", msgs.verboseOption)
		.option("--refresh-manifest", msgs.refreshManifestOption)
		.option("-l, --lang <locale>", msgs.langOption, (value: string) => {
			if (!(SUPPORTED_LOCALES as readonly string[]).includes(value)) {
				throw new Error(
					msgs.unsupportedLocale(value, SUPPORTED_LOCALES.join(", ")),
				);
			}
			// 记到配置里，之后不带 -l 也沿用；写失败不影响本次命令
			try {
				const config = loadConfig();
				config.lang = value;
				saveConfig(config);
			} catch {
				/* ignore */
			}
			return value;
		});

	registerAuthCommands(program);
	registerUploadCommand(program);
	registerStatusCommand(program);
	return program;
}

export async function main(argv: string[]): Promise<void> {
	// 语言、详细日志要在注册命令前定下来：命令描述在注册时就翻译好了
	setOutputMode("json");
	setVerbose(peekFlagBool(argv, "verbose"));
	setLocale(resolveLocale(argv));

	const program = createProgram();
	const args = argv.slice(2);
	const candidate = findFirstPositional(args);
	const baseUrl = resolveBaseUrl(peekFlagValue(argv, "base-url"));

	let manifestAvailable = true;
	if (!candidate || !STATIC_COMMANDS.has(candidate)) {
		const loaded = await loadManifest(baseUrl, getLocale(), {
			refresh: peekFlagBool(argv, "refresh-manifest"),
		});
		manifestAvailable = loaded.available;
		registerToolCommands(program, loaded.manifest);
	}

	if (args.length === 0) {
		program.outputHelp();
		return;
	}

	if (candidate && candidate !== "help") {
		// 清单拉不到时，tools list / 工具命令 / 拼错的命令都给同一个明确的错误，
		// 而不是返回一个空列表或「未知命令」
		if (!manifestAvailable) {
			failure("manifest_unavailable", t().cli.manifestUnavailable(baseUrl));
		}
	}

	if (
		candidate &&
		candidate !== "help" &&
		!program.commands.some((cmd) => cmd.name() === candidate)
	) {
		failure(
			"unknown_command",
			t().cli.unknownCommand(candidate),
			{ suggestions: suggestCommands(candidate, program.commands) },
			2,
		);
	}

	try {
		await program.parseAsync(argv);
	} catch (err) {
		if (err instanceof CommanderError) {
			// --help / --version 也走这里，退出码 0
			if (err.exitCode === 0) return;
			usageError(err.message.replace(/^error:\s*/, ""), {
				commanderCode: err.code,
			});
		}
		throw err;
	}
}
