import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { API_KEY_URL, RECHARGE_URL } from "../src/constants";
import { mapHttpError } from "../src/lib/api";
import { setLocale } from "../src/messages";
import { type MockServer, startMockServer } from "./helpers/mock-server";
import { runCli, setupCliEnv } from "./helpers/run-cli";
import { installStudioRoutes, type RunState } from "./helpers/studio";

setupCliEnv();
// 下面这个假服务器是整个文件共用的：beforeEach 换一个新的，afterEach 关掉它。而
// vitest.config.mts 里 sequence.concurrent 默认开着 —— 同一文件的用例并发跑时会互相
// 覆盖 server，还会把别人正在用的那个提前关掉，表现是退出码和请求记录对不上。所以这
// 个文件的 describe 一律用 .sequential。
let server: MockServer;
let run: RunState;

beforeEach(async () => {
	server = await startMockServer();
	run = installStudioRoutes(server);
});

afterEach(() => server.close());

const TUFTY_A = "https://static.tufty.ai/u/a.jpg";
const TUFTY_B = "https://static.tufty.ai/u/b.jpg";

function pet(...extra: string[]) {
	return [
		"--base-url",
		server.url,
		"--api-key",
		"sk-test",
		"pet-dressup",
		"--product",
		TUFTY_A,
		"--model",
		TUFTY_B,
		...extra,
	];
}

describe.sequential("HTTP error mapping", () => {
	it("402 insufficient_credits → insufficient_balance with a recharge hint", async () => {
		server.route("POST /api/cli/studio/runs", () => ({
			status: 402,
			json: { error: "insufficient_credits", required: 144 },
		}));
		const result = await runCli(pet("--no-cutout"));
		expect(result.exitCode).toBe(1);
		expect(result.payload).toEqual({
			ok: false,
			code: "insufficient_balance",
			message: "Not enough credits (this step needs 144).",
			details: {
				status: 402,
				serverCode: "insufficient_credits",
				required: 144,
			},
		});
		expect(result.stderr).toContain(RECHARGE_URL);
	});

	it("402 on the cutout step stops before submitting the run", async () => {
		server.route("POST /api/cli/studio/analyze", () => ({
			status: 402,
			json: { error: "insufficient_credits", required: 1 },
		}));
		const result = await runCli(pet());
		expect(result.payload.code).toBe("insufficient_balance");
		expect(server.find("POST /api/cli/studio/runs")).toHaveLength(0);
	});

	it("426 → cli_version_too_low, keeping the server message", async () => {
		server.route("POST /api/cli/studio/runs", () => ({
			status: 426,
			json: {
				error: "cli_version_too_low",
				message:
					"CLI 1.0.0 is too old (min 1.1.0). Run npm install -g @tufty/cli@latest",
				details: { currentVersion: "1.0.0", minVersion: "1.1.0" },
			},
		}));
		const result = await runCli(pet("--no-cutout"));
		expect(result.exitCode).toBe(1);
		expect(result.payload.code).toBe("cli_version_too_low");
		expect(result.payload.message).toContain("min 1.1.0");
		expect(result.payload.details.serverCode).toBe("cli_version_too_low");
		expect(result.payload.details.serverDetails).toEqual({
			currentVersion: "1.0.0",
			minVersion: "1.1.0",
		});
	});

	it("426 on the manifest is surfaced on stderr", async () => {
		server.route("GET /api/cli/studio/tools", () => ({
			status: 426,
			json: { error: "cli_version_too_low", message: "upgrade me" },
		}));
		const result = await runCli(["--base-url", server.url, "tools", "list"]);
		expect(result.payload.code).toBe("manifest_unavailable");
		expect(result.stderr).toContain("upgrade me");
	});

	it("401 → unauthorized pointing at the API key page", async () => {
		server.route("POST /api/cli/studio/runs", () => ({
			status: 401,
			json: { error: "unauthorized", message: "API key required" },
		}));
		const result = await runCli(pet("--no-cutout"));
		expect(result.payload.code).toBe("unauthorized");
		expect(result.payload.message).toContain(API_KEY_URL);
		expect(result.payload.message).toContain("tufty auth set <key>");
	});

	it("400 → invalid_request with serverCode and server details", async () => {
		server.route("POST /api/cli/studio/runs", () => ({
			status: 400,
			json: {
				error: "invalid_request",
				message: "Invalid request body",
				details: { issues: [{ path: ["count"] }] },
			},
		}));
		const result = await runCli(pet("--no-cutout"));
		expect(result.exitCode).toBe(1);
		expect(result.payload.code).toBe("invalid_request");
		expect(result.payload.message).toBe("Invalid request body");
		expect(result.payload.details).toEqual({
			status: 400,
			serverCode: "invalid_request",
			serverDetails: { issues: [{ path: ["count"] }] },
		});
	});

	it("maps the remaining statuses", () => {
		setLocale("en-US");
		expect(mapHttpError(400, '{"error":"unknown_template"}')).toMatchObject({
			code: "invalid_request",
			details: { status: 400, serverCode: "unknown_template" },
		});
		expect(mapHttpError(403, "{}").code).toBe("forbidden");
		expect(
			mapHttpError(404, '{"error":"not_found","message":"Run not found"}'),
		).toMatchObject({
			code: "not_found",
			message: "Run not found",
		});
		expect(mapHttpError(502, "<html>bad gateway</html>")).toMatchObject({
			code: "server_error",
			details: { status: 502, body: "<html>bad gateway</html>" },
		});
		expect(mapHttpError(500, '{"error":"internal_error"}').details).toEqual({
			status: 500,
			serverCode: "internal_error",
		});
	});

	it("fails with no_api_key when no key is available (non-interactive)", async () => {
		const result = await runCli([
			"--base-url",
			server.url,
			"pet-dressup",
			"--product",
			TUFTY_A,
			"--model",
			TUFTY_B,
		]);
		expect(result.exitCode).toBe(1);
		expect(result.payload.code).toBe("no_api_key");
		expect(server.find("POST /api/cli/studio/analyze")).toHaveLength(0);
	});

	it("a failed run → task_failed with the runId", async () => {
		run.status = "failed";
		run.error = "generate_failed";
		const result = await runCli(pet("--no-cutout"));
		expect(result.exitCode).toBe(1);
		expect(result.payload.code).toBe("task_failed");
		expect(result.payload.details).toEqual({
			runId: "run_1",
			tool: "pet-dressup",
			serverCode: "generate_failed",
		});
	});

	it("times out with a hint to resume via status", async () => {
		run.runningPolls = 1_000_000;
		const result = await runCli(pet("--no-cutout", "--timeout", "0.05"));
		expect(result.exitCode).toBe(1);
		expect(result.payload.code).toBe("timeout");
		expect(result.payload.details).toEqual({ runId: "run_1" });
		expect(result.payload.message).toContain("tufty status run_1 --wait");
	});
});

describe.sequential("tufty status", () => {
	function status(...args: string[]) {
		return runCli([
			"--base-url",
			server.url,
			"--api-key",
			"sk-test",
			"status",
			...args,
		]);
	}

	it("returns the current state once without --wait", async () => {
		run.kind = "video";
		run.tool = "image-to-video";
		const running = await status("run_9");
		expect(running.exitCode).toBe(0);
		expect(running.payload.result).toEqual({
			tool: "image-to-video",
			runId: "run_9",
			status: "running",
			outputs: [],
		});
		expect(server.find("GET /api/cli/studio/runs/run_9")).toHaveLength(1);
		// status 不依赖清单
		expect(server.find("GET /api/cli/studio/tools")).toHaveLength(0);

		const done = await status("run_9");
		expect(done.payload.result.status).toBe("completed");
		expect(done.payload.result.outputs[0]).toEqual({
			type: "video",
			url: `${server.url}/outputs/run_9-a.mp4`,
		});
	});

	it("polls until completion with --wait", async () => {
		run.runningPolls = 3;
		const result = await status("run_9", "--wait");
		expect(result.exitCode).toBe(0);
		expect(result.payload.result.status).toBe("completed");
		expect(server.find("GET /api/cli/studio/runs/run_9")).toHaveLength(4);
		expect(
			server.find("GET /api/cli/studio/runs/run_9")[0]?.headers.authorization,
		).toBe("Bearer sk-test");
	});

	it("maps an unknown run to not_found", async () => {
		server.route("GET /api/cli/studio/runs/*", () => ({
			status: 404,
			json: { error: "not_found", message: "Run not found" },
		}));
		const result = await status("nope");
		expect(result.exitCode).toBe(1);
		expect(result.payload.code).toBe("not_found");
		expect(result.payload.message).toBe("Run not found");
	});
});
