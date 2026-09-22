import * as fs from "node:fs";
import { type Command, Option } from "commander";
import { CLI_BIN } from "../constants";
import {
	type ApiContext,
	analyzeImage,
	createRun,
	getRun,
	type Library,
	type RunView,
	waitForRun,
} from "../lib/api";
import { type Output, saveOutputs } from "../lib/download";
import {
	emitError,
	failure,
	log,
	type OutputMode,
	type Result,
	SdkError,
	setOutputMode,
	setVerbose,
	success,
} from "../lib/envelope";
import type {
	ImageTool,
	Manifest,
	Quality,
	Resolution,
	StudioTool,
	VideoTool,
} from "../lib/manifest";
import {
	isRemoteUrl,
	isTuftyHosted,
	needsUpload,
	resolveToStorageUrl,
	sameHost,
} from "../lib/upload";
import { t } from "../messages";
import { type GlobalOptions, requireApiContext } from "../utils/config";

export const DEFAULT_TIMEOUT_SECONDS = 900;

/** 一件商品最多几张图（服务端 studioImageBodySchema 同值） */
const MAX_PRODUCT_PARTS = 4;
/**
 * 商品、模特各最多几项（服务端 studioImageBodySchema 同值）。清单里没给这个上限，
 * 但必须在上传前挡住：抠图按张先扣费，等提交任务时才被 400 拒掉就白花积分了。
 */
const MAX_IMAGE_REFERENCES = 8;
/**
 * 一次出图最多几张，同样要在抠图前挡住。
 *
 * 跟着服务端的 config/studio-limits.config.ts 走。这里只能拄一份：CLI 是单独发到
 * npm 的包，不能引主应用的源码。改那边的数时记得回来改这一行 —— 不改也
 * 不会出错，只是 CLI 的预检和服务端的实际上限对不上。
 */
const MAX_IMAGES_PER_RUN = 16;

type CommonOptions = GlobalOptions & {
	notes?: string;
	cutout: boolean;
	dryRun?: boolean;
	wait: boolean;
	timeout: string;
	save?: string;
	format: OutputMode;
};

type ImageOptions = CommonOptions & {
	product?: string[];
	model?: string[];
	quality: string;
	ratio: string;
	count: string;
	enhance?: boolean;
};

type VideoOptions = CommonOptions & {
	still?: string[];
	duration: string;
	ratio: string;
	resolution: string;
	motionVideo?: string;
};

function cheapest<T extends Quality | Resolution>(
	items: T[],
	price: (item: T) => number,
): T | undefined {
	return [...items].sort((a, b) => price(a) - price(b))[0];
}

function formatOption(): Option {
	return new Option("--format <mode>", t().tools.formatOption)
		.choices(["json", "url"])
		.default("json");
}

// ---------------------------------------------------------------------------
// 选项：全部由清单生成
// ---------------------------------------------------------------------------

function addImageOptions(cmd: Command, tool: ImageTool) {
	const m = t().tools;
	const quality = cheapest(tool.qualities, (q) => q.credits);
	const ratioIds = tool.ratios.map((r) => r.id);
	const sizes = tool.ratios
		.filter((r) => r.size)
		.map((r) => `${r.id}=${r.size}`)
		.join(", ");

	cmd
		.addOption(
			new Option(
				"--product <file|url...>",
				m.productOption(tool.requires.products),
			),
		)
		.addOption(
			new Option("--model <file|url...>", m.modelOption(tool.requires.models)),
		)
		.addOption(
			new Option(
				"--quality <id>",
				m.qualityOption(
					tool.qualities.map((q) => `${q.id}=${q.credits}`).join(", "),
				),
			)
				.choices(tool.qualities.map((q) => q.id))
				.default(quality?.id),
		)
		.addOption(
			new Option("--ratio <id>", m.ratioImageOption(sizes))
				.choices(ratioIds)
				.default(ratioIds.includes("auto") ? "auto" : ratioIds[0]),
		)
		.addOption(
			new Option("--count <n>", m.countOption)
				.choices(tool.counts.map(String))
				.default(String(Math.min(...tool.counts))),
		);
	// 只有清单说这个工具有增强提示词时才给开关
	if (tool.enhance) cmd.option("--enhance", m.enhanceOption);
}

function addVideoOptions(cmd: Command, tool: VideoTool) {
	const m = t().tools;
	const resolution = cheapest(tool.resolutions, (r) => r.creditsPerSecond);
	const range =
		tool.minStills === tool.maxStills
			? m.exactly(tool.minStills)
			: `${tool.minStills}-${tool.maxStills}`;

	cmd
		.addOption(new Option("--still <file|url...>", m.stillOption(range)))
		.addOption(
			new Option("--duration <seconds>", m.durationOption)
				.choices(tool.durations.map(String))
				.default(String(tool.durations[0])),
		)
		.addOption(
			new Option("--ratio <id>", m.ratioVideoOption)
				.choices(tool.ratios)
				.default(tool.ratios[0]),
		)
		.addOption(
			new Option(
				"--resolution <id>",
				m.resolutionOption(
					tool.resolutions
						.map((r) => `${r.id}=${r.creditsPerSecond}`)
						.join(", "),
				),
			)
				.choices(tool.resolutions.map((r) => r.id))
				.default(resolution?.id),
		);
	if (tool.motionVideo) {
		cmd.option("--motion-video <file|url>", m.motionVideoOption);
	}
}

function addCommonOptions(cmd: Command) {
	const m = t().tools;
	cmd
		.option("--notes <text>", m.notesOption)
		.option("--no-cutout", m.noCutoutOption)
		.option("--dry-run", m.dryRunOption)
		.option("--no-wait", m.noWaitOption)
		.option(
			"--timeout <seconds>",
			m.timeoutOption,
			String(DEFAULT_TIMEOUT_SECONDS),
		)
		.option("--save <dir>", m.saveOption)
		.addOption(formatOption());
}

// ---------------------------------------------------------------------------
// 校验（全部在上传之前）
// ---------------------------------------------------------------------------

function usage(code: string, message: string, details?: unknown): SdkError {
	return new SdkError(code, message, details, 2);
}

function parseTimeout(raw: string): number {
	const seconds = Number(raw);
	if (!Number.isFinite(seconds) || seconds <= 0) {
		throw usage("usage_error", t().tools.invalidTimeout(raw));
	}
	return seconds;
}

function assertCount(flag: string, got: number, min: number, max: number) {
	if (got < min) {
		throw usage("missing_input", t().tools.missingInput(flag, min, got), {
			flag: `--${flag}`,
			min,
			got,
		});
	}
	if (got > max) {
		throw usage("too_many_inputs", t().tools.tooManyInputs(flag, max, got), {
			flag: `--${flag}`,
			max,
			got,
		});
	}
}

function assertLocalFilesExist(refs: string[]) {
	for (const ref of refs) {
		if (ref.startsWith("data:") || isRemoteUrl(ref)) continue;
		if (!fs.existsSync(ref)) {
			throw usage("file_not_found", t().tools.fileNotFound(ref), { path: ref });
		}
	}
}

/**
 * `--product a.jpg+b.jpg` 是同一件商品的几张图（发给服务端时是嵌套数组）。
 * data: URL（base64 里有 +）和确实存在的本地文件名不拆；地址里本身带 + 的请写成 %2B。
 */
export function parseProducts(values: string[]): Array<string | string[]> {
	return values.map((value) => {
		if (value.startsWith("data:") || fs.existsSync(value)) return value;
		const parts = value
			.split("+")
			.map((part) => part.trim())
			.filter(Boolean);
		if (parts.length > MAX_PRODUCT_PARTS) {
			throw usage(
				"too_many_inputs",
				t().tools.tooManyParts(value, MAX_PRODUCT_PARTS),
				{
					value,
					max: MAX_PRODUCT_PARTS,
				},
			);
		}
		return parts.length === 1 ? (parts[0] as string) : parts;
	});
}

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------

function labelOf(ref: string): string {
	return ref.startsWith("data:") ? "data URL" : ref;
}

/** 上传（需要时）+ 抠图（默认开），返回提交任务用的地址 */
async function prepareImage(
	ctx: ApiContext,
	ref: string,
	library: Library,
	cutout: boolean,
): Promise<string> {
	const m = t().tools;
	const label = labelOf(ref);
	if (needsUpload(ref)) log(m.uploading(label));
	const url = await resolveToStorageUrl(ref, ctx);
	if (!cutout) return url;

	log(m.cuttingOut(label));
	const analyzed = await analyzeImage(ctx, url, library);
	const subjects = analyzed.subjects ?? [];
	if (subjects.length === 0) {
		log(m.cutoutEmpty(label));
		return url;
	}
	// 服务端转存抠图失败时会回供应商的临时地址，提交任务会被 reference_not_allowed 拒掉。
	// 认自家存储上的结果：和这张图同域名，或者是 tufty 的存储域名。只认同域名不够 ——
	// 网站素材库的图在 files.dlazy.com，抠图结果却存到 static.tufty.ai，积分扣了、
	// 结果被丢掉换回原图。
	const subject = subjects.find(
		(s) =>
			typeof s.url === "string" &&
			(sameHost(s.url, url) || isTuftyHosted(s.url)),
	);
	if (!subject) {
		log(m.cutoutNotStored(label));
		return url;
	}
	if (analyzed.degraded) log(m.cutoutDegraded(label));
	return subject.url;
}

/** 运行记录 → 结果信封；失败的任务抛 task_failed（run 和 status 共用） */
export function runResult(view: RunView): Result & { outputs: Output[] } {
	const m = t().tools;
	if (view.status === "failed") {
		throw new SdkError("task_failed", m.runFailed(view.error ?? "unknown"), {
			runId: view.runId,
			tool: view.tool,
			serverCode: view.error,
		});
	}
	const type = view.kind === "video" ? "video" : "image";
	const outputs: Output[] = (view.urls ?? []).map((url) => ({ type, url }));
	if (view.status === "completed") {
		log(m.completed(outputs.length));
		for (const output of outputs) log(`  ${output.url}`);
	}
	return { tool: view.tool, runId: view.runId, status: view.status, outputs };
}

function emitDryRun(
	tool: StudioTool,
	payload: Record<string, unknown>,
	generation: number,
	cutout: number,
): never {
	log(t().tools.costEstimate(generation + cutout, generation, cutout));
	return success({
		tool: tool.id,
		dryRun: true,
		payload,
		estimatedCredits: generation + cutout,
		creditBreakdown: { generation, cutout },
	});
}

async function submitAndFinish(
	ctx: ApiContext,
	tool: StudioTool,
	body: Record<string, unknown>,
	opts: CommonOptions,
	timeoutSeconds: number,
): Promise<never> {
	const m = t().tools;
	const accepted = await createRun(ctx, body);
	log(m.submitted(accepted.runId, accepted.estimatedCredits));

	if (!opts.wait) {
		return success({
			tool: tool.id,
			runId: accepted.runId,
			status: accepted.status ?? "running",
			outputs: [],
		});
	}

	log(m.waiting(accepted.runId));
	const view = await waitForRun(ctx, accepted.runId, timeoutSeconds * 1000);
	const result = runResult({ ...view, tool: view.tool || tool.id });
	if (opts.save) {
		result.outputs = await saveOutputs(result.outputs, opts.save, view.runId);
	}
	return success(result);
}

async function runImageTool(
	tool: ImageTool,
	opts: ImageOptions,
): Promise<void> {
	const timeoutSeconds = parseTimeout(opts.timeout);
	const products = parseProducts(opts.product ?? []);
	const models = opts.model ?? [];
	assertCount(
		"product",
		products.length,
		tool.requires.products,
		MAX_IMAGE_REFERENCES,
	);
	assertCount(
		"model",
		models.length,
		tool.requires.models,
		MAX_IMAGE_REFERENCES,
	);
	const productRefs = products.flat();
	assertLocalFilesExist([...productRefs, ...models]);

	// commander 已按 choices 校验过，这里一定找得到
	const quality = tool.qualities.find((q) => q.id === opts.quality) as Quality;
	const size = tool.ratios.find((r) => r.id === opts.ratio)?.size;
	const count = Number(opts.count);
	const pairs = Math.max(1, products.length) * Math.max(1, models.length);
	if (pairs * count > MAX_IMAGES_PER_RUN) {
		throw usage(
			"too_many_images",
			t().tools.tooManyImages(pairs, count, MAX_IMAGES_PER_RUN),
			{
				pairs,
				count,
				max: MAX_IMAGES_PER_RUN,
			},
		);
	}
	const generation = quality.credits * pairs * count;
	const cutout = opts.cutout ? productRefs.length + models.length : 0;

	const body = (
		productUrls: Array<string | string[]>,
		modelUrls: string[],
	): Record<string, unknown> => ({
		tool: tool.id,
		products: productUrls,
		models: modelUrls,
		...(opts.notes ? { notes: opts.notes } : {}),
		...(size ? { size } : {}),
		count,
		quality: quality.id,
		...(opts.enhance ? { enhance: true } : {}),
	});

	if (opts.dryRun) emitDryRun(tool, body(products, models), generation, cutout);

	log(t().tools.costEstimate(generation + cutout, generation, cutout));
	const ctx = await requireApiContext(opts);
	const [productUrls, modelUrls] = await Promise.all([
		Promise.all(
			products.map((product) =>
				Array.isArray(product)
					? Promise.all(
							product.map((part) =>
								prepareImage(ctx, part, "product", opts.cutout),
							),
						)
					: prepareImage(ctx, product, "product", opts.cutout),
			),
		),
		Promise.all(
			models.map((model) => prepareImage(ctx, model, "model", opts.cutout)),
		),
	]);
	await submitAndFinish(
		ctx,
		tool,
		body(productUrls, modelUrls),
		opts,
		timeoutSeconds,
	);
}

async function runVideoTool(
	tool: VideoTool,
	opts: VideoOptions,
): Promise<void> {
	const timeoutSeconds = parseTimeout(opts.timeout);
	const stills = opts.still ?? [];
	assertCount("still", stills.length, tool.minStills, tool.maxStills);
	assertLocalFilesExist([
		...stills,
		...(opts.motionVideo ? [opts.motionVideo] : []),
	]);

	const seconds = Number(opts.duration);
	const resolution = tool.resolutions.find(
		(r) => r.id === opts.resolution,
	) as Resolution;
	const generation = Math.round(resolution.creditsPerSecond * seconds);
	const cutout = opts.cutout ? stills.length : 0;

	const body = (
		stillUrls: string[],
		motionVideo: string | undefined,
	): Record<string, unknown> => ({
		tool: tool.id,
		stills: stillUrls,
		...(opts.notes ? { notes: opts.notes } : {}),
		...(motionVideo ? { motionVideo } : {}),
		seconds,
		aspectRatio: opts.ratio,
		resolution: resolution.id,
	});

	if (opts.dryRun)
		emitDryRun(tool, body(stills, opts.motionVideo), generation, cutout);

	log(t().tools.costEstimate(generation + cutout, generation, cutout));
	const ctx = await requireApiContext(opts);
	const motionVideo = opts.motionVideo;
	const [stillUrls, motionUrl] = await Promise.all([
		Promise.all(
			stills.map((still) =>
				prepareImage(ctx, still, tool.library, opts.cutout),
			),
		),
		// 参考视频只上传，不抠图
		motionVideo
			? (async () => {
					if (needsUpload(motionVideo)) log(t().tools.uploading(motionVideo));
					return resolveToStorageUrl(motionVideo, ctx);
				})()
			: Promise.resolve(undefined),
	]);
	await submitAndFinish(
		ctx,
		tool,
		body(stillUrls, motionUrl),
		opts,
		timeoutSeconds,
	);
}

// ---------------------------------------------------------------------------
// 注册
// ---------------------------------------------------------------------------

/** 按清单里的一个工具注册 `tufty <id>`，返回命令（技能文档生成脚本复用它拿帮助文本） */
export function registerRunCommand(
	program: Command,
	tool: StudioTool,
): Command {
	const cmd = program
		.command(tool.id)
		.description(`[${tool.kind}] ${tool.name}: ${tool.description}`);
	if (tool.kind === "image") addImageOptions(cmd, tool);
	else addVideoOptions(cmd, tool);
	addCommonOptions(cmd);
	cmd.addHelpText("after", t().tools.helpAfter);

	cmd.action(async (_opts: unknown, command: Command) => {
		const opts = command.optsWithGlobals<CommonOptions>();
		setOutputMode(opts.format);
		if (opts.verbose) setVerbose(true);
		try {
			if (tool.kind === "image") await runImageTool(tool, opts as ImageOptions);
			else await runVideoTool(tool, opts as VideoOptions);
		} catch (err) {
			emitError(err);
		}
	});
	return cmd;
}

function registerToolsNamespace(program: Command, manifest: Manifest) {
	const m = t().tools;
	const ns = program.command("tools").description(m.namespaceDescription);

	ns.command("list")
		.description(m.listDescription)
		.action(() => {
			success({
				tool: "tools.list",
				data: {
					locale: manifest.locale,
					tools: manifest.tools.map((tool) => ({
						id: tool.id,
						kind: tool.kind,
						name: tool.name,
						description: tool.description,
						command: `${CLI_BIN} ${tool.id}`,
					})),
				},
			});
		});

	ns.command("describe")
		.description(m.describeDescription)
		.argument("<id>", m.describeIdArg)
		.action((id: string) => {
			const found = manifest.tools.find((tool) => tool.id === id);
			if (!found) {
				failure(
					"tool_not_found",
					m.toolNotFound(id),
					{ availableTools: manifest.tools.map((tool) => tool.id) },
					2,
				);
			}
			success({ tool: "tools.describe", data: found });
		});
}

export function registerToolCommands(program: Command, manifest: Manifest) {
	registerToolsNamespace(program, manifest);
	for (const tool of manifest.tools) registerRunCommand(program, tool);
}

/** `tufty status <runId> [--wait]` —— 不依赖清单，结果类型取自服务端返回的 kind */
export function registerStatusCommand(program: Command) {
	const m = t().tools;
	program
		.command("status")
		.description(m.statusDescription)
		.argument("<runId>")
		.option("--wait", m.statusWaitOption)
		.option(
			"--timeout <seconds>",
			m.timeoutOption,
			String(DEFAULT_TIMEOUT_SECONDS),
		)
		.addOption(formatOption())
		.addHelpText("after", m.statusHelpAfter)
		.action(async (runId: string, _opts: unknown, command: Command) => {
			const opts = command.optsWithGlobals<
				GlobalOptions & { wait?: boolean; timeout: string; format: OutputMode }
			>();
			setOutputMode(opts.format);
			if (opts.verbose) setVerbose(true);
			try {
				const timeoutSeconds = parseTimeout(opts.timeout);
				const ctx = await requireApiContext(opts);
				let view = await getRun(ctx, runId);
				if (opts.wait && view.status === "running") {
					log(m.waiting(runId));
					view = await waitForRun(ctx, runId, timeoutSeconds * 1000);
				}
				success(runResult(view));
			} catch (err) {
				emitError(err);
			}
		});
}
