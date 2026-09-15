import { RECHARGE_URL } from "../constants";
import { t } from "../messages";

/**
 * stdout 的唯一出口。成功：`{ ok: true, result }`；失败：`{ ok: false, code,
 * message, details? }`。人看的进度一律走 stderr，stdout 多一个字都会破坏调用方
 * 的解析。退出码：0 成功，1 运行 / 接口错误，2 用法错误（参数、输入不合法）。
 */

export type Result = { tool: string } & Record<string, unknown>;

export type OutputMode = "json" | "url";

export class SdkError extends Error {
	constructor(
		public code: string,
		message: string,
		public details?: unknown,
		public exitCode: 1 | 2 = 1,
	) {
		super(message);
		this.name = "SdkError";
	}
}

let outputMode: OutputMode = "json";
let verbose = false;

export function setOutputMode(mode: OutputMode) {
	outputMode = mode;
}

export function setVerbose(v: boolean) {
	verbose = v;
}

export function log(msg: string) {
	process.stderr.write(`${msg}\n`);
}

export function debug(...parts: unknown[]) {
	if (!verbose) return;
	process.stderr.write(
		`[debug] ${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}\n`,
	);
}

/** 长轮询时在终端上打点，非 TTY（智能体、管道）不输出 */
export function heartbeat() {
	if (process.stderr.isTTY) process.stderr.write(".");
}

/** result 里能直接给用户的地址：run/status 的 outputs[].url，upload 的 data.url */
export function resultUrls(result: Result): string[] {
	const urls: string[] = [];
	if (Array.isArray(result.outputs)) {
		for (const o of result.outputs) {
			const url = (o as { url?: unknown } | null)?.url;
			if (typeof url === "string") urls.push(url);
		}
	}
	const dataUrl = (result.data as { url?: unknown } | undefined)?.url;
	if (typeof dataUrl === "string") urls.push(dataUrl);
	return urls;
}

export function success(result: Result): never {
	const urls = resultUrls(result);
	// url 模式只在确实有地址时生效；列表、--no-wait 这类没有地址的结果仍输出信封，
	// 免得调用方拿到一个空的 stdout 不知道发生了什么。
	if (outputMode === "url" && urls.length > 0) {
		process.stdout.write(`${urls.join("\n")}\n`);
	} else {
		process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`);
	}
	process.exit(0);
}

export function failure(
	code: string,
	message: string,
	details?: unknown,
	exitCode: 1 | 2 = 1,
): never {
	if (code === "insufficient_balance") {
		process.stderr.write(
			`\n${t().api.insufficientBalanceHint(RECHARGE_URL)}\n`,
		);
	}
	process.stdout.write(
		`${JSON.stringify({ ok: false, code, message, details }, null, 2)}\n`,
	);
	process.exit(exitCode);
}

export function usageError(message: string, details?: unknown): never {
	return failure("usage_error", message, details, 2);
}

/** 把抛出的错误转成失败信封：SdkError 保留 code/details/退出码，其余算 internal_error */
export function emitError(err: unknown): never {
	if (err instanceof SdkError) {
		return failure(err.code, err.message, err.details, err.exitCode);
	}
	const message = err instanceof Error ? err.message : String(err);
	return failure("internal_error", message);
}
