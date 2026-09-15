/**
 * 在 commander 解析之前偷看 argv：语言（命令描述要在注册时就翻译好）、
 * --base-url（注册工具命令前要先拉清单）、--verbose、--refresh-manifest。
 * 故意宽松：格式不对就退回环境变量 / 默认值，真正的解析仍以 commander 为准。
 */

/** 返回 `--<name> <v>` 或 `--<name>=<v>` 的值 */
export function peekFlagValue(
	argv: readonly string[],
	name: string,
): string | undefined {
	const long = `--${name}`;
	const longEq = `${long}=`;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === long) return argv[i + 1];
		if (a?.startsWith(longEq)) return a.slice(longEq.length);
	}
	return undefined;
}

/** argv 里出现过 `--<name>`（布尔开关） */
export function peekFlagBool(argv: readonly string[], name: string): boolean {
	return argv.includes(`--${name}`);
}
