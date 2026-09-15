import { name, version } from "../package.json";

/**
 * npm 包名只在 package.json 里写一次，这里转出去给代码用（升级提示、安装命令）。
 * 改名时改 package.json 的 name，然后重新生成技能文档（npm run skills:sync），
 * README 里的包名需要手动查找替换。
 */
export const PACKAGE_NAME: string = name;
export const CLI_VERSION: string = version;

/** 命令名（package.json 的 bin 键） */
export const CLI_BIN = "tufty";

export const DEFAULT_BASE_URL = "https://tufty.ai";
export const SITE_URL = "https://tufty.ai";
/** CLI 和技能文档的公开源码仓库（AGPL-3.0-or-later）。 */
export const REPO_URL = "https://github.com/tufty-ai/tufty-cli";
export const API_KEY_URL = `${SITE_URL}/dashboard/organization/api-key`;
export const RECHARGE_URL = `${SITE_URL}/dashboard/settings?tab=credits`;

/**
 * 服务端只接受托管在 tufty 自己存储上的图片。这些域名的 http(s) 地址原样透传，
 * 其他外链一律先下载再上传。
 */
export const TUFTY_STORAGE_HOSTS: ReadonlySet<string> = new Set([
	"static.tufty.ai",
	"files.dlazy.com",
]);

/** 所有 CLI 接口都挂在服务端 app/api/cli/* 下 */
export const CLI_API_BASE = "/api/cli";

export function resolveBaseUrl(override?: string): string {
	const url = override || process.env.TUFTY_BASE_URL || DEFAULT_BASE_URL;
	return url.replace(/\/+$/, "");
}

export function cliEndpoint(baseUrl: string, path: string): string {
	const cleanPath = path.startsWith("/") ? path : `/${path}`;
	return `${baseUrl.replace(/\/+$/, "")}${CLI_API_BASE}${cleanPath}`;
}
