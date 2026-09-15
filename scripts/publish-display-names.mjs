#!/usr/bin/env node
/**
 * 逐个发布 skills/ 下的技能，并用 `clawhub publish --name` 写入中文 displayName。
 *
 * 为什么不能用 `clawhub sync`：sync 没有 --name 参数，displayName 会被 registry 重算成
 * slug 的 Title Case（Tufty Pet Dressup），中文名全部丢失，中文搜索随之失效。
 *
 * 发布账号还没定：owner 只从环境变量 CLAWHUB_OWNER 读，没设就拒绝运行。
 * 幂等：线上 displayName 已等于目标名时跳过，可反复重跑。
 *
 *   CLAWHUB_OWNER=<owner> node scripts/publish-display-names.mjs [--dry-run] [--force] [--only <slug>[,<slug>]] [--changelog <text>]
 */
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const OWNER = process.env.CLAWHUB_OWNER?.trim();
if (!OWNER) {
	console.error(
		"CLAWHUB_OWNER 未设置，拒绝发布。请先确定 ClawHub 发布账号，然后：CLAWHUB_OWNER=<owner> npm run publish:skills",
	);
	process.exit(1);
}

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, "..", "skills");
const NAMES_FILE = path.join(__dirname, "skill-display-names.json");
const STATE_FILE = path.join(__dirname, ".publish-display-names.done");
const API = "https://clawhub.ai/api/v1/skills";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
// --force：内容变了（比如重新生成了文档）就算线上显示名已正确也要重发
const force = args.includes("--force");
const only = args.includes("--only")
	? new Set(String(args[args.indexOf("--only") + 1]).split(","))
	: null;
const changelog = args.includes("--changelog")
	? args[args.indexOf("--changelog") + 1]
	: "Update tufty skill";

const slugify = (name) => name.replace(/[._]/g, "-").toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bumpPatch = (v) => {
	const [maj = 1, min = 0, pat = 0] = String(v)
		.split(".")
		.map((n) => Number.parseInt(n, 10) || 0);
	return `${maj}.${min}.${pat + 1}`;
};
const maxVersion = (a, b) => {
	const pa = String(a).split(".").map(Number);
	const pb = String(b).split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if ((pa[i] || 0) !== (pb[i] || 0))
			return (pa[i] || 0) > (pb[i] || 0) ? a : b;
	}
	return a;
};

const localVersion = (dir) => {
	const f = path.join(dir, "SKILL.md");
	if (!fs.existsSync(f)) return "1.0.0";
	const m = fs.readFileSync(f, "utf8").match(/^version:\s*(.+)$/m);
	return m ? m[1].trim().replace(/['"]/g, "") : "1.0.0";
};

const fetchRemote = async (slug) => {
	try {
		// 必须带 owner：别的作者也可能占用同名 slug，不带会 409
		const res = await fetch(
			`${API}/${slug}?owner=${encodeURIComponent(OWNER)}`,
		);
		if (!res.ok) return null;
		const j = await res.json();
		return {
			displayName: j.skill?.displayName ?? "",
			latest: j.latestVersion?.version ?? j.skill?.latestVersion ?? null,
		};
	} catch {
		return null;
	}
};

// 走 shell 才能在 Windows 上调到 npx.cmd（execFile 直调 .cmd 会 spawn EINVAL），
// 因此带空格的路径和中文 displayName 必须自己加引号，否则会被 shell 拆成多个参数。
const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

const publish = async (dir, version, displayName) => {
	const cmd = `npx clawhub publish ${q(dir)} --version ${version} --name ${q(displayName)} --changelog ${q(changelog)}`;
	const { stdout, stderr } = await execAsync(cmd, {
		maxBuffer: 10 * 1024 * 1024,
	});
	return `${stdout}\n${stderr}`;
};

// --force 从头跑：丢弃上一轮的记账
if (force && !dryRun && fs.existsSync(STATE_FILE)) fs.rmSync(STATE_FILE);

const done = fs.existsSync(STATE_FILE)
	? new Set(fs.readFileSync(STATE_FILE, "utf8").split("\n").filter(Boolean))
	: new Set();

const names = JSON.parse(fs.readFileSync(NAMES_FILE, "utf8")).names;
const dirs = fs
	.readdirSync(SKILLS_DIR, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

const missing = dirs.filter((d) => !names[slugify(d)]);
if (missing.length) {
	console.error(`缺少中文名映射（${missing.length}）：${missing.join(", ")}`);
	process.exit(1);
}

let ok = 0;
let skipped = 0;
const failed = [];

for (const dirName of dirs) {
	const slug = slugify(dirName);
	if (only && !only.has(slug)) continue;
	if (!force && done.has(slug)) {
		skipped++;
		continue;
	}
	const target = names[slug];
	const remote = await fetchRemote(slug);

	if (!force && remote && remote.displayName === target) {
		console.log(`SKIP  ${slug}  已是「${target}」`);
		if (!dryRun) fs.appendFileSync(STATE_FILE, `${slug}\n`);
		skipped++;
		continue;
	}

	// ClawHub 允许发布低于 latest 的版本但不会成为 latest，所以取本地和线上的较大者再 +1
	let version = bumpPatch(
		maxVersion(
			localVersion(path.join(SKILLS_DIR, dirName)),
			remote?.latest ?? "0.0.0",
		),
	);

	if (dryRun) {
		console.log(
			`DRY   ${OWNER}/${slug}  ${remote?.latest ?? "NEW"} -> ${version}  「${target}」`,
		);
		continue;
	}

	let published = false;
	for (let attempt = 0; attempt < 6 && !published; attempt++) {
		try {
			const out = await publish(
				path.join(SKILLS_DIR, dirName),
				version,
				target,
			);
			if (/OK\. Published/.test(out)) {
				console.log(`OK    ${slug}@${version}  「${target}」`);
				fs.appendFileSync(STATE_FILE, `${slug}\n`);
				published = true;
				ok++;
			} else if (/already exists/i.test(out)) {
				version = bumpPatch(version);
			} else {
				throw new Error(out.trim().split("\n").slice(-3).join(" | "));
			}
		} catch (e) {
			const msg = String(e.message || e);
			if (/already exists/i.test(msg)) {
				version = bumpPatch(version);
			} else if (/rate limit|reset in|429/i.test(msg)) {
				console.log(`WAIT  ${slug}  限流，等 60s`);
				await sleep(60_000);
			} else {
				console.log(`FAIL  ${slug}  ${msg}`);
				failed.push(slug);
				break;
			}
		}
	}
	if (!published && !failed.includes(slug)) {
		console.log(`FAIL  ${slug}  重试次数用尽`);
		failed.push(slug);
	}
	await sleep(1500);
}

console.log(
	`\n完成：published=${ok} skipped=${skipped} failed=${failed.length}`,
);
if (failed.length) console.log(`失败：${failed.join(", ")}`);
