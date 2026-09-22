import * as fs from "node:fs";
import * as path from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerRunCommand } from "../src/commands/tools";
import { CLI_VERSION } from "../src/constants";
import type { StudioTool } from "../src/lib/manifest";
import { setLocale } from "../src/messages";
import { type MockServer, startMockServer } from "./helpers/mock-server";
import { runCli, setupCliEnv } from "./helpers/run-cli";
import {
	FIXTURES,
	installStudioRoutes,
	TOOL_IDS,
	UNLISTED_TOOLS,
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

function optionsOf(
	id: string,
): Map<string, { choices?: string[]; default?: unknown }> {
	setLocale("en-US");
	// 连没露出的工具一起找：flag 是按清单条目生成的，这一步不碰服务端。
	const tool = [...FIXTURES["en-US"].tools, ...UNLISTED_TOOLS].find(
		(t: StudioTool) => t.id === id,
	) as StudioTool;
	const cmd = registerRunCommand(new Command("tufty"), tool);
	return new Map(
		cmd.options.map((o) => [
			o.long as string,
			{ choices: o.argChoices, default: o.defaultValue },
		]),
	);
}

describe.sequential("manifest-driven command registration", () => {
	it("registers one command per manifest tool", async () => {
		const result = await runCli(["--base-url", server.url, "--help"]);
		expect(result.exitCode).toBe(0);
		for (const id of TOOL_IDS) expect(result.stdout).toContain(id);
		// 对外只放出这两个：清单是 CLI 命令、技能和文档的唯一来源，网页上点不到
		// 的工具，终端里也不该能调（网站仓库 config/studio-tools.config.ts）。
		expect(TOOL_IDS).toEqual(["pet-dressup", "image-to-video"]);
	});

	it("builds image flags from the manifest entry", () => {
		const pet = optionsOf("pet-dressup");
		expect([...pet.keys()]).toEqual([
			"--product",
			"--model",
			"--quality",
			"--ratio",
			"--count",
			"--notes",
			"--no-cutout",
			"--dry-run",
			"--no-wait",
			"--timeout",
			"--save",
			"--format",
		]);
		expect(pet.get("--quality")).toEqual({
			choices: ["low", "medium", "high"],
			default: "low",
		});
		expect(pet.get("--ratio")).toEqual({
			choices: ["auto", "1:1", "3:4", "9:16"],
			default: "auto",
		});
		expect(pet.get("--count")).toEqual({
			choices: ["1", "2", "3", "4"],
			default: "1",
		});
		expect(pet.get("--timeout")?.default).toBe("900");
		// 线上 pet-dressup 的 enhance 是 false，不给开关
		expect(pet.has("--enhance")).toBe(false);
		// 清单里 enhance 为真的工具才有这个开关
		expect(optionsOf("background-swap").has("--enhance")).toBe(true);
		expect(optionsOf("background-swap").get("--quality")?.default).toBe("low");
	});

	it("builds video flags from the manifest entry", () => {
		const promo = optionsOf("product-promo");
		expect(promo.get("--duration")).toEqual({
			choices: ["5", "10"],
			default: "5",
		});
		expect(promo.get("--ratio")).toEqual({
			choices: ["9:16", "1:1", "16:9"],
			default: "9:16",
		});
		expect(promo.get("--resolution")).toEqual({
			choices: ["720P", "1080P"],
			default: "720P",
		});
		expect(promo.has("--still")).toBe(true);
		expect(promo.has("--product")).toBe(false);
		expect(promo.has("--motion-video")).toBe(false);
		expect(optionsOf("motion-control").has("--motion-video")).toBe(true);
		expect(optionsOf("image-to-video").has("--motion-video")).toBe(false);
	});

	it("tools list returns the manifest and caches it for 10 minutes", async () => {
		const result = await runCli(["--base-url", server.url, "tools", "list"]);
		expect(result.exitCode).toBe(0);
		expect(result.payload.ok).toBe(true);
		expect(result.payload.result.tool).toBe("tools.list");
		expect(
			result.payload.result.data.tools.map((t: { id: string }) => t.id),
		).toEqual(TOOL_IDS);
		expect(result.payload.result.data.tools[0]).toEqual({
			id: "pet-dressup",
			kind: "image",
			name: "Pet Dress-Up",
			description: FIXTURES["en-US"].tools[0].description,
			command: "tufty pet-dressup",
		});

		const [req] = server.find("GET /api/cli/studio/tools");
		expect(req?.query.get("locale")).toBe("en-US");
		expect(req?.headers["x-cli-version"]).toBe(CLI_VERSION);
		expect(req?.headers["accept-language"]).toBe("en-US");
		expect(req?.headers.authorization).toBeUndefined();
		expect(fs.existsSync(path.join(env.dir, "manifest-en-US.json"))).toBe(true);

		await runCli(["--base-url", server.url, "tools", "list"]);
		expect(server.find("GET /api/cli/studio/tools")).toHaveLength(1);

		await runCli([
			"--base-url",
			server.url,
			"--refresh-manifest",
			"tools",
			"list",
		]);
		expect(server.find("GET /api/cli/studio/tools")).toHaveLength(2);
	});

	it("uses the zh-CN manifest and Accept-Language with --lang zh-CN", async () => {
		const result = await runCli([
			"--base-url",
			server.url,
			"--lang",
			"zh-CN",
			"tools",
			"describe",
			"pet-dressup",
		]);
		expect(result.exitCode).toBe(0);
		expect(result.payload.result.data.name).toBe("宠物换装");
		const [req] = server.find("GET /api/cli/studio/tools");
		expect(req?.query.get("locale")).toBe("zh-CN");
		expect(req?.headers["accept-language"]).toBe("zh-CN");
	});

	it("tools describe fails with tool_not_found for an unknown id", async () => {
		const result = await runCli([
			"--base-url",
			server.url,
			"tools",
			"describe",
			"nope",
		]);
		expect(result.exitCode).toBe(2);
		expect(result.payload.code).toBe("tool_not_found");
		expect(result.payload.details.availableTools).toEqual(TOOL_IDS);
	});

	it("rejects an unknown command with suggestions", async () => {
		const result = await runCli(["--base-url", server.url, "pet-dress"]);
		expect(result.exitCode).toBe(2);
		expect(result.payload.code).toBe("unknown_command");
		expect(result.payload.details.suggestions).toContain("pet-dressup");
	});

	it("turns commander errors (bad choice, unknown flag) into usage_error envelopes", async () => {
		const badChoice = await runCli([
			"--base-url",
			server.url,
			"pet-dressup",
			"--product",
			"https://static.tufty.ai/a.jpg",
			"--model",
			"https://static.tufty.ai/b.jpg",
			"--quality",
			"ultra",
		]);
		expect(badChoice.exitCode).toBe(2);
		expect(badChoice.payload.code).toBe("usage_error");
		expect(badChoice.payload.message).toContain("ultra");

		const unknownFlag = await runCli([
			"--base-url",
			server.url,
			"pet-dressup",
			"--enhance",
		]);
		expect(unknownFlag.exitCode).toBe(2);
		expect(unknownFlag.payload.code).toBe("usage_error");
		expect(unknownFlag.payload.message).toContain("--enhance");
	});

	it("reports manifest_unavailable when the tool list cannot be loaded", async () => {
		const result = await runCli([
			"--base-url",
			"http://127.0.0.1:9",
			"pet-dressup",
		]);
		expect(result.exitCode).toBe(1);
		expect(result.payload.code).toBe("manifest_unavailable");
	});

	it("does not fetch the manifest for static commands", async () => {
		const result = await runCli(["--base-url", server.url, "logout"]);
		expect(result.exitCode).toBe(0);
		expect(server.requests).toHaveLength(0);
	});
});
