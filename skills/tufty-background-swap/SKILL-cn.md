---
name: tufty-background-swap
version: 1.1.0
description: "场景替换（tufty.ai）：把模特图或商品图放进任意新场景（海边、影棚、街拍、咖啡馆），不用搭背景板。适用于换背景、替换照片背景、制作商品场景图和电商生活方式图。 Scene swap on tufty.ai: place a model or product photo into any new background or setting (beach, studio, street, cafe) without building a set. Use when the user wants to change or replace a photo's background, create lifestyle scene shots, or put a product in context."
metadata: {"clawdbot":{"emoji":"🏞️","requires":{"bins":["npm","npx"]},"install":"npm install -g @tufty/cli@1.1.0","installAlternative":"npx @tufty/cli@1.1.0","homepage":"https://tufty.ai","source":"https://github.com/tufty-ai/tufty-cli","author":"tufty.ai","license":"AGPL-3.0-or-later","npm":"https://www.npmjs.com/package/@tufty/cli","configLocation":"~/.tufty/config.json","apiEndpoints":["tufty.ai","static.tufty.ai"]},"openclaw":{"systemPrompt":"当调用此技能时，可以使用 tufty background-swap -h 查看帮助信息。"}}
---

# 场景替换 Scene Swap

[English](./SKILL.md) · [中文](./SKILL-cn.md)

把商品或模特放进任意场景，不用再搭背景板。 场景替换（tufty.ai）：把模特图或商品图放进任意新场景（海边、影棚、街拍、咖啡馆），不用搭背景板。适用于换背景、替换照片背景、制作商品场景图和电商生活方式图。

## 触发关键词

- 场景替换
- 换背景
- 替换背景
- 商品换场景
- 模特换背景
- 电商场景图
- scene swap
- change background
- replace photo background
- product lifestyle shot
- put product in a scene
- background-swap

## 身份验证 (Authentication)

所有请求都需要 tufty.ai API 密钥。**推荐使用** `tufty login` 登录：

```bash
tufty login
```

该命令使用设备码流程：在浏览器中打开授权页，同时把链接打印出来，远程终端也能用。授权完成后 **自动把 API 密钥写入本地 CLI 配置**，无需手动复制粘贴。

### 备选：手动设置 API 密钥

如果你已有 API 密钥，可以直接保存：

```bash
tufty auth set YOUR_API_KEY
```

密钥保存在 `~/.tufty/config.json`（Windows 上为 `%USERPROFILE%\.tufty\config.json`），仅当前系统用户可读。也可以每次用 `--api-key` 或 `TUFTY_API_KEY` 环境变量传入。查找顺序：`--api-key` → `TUFTY_API_KEY` → 配置文件 → 交互式登录（仅限终端，CI 中不会触发）。

### 手动获取 API 密钥

1. 登录或在 [tufty.ai](https://tufty.ai) 注册账号
2. 打开 [tufty.ai/dashboard/organization/api-key](https://tufty.ai/dashboard/organization/api-key)（用户菜单里的「API 密钥」）
3. 复制密钥，以 `sk-` 开头

密钥可以在同一页面**随时轮换或吊销**。

## 关于与来源 (Provenance)

- **官网**: [tufty.ai](https://tufty.ai)
- **源码**: [github.com/tufty-ai/tufty-cli](https://github.com/tufty-ai/tufty-cli)（AGPL-3.0-or-later 许可）
- **维护者**: tufty.ai
- **npm 包名**: `@tufty/cli`（本技能 install 字段固定到 `1.1.0` 版本）
- **配置文件**: `~/.tufty/config.json`

不想全局安装的话，可以按需运行：

```bash
npx @tufty/cli@1.1.0 <command>
```

如需全局安装，`metadata.clawdbot.install` 已固定版本：`npm install -g @tufty/cli@1.1.0`。

## 工作原理

此技能是 tufty.ai 托管 API 的轻量封装。调用时：

- 你传入的`--product` / `--model` 图片可以是本地路径、`data:` URL 或 http(s) 地址。本地文件和 data URL 会上传到 tufty 存储（`static.tufty.ai`）；已经在 tufty 存储上的地址原样使用；其他地址由 CLI 先下载再上传，因为服务端只接受托管在 tufty 存储上的图片。
- 每张输入图都会先做**自动抠图，每张消耗 1 积分**。加 `--no-cutout` 可跳过，直接使用上传的原图。
- 随后 CLI 把任务提交到 `tufty.ai`，每 3 秒轮询一次直到完成（最长 `--timeout`，默认 900 秒）。`--no-wait` 会立即返回 `runId`。
- 生成的成品托管在 `static.tufty.ai`；`--save <dir>` 可下载到本地。
- 价格：每张成品积分：low=4, medium=16, high=47。总价 = 画质单价 x（商品数 x 模特数）x `--count`，另加每张抠图输入图 1 积分。`--dry-run` 只打印请求内容和预估积分，不上传、不扣费。

API 密钥只会发送给 `tufty.ai`，不会附加到存储上传或下载请求上。完整服务条款见 [tufty.ai](https://tufty.ai)。

## 使用方法

**CRITICAL INSTRUCTION FOR AGENT**:
执行 `tufty background-swap` 命令获取结果。

```bash
tufty background-swap -h

Usage: tufty background-swap [options]

[image] 场景替换: 把商品或模特放进任意场景，不用再搭背景板。

Options:
  --product <file|url...>  商品图：本地路径、data: URL 或 http(s) 地址。传多件商品会逐件生成；同一件商品的多张图（最多 4 张）用 "+" 连接（front.jpg+back.jpg）。可选。
  --model <file|url...>    模特图（宠物、人物或主体）：本地路径、data: URL 或 http(s) 地址。每个模特会和每件商品两两配对。至少 1 张。
  --quality <id>           画质档位；每张成品消耗积分：low=4, medium=16, high=47 (choices: "low", "medium", "high", default: "low")
  --ratio <id>             画面比例；auto 由模型决定（1:1=1024x1024, 3:4=1024x1536, 9:16=1024x1536） (choices: "auto", "1:1",
                           "3:4", "9:16", default: "auto")
  --count <n>              每组商品×模特配对生成的张数 (choices: "1", "2", "3", "4", default: "1")
  --enhance                启用工具自带的提示词增强
  --notes <text>           本次生成的补充说明（自由文本，最多 2000 字）
  --no-cutout              跳过输入图片的自动抠图（每张省 1 积分）
  --dry-run                只校验输入并打印请求载荷和积分预估；不上传、不扣费
  --no-wait                提交后立即返回 runId，不等待生成结果
  --timeout <seconds>      等待任务完成的最大秒数 (default: "900")
  --save <dir>             把成品下载到这个目录
  --format <mode>          标准输出格式：json = 完整信封，url = 每行一个成品地址 (choices: "json", "url", default: "json")
  -h, --help               display help for command

积分：
  图片 = 画质单价 x 配对数 x 张数，配对数 = 商品数 x 模特数
  视频 = round(每秒单价 x 时长)
  + 每张需要抠图的输入图 1 积分（用 --no-cutout 跳过）

输出（标准输出 JSON 信封）：
  { ok: true, result: { tool, runId, status, outputs: [{ type, url, path? }] } }
  配合 --no-wait：status 为 "running"，outputs 为 []，之后用 `tufty status <runId> --wait` 轮询
  失败时：{ ok: false, code, message, details? }（退出码 1；用法错误退出码 2）
```

## 输出格式

```json
{
  "ok": true,
  "result": {
    "tool": "background-swap",
    "runId": "3f6c2a1e-8b4d-4e7a-9c55-0d2b7e1f4a90",
    "status": "completed",
    "outputs": [
      {
        "type": "image",
        "url": "https://static.tufty.ai/studio/3f6c2a1e-8b4d-4e7a-9c55-0d2b7e1f4a90/result.png"
      }
    ]
  }
}
```

> - 配合 `--no-wait`：`status` 为 `"running"`，`outputs` 为 `[]`；之后用 `tufty status <runId> --wait` 取结果。
> - 配合 `--save <dir>`：每个成品额外带 `path`，即本地文件的绝对路径。
> - 配合 `--format url`：标准输出只有成品地址，每行一个。
> - `--dry-run` 返回 `{ tool, dryRun: true, payload, estimatedCredits, creditBreakdown: { generation, cutout } }`。
> - 失败时：`{ "ok": false, "code": "...", "message": "...", "details": { ... } }`，退出码 1（参数或输入不合法时为 2）。进度日志只写标准错误，不会混进标准输出。

## 命令示例

```bash
# 把棚拍模特图换到日落海边，竖版 3:4
tufty background-swap --model ./model-white-bg.jpg --notes "日落海边，暖色逆光" --ratio 3:4

# 模特和手袋一起放进同一个场景，启用提示词增强，出 2 张
tufty background-swap --model ./model.jpg --product ./handbag.jpg --notes "极简大理石影棚" --enhance --count 2
```

## 错误处理

| Code | 场景 | 处理方式 |
| ---- | ---- | -------- |
| `no_api_key` / `unauthorized` | 没有 API 密钥，或密钥无效（HTTP 401） | 到 https://tufty.ai/dashboard/organization/api-key 获取密钥，运行 `tufty auth set <key>`（或 `tufty login`）后重试 |
| `insufficient_balance` | 积分不足（HTTP 402；`details.required` 为所需积分） | 前往 https://tufty.ai/dashboard/settings?tab=credits 充值 |
| `missing_input` / `too_many_inputs` / `too_many_images` / `file_not_found` / `invalid_video` / `usage_error` | 参数或输入不合法，在上传前就被拒绝（退出码 2） | 修正命令；参见 `tufty <tool> -h` |
| `invalid_request` | 服务端拒绝请求（HTTP 400；`details.serverCode`，如 `unknown_template`、`reference_not_allowed`） | 检查输入；`tufty tools describe <tool>` 可查看当前选项 |
| `cli_version_too_low` | CLI 版本低于服务端要求（HTTP 426） | 运行 `npm install -g @tufty/cli@latest` 后重试 |
| `task_failed` | 服务端生成失败（`details.serverCode`） | 重试，或更换输入图片 / `--notes` |
| `timeout` | 在 `--timeout` 内未完成（`details.runId`） | `tufty status <runId> --wait` |
| `not_found` | runId 不存在（HTTP 404） | 检查 runId |
| `server_error` / `network_error` / `upload_failed` / `download_failed` | 服务端、存储或网络问题 | 稍后重试 |

> **智能体关键指令**:
> 1. 如果执行结果返回 `code: "insufficient_balance"`，您必须明确告知用户当前积分不足，并引导用户点击以下链接前往充值：[https://tufty.ai/dashboard/settings?tab=credits](https://tufty.ai/dashboard/settings?tab=credits)
> 2. 如果执行结果返回 `code: "unauthorized"` 或 `code: "no_api_key"`，您必须明确告知用户前往 [https://tufty.ai/dashboard/organization/api-key](https://tufty.ai/dashboard/organization/api-key) 获取 API 密钥并使用 `tufty auth set <key>` 保存，然后继续执行任务。

## Tips

- `--notes` 用来描述新场景：地点、光线、氛围写得越具体越好。
- 这个工具的 `--product` 是可选的；需要商品和模特同框时再加上。
- 用户还没确认积分花费时，先加 `--dry-run` 预估。
- 更多信息请访问 https://tufty.ai。
