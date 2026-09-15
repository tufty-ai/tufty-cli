import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLI_VERSION } from "../src/constants";
import { SdkError } from "../src/lib/envelope";
import { resolveApiKey, waitForApiKeyAuth } from "../src/utils/config";
import { runtime } from "../src/utils/utils";
import { type MockServer, startMockServer } from "./helpers/mock-server";
import { runCli, setupCliEnv } from "./helpers/run-cli";

const env = setupCliEnv();
let server: MockServer;

beforeEach(async () => {
	server = await startMockServer();
	// 直接调用 config 里的函数时会往 stderr 打登录提示，测试输出里不要这些
	vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => server.close());

/** 前 n 次 pending，之后给 key */
function verificationAfter(n: number, apiKey = "sk-device-key") {
	let polls = 0;
	server.route("GET /api/cli/verification", () => {
		polls++;
		return polls <= n ? { json: { status: "pending" } } : { json: { apiKey } };
	});
}

function readConfig() {
	return JSON.parse(fs.readFileSync(path.join(env.dir, "config.json"), "utf8"));
}

describe("device login", () => {
	it("opens the verification page and polls until an apiKey arrives", async () => {
		verificationAfter(2);
		const opened = vi.fn();
		runtime.openBrowser = opened;

		const key = await waitForApiKeyAuth({ baseUrl: server.url });

		expect(key).toBe("sk-device-key");
		const polls = server.find("GET /api/cli/verification");
		expect(polls).toHaveLength(3);
		const id = polls[0]?.query.get("id");
		expect(id).toMatch(/^[0-9a-f-]{36}$/);
		expect(polls.every((p) => p.query.get("id") === id)).toBe(true);
		expect(polls[0]?.headers["x-cli-version"]).toBe(CLI_VERSION);
		expect(polls[0]?.headers.authorization).toBeUndefined();
		expect(opened).toHaveBeenCalledWith(
			`${server.url}/auth/cli?id=${id}&exp=30`,
		);
	});

	it("throws login_expired on 410", async () => {
		server.route("GET /api/cli/verification", () => ({
			status: 410,
			json: { status: "expired" },
		}));
		await expect(
			waitForApiKeyAuth({ baseUrl: server.url }),
		).rejects.toMatchObject({
			code: "login_expired",
		});
	});

	it("keeps polling through transient server errors", async () => {
		let polls = 0;
		server.route("GET /api/cli/verification", () => {
			polls++;
			return polls === 1
				? { status: 500, json: { error: "internal_error" } }
				: { json: { apiKey: "sk-late" } };
		});
		await expect(waitForApiKeyAuth({ baseUrl: server.url })).resolves.toBe(
			"sk-late",
		);
	});

	it("`tufty login` saves the key to the config file", async () => {
		verificationAfter(1);
		const result = await runCli(["--base-url", server.url, "login"]);
		expect(result.exitCode).toBe(0);
		expect(result.payload.result).toEqual({
			tool: "login",
			data: { saved: true },
		});
		expect(result.stderr).toContain(`${server.url}/auth/cli?id=`);
		expect(readConfig().TUFTY_API_KEY).toBe("sk-device-key");
	});
});

describe("API key lookup order: --api-key → TUFTY_API_KEY → config → device login", () => {
	function writeConfigKey(key: string) {
		fs.writeFileSync(
			path.join(env.dir, "config.json"),
			JSON.stringify({ TUFTY_API_KEY: key }),
		);
	}

	it("--api-key wins over env and config", async () => {
		process.env.TUFTY_API_KEY = "sk-env";
		writeConfigKey("sk-config");
		expect(
			await resolveApiKey("sk-flag", {
				baseUrl: server.url,
				interactive: true,
			}),
		).toBe("sk-flag");
	});

	it("env wins over config", async () => {
		process.env.TUFTY_API_KEY = "sk-env";
		writeConfigKey("sk-config");
		expect(
			await resolveApiKey(undefined, {
				baseUrl: server.url,
				interactive: true,
			}),
		).toBe("sk-env");
	});

	it("config is used when no flag or env", async () => {
		writeConfigKey("sk-config");
		expect(
			await resolveApiKey(undefined, {
				baseUrl: server.url,
				interactive: true,
			}),
		).toBe("sk-config");
		expect(server.requests).toHaveLength(0);
	});

	it("falls back to device login when interactive, and persists the key", async () => {
		verificationAfter(0, "sk-from-login");
		expect(
			await resolveApiKey(undefined, {
				baseUrl: server.url,
				interactive: true,
			}),
		).toBe("sk-from-login");
		expect(readConfig().TUFTY_API_KEY).toBe("sk-from-login");
	});

	it("returns null without prompting when not interactive", async () => {
		expect(
			await resolveApiKey(undefined, {
				baseUrl: server.url,
				interactive: false,
			}),
		).toBeNull();
		expect(server.requests).toHaveLength(0);
	});
});

describe("auth commands", () => {
	it("auth set / get / logout", async () => {
		const set = await runCli(["auth", "set", "  sk-abcdef123456  "]);
		expect(set.payload.result).toEqual({
			tool: "auth.set",
			data: { source: "config", saved: true },
		});
		expect(readConfig().TUFTY_API_KEY).toBe("sk-abcdef123456");

		const masked = await runCli(["auth", "get"]);
		expect(masked.payload.result.data).toEqual({
			source: "config",
			apiKey: "sk-***3456",
		});

		process.env.TUFTY_API_KEY = "sk-environment-9999";
		const shown = await runCli(["auth", "get", "--show"]);
		expect(shown.payload.result.data).toEqual({
			source: "env",
			apiKey: "sk-environment-9999",
		});

		const logout = await runCli(["logout"]);
		expect(logout.payload.result.data).toEqual({ removed: true });
		expect(logout.stderr).toContain("TUFTY_API_KEY is still set");
		expect(readConfig().TUFTY_API_KEY).toBeUndefined();

		delete process.env.TUFTY_API_KEY;
		const none = await runCli(["auth", "get"]);
		expect(none.exitCode).toBe(1);
		expect(none.payload.code).toBe("not_configured");
	});

	it("is an SdkError-based flow (sanity)", () => {
		expect(new SdkError("x", "y").exitCode).toBe(1);
	});
});
