import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkMp4Integrity } from "../src/lib/upload";
import { setLocale } from "../src/messages";
import { type MockServer, startMockServer } from "./helpers/mock-server";
import { runCli, setupCliEnv } from "./helpers/run-cli";
import {
	installStudioRoutes,
	MP4_BYTES,
	PNG_BYTES,
	publicUrlFor,
} from "./helpers/studio";

const env = setupCliEnv();
// 下面这个假服务器是整个文件共用的：beforeEach 换一个新的，afterEach 关掉它。而
// vitest.config.mts 里 sequence.concurrent 默认开着 —— 同一文件的用例并发跑时会互相
// 覆盖 server，还会把别人正在用的那个提前关掉，表现是退出码和请求记录对不上。所以这
// 个文件的 describe 一律用 .sequential。
let server: MockServer;

beforeEach(async () => {
	server = await startMockServer();
	installStudioRoutes(server);
});

afterEach(() => server.close());

describe.sequential("tufty upload", () => {
	it("uploads a local file and prints its public URL", async () => {
		const file = env.file("shot.png", PNG_BYTES);
		const result = await runCli([
			"--base-url",
			server.url,
			"--api-key",
			"sk-test",
			"upload",
			file,
		]);
		expect(result.exitCode).toBe(0);
		expect(result.payload.result).toEqual({
			tool: "upload",
			data: { url: publicUrlFor("shot.png") },
		});
		const [put] = server.find("PUT /storage/*");
		expect(put?.body).toEqual(PNG_BYTES);
		expect(put?.headers["content-type"]).toBe("image/png");
	});

	it("--format url prints only the URL", async () => {
		const file = env.file("shot.png", PNG_BYTES);
		const result = await runCli([
			"--base-url",
			server.url,
			"--api-key",
			"sk-test",
			"upload",
			file,
			"--format",
			"url",
		]);
		expect(result.stdout).toBe(`${publicUrlFor("shot.png")}\n`);
	});

	it("uploads a data: URL", async () => {
		const dataUrl = `data:image/jpeg;base64,${PNG_BYTES.toString("base64")}`;
		const result = await runCli([
			"--base-url",
			server.url,
			"--api-key",
			"sk-test",
			"upload",
			dataUrl,
		]);
		expect(result.exitCode).toBe(0);
		expect(server.find("POST /api/cli/upload-url")[0]?.json).toEqual({
			filename: "upload.jpg",
			contentType: "image/jpeg",
		});
	});

	it("passes tufty-hosted URLs through without auth or requests", async () => {
		for (const url of [
			"https://static.tufty.ai/u/x.png",
			"https://files.dlazy.com/y.png",
		]) {
			const result = await runCli(["--base-url", server.url, "upload", url]);
			expect(result.exitCode).toBe(0);
			expect(result.payload.result.data.url).toBe(url);
		}
		expect(server.requests).toHaveLength(0);
	});

	it("downloads other http(s) URLs and re-uploads them", async () => {
		const result = await runCli([
			"--base-url",
			server.url,
			"--api-key",
			"sk-test",
			"upload",
			`${server.url}/remote/look.jpg`,
		]);
		expect(result.exitCode).toBe(0);
		expect(result.payload.result.data.url).toBe(publicUrlFor("look.jpg"));
		expect(
			server.find("GET /remote/look.jpg")[0]?.headers.authorization,
		).toBeUndefined();
	});

	it("learns the storage host from upload-url and passes later URLs on it through", async () => {
		server.route("POST /api/cli/upload-url", (req) => ({
			json: {
				signedUrl: `${server.url}/storage/${req.json.filename}`,
				publicUrl: `https://files.dev-storage.test/uploads/${req.json.filename}`,
			},
		}));
		const file = env.file("shot.png", PNG_BYTES);
		const first = await runCli([
			"--base-url",
			server.url,
			"--api-key",
			"sk-test",
			"upload",
			file,
		]);
		expect(first.payload.result.data.url).toBe(
			"https://files.dev-storage.test/uploads/shot.png",
		);

		const second = await runCli([
			"--base-url",
			server.url,
			"--api-key",
			"sk-test",
			"upload",
			"https://files.dev-storage.test/other.png",
		]);
		expect(second.payload.result.data.url).toBe(
			"https://files.dev-storage.test/other.png",
		);
		expect(server.find("POST /api/cli/upload-url")).toHaveLength(1);
	});

	it("fails with file_not_found (exit 2) for a missing file", async () => {
		const result = await runCli([
			"--api-key",
			"sk-test",
			"upload",
			"./missing.png",
		]);
		expect(result.exitCode).toBe(2);
		expect(result.payload.code).toBe("file_not_found");
	});
});

describe.sequential("checkMp4Integrity", () => {
	it("accepts a complete file, rejects truncated or index-less files, ignores other containers", () => {
		setLocale("en-US");
		expect(checkMp4Integrity(MP4_BYTES)).toBeNull();
		const truncated = Buffer.concat([
			MP4_BYTES.subarray(0, 16),
			Buffer.from([0, 0, 1, 0, 0x6d, 0x64, 0x61, 0x74]),
		]);
		expect(checkMp4Integrity(truncated)).toContain("incomplete");
		expect(checkMp4Integrity(MP4_BYTES.subarray(0, 16))).toContain("moov");
		expect(
			checkMp4Integrity(Buffer.from("1a45dfa3000000000000000000", "hex")),
		).toBeNull();
	});
});
