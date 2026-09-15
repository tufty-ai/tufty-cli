import * as fs from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { t } from "../messages";
import { sleep } from "../utils/utils";
import { debug, log, SdkError } from "./envelope";

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 500;

/**
 * 把远端文件下载到本地：
 * - 目标目录不存在就建
 * - 临时失败最多重试 MAX_ATTEMPTS 次
 * - 先写 `.partial` 再改名，中途被杀不会留下截断的文件
 *
 * 成品地址是公开的，不带任何鉴权头。返回写入的绝对路径。
 */
export async function downloadToFile(
	url: string,
	dest: string,
): Promise<string> {
	const abs = path.resolve(dest);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	const tmp = `${abs}.partial`;

	let lastErr: unknown;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const resp = await fetch(url);
			if (!resp.ok || !resp.body) {
				throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
			}
			await pipeline(
				Readable.fromWeb(resp.body as Parameters<typeof Readable.fromWeb>[0]),
				fs.createWriteStream(tmp),
			);
			fs.renameSync(tmp, abs);
			return abs;
		} catch (err) {
			lastErr = err;
			fs.rmSync(tmp, { force: true });
			debug(`download attempt ${attempt}/${MAX_ATTEMPTS} failed:`, String(err));
			if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BACKOFF_MS * attempt);
		}
	}
	throw new SdkError(
		"download_failed",
		t().api.downloadFailed(
			url,
			MAX_ATTEMPTS,
			lastErr instanceof Error ? lastErr.message : String(lastErr),
		),
		{ url },
	);
}

export type Output = { type: "image" | "video"; url: string; path?: string };

/**
 * `--save <dir>`：逐个下载成品，文件名 `<runId>-<序号><扩展名>`（扩展名取自地址，
 * 取不到按类型用 .png / .mp4），并把本地路径写回 output.path。
 */
export async function saveOutputs(
	outputs: Output[],
	dir: string,
	runId: string,
): Promise<Output[]> {
	const saved: Output[] = [];
	for (const [i, output] of outputs.entries()) {
		let ext = "";
		try {
			ext = path.extname(new URL(output.url).pathname);
		} catch {
			/* 地址不合法就用默认扩展名 */
		}
		if (!ext) ext = output.type === "video" ? ".mp4" : ".png";
		const file = await downloadToFile(
			output.url,
			path.join(dir, `${runId}-${i + 1}${ext}`),
		);
		log(t().tools.saved(file));
		saved.push({ ...output, path: file });
	}
	return saved;
}
