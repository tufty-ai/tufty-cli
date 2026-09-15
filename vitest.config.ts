import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		// 测试会改 process.env（配置目录、API key）并 mock process.exit，串行跑更稳
		fileParallelism: false,
		testTimeout: 30_000,
	},
});
