import {
	API_KEY_URL,
	CLI_VERSION,
	cliEndpoint,
	PACKAGE_NAME,
} from "../constants";
import { getLocale, t } from "../messages";
import { runtime, sleep } from "../utils/utils";
import { debug, heartbeat, SdkError } from "./envelope";

export type ApiContext = { baseUrl: string; apiKey: string };

/** 每个 tufty 接口请求都带：版本（缺了服务端回 426）和语言 */
export function baseHeaders(): Record<string, string> {
	return { "X-CLI-Version": CLI_VERSION, "Accept-Language": getLocale() };
}

export function authHeaders(apiKey: string): Record<string, string> {
	return { ...baseHeaders(), Authorization: `Bearer ${apiKey}` };
}

/** Node 的 fetch 失败只报 "fetch failed"，真正原因在 cause 里 */
export function errMessage(err: unknown): string {
	if (!(err instanceof Error)) return String(err);
	const cause = (err as { cause?: unknown }).cause;
	return cause instanceof Error
		? `${err.message}: ${cause.message}`
		: err.message;
}

type ServerErrorBody = {
	error?: unknown;
	message?: unknown;
	details?: unknown;
	required?: unknown;
};

/**
 * 服务端错误体 `{ error, message?, details?, required? }` → SdkError。
 * HTTP 状态决定对外的 code；服务端自己的 error 码放进 details.serverCode。
 */
export function mapHttpError(status: number, bodyText: string): SdkError {
	let body: ServerErrorBody = {};
	try {
		const parsed: unknown = JSON.parse(bodyText);
		if (parsed && typeof parsed === "object") body = parsed as ServerErrorBody;
	} catch {
		/* 不是 JSON，保留原文进 details.body */
	}
	const serverCode = typeof body.error === "string" ? body.error : undefined;
	const serverMessage =
		typeof body.message === "string" && body.message ? body.message : undefined;
	const required =
		typeof body.required === "number" ? body.required : undefined;
	const m = t().api;

	let code: string;
	let fallback: string;
	if (status === 401) {
		code = "unauthorized";
		fallback = m.unauthorized(API_KEY_URL);
	} else if (status === 402) {
		code = "insufficient_balance";
		fallback = m.insufficientBalance(required);
	} else if (status === 403) {
		code = "forbidden";
		fallback = m.forbidden;
	} else if (status === 404) {
		code = "not_found";
		fallback = m.notFound;
	} else if (status === 400) {
		code = "invalid_request";
		fallback = m.invalidRequest(serverCode);
	} else if (status === 426) {
		code = "cli_version_too_low";
		fallback = m.versionTooLow(`npm install -g ${PACKAGE_NAME}@latest`);
	} else if (status >= 500) {
		code = "server_error";
		fallback = m.serverError(status, serverCode);
	} else {
		code = "http_error";
		fallback = m.requestFailed(status);
	}

	const details: Record<string, unknown> = { status };
	if (serverCode) details.serverCode = serverCode;
	if (required !== undefined) details.required = required;
	if (body.details !== undefined) details.serverDetails = body.details;
	if (!serverCode && !serverMessage && bodyText) {
		details.body = bodyText.slice(0, 500);
	}

	// 401 的服务端文案只有一句 "API key required"，不如本地文案（带取 key 的地址）有用
	const message = status === 401 ? fallback : (serverMessage ?? fallback);
	return new SdkError(code, message, details);
}

export async function requestJson<T>(
	url: string,
	init: RequestInit,
): Promise<T> {
	debug(init.method ?? "GET", url);
	let resp: Response;
	try {
		resp = await fetch(url, init);
	} catch (err) {
		throw new SdkError(
			"network_error",
			t().api.networkError(url, errMessage(err)),
			{
				url,
			},
		);
	}
	if (!resp.ok) {
		throw mapHttpError(resp.status, await resp.text().catch(() => ""));
	}
	try {
		return (await resp.json()) as T;
	} catch {
		throw new SdkError("server_error", t().api.badResponse(url), {
			url,
			status: resp.status,
		});
	}
}

function apiPost<T>(ctx: ApiContext, path: string, body: unknown): Promise<T> {
	return requestJson<T>(cliEndpoint(ctx.baseUrl, path), {
		method: "POST",
		headers: { ...authHeaders(ctx.apiKey), "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

function apiGet<T>(ctx: ApiContext, path: string): Promise<T> {
	return requestJson<T>(cliEndpoint(ctx.baseUrl, path), {
		headers: authHeaders(ctx.apiKey),
	});
}

// ---------------------------------------------------------------------------
// 工作室接口
// ---------------------------------------------------------------------------

export type Library = "product" | "model";

export type AnalyzeResult = {
	subjects: Array<{ url: string; kind?: string; label?: string }>;
	degraded: boolean;
};

/** 识别 + 抠图，每张 1 积分 */
export function analyzeImage(
	ctx: ApiContext,
	imageUrl: string,
	library: Library,
): Promise<AnalyzeResult> {
	return apiPost<AnalyzeResult>(ctx, "/studio/analyze", { imageUrl, library });
}

export type RunStatus = "running" | "completed" | "failed";

export type RunAccepted = {
	runId: string;
	status: RunStatus;
	kind: "image" | "video";
	tool: string;
	estimatedCredits?: number;
};

export type RunView = {
	runId: string;
	status: RunStatus;
	kind: "image" | "video";
	tool: string;
	urls?: string[];
	error?: string;
};

export function createRun(
	ctx: ApiContext,
	body: Record<string, unknown>,
): Promise<RunAccepted> {
	return apiPost<RunAccepted>(ctx, "/studio/runs", body);
}

export function getRun(ctx: ApiContext, runId: string): Promise<RunView> {
	return apiGet<RunView>(ctx, `/studio/runs/${encodeURIComponent(runId)}`);
}

/** 连续几次连不上服务端才放弃 —— 一等十几分钟，偶尔断一下网不该让整次等待作废 */
const MAX_POLL_NETWORK_ERRORS = 3;

/** 轮询到 completed / failed 返回；超时抛 timeout（带 runId，方便之后 status 续上） */
export async function waitForRun(
	ctx: ApiContext,
	runId: string,
	timeoutMs: number,
): Promise<RunView> {
	const deadline = Date.now() + timeoutMs;
	let networkErrors = 0;
	while (Date.now() < deadline) {
		await sleep(runtime.runPollIntervalMs);
		let view: RunView;
		try {
			view = await getRun(ctx, runId);
			networkErrors = 0;
		} catch (err) {
			if (
				err instanceof SdkError &&
				err.code === "network_error" &&
				++networkErrors <= MAX_POLL_NETWORK_ERRORS
			) {
				debug("poll network error, retrying", err.message);
				continue;
			}
			throw err;
		}
		if (view.status !== "running") return view;
		heartbeat();
	}
	throw new SdkError(
		"timeout",
		t().tools.runTimeout(Math.round(timeoutMs / 1000), runId),
		{ runId },
	);
}
