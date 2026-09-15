import * as fs from "node:fs";
import * as path from "node:path";
import type { MockServer } from "./mock-server";

export const FIXTURES = {
	"en-US": JSON.parse(
		fs.readFileSync(
			path.join(__dirname, "../fixtures/tools.en-US.json"),
			"utf8",
		),
	),
	"zh-CN": JSON.parse(
		fs.readFileSync(
			path.join(__dirname, "../fixtures/tools.zh-CN.json"),
			"utf8",
		),
	),
};

export const TOOL_IDS: string[] = FIXTURES["en-US"].tools.map(
	(t: { id: string }) => t.id,
);

export const PNG_BYTES = Buffer.concat([
	Buffer.from("89504e470d0a1a0a", "hex"),
	Buffer.from("fake-png-body"),
]);

export const JPEG_BYTES = Buffer.concat([
	Buffer.from("ffd8ffe0", "hex"),
	Buffer.from("fake-jpeg-body"),
]);

function box(type: string, payload: Buffer): Buffer {
	const header = Buffer.alloc(8);
	header.writeUInt32BE(8 + payload.length, 0);
	header.write(type, 4, "latin1");
	return Buffer.concat([header, payload]);
}

/** 结构完整的最小 mp4：ftyp + moov */
export const MP4_BYTES = Buffer.concat([
	box("ftyp", Buffer.from("isom\0\0\0\0", "latin1")),
	box("moov", Buffer.alloc(8)),
]);

export type RunState = {
	/** 返回 completed 之前先回几次 running */
	runningPolls: number;
	polls: number;
	tool: string;
	kind: "image" | "video";
	status: "completed" | "failed";
	error?: string;
};

/** 上传后的地址：按文件名生成，方便断言 */
export function publicUrlFor(filename: string): string {
	return `https://static.tufty.ai/uploads/${filename}`;
}

/** 抠图结果地址：原地址去掉扩展名加 -cutout.png */
export function cutoutUrlFor(imageUrl: string): string {
	return `${imageUrl.replace(/\.\w+$/, "")}-cutout.png`;
}

/** 装上工作室接口的默认假实现，返回可调的任务状态 */
export function installStudioRoutes(server: MockServer): RunState {
	const state: RunState = {
		runningPolls: 1,
		polls: 0,
		tool: "pet-dressup",
		kind: "image",
		status: "completed",
	};

	server.route("GET /api/cli/studio/tools", (req) => ({
		json: FIXTURES[req.query.get("locale") === "zh-CN" ? "zh-CN" : "en-US"],
	}));

	server.route("POST /api/cli/upload-url", (req) => ({
		json: {
			signedUrl: `${server.url}/storage/${req.json.filename}`,
			requiredHeaders: { "x-oss-object-acl": "public-read" },
			publicUrl: publicUrlFor(req.json.filename),
			path: `uploads/${req.json.filename}`,
		},
	}));

	server.route("PUT /storage/*", () => ({ status: 200 }));

	server.route("POST /api/cli/studio/analyze", (req) => ({
		json: {
			subjects: [{ url: cutoutUrlFor(req.json.imageUrl), kind: "subject" }],
			degraded: false,
		},
	}));

	server.route("POST /api/cli/studio/runs", (req) => {
		const tool = FIXTURES["en-US"].tools.find(
			(t: { id: string }) => t.id === req.json.tool,
		);
		state.tool = req.json.tool;
		state.kind = tool?.kind ?? "image";
		return {
			status: 202,
			json: {
				runId: "run_1",
				status: "running",
				kind: state.kind,
				tool: state.tool,
				estimatedCredits: 42,
			},
		};
	});

	server.route("GET /api/cli/studio/runs/*", (req) => {
		const runId = decodeURIComponent(req.path.split("/").pop() ?? "");
		state.polls++;
		const base = { runId, kind: state.kind, tool: state.tool };
		if (state.polls <= state.runningPolls) {
			return { json: { ...base, status: "running" } };
		}
		if (state.status === "failed") {
			return { json: { ...base, status: "failed", error: state.error } };
		}
		const ext = state.kind === "video" ? "mp4" : "png";
		return {
			json: {
				...base,
				status: "completed",
				urls: [
					`${server.url}/outputs/${runId}-a.${ext}`,
					`${server.url}/outputs/${runId}-b.${ext}`,
				],
			},
		};
	});

	server.route("GET /outputs/*", () => ({
		headers: { "Content-Type": "image/png" },
		body: PNG_BYTES,
	}));

	server.route("GET /remote/*", () => ({
		headers: { "Content-Type": "image/jpeg" },
		body: JPEG_BYTES,
	}));

	return state;
}
