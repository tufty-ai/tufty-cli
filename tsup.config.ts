import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
	},
	format: ["cjs"],
	tsconfig: "tsconfig.json",
	clean: true,
	target: "node18",
	splitting: false,
	sourcemap: false,
});
