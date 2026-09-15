import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { API_KEY_URL, cliEndpoint, resolveBaseUrl } from "../constants";
import { type ApiContext, baseHeaders, mapHttpError } from "../lib/api";
import { log, SdkError } from "../lib/envelope";
import { t } from "../messages";
import { runtime, sleep } from "./utils";

export type TuftyConfig = {
	TUFTY_API_KEY?: string;
	/** 由 `tufty -l <locale>` 写入 */
	lang?: string;
} & Record<string, string | undefined>;

export function resolveConfigDir(): string {
	const env = process.env.TUFTY_CONFIG_DIR;
	if (env?.trim()) return path.resolve(env);
	return path.join(os.homedir(), ".tufty");
}

export function resolveConfigFile(): string {
	return path.join(resolveConfigDir(), "config.json");
}

export function loadConfig(): TuftyConfig {
	try {
		const file = resolveConfigFile();
		if (!fs.existsSync(file)) return {};
		return JSON.parse(fs.readFileSync(file, "utf8")) as TuftyConfig;
	} catch {
		return {};
	}
}

export function saveConfig(config: TuftyConfig) {
	fs.mkdirSync(resolveConfigDir(), { recursive: true });
	// 0o600：只有当前系统用户能读（Windows 上忽略）
	fs.writeFileSync(resolveConfigFile(), JSON.stringify(config, null, 2), {
		encoding: "utf8",
		mode: 0o600,
	});
}

const DEFAULT_EXPIRES_IN_MINUTES = 30;

/**
 * 设备码登录：浏览器打开 {base}/auth/cli?id=<uuid>&exp=30，CLI 每 2 秒轮询
 * GET /api/cli/verification?id=<uuid>：`{status:"pending"}` 继续等，410 过期，
 * `{apiKey}` 完成。URL 里只放一个短 UUID，聊天软件和折行的终端不容易截断。
 */
export async function waitForApiKeyAuth(options: {
	baseUrl: string;
	expiresInMinutes?: number;
}): Promise<string> {
	const msgs = t().login;
	const minutes = options.expiresInMinutes ?? DEFAULT_EXPIRES_IN_MINUTES;
	const id = crypto.randomUUID();
	const verificationUri = `${options.baseUrl}/auth/cli?id=${id}&exp=${minutes}`;
	const pollUrl = `${cliEndpoint(options.baseUrl, "/verification")}?id=${id}`;

	log(msgs.starting);
	log(msgs.visit(verificationUri));
	log(msgs.polling(minutes));
	try {
		runtime.openBrowser(verificationUri);
	} catch {
		/* 打不开浏览器（远程终端）不要紧，链接已经打印出来了 */
	}

	const deadline = Date.now() + minutes * 60 * 1000;
	while (Date.now() < deadline) {
		let res: Response | null = null;
		try {
			res = await fetch(pollUrl, {
				headers: { ...baseHeaders(), Accept: "application/json" },
			});
		} catch {
			// 网络抖动：继续轮询直到过期
		}
		if (res) {
			if (res.status === 410) {
				throw new SdkError("login_expired", msgs.expired);
			}
			if (res.status === 426) {
				throw mapHttpError(426, await res.text().catch(() => ""));
			}
			if (res.ok) {
				const body = (await res.json().catch(() => ({}))) as {
					apiKey?: unknown;
					status?: unknown;
				};
				if (typeof body.apiKey === "string" && body.apiKey) return body.apiKey;
				if (body.status === "expired") {
					throw new SdkError("login_expired", msgs.expired);
				}
			}
		}
		await sleep(runtime.loginPollIntervalMs);
	}
	throw new SdkError("login_timeout", msgs.timeout(minutes));
}

/** 环境变量 → 配置文件（不含 --api-key 和交互登录） */
export function getStoredApiKey(): {
	apiKey: string;
	source: "env" | "config";
} | null {
	const envKey = process.env.TUFTY_API_KEY?.trim();
	if (envKey) return { apiKey: envKey, source: "env" };
	const configKey = loadConfig().TUFTY_API_KEY?.trim();
	if (configKey) return { apiKey: configKey, source: "config" };
	return null;
}

/** CI 或者没有交互终端（智能体、管道）时不弹登录 */
export function isHeadless(): boolean {
	if (process.env.CI) return true;
	return !process.stdin.isTTY || !process.stderr.isTTY;
}

/**
 * API key 查找顺序：
 *   1. --api-key
 *   2. TUFTY_API_KEY
 *   3. <config-dir>/config.json
 *   4. 交互式设备码登录（只在 TTY 且非 CI 时），拿到后写回配置文件
 * 都没有返回 null。
 */
export async function resolveApiKey(
	override: string | undefined,
	options: { baseUrl: string; interactive?: boolean },
): Promise<string | null> {
	if (override?.trim()) return override.trim();
	const stored = getStoredApiKey();
	if (stored) return stored.apiKey;
	if (!(options.interactive ?? !isHeadless())) return null;
	const apiKey = await waitForApiKeyAuth({ baseUrl: options.baseUrl });
	const config = loadConfig();
	config.TUFTY_API_KEY = apiKey;
	saveConfig(config);
	return apiKey;
}

export type GlobalOptions = {
	apiKey?: string;
	baseUrl?: string;
	verbose?: boolean;
};

export async function requireApiContext(
	globals: GlobalOptions,
): Promise<ApiContext> {
	const baseUrl = resolveBaseUrl(globals.baseUrl);
	const apiKey = await resolveApiKey(globals.apiKey, { baseUrl });
	if (!apiKey) {
		throw new SdkError("no_api_key", t().auth.noApiKey(API_KEY_URL));
	}
	return { baseUrl, apiKey };
}
