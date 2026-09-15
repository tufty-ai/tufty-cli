# CLAUDE.md — packages/cli（@tufty/cli）

tufty.ai 工作室工具的命令行，以及发布到 ClawHub 的技能文档。仿 dlazy CLI（`ai-work-canvas-new/packages/cli`），只保留工作室工具相关的部分。

- **独立 npm 包**：不在网站的 pnpm workspace 里（根 `pnpm-workspace.yaml` 有 `!packages/cli`），自带 `package-lock.json`。
- **发布账号**：npm 包 `@tufty/cli` 发在 npm 组织 `tufty` 下；ClawHub 技能用 GitHub 账号 `tufty-ai` 发布；源码公开在 https://github.com/tufty-ai/tufty-cli（AGPL-3.0-or-later）。包名只写在 `package.json` 的 `name` 里，代码经 `src/constants.ts` 读取。改名时还要：重新生成技能（见下）、手动替换两份 README 里的包名、服务端 `lib/cli/version.ts` 的 `UPGRADE_COMMAND`。

## 常用命令

```bash
npm install --workspaces=false   # 见下方「安装依赖」
npm run build                    # tsup → dist/index.js（CJS，node18）
npm test                         # vitest，本地 node:http 假服务端，不连网
npm run typecheck
node bin/tufty.cjs <args>        # 有 src + tsx 时直接跑 TS 源码，默认连 http://localhost:3300
```

### 安装依赖

- 仓库根 `package.json` 有 `"workspaces": ["packages/*"]`（npm 语义），在这里直接 `npm install` 会被当成根工作区的成员，改到仓库根目录。**必须带 `--workspaces=false`**。
- vitest 固定在 3.x：vitest 4 + tsup + tsx 这组依赖会让 npm 10.9 的 arborist 在解析 peer 依赖时崩溃（`Cannot read properties of null (reading 'edgesOut')`），和装在哪个目录无关。

## 结构

- `src/cli.ts` 入口逻辑：先偷看 argv 定语言 / base URL，拉工具清单（`lib/manifest.ts`，缓存 10 分钟），按清单注册命令，再交给 commander。commander 的参数错误统一转成 `usage_error` 信封。
- `src/commands/tools.ts` 每个工具一个命令，flag 全部由清单生成；流程：校验 → 鉴权 → 上传 → 抠图 → 提交 → 轮询 → 输出。
- `src/lib/api.ts` HTTP 与错误码映射；`lib/upload.ts` 签名直传、外链转存、mp4 完整性检查；`lib/envelope.ts` stdout JSON 信封与退出码。
- `src/messages/` 中英文案。

## 服务端契约

接口在网站仓库 `app/api/cli/*`：`studio/tools`（清单，公开）、`upload-url`、`studio/analyze`（抠图，1 积分/张）、`studio/runs`（202 + runId）、`studio/runs/<runId>`、`verification`（设备码登录）。错误体 `{ error, message?, details?, required? }`，CLI 按 HTTP 状态映射 code（`mapHttpError`）。每个请求都带 `X-CLI-Version`，低于服务端 `MIN_SUPPORTED_CLI_VERSION` 回 426。

几处和服务端对齐的硬编码（服务端改了要跟着改）：`tools.ts` 的 `MAX_PRODUCT_PARTS=4`、`MAX_IMAGE_REFERENCES=8`、`MAX_IMAGES_PER_RUN=16`。

## 加一个工具

1. 服务端把工具加进 `lib/studio/cli-tools.ts` 的清单。CLI 命令和 flag 由清单自动生成，通常不用改 CLI 代码。
2. `scripts/skill-display-names.json` 登记 `tufty-<id>` 的「中文 English」显示名。
3. `scripts/skill-content.ts` 补一条：emoji、触发描述、关键词、示例、提示。示例里的 flag 生成时会校验。
4. 更新测试夹具（公开接口，不需要 key）：
   ```bash
   curl -H "X-CLI-Version: <package.json 版本>" "https://tufty.ai/api/cli/studio/tools?locale=zh-CN" > tests/fixtures/tools.zh-CN.json
   curl -H "X-CLI-Version: <package.json 版本>" "https://tufty.ai/api/cli/studio/tools?locale=en-US" > tests/fixtures/tools.en-US.json
   ```
   `tests/commands.test.ts` 里的工具列表断言跟着改。
5. 重新生成技能文档（下一节），`npm test`。

## 重新生成技能文档

改了 flag 文案、价格、版本号、技能文案之后：

```bash
npm run skills:sync            # 拉线上清单（TUFTY_BASE_URL，默认 https://tufty.ai）
npm run skills:sync:fixtures   # 用 tests/fixtures 里的清单
```

生成 `skills/tufty-<id>/SKILL.md`（英文）、`SKILL-cn.md`（中文）、`skills/README.md`、`skills/skills.txt`。Usage 段就是 commander 真实的 `-h` 文本，不要手改生成的文件。

## 发布

- **npm**：先定 scope 和账号。改 `package.json` 版本 → `npm run publish:npm`。服务端 `MIN_SUPPORTED_CLI_VERSION` 视情况跟上；技能文档里的安装命令固定了版本，发版后要重新生成。
- **ClawHub**：**禁止用 `clawhub sync`**（没有 `--name`，中文显示名会被重算成 slug 的 Title Case）。用：
  ```bash
  CLAWHUB_OWNER=<owner> npm run publish:skills -- --dry-run   # 先看
  CLAWHUB_OWNER=<owner> npm run publish:skills                 # 逐个 clawhub publish --name
  ```
  没设 `CLAWHUB_OWNER` 脚本直接拒绝运行。版本取 max(本地 frontmatter, 线上 latest) 再 +1；进度记在 `scripts/.publish-display-names.done`，`--force` 从头重发。
