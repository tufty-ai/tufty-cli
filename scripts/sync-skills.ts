/**
 * 按工具清单生成 skills/tufty-<id>/SKILL.md（英文）与 SKILL-cn.md（中文），
 * 以及 skills/README.md 索引和 skills/skills.txt。
 *
 *   npm run skills:sync             # 从 TUFTY_BASE_URL（默认 https://tufty.ai）拉 en-US / zh-CN 两份清单
 *   npm run skills:sync:fixtures    # 用 tests/fixtures/tools.*.json
 *   npx tsx scripts/sync-skills.ts --manifest <file> --manifest <file>   # 语言取文件里的 locale
 *
 * Usage 段就是 commander 为该工具生成的 `-h` 文本（和 CLI 用同一个 registerRunCommand），
 * flag 一个不差。示例命令里的 flag 会对照真实选项校验，写错直接报错退出。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { Command } from "commander";
import {
	DEFAULT_TIMEOUT_SECONDS,
	registerRunCommand,
} from "../src/commands/tools";
import {
	API_KEY_URL,
	CLI_BIN,
	CLI_VERSION,
	cliEndpoint,
	PACKAGE_NAME,
	RECHARGE_URL,
	REPO_URL,
	resolveBaseUrl,
	SITE_URL,
} from "../src/constants";
import type { Manifest, StudioTool } from "../src/lib/manifest";
import { type Locale, setLocale, t } from "../src/messages";
import { SKILL_CONTENT, type SkillContent } from "./skill-content";

const SKILLS_DIR = path.join(__dirname, "..", "skills");
const DISPLAY_NAMES: Record<string, string> = JSON.parse(
	fs.readFileSync(path.join(__dirname, "skill-display-names.json"), "utf8"),
).names;

const SKILL_AUTHOR = "tufty.ai";
/** 和 package.json、仓库里的 LICENSE 一致。 */
const SKILL_LICENSE = "AGPL-3.0-or-later";
/** 固定帮助文本宽度，避免生成结果随终端宽度变化 */
const HELP_WIDTH = 120;
const GLOBAL_FLAGS = new Set([
	"--api-key",
	"--base-url",
	"--lang",
	"-l",
	"--verbose",
	"--refresh-manifest",
]);
const SAMPLE_RUN_ID = "3f6c2a1e-8b4d-4e7a-9c55-0d2b7e1f4a90";

type Lang = "en" | "zh";
const LOCALE_OF: Record<Lang, Locale> = { en: "en-US", zh: "zh-CN" };

async function readManifests(): Promise<Record<Locale, Manifest>> {
	const args = process.argv.slice(2);
	const files = args.flatMap((arg, i) =>
		arg === "--manifest" && args[i + 1] ? [args[i + 1] as string] : [],
	);
	const manifests: Partial<Record<Locale, Manifest>> = {};

	if (files.length > 0) {
		for (const file of files) {
			const manifest = JSON.parse(
				fs.readFileSync(path.resolve(file), "utf8"),
			) as Manifest;
			manifests[manifest.locale] = manifest;
		}
	} else {
		const baseUrl = resolveBaseUrl();
		for (const locale of ["en-US", "zh-CN"] as const) {
			const url = `${cliEndpoint(baseUrl, "/studio/tools")}?locale=${locale}`;
			console.log(`Fetching ${url}`);
			const resp = await fetch(url, {
				headers: { "X-CLI-Version": CLI_VERSION, "Accept-Language": locale },
			});
			if (!resp.ok)
				throw new Error(`${url} -> HTTP ${resp.status}: ${await resp.text()}`);
			manifests[locale] = (await resp.json()) as Manifest;
		}
	}

	if (!manifests["en-US"] || !manifests["zh-CN"]) {
		throw new Error(
			"Need both an en-US and a zh-CN manifest (pass --manifest twice).",
		);
	}
	return manifests as Record<Locale, Manifest>;
}

/** 按指定语言注册一次命令，拿到和 `tufty <id> -h` 完全一致的帮助文本 */
function helpFor(
	tool: StudioTool,
	locale: Locale,
): { command: Command; text: string } {
	setLocale(locale);
	const program = new Command()
		.name(CLI_BIN)
		.configureHelp({ helpWidth: HELP_WIDTH });
	const command = registerRunCommand(program, tool);
	return {
		command,
		text: `${command.helpInformation()}${t().tools.helpAfter}`.trimEnd(),
	};
}

function tokenize(command: string): string[] {
	return command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}

function validateExamples(
	tool: StudioTool,
	command: Command,
	content: SkillContent,
) {
	const known = new Set<string>(["-h", "--help", ...GLOBAL_FLAGS]);
	for (const option of command.options) {
		if (option.long) known.add(option.long);
		if (option.short) known.add(option.short);
	}
	for (const example of content.examples) {
		for (const line of [example.command, example.commandZh].filter(
			Boolean,
		) as string[]) {
			const tokens = tokenize(line);
			if (tokens[0] !== CLI_BIN)
				throw new Error(
					`${tool.id}: example must start with "${CLI_BIN}": ${line}`,
				);
			if (tokens[1] === "status") continue;
			if (tokens[1] !== tool.id)
				throw new Error(`${tool.id}: example runs another command: ${line}`);
			for (const token of tokens.slice(2)) {
				if (!token.startsWith("-")) continue;
				const flag = token.split("=")[0] as string;
				if (!known.has(flag))
					throw new Error(
						`${tool.id}: example uses unknown flag ${flag}: ${line}`,
					);
			}
		}
	}
}

function pricing(tool: StudioTool, lang: Lang): string {
	if (tool.kind === "image") {
		const list = tool.qualities.map((q) => `${q.id}=${q.credits}`).join(", ");
		return lang === "en"
			? `credits per output image: ${list}. Total = quality credits x (products x models) x \`--count\`, plus 1 credit per input image cut out`
			: `每张成品积分：${list}。总价 = 画质单价 x（商品数 x 模特数）x \`--count\`，另加每张抠图输入图 1 积分`;
	}
	const list = tool.resolutions
		.map((r) => `${r.id}=${r.creditsPerSecond}`)
		.join(", ");
	const cheapest = [...tool.resolutions].sort(
		(a, b) => a.creditsPerSecond - b.creditsPerSecond,
	)[0];
	const seconds = tool.durations[0] ?? 5;
	const sample = cheapest ? Math.round(cheapest.creditsPerSecond * seconds) : 0;
	return lang === "en"
		? `credits per second: ${list}. Total = round(credits per second x \`--duration\`), plus 1 credit per still cut out (e.g. ${seconds}s at ${cheapest?.id} = ${sample} credits + cutouts)`
		: `每秒积分：${list}。总价 = round(每秒单价 x \`--duration\`)，另加每张抠图静帧 1 积分（例如 ${cheapest?.id} ${seconds} 秒 = ${sample} 积分 + 抠图）`;
}

function frontmatter(
	tool: StudioTool,
	lang: Lang,
	content: SkillContent,
): string {
	const description =
		lang === "en"
			? `${content.description.en} ${content.description.zh}`
			: `${content.description.zh} ${content.description.en}`;
	const systemPrompt =
		lang === "en"
			? `When invoking this skill, use ${CLI_BIN} ${tool.id} -h for help.`
			: `当调用此技能时，可以使用 ${CLI_BIN} ${tool.id} -h 查看帮助信息。`;
	const metadata = {
		clawdbot: {
			emoji: content.emoji,
			requires: { bins: ["npm", "npx"] },
			install: `npm install -g ${PACKAGE_NAME}@${CLI_VERSION}`,
			installAlternative: `npx ${PACKAGE_NAME}@${CLI_VERSION}`,
			homepage: SITE_URL,
			source: REPO_URL,
			author: SKILL_AUTHOR,
			license: SKILL_LICENSE,
			npm: `https://www.npmjs.com/package/${PACKAGE_NAME}`,
			configLocation: "~/.tufty/config.json",
			apiEndpoints: ["tufty.ai", "static.tufty.ai"],
		},
		openclaw: { systemPrompt },
	};
	return [
		"---",
		`name: tufty-${tool.id}`,
		`version: ${CLI_VERSION}`,
		`description: ${JSON.stringify(description)}`,
		`metadata: ${JSON.stringify(metadata)}`,
		"---",
	].join("\n");
}

function authBlock(lang: Lang): string {
	if (lang === "en") {
		return `## Authentication

All requests require a tufty.ai API key. The recommended way to authenticate is:

\`\`\`bash
tufty login
\`\`\`

This runs a device-code flow: it opens an authorization page in the browser and also prints the link, so it works in remote shells too. Once approved, the CLI **automatically saves your API key** to its local config.

### Alternative: Set the Key Manually

If you already have an API key, save it directly:

\`\`\`bash
tufty auth set YOUR_API_KEY
\`\`\`

The key is stored in \`~/.tufty/config.json\` (\`%USERPROFILE%\\.tufty\\config.json\` on Windows), readable only by your OS user. You can also pass it per invocation with \`--api-key\` or the \`TUFTY_API_KEY\` environment variable. Lookup order: \`--api-key\` → \`TUFTY_API_KEY\` → config file → interactive login (terminals only, never in CI).

### Getting Your API Key Manually

1. Sign in or create an account at [tufty.ai](${SITE_URL})
2. Open [${API_KEY_URL.replace("https://", "")}](${API_KEY_URL}) (also linked from the user menu)
3. Copy the key; it starts with \`sk-\`

Keys can be **rotated or revoked at any time** from the same page.`;
	}
	return `## 身份验证 (Authentication)

所有请求都需要 tufty.ai API 密钥。**推荐使用** \`tufty login\` 登录：

\`\`\`bash
tufty login
\`\`\`

该命令使用设备码流程：在浏览器中打开授权页，同时把链接打印出来，远程终端也能用。授权完成后 **自动把 API 密钥写入本地 CLI 配置**，无需手动复制粘贴。

### 备选：手动设置 API 密钥

如果你已有 API 密钥，可以直接保存：

\`\`\`bash
tufty auth set YOUR_API_KEY
\`\`\`

密钥保存在 \`~/.tufty/config.json\`（Windows 上为 \`%USERPROFILE%\\.tufty\\config.json\`），仅当前系统用户可读。也可以每次用 \`--api-key\` 或 \`TUFTY_API_KEY\` 环境变量传入。查找顺序：\`--api-key\` → \`TUFTY_API_KEY\` → 配置文件 → 交互式登录（仅限终端，CI 中不会触发）。

### 手动获取 API 密钥

1. 登录或在 [tufty.ai](${SITE_URL}) 注册账号
2. 打开 [${API_KEY_URL.replace("https://", "")}](${API_KEY_URL})（用户菜单里的「API 密钥」）
3. 复制密钥，以 \`sk-\` 开头

密钥可以在同一页面**随时轮换或吊销**。`;
}

function provenanceBlock(lang: Lang): string {
	if (lang === "en") {
		return `## About & Provenance

- **Homepage**: [tufty.ai](${SITE_URL})
- **Source code**: [${REPO_URL.replace("https://", "")}](${REPO_URL}) (${SKILL_LICENSE})
- **Maintainer**: ${SKILL_AUTHOR}
- **npm package**: \`${PACKAGE_NAME}\` (pinned to \`${CLI_VERSION}\` in this skill's install spec)
- **Config file**: \`~/.tufty/config.json\`

You can run it on demand without a global install:

\`\`\`bash
npx ${PACKAGE_NAME}@${CLI_VERSION} <command>
\`\`\`

Or install globally with the exact pinned version declared in \`metadata.clawdbot.install\`: \`npm install -g ${PACKAGE_NAME}@${CLI_VERSION}\`.`;
	}
	return `## 关于与来源 (Provenance)

- **官网**: [tufty.ai](${SITE_URL})
- **源码**: [${REPO_URL.replace("https://", "")}](${REPO_URL})（${SKILL_LICENSE} 许可）
- **维护者**: ${SKILL_AUTHOR}
- **npm 包名**: \`${PACKAGE_NAME}\`（本技能 install 字段固定到 \`${CLI_VERSION}\` 版本）
- **配置文件**: \`~/.tufty/config.json\`

不想全局安装的话，可以按需运行：

\`\`\`bash
npx ${PACKAGE_NAME}@${CLI_VERSION} <command>
\`\`\`

如需全局安装，\`metadata.clawdbot.install\` 已固定版本：\`npm install -g ${PACKAGE_NAME}@${CLI_VERSION}\`。`;
}

function howItWorksBlock(tool: StudioTool, lang: Lang): string {
	const motion = tool.kind === "video" && tool.motionVideo;
	if (lang === "en") {
		const inputs =
			tool.kind === "image"
				? "`--product` / `--model` images"
				: `\`--still\` images${motion ? " and the `--motion-video` reference" : ""}`;
		return `## How It Works

This skill is a thin client over the tufty.ai hosted API. When you invoke it:

- The ${inputs} you pass can be local paths, \`data:\` URLs or http(s) URLs. Local files and data URLs are uploaded to tufty storage (\`static.tufty.ai\`). URLs already on tufty storage are used as-is; any other URL is downloaded by the CLI and re-uploaded, because the service only accepts images hosted on tufty storage.
- Every input image first goes through **automatic subject cutout, which costs 1 credit per image**. Pass \`--no-cutout\` to skip it and use the uploaded image as-is.${motion ? " The reference motion video is uploaded as-is and never cut out." : ""}
- The CLI then submits the run to \`tufty.ai\` and polls every 3 seconds until it completes (up to \`--timeout\`, default ${DEFAULT_TIMEOUT_SECONDS} seconds). \`--no-wait\` returns the \`runId\` immediately.
- Generated outputs are hosted on \`static.tufty.ai\`; \`--save <dir>\` downloads them.
- Pricing: ${pricing(tool, "en")}. \`--dry-run\` prints the exact request and the estimate without uploading or charging anything.

Your API key is only sent to \`tufty.ai\`; it is never attached to storage uploads or downloads. See [tufty.ai](${SITE_URL}) for the full service terms.`;
	}
	const inputs =
		tool.kind === "image"
			? "`--product` / `--model` 图片"
			: `\`--still\` 静帧${motion ? "和 `--motion-video` 参考视频" : ""}`;
	return `## 工作原理

此技能是 tufty.ai 托管 API 的轻量封装。调用时：

- 你传入的${inputs}可以是本地路径、\`data:\` URL 或 http(s) 地址。本地文件和 data URL 会上传到 tufty 存储（\`static.tufty.ai\`）；已经在 tufty 存储上的地址原样使用；其他地址由 CLI 先下载再上传，因为服务端只接受托管在 tufty 存储上的图片。
- 每张输入图都会先做**自动抠图，每张消耗 1 积分**。加 \`--no-cutout\` 可跳过，直接使用上传的原图。${motion ? "参考视频原样上传，不做抠图。" : ""}
- 随后 CLI 把任务提交到 \`tufty.ai\`，每 3 秒轮询一次直到完成（最长 \`--timeout\`，默认 ${DEFAULT_TIMEOUT_SECONDS} 秒）。\`--no-wait\` 会立即返回 \`runId\`。
- 生成的成品托管在 \`static.tufty.ai\`；\`--save <dir>\` 可下载到本地。
- 价格：${pricing(tool, "zh")}。\`--dry-run\` 只打印请求内容和预估积分，不上传、不扣费。

API 密钥只会发送给 \`tufty.ai\`，不会附加到存储上传或下载请求上。完整服务条款见 [tufty.ai](${SITE_URL})。`;
}

function outputBlock(tool: StudioTool, lang: Lang): string {
	const ext = tool.kind === "video" ? "mp4" : "png";
	const sample = JSON.stringify(
		{
			ok: true,
			result: {
				tool: tool.id,
				runId: SAMPLE_RUN_ID,
				status: "completed",
				outputs: [
					{
						type: tool.kind,
						url: `https://static.tufty.ai/studio/${SAMPLE_RUN_ID}/result.${ext}`,
					},
				],
			},
		},
		null,
		2,
	);
	const notes =
		lang === "en"
			? [
					'With `--no-wait`: `status` is `"running"` and `outputs` is `[]`; fetch the result later with `tufty status <runId> --wait`.',
					"With `--save <dir>`: each output also carries `path`, the absolute local file path.",
					"With `--format url`: stdout is just the output URLs, one per line.",
					"`--dry-run` returns `{ tool, dryRun: true, payload, estimatedCredits, creditBreakdown: { generation, cutout } }`.",
					'Errors: `{ "ok": false, "code": "...", "message": "...", "details": { ... } }` with exit code 1 (exit code 2 for invalid flags or inputs). Progress logs go to stderr, never stdout.',
				]
			: [
					'配合 `--no-wait`：`status` 为 `"running"`，`outputs` 为 `[]`；之后用 `tufty status <runId> --wait` 取结果。',
					"配合 `--save <dir>`：每个成品额外带 `path`，即本地文件的绝对路径。",
					"配合 `--format url`：标准输出只有成品地址，每行一个。",
					"`--dry-run` 返回 `{ tool, dryRun: true, payload, estimatedCredits, creditBreakdown: { generation, cutout } }`。",
					'失败时：`{ "ok": false, "code": "...", "message": "...", "details": { ... } }`，退出码 1（参数或输入不合法时为 2）。进度日志只写标准错误，不会混进标准输出。',
				];
	return `${lang === "en" ? "## Output Format" : "## 输出格式"}

\`\`\`json
${sample}
\`\`\`

${notes.map((n) => `> - ${n}`).join("\n")}`;
}

function examplesBlock(content: SkillContent, lang: Lang): string {
	const body = content.examples
		.map(
			(e) =>
				`# ${e.title[lang]}\n${lang === "zh" ? (e.commandZh ?? e.command) : e.command}`,
		)
		.join("\n\n");
	return `${lang === "en" ? "## Examples" : "## 命令示例"}

\`\`\`bash
${body}
\`\`\``;
}

function errorBlock(lang: Lang): string {
	const upgrade = `npm install -g ${PACKAGE_NAME}@latest`;
	if (lang === "en") {
		return `## Error Handling

| Code | When | What to do |
| ---- | ---- | ---------- |
| \`no_api_key\` / \`unauthorized\` | No API key found, or the key is invalid (HTTP 401) | Get a key at ${API_KEY_URL}, run \`tufty auth set <key>\` (or \`tufty login\`), then retry |
| \`insufficient_balance\` | Not enough credits (HTTP 402; \`details.required\` = credits needed) | Top up at ${RECHARGE_URL} |
| \`missing_input\` / \`too_many_inputs\` / \`too_many_images\` / \`file_not_found\` / \`invalid_video\` / \`usage_error\` | Invalid flags or inputs, rejected before anything is uploaded (exit code 2) | Fix the command; see \`tufty <tool> -h\` |
| \`invalid_request\` | Server rejected the request (HTTP 400; \`details.serverCode\`, e.g. \`unknown_template\`, \`reference_not_allowed\`) | Check the inputs; \`tufty tools describe <tool>\` shows the current options |
| \`cli_version_too_low\` | CLI is older than the server accepts (HTTP 426) | \`${upgrade}\`, then retry |
| \`task_failed\` | Generation failed on the server (\`details.serverCode\`) | Retry, or change the input images / \`--notes\` |
| \`timeout\` | Run not finished within \`--timeout\` (\`details.runId\`) | \`tufty status <runId> --wait\` |
| \`not_found\` | Unknown \`runId\` (HTTP 404) | Check the runId |
| \`server_error\` / \`network_error\` / \`upload_failed\` / \`download_failed\` | Server, storage or network problem | Retry later |

> **AGENT CRITICAL INSTRUCTION**:
> 1. If the execution result returns \`code: "insufficient_balance"\`, you MUST explicitly inform the user that their credits are insufficient and guide them to recharge: [${RECHARGE_URL}](${RECHARGE_URL})
> 2. If the execution result returns \`code: "unauthorized"\` or \`code: "no_api_key"\`, you MUST inform the user to get their API key from [${API_KEY_URL}](${API_KEY_URL}) and save it using \`tufty auth set <key>\`, then resume the task.`;
	}
	return `## 错误处理

| Code | 场景 | 处理方式 |
| ---- | ---- | -------- |
| \`no_api_key\` / \`unauthorized\` | 没有 API 密钥，或密钥无效（HTTP 401） | 到 ${API_KEY_URL} 获取密钥，运行 \`tufty auth set <key>\`（或 \`tufty login\`）后重试 |
| \`insufficient_balance\` | 积分不足（HTTP 402；\`details.required\` 为所需积分） | 前往 ${RECHARGE_URL} 充值 |
| \`missing_input\` / \`too_many_inputs\` / \`too_many_images\` / \`file_not_found\` / \`invalid_video\` / \`usage_error\` | 参数或输入不合法，在上传前就被拒绝（退出码 2） | 修正命令；参见 \`tufty <tool> -h\` |
| \`invalid_request\` | 服务端拒绝请求（HTTP 400；\`details.serverCode\`，如 \`unknown_template\`、\`reference_not_allowed\`） | 检查输入；\`tufty tools describe <tool>\` 可查看当前选项 |
| \`cli_version_too_low\` | CLI 版本低于服务端要求（HTTP 426） | 运行 \`${upgrade}\` 后重试 |
| \`task_failed\` | 服务端生成失败（\`details.serverCode\`） | 重试，或更换输入图片 / \`--notes\` |
| \`timeout\` | 在 \`--timeout\` 内未完成（\`details.runId\`） | \`tufty status <runId> --wait\` |
| \`not_found\` | runId 不存在（HTTP 404） | 检查 runId |
| \`server_error\` / \`network_error\` / \`upload_failed\` / \`download_failed\` | 服务端、存储或网络问题 | 稍后重试 |

> **智能体关键指令**:
> 1. 如果执行结果返回 \`code: "insufficient_balance"\`，您必须明确告知用户当前积分不足，并引导用户点击以下链接前往充值：[${RECHARGE_URL}](${RECHARGE_URL})
> 2. 如果执行结果返回 \`code: "unauthorized"\` 或 \`code: "no_api_key"\`，您必须明确告知用户前往 [${API_KEY_URL}](${API_KEY_URL}) 获取 API 密钥并使用 \`tufty auth set <key>\` 保存，然后继续执行任务。`;
}

function tipsBlock(content: SkillContent, lang: Lang): string {
	const tips =
		lang === "en"
			? [
					...content.tips.en,
					"Run with `--dry-run` first when the user has not confirmed the credit cost.",
					`Visit ${SITE_URL} for more information.`,
				]
			: [
					...content.tips.zh,
					"用户还没确认积分花费时，先加 `--dry-run` 预估。",
					`更多信息请访问 ${SITE_URL}。`,
				];
	return `## Tips\n\n${tips.map((tip) => `- ${tip}`).join("\n")}`;
}

function renderSkill(
	tool: StudioTool,
	lang: Lang,
	content: SkillContent,
	help: string,
): string {
	const slug = `tufty-${tool.id}`;
	const keywords =
		lang === "en"
			? [...content.keywords.en, ...content.keywords.zh]
			: [...content.keywords.zh, ...content.keywords.en];
	const sections = [
		frontmatter(tool, lang, content),
		`# ${DISPLAY_NAMES[slug]}`,
		"[English](./SKILL.md) · [中文](./SKILL-cn.md)",
		`${tool.description} ${lang === "en" ? content.description.en : content.description.zh}`,
		`${lang === "en" ? "## Trigger Keywords" : "## 触发关键词"}\n\n${[...keywords, tool.id].map((k) => `- ${k}`).join("\n")}`,
		authBlock(lang),
		provenanceBlock(lang),
		howItWorksBlock(tool, lang),
		`${lang === "en" ? "## Usage" : "## 使用方法"}

**CRITICAL INSTRUCTION FOR AGENT**:
${lang === "en" ? `Execute \`tufty ${tool.id}\` to get the result.` : `执行 \`tufty ${tool.id}\` 命令获取结果。`}

\`\`\`bash
tufty ${tool.id} -h

${help}
\`\`\``,
		outputBlock(tool, lang),
		examplesBlock(content, lang),
		errorBlock(lang),
		tipsBlock(content, lang),
	];
	return `${sections.join("\n\n")}\n`;
}

function priceSummary(tool: StudioTool): string {
	return tool.kind === "image"
		? `${tool.qualities.map((q) => `${q.id} ${q.credits}`).join(" / ")} credits per image`
		: `${tool.resolutions.map((r) => `${r.id} ${r.creditsPerSecond}`).join(" / ")} credits per second`;
}

function renderIndex(manifest: Manifest): string {
	const rows = manifest.tools
		.map((tool) => {
			const slug = `tufty-${tool.id}`;
			return `| [${slug}](./${slug}) | ${DISPLAY_NAMES[slug]} | ${tool.kind} | ${tool.description} | ${priceSummary(tool)} |`;
		})
		.join("\n");
	return `# tufty.ai Agent Skills

Skills for publishing to ClawHub, one per tufty.ai studio tool. They are generated by \`scripts/sync-skills.ts\` from the tool manifest; do not edit them by hand.

Every skill drives the [\`${PACKAGE_NAME}\`](https://www.npmjs.com/package/${PACKAGE_NAME}) command-line tool:

\`\`\`bash
npm install -g ${PACKAGE_NAME}@${CLI_VERSION}
tufty login
\`\`\`

| Skill | Display name | Type | What it does | Pricing |
| ----- | ------------ | ---- | ------------ | ------- |
${rows}

All tools also charge 1 credit per input image for the automatic cutout (skip with \`--no-cutout\`). Prices come from the live manifest at generation time; \`tufty tools describe <tool>\` always shows the current ones.
`;
}

async function main() {
	const manifests = await readManifests();
	const en = manifests["en-US"];
	const zh = manifests["zh-CN"];

	const ids = en.tools.map((tool) => tool.id);
	const problems: string[] = [];
	for (const id of ids) {
		if (!SKILL_CONTENT[id])
			problems.push(`scripts/skill-content.ts has no entry for "${id}"`);
		if (!DISPLAY_NAMES[`tufty-${id}`])
			problems.push(
				`scripts/skill-display-names.json has no name for "tufty-${id}"`,
			);
		if (!zh.tools.some((tool) => tool.id === id))
			problems.push(`zh-CN manifest is missing "${id}"`);
	}
	if (problems.length > 0) {
		console.error(problems.join("\n"));
		process.exit(1);
	}

	fs.mkdirSync(SKILLS_DIR, { recursive: true });
	for (const toolEn of en.tools) {
		const toolZh = zh.tools.find((tool) => tool.id === toolEn.id) as StudioTool;
		const content = SKILL_CONTENT[toolEn.id] as SkillContent;
		const helpEn = helpFor(toolEn, LOCALE_OF.en);
		const helpZh = helpFor(toolZh, LOCALE_OF.zh);
		validateExamples(toolEn, helpEn.command, content);

		const dir = path.join(SKILLS_DIR, `tufty-${toolEn.id}`);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "SKILL.md"),
			renderSkill(toolEn, "en", content, helpEn.text),
		);
		fs.writeFileSync(
			path.join(dir, "SKILL-cn.md"),
			renderSkill(toolZh, "zh", content, helpZh.text),
		);
		console.log(`Wrote skills/tufty-${toolEn.id}`);
	}

	fs.writeFileSync(path.join(SKILLS_DIR, "README.md"), renderIndex(en));
	fs.writeFileSync(
		path.join(SKILLS_DIR, "skills.txt"),
		`${ids.map((id) => `tufty-${id}`).join("\n")}\n`,
	);

	const stale = fs
		.readdirSync(SKILLS_DIR, { withFileTypes: true })
		.filter(
			(d) => d.isDirectory() && !ids.includes(d.name.replace(/^tufty-/, "")),
		)
		.map((d) => d.name);
	if (stale.length > 0)
		console.warn(
			`Not in the manifest any more (delete by hand if intended): ${stale.join(", ")}`,
		);
	console.log(`Done: ${ids.length} skills.`);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
