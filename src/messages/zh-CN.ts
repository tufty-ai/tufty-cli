import type { Messages } from "./types";

export const messages: Messages = {
	cli: {
		description:
			"在终端里使用 tufty.ai 工作室工具。标准输出返回 JSON 信封，进度写入标准错误。",
		apiKeyOption: "API 密钥（优先级高于 TUFTY_API_KEY 和配置文件）",
		baseUrlOption: "API 地址（优先级高于 TUFTY_BASE_URL）",
		verboseOption: "在标准错误中输出调试日志",
		refreshManifestOption: "跳过 10 分钟的本地工具清单缓存，直接从服务器拉取",
		langOption: "输出语言（en-US 或 zh-CN），会记住供之后使用",
		unsupportedLocale: (locale, supported) =>
			`不支持的语言：${locale}。可选：${supported}`,
		unknownCommand: (name) => `未知命令 '${name}'`,
		manifestUnavailable: (baseUrl) =>
			`无法从 ${baseUrl} 获取工具清单。请检查网络或 --base-url 后重试。`,
	},
	auth: {
		description: "管理 API 密钥",
		setDescription: "把 API 密钥保存到配置文件",
		setKeyArg: "API 密钥（sk-...）",
		getDescription: "查看当前使用的 API 密钥（默认遮蔽）",
		getShowOption: "完整显示密钥，不做遮蔽",
		loginDescription: "在浏览器里用设备码登录（远程终端也可用）",
		loginSuccess: "登录成功；API 密钥已保存到配置文件",
		logoutDescription: "退出登录（从配置文件中清除 API 密钥）",
		logoutSuccess: "已退出登录；API 密钥已从配置文件中清除",
		logoutNothing: "配置文件中没有 API 密钥，无需清除",
		logoutEnvWarning:
			"提示：环境变量 TUFTY_API_KEY 仍然生效。如需完全退出，请同时清除该环境变量。",
		notConfigured: "尚未设置 API 密钥",
		noApiKey: (keyUrl) =>
			`未找到可用的 API 密钥。请传入 --api-key、设置 TUFTY_API_KEY、运行 \`tufty login\`，或到 ${keyUrl} 获取密钥后运行 \`tufty auth set <key>\`。`,
	},
	login: {
		starting: "\n[tufty] 正在启动登录流程...",
		visit: (url) => `请在任意浏览器中打开以下链接完成授权：\n${url}\n`,
		polling: (minutes) => `等待授权完成（链接 ${minutes} 分钟内有效）...`,
		expired: "授权请求已过期或被拒绝",
		timeout: (minutes) => `${minutes} 分钟内未完成授权`,
	},
	tools: {
		namespaceDescription: "浏览工作室工具",
		listDescription: "列出所有工作室工具",
		describeDescription: "输出单个工具的完整信息：输入、选项、价格与限制",
		describeIdArg: "工具 id，例如 pet-dressup",
		toolNotFound: (id) => `没有 id 为 '${id}' 的工作室工具`,
		statusDescription: "按 runId 查询任务，或用 --wait 等待完成",
		statusWaitOption: "轮询直到任务完成或失败",
		productOption: (min) =>
			`商品图：本地路径、data: URL 或 http(s) 地址。传多件商品会逐件生成；同一件商品的多张图（最多 4 张）用 "+" 连接（front.jpg+back.jpg）。${min > 0 ? `至少 ${min} 件。` : "可选。"}`,
		modelOption: (min) =>
			`模特图（宠物、人物或主体）：本地路径、data: URL 或 http(s) 地址。每个模特会和每件商品两两配对。${min > 0 ? `至少 ${min} 张。` : "可选。"}`,
		qualityOption: (pricing) => `画质档位；每张成品消耗积分：${pricing}`,
		ratioImageOption: (sizes) => `画面比例；auto 由模型决定（${sizes}）`,
		countOption: "每组商品×模特配对生成的张数",
		enhanceOption: "启用工具自带的提示词增强",
		stillOption: (range) =>
			`视频用的静帧图：本地路径、data: URL 或 http(s) 地址（${range}）`,
		exactly: (n) => `恰好 ${n} 张`,
		durationOption: "视频时长（秒）",
		ratioVideoOption: "视频画面比例",
		resolutionOption: (pricing) => `输出分辨率；每秒消耗积分：${pricing}`,
		motionVideoOption:
			"要跟随的参考运镜视频（本地路径或 http(s) 地址）；原样上传，不做抠图",
		notesOption: "本次生成的补充说明（自由文本，最多 2000 字）",
		noCutoutOption: "跳过输入图片的自动抠图（每张省 1 积分）",
		dryRunOption: "只校验输入并打印请求载荷和积分预估；不上传、不扣费",
		noWaitOption: "提交后立即返回 runId，不等待生成结果",
		timeoutOption: "等待任务完成的最大秒数",
		saveOption: "把成品下载到这个目录",
		formatOption: "标准输出格式：json = 完整信封，url = 每行一个成品地址",
		helpAfter: `
积分：
  图片 = 画质单价 x 配对数 x 张数，配对数 = 商品数 x 模特数
  视频 = round(每秒单价 x 时长)
  + 每张需要抠图的输入图 1 积分（用 --no-cutout 跳过）

输出（标准输出 JSON 信封）：
  { ok: true, result: { tool, runId, status, outputs: [{ type, url, path? }] } }
  配合 --no-wait：status 为 "running"，outputs 为 []，之后用 \`tufty status <runId> --wait\` 轮询
  失败时：{ ok: false, code, message, details? }（退出码 1；用法错误退出码 2）`,
		statusHelpAfter: `
输出：{ ok: true, result: { tool, runId, status, outputs: [{ type, url }] } }
任务失败时返回 { ok: false, code: "task_failed", ... }。`,
		missingInput: (flag, min, got) =>
			`--${flag} 至少需要 ${min} 张图，实际 ${got} 张`,
		tooManyInputs: (flag, max, got) =>
			`--${flag} 最多 ${max} 张图，实际 ${got} 张`,
		tooManyParts: (value, max) =>
			`"${value}" 连接了超过 ${max} 张图；同一件商品最多 ${max} 张`,
		tooManyImages: (pairs, count, max) =>
			`${pairs} 组商品×模特配对 x --count ${count} = ${pairs * count} 张；一次最多出 ${max} 张。请拆成多次运行或调低 --count。`,
		fileNotFound: (p) => `文件不存在：${p}`,
		invalidTimeout: (value) => `--timeout 必须是正数秒数，实际为 '${value}'`,
		costEstimate: (total, generation, cutout) =>
			`[cost-estimate] 预计约 ${total} 积分（生成 ${generation} + 抠图 ${cutout}）`,
		uploading: (label) => `正在上传 ${label}...`,
		cuttingOut: (label) => `正在抠图：${label}`,
		cutoutDegraded: (label) =>
			`[cutout] ${label}：抠图降级，主体未能干净分离，请检查成品`,
		cutoutEmpty: (label) =>
			`[cutout] ${label}：未识别到主体，直接使用上传的原图`,
		cutoutNotStored: (label) =>
			`[cutout] ${label}：抠图结果没有转存到 tufty 存储，直接使用上传的原图`,
		submitted: (runId, credits) =>
			`任务已提交：${runId}${credits !== undefined ? `（已冻结 ${credits} 积分）` : ""}`,
		waiting: (runId) =>
			`正在等待结果...（可以随时中断，之后用 \`tufty status ${runId} --wait\` 继续）`,
		completed: (count) => `生成完成，共 ${count} 个成品：`,
		runFailed: (reason) => `任务失败：${reason}`,
		runTimeout: (seconds, runId) =>
			`任务在 ${seconds} 秒内未完成。稍后用 \`tufty status ${runId} --wait\` 再查`,
		saved: (p) => `[save] ${p}`,
	},
	api: {
		networkError: (url, reason) => `无法连接 ${url}：${reason}`,
		badResponse: (url) => `${url} 返回了无法解析的响应`,
		requestFailed: (status) => `请求失败，状态码 ${status}`,
		unauthorized: (keyUrl) =>
			`API 密钥缺失或无效。请到 ${keyUrl} 获取密钥，然后运行 \`tufty auth set <key>\`。`,
		insufficientBalance: (required) =>
			`积分不足${required !== undefined ? `（这一步需要 ${required} 积分）` : ""}。`,
		insufficientBalanceHint: (rechargeUrl) =>
			`[tufty] 积分不足。请前往 ${rechargeUrl} 充值后重新运行命令。`,
		forbidden: "没有访问权限。",
		notFound: "未找到。",
		invalidRequest: (serverCode) =>
			`服务端拒绝了请求${serverCode ? `（${serverCode}）` : ""}。`,
		serverError: (status, serverCode) =>
			`服务端错误 ${status}${serverCode ? `（${serverCode}）` : ""}，请稍后重试。`,
		versionTooLow: (upgradeCommand) =>
			`当前 CLI 版本已不再支持。请运行 \`${upgradeCommand}\` 升级后重试。`,
		uploadFailed: (reason) => `上传失败：${reason}`,
		remoteDownloadFailed: (url, reason) =>
			`无法下载 ${url} 以重新上传：${reason}`,
		videoTruncated: (type, declared, actual) =>
			`视频文件不完整：'${type}' 数据段声明 ${declared} 字节但超出文件末尾（实际仅 ${actual} 字节），很可能是导出/下载未完成。请检查源视频后重试。`,
		videoNoMoov:
			"视频文件缺少 moov 原子（索引），很可能已损坏或未完整导出。请检查源视频后重试。",
		downloadFailed: (url, attempts, reason) =>
			`下载 ${url} 失败（已重试 ${attempts} 次）：${reason}`,
	},
	upload: {
		description:
			"把文件上传到 tufty 存储并输出公开地址。支持本地路径、data: URL 或 http(s) 地址（tufty 托管的地址原样返回，其他外链会先下载再上传）。",
		fileArg: "本地路径、data: URL 或 http(s) 地址",
	},
};
