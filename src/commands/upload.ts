import * as fs from "node:fs";
import { type Command, Option } from "commander";
import {
	emitError,
	log,
	type OutputMode,
	SdkError,
	setOutputMode,
	success,
} from "../lib/envelope";
import { isRemoteUrl, needsUpload, resolveToStorageUrl } from "../lib/upload";
import { t } from "../messages";
import { type GlobalOptions, requireApiContext } from "../utils/config";

export function registerUploadCommand(program: Command) {
	const msgs = t();
	program
		.command("upload")
		.description(msgs.upload.description)
		.argument("<file>", msgs.upload.fileArg)
		.addOption(
			new Option("--format <mode>", msgs.tools.formatOption)
				.choices(["json", "url"])
				.default("json"),
		)
		.action(async (file: string, _opts: unknown, command: Command) => {
			const opts = command.optsWithGlobals<
				GlobalOptions & { format: OutputMode }
			>();
			setOutputMode(opts.format);
			try {
				// 已经在 tufty 存储上：不需要登录，原样返回
				if (!needsUpload(file)) {
					success({ tool: "upload", data: { url: file } });
				}
				if (
					!file.startsWith("data:") &&
					!isRemoteUrl(file) &&
					!fs.existsSync(file)
				) {
					throw new SdkError(
						"file_not_found",
						msgs.tools.fileNotFound(file),
						{ path: file },
						2,
					);
				}
				const ctx = await requireApiContext(opts);
				log(msgs.tools.uploading(file.startsWith("data:") ? "data URL" : file));
				const url = await resolveToStorageUrl(file, ctx);
				success({ tool: "upload", data: { url } });
			} catch (err) {
				emitError(err);
			}
		});
}
