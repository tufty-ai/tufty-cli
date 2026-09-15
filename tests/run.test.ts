import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLI_VERSION } from "../src/constants";
import { type MockServer, startMockServer } from "./helpers/mock-server";
import { runCli, setupCliEnv } from "./helpers/run-cli";
import {
	cutoutUrlFor,
	installStudioRoutes,
	MP4_BYTES,
	PNG_BYTES,
	publicUrlFor,
	type RunState,
} from "./helpers/studio";

const env = setupCliEnv();
let server: MockServer;
let run: RunState;

beforeEach(async () => {
	server = await startMockServer();
	run = installStudioRoutes(server);
});

afterEach(() => server.close());

const TUFTY_A = "https://static.tufty.ai/u/a.jpg";
const TUFTY_B = "https://static.tufty.ai/u/b.jpg";

function base(...args: string[]) {
	return ["--base-url", server.url, "--api-key", "sk-test", ...args];
}

describe("input validation happens before anything is uploaded", () => {
	const cases: Array<{ name: string; args: string[]; code: string }> = [
		{
			name: "missing required model",
			args: ["pet-dressup", "--product", TUFTY_A],
			code: "missing_input",
		},
		{
			name: "missing required product",
			args: ["flat-to-3d"],
			code: "missing_input",
		},
		{
			name: "too many stills",
			args: [
				"product-promo",
				"--still",
				...Array.from(
					{ length: 10 },
					(_, i) => `https://static.tufty.ai/u/${i}.jpg`,
				),
			],
			code: "too_many_inputs",
		},
		{
			name: "still count below minimum",
			args: ["image-to-video"],
			code: "missing_input",
		},
		{
			name: "more than 4 shots joined into one product",
			args: [
				"pet-dressup",
				"--product",
				"a.jpg+b.jpg+c.jpg+d.jpg+e.jpg",
				"--model",
				TUFTY_B,
			],
			code: "too_many_inputs",
		},
		{
			name: "local file does not exist",
			args: [
				"pet-dressup",
				"--product",
				"./does-not-exist.jpg",
				"--model",
				TUFTY_B,
			],
			code: "file_not_found",
		},
		{
			name: "more than 16 images in one run",
			args: [
				"pet-dressup",
				"--product",
				...Array.from(
					{ length: 5 },
					(_, i) => `https://static.tufty.ai/u/p${i}.jpg`,
				),
				"--model",
				TUFTY_B,
				"--count",
				"4",
			],
			code: "too_many_images",
		},
	];

	for (const c of cases) {
		it(c.name, async () => {
			const result = await runCli(base(...c.args));
			expect(result.exitCode).toBe(2);
			expect(result.payload.ok).toBe(false);
			expect(result.payload.code).toBe(c.code);
			// 只拉过清单，没有上传 / 抠图 / 提交
			expect(server.requests.map((r) => r.path)).toEqual([
				"/api/cli/studio/tools",
			]);
		});
	}
});

describe("--dry-run", () => {
	it("prints the image payload and credit estimate without auth or uploads", async () => {
		const sweater = env.file("sweater.png", PNG_BYTES);
		const result = await runCli([
			"--base-url",
			server.url,
			"pet-dressup",
			"--product",
			sweater,
			`${TUFTY_A}+${TUFTY_B}`,
			"--model",
			"https://static.tufty.ai/u/corgi.jpg",
			"--quality",
			"medium",
			"--ratio",
			"3:4",
			"--count",
			"2",
			"--notes",
			"red scarf",
			"--dry-run",
		]);
		expect(result.exitCode).toBe(0);
		// 18 积分 x (2 件商品 x 1 个模特) x 2 张 = 72，抠图 3 张商品图 + 1 张模特图 = 4
		expect(result.payload.result).toEqual({
			tool: "pet-dressup",
			dryRun: true,
			payload: {
				tool: "pet-dressup",
				products: [sweater, [TUFTY_A, TUFTY_B]],
				models: ["https://static.tufty.ai/u/corgi.jpg"],
				notes: "red scarf",
				size: "1024x1536",
				count: 2,
				quality: "medium",
			},
			estimatedCredits: 76,
			creditBreakdown: { generation: 72, cutout: 4 },
		});
		expect(result.stderr).toContain("[cost-estimate] ~76 credits");
		expect(server.requests.map((r) => r.path)).toEqual([
			"/api/cli/studio/tools",
		]);
	});

	it("omits size for auto, adds enhance only where the manifest allows it", async () => {
		const result = await runCli([
			"--base-url",
			server.url,
			"background-swap",
			"--model",
			TUFTY_A,
			"--enhance",
			"--no-cutout",
			"--dry-run",
		]);
		expect(result.exitCode).toBe(0);
		expect(result.payload.result.payload).toEqual({
			tool: "background-swap",
			products: [],
			models: [TUFTY_A],
			count: 1,
			quality: "low",
			enhance: true,
		});
		expect(result.payload.result.estimatedCredits).toBe(4);
	});

	it("estimates video credits per second plus cutouts", async () => {
		const stills = [TUFTY_A, TUFTY_B, "https://static.tufty.ai/u/c.jpg"];
		const withCutout = await runCli([
			"--base-url",
			server.url,
			"product-promo",
			"--still",
			...stills,
			"--resolution",
			"1080P",
			"--duration",
			"10",
			"--dry-run",
		]);
		expect(withCutout.exitCode).toBe(0);
		// round(78.59 x 10) = 786，外加 3 张静帧抠图
		expect(withCutout.payload.result.estimatedCredits).toBe(789);
		expect(withCutout.payload.result.payload).toEqual({
			tool: "product-promo",
			stills,
			seconds: 10,
			aspectRatio: "9:16",
			resolution: "1080P",
		});

		const noCutout = await runCli([
			"--base-url",
			server.url,
			"product-promo",
			"--still",
			...stills,
			"--resolution",
			"1080P",
			"--duration",
			"10",
			"--no-cutout",
			"--dry-run",
		]);
		expect(noCutout.payload.result.creditBreakdown).toEqual({
			generation: 786,
			cutout: 0,
		});
	});
});

describe("image tool happy path", () => {
	it("uploads, cuts out, submits, polls and saves", async () => {
		const sweater = env.file("sweater.png", PNG_BYTES);
		const front = env.file("front.png", PNG_BYTES);
		const back = env.file("back.png", PNG_BYTES);
		const outDir = path.join(env.dir, "out");
		run.runningPolls = 2;

		const result = await runCli(
			base(
				"pet-dressup",
				"--product",
				sweater,
				`${front}+${back}`,
				"--model",
				`${server.url}/remote/corgi.jpg`,
				"https://static.tufty.ai/u/shiba.jpg",
				"--quality",
				"medium",
				"--ratio",
				"1:1",
				"--count",
				"2",
				"--notes",
				"red",
				"--save",
				outDir,
			),
		);

		expect(result.stderr).not.toContain("internal_error");
		expect(result.exitCode).toBe(0);

		// 本地 3 张 + 外链 1 张需要上传；tufty 自家地址直接透传
		const signs = server.find("POST /api/cli/upload-url");
		expect(
			signs
				.map((r) => r.json)
				.sort((a, b) => a.filename.localeCompare(b.filename)),
		).toEqual([
			{ filename: "back.png", contentType: "image/png" },
			{ filename: "corgi.jpg", contentType: "image/jpeg" },
			{ filename: "front.png", contentType: "image/png" },
			{ filename: "sweater.png", contentType: "image/png" },
		]);
		expect(server.find("GET /remote/corgi.jpg")).toHaveLength(1);
		const puts = server.find("PUT /storage/*");
		expect(puts).toHaveLength(4);
		for (const put of puts) {
			expect(put.headers["x-oss-object-acl"]).toBe("public-read");
			expect(put.headers.authorization).toBeUndefined();
			expect(put.headers["content-type"]).toMatch(/^image\//);
		}

		// 每张输入图都抠图：商品图用 product 词表，模特图用 model 词表
		const analyses = server
			.find("POST /api/cli/studio/analyze")
			.map((r) => r.json);
		expect(analyses).toHaveLength(5);
		expect(
			analyses
				.filter((a) => a.library === "product")
				.map((a) => a.imageUrl)
				.sort(),
		).toEqual([
			publicUrlFor("back.png"),
			publicUrlFor("front.png"),
			publicUrlFor("sweater.png"),
		]);
		expect(
			analyses
				.filter((a) => a.library === "model")
				.map((a) => a.imageUrl)
				.sort(),
		).toEqual([
			"https://static.tufty.ai/u/shiba.jpg",
			publicUrlFor("corgi.jpg"),
		]);

		const [submit] = server.find("POST /api/cli/studio/runs");
		expect(submit?.json).toEqual({
			tool: "pet-dressup",
			products: [
				cutoutUrlFor(publicUrlFor("sweater.png")),
				[
					cutoutUrlFor(publicUrlFor("front.png")),
					cutoutUrlFor(publicUrlFor("back.png")),
				],
			],
			models: [
				cutoutUrlFor(publicUrlFor("corgi.jpg")),
				cutoutUrlFor("https://static.tufty.ai/u/shiba.jpg"),
			],
			notes: "red",
			size: "1024x1024",
			count: 2,
			quality: "medium",
		});

		// 所有 tufty 接口都带鉴权、版本和语言
		for (const req of server.requests.filter(
			(r) =>
				r.path.startsWith("/api/cli/") && r.path !== "/api/cli/studio/tools",
		)) {
			expect(req.headers.authorization).toBe("Bearer sk-test");
			expect(req.headers["x-cli-version"]).toBe(CLI_VERSION);
			expect(req.headers["accept-language"]).toBe("en-US");
		}

		expect(server.find("GET /api/cli/studio/runs/run_1")).toHaveLength(3);
		expect(result.stderr).toContain(
			"[cost-estimate] ~149 credits (generation 144 + cutout 5)",
		);

		const outputs = result.payload.result.outputs;
		expect(result.payload).toEqual({
			ok: true,
			result: {
				tool: "pet-dressup",
				runId: "run_1",
				status: "completed",
				outputs: [
					{
						type: "image",
						url: `${server.url}/outputs/run_1-a.png`,
						path: path.join(outDir, "run_1-1.png"),
					},
					{
						type: "image",
						url: `${server.url}/outputs/run_1-b.png`,
						path: path.join(outDir, "run_1-2.png"),
					},
				],
			},
		});
		for (const o of outputs) expect(fs.readFileSync(o.path)).toEqual(PNG_BYTES);
	});

	it("--format url prints one output URL per line", async () => {
		const result = await runCli(
			base(
				"flat-to-3d",
				"--product",
				TUFTY_A,
				"--no-cutout",
				"--format",
				"url",
			),
		);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe(
			`${server.url}/outputs/run_1-a.png\n${server.url}/outputs/run_1-b.png\n`,
		);
	});

	it("uses TUFTY_API_KEY from the environment when --api-key is absent", async () => {
		process.env.TUFTY_API_KEY = "sk-from-env";
		const result = await runCli([
			"--base-url",
			server.url,
			"flat-to-3d",
			"--product",
			TUFTY_A,
			"--no-cutout",
			"--no-wait",
		]);
		expect(result.exitCode).toBe(0);
		expect(
			server.find("POST /api/cli/studio/runs")[0]?.headers.authorization,
		).toBe("Bearer sk-from-env");
	});
});

describe("video tool happy path", () => {
	it("uploads the still (with cutout) and the motion video (without), then polls", async () => {
		const still = env.file("model.png", PNG_BYTES);
		const motion = env.file("dolly.mp4", MP4_BYTES);
		server.route("POST /api/cli/studio/analyze", (req) => ({
			json: {
				subjects: [{ url: cutoutUrlFor(req.json.imageUrl) }],
				degraded: true,
			},
		}));

		const result = await runCli(
			base(
				"motion-control",
				"--still",
				still,
				"--motion-video",
				motion,
				"--duration",
				"10",
				"--ratio",
				"1:1",
			),
		);

		expect(result.exitCode).toBe(0);
		expect(
			server
				.find("POST /api/cli/upload-url")
				.map((r) => r.json)
				.sort((a, b) => a.filename.localeCompare(b.filename)),
		).toEqual([
			{ filename: "dolly.mp4", contentType: "video/mp4" },
			{ filename: "model.png", contentType: "image/png" },
		]);
		const analyses = server
			.find("POST /api/cli/studio/analyze")
			.map((r) => r.json);
		expect(analyses).toEqual([
			{ imageUrl: publicUrlFor("model.png"), library: "model" },
		]);
		expect(result.stderr).toContain("degraded result");

		expect(server.find("POST /api/cli/studio/runs")[0]?.json).toEqual({
			tool: "motion-control",
			stills: [cutoutUrlFor(publicUrlFor("model.png"))],
			motionVideo: publicUrlFor("dolly.mp4"),
			seconds: 10,
			aspectRatio: "1:1",
			resolution: "720P",
		});
		expect(result.payload.result).toEqual({
			tool: "motion-control",
			runId: "run_1",
			status: "completed",
			outputs: [
				{ type: "video", url: `${server.url}/outputs/run_1-a.mp4` },
				{ type: "video", url: `${server.url}/outputs/run_1-b.mp4` },
			],
		});
	});

	it("uses the tool's library for still cutouts", async () => {
		const result = await runCli(
			base("product-promo", "--still", TUFTY_A, "--no-wait"),
		);
		expect(result.exitCode).toBe(0);
		expect(
			server.find("POST /api/cli/studio/analyze").map((r) => r.json.library),
		).toEqual(["product"]);
	});

	it("falls back to the uploaded URL when no subject is found", async () => {
		server.route("POST /api/cli/studio/analyze", () => ({
			json: { subjects: [], degraded: false },
		}));
		const result = await runCli(
			base("image-to-video", "--still", TUFTY_A, "--no-wait"),
		);
		expect(result.exitCode).toBe(0);
		expect(server.find("POST /api/cli/studio/runs")[0]?.json.stills).toEqual([
			TUFTY_A,
		]);
		expect(result.stderr).toContain("no subject found");
	});

	it("rejects a truncated motion video before uploading it", async () => {
		const broken = Buffer.concat([
			MP4_BYTES.subarray(0, 16),
			Buffer.from([0, 0, 1, 0, 0x6d, 0x64, 0x61, 0x74]),
		]);
		const motion = env.file("broken.mp4", broken);
		const result = await runCli(
			base(
				"motion-control",
				"--still",
				TUFTY_A,
				"--motion-video",
				motion,
				"--no-cutout",
			),
		);
		expect(result.exitCode).toBe(2);
		expect(result.payload.code).toBe("invalid_video");
		expect(server.find("POST /api/cli/studio/runs")).toHaveLength(0);
	});
});

describe("cutout subject selection", () => {
	const FOREIGN = "https://v3b.fal.media/files/tmp-cutout.png";

	it("uses the first subject on the same storage host as the uploaded image", async () => {
		server.route("POST /api/cli/studio/analyze", (req) => ({
			json: {
				subjects: [{ url: FOREIGN }, { url: cutoutUrlFor(req.json.imageUrl) }],
				degraded: false,
			},
		}));
		const still = env.file("pet.png", PNG_BYTES);
		const result = await runCli(
			base("image-to-video", "--still", still, "--no-wait"),
		);
		expect(result.exitCode).toBe(0);
		expect(server.find("POST /api/cli/studio/runs")[0]?.json.stills).toEqual([
			cutoutUrlFor(publicUrlFor("pet.png")),
		]);
		expect(result.stderr).not.toContain("not stored");
	});

	it("falls back to the uploaded original when no subject is on the storage host", async () => {
		server.route("POST /api/cli/studio/analyze", () => ({
			json: { subjects: [{ url: FOREIGN }], degraded: false },
		}));
		const still = env.file("pet.png", PNG_BYTES);
		const result = await runCli(
			base("image-to-video", "--still", still, "--no-wait"),
		);
		expect(result.exitCode).toBe(0);
		expect(server.find("POST /api/cli/studio/runs")[0]?.json.stills).toEqual([
			publicUrlFor("pet.png"),
		]);
		expect(result.stderr).toContain("not stored on tufty storage");
	});
});

describe("--no-wait", () => {
	it("returns the runId right after submitting", async () => {
		const result = await runCli(
			base("product-promo", "--still", TUFTY_A, "--no-cutout", "--no-wait"),
		);
		expect(result.exitCode).toBe(0);
		expect(result.payload.result).toEqual({
			tool: "product-promo",
			runId: "run_1",
			status: "running",
			outputs: [],
		});
		expect(server.find("GET /api/cli/studio/runs/*")).toHaveLength(0);
		expect(server.find("POST /api/cli/studio/analyze")).toHaveLength(0);
		expect(server.find("POST /api/cli/upload-url")).toHaveLength(0);
		expect(result.stderr).toContain(
			"Run submitted: run_1 (42 credits reserved)",
		);
	});
});
