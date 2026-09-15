#!/usr/bin/env node
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const root = path.join(__dirname, "..");
const srcEntry = path.join(root, "src", "index.ts");
const distEntry = path.join(root, "dist", "index.js");
// 直接用 node 跑 tsx 的 CLI 入口，而不是 node_modules/.bin/tsx：
// Windows 上 .bin/tsx 是 shell 脚本 / .cmd，spawn 不带 shell 调不起来。
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

// 源码 + tsx 都在（仓库里开发时）→ 直接跑 TS 源码，默认连本地服务；
// 发布到 npm 的包只带 bin + dist，走编译产物。
if (fs.existsSync(srcEntry) && fs.existsSync(tsxCli)) {
	const env = {
		...process.env,
		TUFTY_BASE_URL: process.env.TUFTY_BASE_URL || "http://localhost:3300",
	};
	const child = spawn(
		process.execPath,
		[tsxCli, srcEntry, ...process.argv.slice(2)],
		{ stdio: "inherit", env },
	);
	child.on("exit", (code, signal) => {
		if (signal) process.kill(process.pid, signal);
		else process.exit(code ?? 0);
	});
} else {
	require(distEntry);
}
