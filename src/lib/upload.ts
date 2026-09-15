import * as fs from "node:fs";
import * as path from "node:path";
import { cliEndpoint, TUFTY_STORAGE_HOSTS } from "../constants";
import { t } from "../messages";
import { extensionForMime, getMimeType } from "../utils/utils";
import { type ApiContext, authHeaders, errMessage, requestJson } from "./api";
import { debug, SdkError } from "./envelope";

// 上传前对 mp4/mov（ISO-BMFF）做一次完整性预检：发现被截断（某个 box 声明的大小
// 超出文件末尾）或缺少 moov 原子（索引）就直接拒绝，避免把坏视频传上去后在生成阶段
// 才失败。返回错误描述；结构正常或不是 ISO-BMFF 容器则返回 null（放行）。
export function checkMp4Integrity(buf: Buffer): string | null {
	if (buf.length < 12) return null;
	// 仅校验 ISO-BMFF：必须以 ftyp box 开头，否则是别的容器（webm/avi...），不冒险误判。
	if (buf.toString("latin1", 4, 8) !== "ftyp") return null;

	let offset = 0;
	let sawMoov = false;
	const len = buf.length;
	while (offset + 8 <= len) {
		let size = buf.readUInt32BE(offset);
		const type = buf.toString("latin1", offset + 4, offset + 8);
		let header = 8;
		if (size === 1) {
			if (offset + 16 > len)
				return t().api.videoTruncated(type, 16, len - offset);
			size = Number(buf.readBigUInt64BE(offset + 8));
			header = 16;
		} else if (size === 0) {
			size = len - offset; // 最后一个 box，延伸到文件末尾
		}
		if (size < header) return null; // box 头异常，不误判，交给服务端
		if (type === "moov") sawMoov = true;
		if (offset + size > len) return t().api.videoTruncated(type, size, len);
		offset += size;
	}
	return sawMoov ? null : t().api.videoNoMoov;
}

type SignedUpload = {
	signedUrl?: unknown;
	requiredHeaders?: unknown;
	publicUrl?: unknown;
	path?: unknown;
};

async function putToStorage(
	signedUrl: string,
	buf: Buffer,
	contentType: string,
	requiredHeaders: unknown,
): Promise<void> {
	// 直传对象存储：只带 Content-Type 和服务端要求的头。绝不能带 Authorization ——
	// 一是会泄露 API key，二是和签名 URL 的鉴权冲突。
	const headers = new Headers({ "Content-Type": contentType });
	if (requiredHeaders && typeof requiredHeaders === "object") {
		for (const [key, value] of Object.entries(requiredHeaders)) {
			if (typeof value === "string") headers.set(key, value);
		}
	}
	let resp: Response;
	try {
		resp = await fetch(signedUrl, {
			method: "PUT",
			headers,
			// Buffer 是 Uint8Array 子类，运行时可直接当 BodyInit，强转只为过 TS
			body: buf as unknown as BodyInit,
		});
	} catch (err) {
		throw new SdkError("upload_failed", t().api.uploadFailed(errMessage(err)));
	}
	if (!resp.ok) {
		const text = await resp.text().catch(() => "");
		throw new SdkError(
			"upload_failed",
			t().api.uploadFailed(`storage responded ${resp.status}`),
			{ status: resp.status, body: text.slice(0, 500) },
		);
	}
}

export async function uploadBuffer(
	buf: Buffer,
	filename: string,
	contentType: string,
	ctx: ApiContext,
): Promise<string> {
	if (contentType.startsWith("video/") || /\.(mp4|mov|m4v)$/i.test(filename)) {
		const problem = checkMp4Integrity(buf);
		if (problem) throw new SdkError("invalid_video", problem, { filename }, 2);
	}
	const signed = await requestJson<SignedUpload>(
		cliEndpoint(ctx.baseUrl, "/upload-url"),
		{
			method: "POST",
			headers: {
				...authHeaders(ctx.apiKey),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ filename, contentType }),
		},
	);
	if (
		typeof signed.signedUrl !== "string" ||
		typeof signed.publicUrl !== "string"
	) {
		throw new SdkError(
			"upload_failed",
			t().api.uploadFailed("invalid response from /api/cli/upload-url"),
		);
	}
	await putToStorage(
		signed.signedUrl,
		buf,
		contentType,
		signed.requiredHeaders,
	);
	debug("uploaded", { publicUrl: signed.publicUrl, size: buf.length });
	rememberStorageHost(signed.publicUrl);
	return signed.publicUrl;
}

/**
 * 上传拿到的 publicUrl 所在域名就是当前服务端的存储域名（本地开发是 files.dlazy.com，
 * 线上是 static.tufty.ai）。记下来，之后用户直接给这个域名上的地址也原样透传。
 */
const learnedStorageHosts = new Set<string>();

function hostOf(url: string): string | undefined {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return undefined;
	}
}

function rememberStorageHost(publicUrl: string) {
	const host = hostOf(publicUrl);
	if (host) learnedStorageHosts.add(host);
}

/** 两个地址是否在同一个域名上（抠图结果要和原图在同一个存储上才能提交） */
export function sameHost(a: string, b: string): boolean {
	const host = hostOf(a);
	return host !== undefined && host === hostOf(b);
}

export function parseDataUrl(dataUrl: string): { mime: string; buf: Buffer } {
	const commaIdx = dataUrl.indexOf(",");
	if (!dataUrl.startsWith("data:") || commaIdx === -1) {
		throw new SdkError("invalid_input", `invalid data URL`, undefined, 2);
	}
	const segments = dataUrl.slice(5, commaIdx).split(";");
	const data = dataUrl.slice(commaIdx + 1);
	const mime = segments[0] || "application/octet-stream";
	const buf =
		segments[segments.length - 1] === "base64"
			? Buffer.from(data, "base64")
			: Buffer.from(decodeURIComponent(data), "utf8");
	return { mime, buf };
}

export function isRemoteUrl(ref: string): boolean {
	return /^https?:\/\//i.test(ref);
}

export function isTuftyHosted(ref: string): boolean {
	const host = hostOf(ref);
	return (
		host !== undefined &&
		(TUFTY_STORAGE_HOSTS.has(host) || learnedStorageHosts.has(host))
	);
}

/** 这个输入要不要真的上传（tufty 自家存储上的地址不用） */
export function needsUpload(ref: string): boolean {
	return !(isRemoteUrl(ref) && isTuftyHosted(ref));
}

async function downloadRemote(
	url: string,
): Promise<{ buf: Buffer; filename: string; contentType: string }> {
	let resp: Response;
	try {
		// 第三方地址，不带任何 tufty 请求头
		resp = await fetch(url);
	} catch (err) {
		throw new SdkError(
			"download_failed",
			t().api.remoteDownloadFailed(url, errMessage(err)),
			{ url },
		);
	}
	if (!resp.ok) {
		throw new SdkError(
			"download_failed",
			t().api.remoteDownloadFailed(url, `HTTP ${resp.status}`),
			{ url, status: resp.status },
		);
	}
	const buf = Buffer.from(await resp.arrayBuffer());
	let name = "";
	try {
		name = path.posix.basename(new URL(url).pathname);
	} catch {
		/* 用默认名 */
	}
	const headerType = resp.headers.get("content-type")?.split(";")[0]?.trim();
	const contentType =
		headerType && headerType !== "application/octet-stream"
			? headerType
			: getMimeType(name);
	if (!path.extname(name)) {
		const ext = extensionForMime(contentType);
		name = `${name || "remote"}${ext ? `.${ext}` : ""}`;
	}
	return { buf, filename: name, contentType };
}

/**
 * 把一个输入变成服务端认可的 tufty 存储地址：
 *  - 本地路径 / data: URL → 上传
 *  - static.tufty.ai、files.dlazy.com 上的地址 → 原样返回
 *  - 其他 http(s) 地址 → 先下载再上传（服务端不收外链）
 */
export async function resolveToStorageUrl(
	ref: string,
	ctx: ApiContext,
): Promise<string> {
	if (ref.startsWith("data:")) {
		const { mime, buf } = parseDataUrl(ref);
		const sub = (mime.split("/")[1] || "bin").replace(/^x-/, "");
		return uploadBuffer(
			buf,
			`upload.${sub === "jpeg" ? "jpg" : sub}`,
			mime,
			ctx,
		);
	}
	if (isRemoteUrl(ref)) {
		if (isTuftyHosted(ref)) return ref;
		const remote = await downloadRemote(ref);
		return uploadBuffer(remote.buf, remote.filename, remote.contentType, ctx);
	}
	if (!fs.existsSync(ref)) {
		throw new SdkError(
			"file_not_found",
			t().tools.fileNotFound(ref),
			{ path: ref },
			2,
		);
	}
	return uploadBuffer(
		fs.readFileSync(ref),
		path.basename(ref),
		getMimeType(ref),
		ctx,
	);
}
