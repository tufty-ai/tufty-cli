import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { peekFlagValue } from "../utils/argv";
import { messages as enUS } from "./en-US";
import {
	DEFAULT_LOCALE,
	type Locale,
	type Messages,
	SUPPORTED_LOCALES,
} from "./types";
import { messages as zhCN } from "./zh-CN";

const REGISTRY: Record<Locale, Messages> = {
	"en-US": enUS,
	"zh-CN": zhCN,
};

let currentLocale: Locale = DEFAULT_LOCALE;

export function normalizeLocale(
	raw: string | undefined | null,
): Locale | undefined {
	if (!raw) return undefined;
	const lower = raw.toLowerCase();
	if (lower.startsWith("zh")) return "zh-CN";
	if (lower.startsWith("en")) return "en-US";
	return undefined;
}

/**
 * 直接读 <config-dir>/config.json 里的 lang。不走 utils/config：那边依赖本模块
 * 的 t()，引用回去会成环。
 */
function readConfigLang(): string | undefined {
	try {
		const configDir =
			process.env.TUFTY_CONFIG_DIR?.trim() || path.join(os.homedir(), ".tufty");
		const configFile = path.join(configDir, "config.json");
		if (!fs.existsSync(configFile)) return undefined;
		const raw = JSON.parse(fs.readFileSync(configFile, "utf8")) as {
			lang?: unknown;
		};
		return typeof raw.lang === "string" ? raw.lang : undefined;
	} catch {
		return undefined;
	}
}

/**
 * 语言优先级（高到低）：
 *   1. --lang / -l（commander 解析前直接扫 argv）
 *   2. TUFTY_LANG
 *   3. 配置文件里的 lang（由 -l 写入）
 *   4. LC_ALL / LANG
 *   5. DEFAULT_LOCALE
 */
export function resolveLocale(argv: readonly string[]): Locale {
	const flagShort = ((): string | undefined => {
		for (let i = 0; i < argv.length; i++)
			if (argv[i] === "-l") return argv[i + 1];
		return undefined;
	})();
	return (
		normalizeLocale(peekFlagValue(argv, "lang") ?? flagShort) ??
		normalizeLocale(process.env.TUFTY_LANG) ??
		normalizeLocale(readConfigLang()) ??
		normalizeLocale(process.env.LC_ALL) ??
		normalizeLocale(process.env.LANG) ??
		DEFAULT_LOCALE
	);
}

export function setLocale(locale: string) {
	currentLocale = normalizeLocale(locale) ?? DEFAULT_LOCALE;
}

export function getLocale(): Locale {
	return currentLocale;
}

export function t(): Messages {
	return REGISTRY[currentLocale];
}

export { SUPPORTED_LOCALES, DEFAULT_LOCALE };
export type { Locale, Messages };
