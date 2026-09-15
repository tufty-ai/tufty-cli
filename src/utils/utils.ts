import * as mime from "mime-types";

export function getMimeType(filePath: string): string {
	return mime.lookup(filePath) || "application/octet-stream";
}

export function extensionForMime(contentType: string): string | undefined {
	return mime.extension(contentType) || undefined;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 轮询间隔集中放在一个可变对象里：生产用默认值，测试直接改字段把 2s/3s 缩成
 * 几毫秒，不需要对外暴露环境变量。openBrowser 同理，测试里换成空函数。
 */
export const runtime = {
	loginPollIntervalMs: 2000,
	runPollIntervalMs: 3000,
	openBrowser: (url: string): void => {
		// 延迟 require，避免测试替换前就加载 child_process
		const { exec } =
			require("node:child_process") as typeof import("node:child_process");
		if (process.platform === "win32") exec(`start "" "${url}"`);
		else if (process.platform === "darwin") exec(`open "${url}"`);
		else exec(`xdg-open "${url}"`);
	},
};
