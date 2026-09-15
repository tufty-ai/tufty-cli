import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { main } from "../../src/cli";
import { runtime } from "../../src/utils/utils";

class CliExit extends Error {
	constructor(public exitCode: number) {
		super(`__cli_exit_${exitCode}__`);
	}
}

export type CliResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
	payload: any;
};

/**
 * 在进程内跑一次 CLI（和 bin 走同一个 main）。success/failure 会调 process.exit：
 * 这里把它换成抛异常，并记下**第一次**退出时的退出码和 stdout —— 动作里的
 * try/catch 会接住这个异常再调一次 failure，那一次不算数。
 */
export async function runCli(args: string[]): Promise<CliResult> {
	const out: string[] = [];
	const err: string[] = [];
	let firstExit: number | null = null;
	let firstStdout: string | null = null;
	const toText = (chunk: string | Uint8Array) =>
		typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");

	const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(((
		chunk: string | Uint8Array,
	) => {
		out.push(toText(chunk));
		return true;
	}) as typeof process.stdout.write);
	const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(((
		chunk: string | Uint8Array,
	) => {
		err.push(toText(chunk));
		return true;
	}) as typeof process.stderr.write);
	const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
		code?: number,
	) => {
		if (firstExit === null) {
			firstExit = code ?? 0;
			firstStdout = out.join("");
		}
		throw new CliExit(code ?? 0);
	}) as typeof process.exit);

	try {
		await main(["node", "tufty", ...args]);
	} catch (e) {
		if (!(e instanceof CliExit)) throw e;
	} finally {
		stdoutSpy.mockRestore();
		stderrSpy.mockRestore();
		exitSpy.mockRestore();
	}

	const stdout = firstStdout ?? out.join("");
	let payload = null;
	try {
		payload = JSON.parse(stdout);
	} catch {
		/* 帮助文本、--format url 之类不是 JSON */
	}
	return { stdout, stderr: err.join(""), exitCode: firstExit ?? 0, payload };
}

/**
 * 每个用例一个临时配置目录，清掉会影响结果的环境变量，轮询间隔缩到几毫秒，
 * 不打开浏览器。
 */
export function setupCliEnv() {
	const state = { dir: "" };
	const saved = {
		TUFTY_CONFIG_DIR: process.env.TUFTY_CONFIG_DIR,
		TUFTY_API_KEY: process.env.TUFTY_API_KEY,
		TUFTY_BASE_URL: process.env.TUFTY_BASE_URL,
		TUFTY_LANG: process.env.TUFTY_LANG,
	};

	beforeEach(() => {
		state.dir = fs.mkdtempSync(path.join(os.tmpdir(), "tufty-cli-test-"));
		process.env.TUFTY_CONFIG_DIR = state.dir;
		process.env.TUFTY_LANG = "en-US";
		delete process.env.TUFTY_API_KEY;
		delete process.env.TUFTY_BASE_URL;
		runtime.runPollIntervalMs = 5;
		runtime.loginPollIntervalMs = 5;
		runtime.openBrowser = () => {};
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(state.dir, { recursive: true, force: true });
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	return {
		get dir() {
			return state.dir;
		},
		/** 在临时目录里写一个文件，返回绝对路径 */
		file(name: string, bytes: Buffer): string {
			const p = path.join(state.dir, name);
			fs.writeFileSync(p, bytes);
			return p;
		},
	};
}
