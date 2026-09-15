import * as http from "node:http";
import type { AddressInfo } from "node:net";

/** 一个 node:http 写的假服务端：记录每个请求，按 "METHOD /path" 路由（末尾 * 表示前缀匹配） */

export type RecordedRequest = {
	method: string;
	path: string;
	query: URLSearchParams;
	headers: http.IncomingHttpHeaders;
	body: Buffer;
	json: any;
};

export type Reply = {
	status?: number;
	json?: unknown;
	body?: string | Buffer;
	headers?: Record<string, string>;
};

export type Handler = (req: RecordedRequest) => Reply | Promise<Reply>;

export type MockServer = {
	url: string;
	requests: RecordedRequest[];
	route: (key: string, handler: Handler) => void;
	find: (key: string) => RecordedRequest[];
	close: () => Promise<void>;
};

function keyMatches(key: string, method: string, path: string): boolean {
	const [keyMethod, keyPath = ""] = key.split(" ");
	if (keyMethod !== method) return false;
	return keyPath.endsWith("*")
		? path.startsWith(keyPath.slice(0, -1))
		: path === keyPath;
}

export async function startMockServer(): Promise<MockServer> {
	const routes = new Map<string, Handler>();
	const requests: RecordedRequest[] = [];

	const server = http.createServer(async (req, res) => {
		const chunks: Buffer[] = [];
		for await (const chunk of req) chunks.push(chunk as Buffer);
		const body = Buffer.concat(chunks);
		const url = new URL(req.url ?? "/", "http://localhost");
		let json: unknown;
		try {
			json = body.length ? JSON.parse(body.toString("utf8")) : undefined;
		} catch {
			json = undefined;
		}
		const recorded: RecordedRequest = {
			method: req.method ?? "GET",
			path: url.pathname,
			query: url.searchParams,
			headers: req.headers,
			body,
			json,
		};
		requests.push(recorded);

		// 精确路由优先，其次前缀路由
		const handler =
			routes.get(`${recorded.method} ${recorded.path}`) ??
			[...routes.entries()].find(([key]) =>
				keyMatches(key, recorded.method, recorded.path),
			)?.[1];
		const reply: Reply = handler
			? await handler(recorded)
			: { status: 404, json: { error: "not_found", message: "no mock route" } };

		const status = reply.status ?? 200;
		if (reply.json !== undefined) {
			res.writeHead(status, {
				"Content-Type": "application/json",
				...reply.headers,
			});
			res.end(JSON.stringify(reply.json));
		} else {
			res.writeHead(status, reply.headers);
			res.end(reply.body ?? "");
		}
	});

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;

	return {
		url: `http://127.0.0.1:${port}`,
		requests,
		route: (key, handler) => routes.set(key, handler),
		find: (key) => requests.filter((r) => keyMatches(key, r.method, r.path)),
		close: () =>
			new Promise<void>((resolve) => {
				// fetch 用的是 keep-alive 连接，不强关的话 close 会一直等
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	};
}
