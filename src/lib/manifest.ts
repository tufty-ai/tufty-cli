import * as fs from "node:fs";
import * as path from "node:path";
import { cliEndpoint } from "../constants";
import type { Locale } from "../messages";
import { resolveConfigDir } from "../utils/config";
import { baseHeaders, errMessage, mapHttpError } from "./api";
import { debug, log } from "./envelope";

export type Quality = { id: string; credits: number };
export type ImageRatio = { id: string; size?: string };

export type ImageTool = {
	id: string;
	kind: "image";
	name: string;
	description: string;
	/** 最少要几件商品 / 几张模特图；0 表示可以不给 */
	requires: { products: number; models: number };
	qualities: Quality[];
	ratios: ImageRatio[];
	counts: number[];
	enhance: boolean;
};

export type Resolution = { id: string; creditsPerSecond: number };

export type VideoTool = {
	id: string;
	kind: "video";
	name: string;
	description: string;
	minStills: number;
	maxStills: number;
	durations: number[];
	ratios: string[];
	resolutions: Resolution[];
	motionVideo: boolean;
	/** 静帧抠图用哪套分类词表 */
	library: "product" | "model";
};

export type StudioTool = ImageTool | VideoTool;

export type Manifest = { locale: Locale; tools: StudioTool[] };

export type LoadedManifest = {
	manifest: Manifest;
	/** false：没网也没缓存，工具命令一个都注册不了 */
	available: boolean;
};

const FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheFile = { baseUrl: string; cachedAt: number; manifest: Manifest };

function cachePath(locale: Locale): string {
	return path.join(resolveConfigDir(), `manifest-${locale}.json`);
}

/** 缓存记着来自哪个 baseUrl：本地开发和线上共用 ~/.tufty，不能串 */
function readCache(locale: Locale, baseUrl: string): CacheFile | null {
	try {
		const p = cachePath(locale);
		if (!fs.existsSync(p)) return null;
		const cache = JSON.parse(fs.readFileSync(p, "utf8")) as CacheFile;
		if (cache.baseUrl !== baseUrl || !Array.isArray(cache.manifest?.tools)) {
			return null;
		}
		return cache;
	} catch {
		return null;
	}
}

function writeCache(locale: Locale, baseUrl: string, manifest: Manifest) {
	try {
		fs.mkdirSync(resolveConfigDir(), { recursive: true });
		const cache: CacheFile = { baseUrl, cachedAt: Date.now(), manifest };
		fs.writeFileSync(cachePath(locale), JSON.stringify(cache), "utf8");
	} catch (err) {
		debug("manifest cache write failed", errMessage(err));
	}
}

async function fetchFresh(
	baseUrl: string,
	locale: Locale,
): Promise<Manifest | null> {
	const url = `${cliEndpoint(baseUrl, "/studio/tools")}?locale=${encodeURIComponent(locale)}`;
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
	try {
		// 清单公开，不带 Authorization
		const resp = await fetch(url, {
			signal: ctrl.signal,
			headers: baseHeaders(),
		});
		if (!resp.ok) {
			const text = await resp.text().catch(() => "");
			// 版本过低要让人看见原因，否则只会看到「拉不到清单」
			if (resp.status === 426) log(mapHttpError(426, text).message);
			debug("manifest fetch http error", resp.status);
			return null;
		}
		const body = (await resp.json()) as {
			locale?: Locale;
			tools?: unknown;
			cliWarning?: unknown;
		};
		if (!Array.isArray(body.tools)) return null;
		if (typeof body.cliWarning === "string" && body.cliWarning) {
			log(body.cliWarning);
		}
		// 服务端以后加了别的类型，老 CLI 不认识就跳过，而不是注册出坏命令
		const tools = (body.tools as StudioTool[]).filter(
			(tool) => tool?.kind === "image" || tool?.kind === "video",
		);
		return { locale: body.locale ?? locale, tools };
	} catch (err) {
		debug("manifest fetch failed", errMessage(err));
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * 读工具清单：
 *  - 10 分钟内的缓存 → 直接用
 *  - 缓存过期 / 没有 → 同步拉取；拉不到就退回过期缓存
 *  - 都没有 → 空清单，available=false
 * `refresh` 跳过新鲜缓存（--refresh-manifest）。
 */
export async function loadManifest(
	baseUrl: string,
	locale: Locale,
	options: { refresh?: boolean } = {},
): Promise<LoadedManifest> {
	const cached = readCache(locale, baseUrl);
	if (
		cached &&
		!options.refresh &&
		Date.now() - cached.cachedAt < CACHE_TTL_MS
	) {
		return { manifest: cached.manifest, available: true };
	}
	const fresh = await fetchFresh(baseUrl, locale);
	if (fresh) {
		writeCache(locale, baseUrl, fresh);
		return { manifest: fresh, available: true };
	}
	if (cached) return { manifest: cached.manifest, available: true };
	return { manifest: { locale, tools: [] }, available: false };
}
