#!/usr/bin/env node

import { main } from "./cli";

main(process.argv).catch((err) => {
	process.stdout.write(
		`${JSON.stringify({
			ok: false,
			code: "internal_error",
			message: err instanceof Error ? err.message : String(err),
		})}\n`,
	);
	process.exit(1);
});
