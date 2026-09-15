import type { Command } from "commander";
import { resolveBaseUrl } from "../constants";
import { emitError, failure, log, success } from "../lib/envelope";
import { t } from "../messages";
import {
	type GlobalOptions,
	getStoredApiKey,
	loadConfig,
	saveConfig,
	waitForApiKeyAuth,
} from "../utils/config";

/** 遮蔽展示：保留前缀（通常是 `sk-`）和末 4 位，`auth get --show` 才显示全文 */
export function maskApiKey(key: string): string {
	if (key.length <= 8) return "***";
	const dash = key.indexOf("-");
	const prefix =
		dash >= 0 && dash <= 6 ? key.slice(0, dash + 1) : key.slice(0, 3);
	return `${prefix}***${key.slice(-4)}`;
}

export function registerAuthCommands(program: Command) {
	const msgs = t().auth;

	const authCmd = program.command("auth").description(msgs.description);

	authCmd
		.command("set")
		.description(msgs.setDescription)
		.argument("<apiKey>", msgs.setKeyArg)
		.action((apiKey: string) => {
			const config = loadConfig();
			config.TUFTY_API_KEY = apiKey.trim();
			saveConfig(config);
			success({ tool: "auth.set", data: { source: "config", saved: true } });
		});

	authCmd
		.command("get")
		.description(msgs.getDescription)
		.option("--show", msgs.getShowOption)
		.action((opts: { show?: boolean }) => {
			const stored = getStoredApiKey();
			if (!stored) failure("not_configured", msgs.notConfigured);
			success({
				tool: "auth.get",
				data: {
					source: stored.source,
					apiKey: opts.show ? stored.apiKey : maskApiKey(stored.apiKey),
				},
			});
		});

	program
		.command("login")
		.description(msgs.loginDescription)
		.action(async (_opts: unknown, command: Command) => {
			try {
				const baseUrl = resolveBaseUrl(
					command.optsWithGlobals<GlobalOptions>().baseUrl,
				);
				const apiKey = await waitForApiKeyAuth({ baseUrl });
				const config = loadConfig();
				config.TUFTY_API_KEY = apiKey;
				saveConfig(config);
				log(msgs.loginSuccess);
				success({ tool: "login", data: { saved: true } });
			} catch (err) {
				emitError(err);
			}
		});

	program
		.command("logout")
		.description(msgs.logoutDescription)
		.action(() => {
			const config = loadConfig();
			const had = "TUFTY_API_KEY" in config;
			if (had) {
				delete config.TUFTY_API_KEY;
				saveConfig(config);
				log(msgs.logoutSuccess);
			} else {
				log(msgs.logoutNothing);
			}
			if (process.env.TUFTY_API_KEY) log(msgs.logoutEnvWarning);
			success({ tool: "logout", data: { removed: had } });
		});
}
