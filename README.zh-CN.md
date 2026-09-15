# @tufty/cli

[English](./README.md) · [中文](./README.zh-CN.md)

[tufty.ai](https://tufty.ai) 工作室工具的命令行：宠物换装、场景替换、平铺转 3D，以及用图片生成短视频。为终端和 AI 智能体设计：标准输出永远是 JSON 信封，进度写到标准错误。

> npm 包名和 scope 尚未最终确定。

## 安装

```bash
npm install -g @tufty/cli
# 或者按需运行
npx @tufty/cli <command>
```

需要 Node.js 18 及以上。

## 登录

```bash
tufty login               # 浏览器设备码登录，自动保存密钥
tufty auth set sk-...     # 或保存已有的密钥
tufty auth get [--show]   # 查看当前使用的密钥（默认遮蔽）
tufty logout
```

在 <https://tufty.ai/dashboard/organization/api-key> 获取密钥。CLI 查找密钥的顺序：`--api-key` → `TUFTY_API_KEY` → `~/.tufty/config.json` → 交互式登录（仅限终端，CI 中不会触发）。

## 快速开始

```bash
tufty tools list
tufty tools describe pet-dressup

# 先看请求内容和积分预估（不上传、不扣费）
tufty pet-dressup --product ./sweater.jpg --model ./corgi.jpg --quality medium --ratio 1:1 --dry-run

# 正式运行并下载结果
tufty pet-dressup --product ./sweater.jpg --model ./corgi.jpg --quality medium --ratio 1:1 --save ./out
```

## 工具

工具命令由服务端的工具清单生成，选项和价格始终与网站一致。`tufty <tool> -h` 查看当前的参数。

| 命令 | 类型 | 输入 |
| ---- | ---- | ---- |
| `tufty pet-dressup` | 图片 | `--product`（至少 1）、`--model`（至少 1） |
| `tufty background-swap` | 图片 | `--model`（至少 1），`--product` 可选 |
| `tufty flat-to-3d` | 图片 | `--product`（至少 1），`--model` 可选 |
| `tufty image-to-video` | 视频 | `--still`（恰好 1 张） |
| `tufty product-promo` | 视频 | `--still`（1-9 张） |
| `tufty motion-control` | 视频 | `--still`（恰好 1 张）、`--motion-video` 参考视频（参数可选） |
| `tufty replace-elements` | 视频 | `--still`（1-9 张） |

### 图片工具参数

| 参数 | 说明 |
| ---- | ---- |
| `--product <file\|url...>` | 商品图。多件商品逐件生成；同一件商品最多 4 张图，用 `+` 连接（`front.jpg+back.jpg`）。 |
| `--model <file\|url...>` | 模特图：宠物、人物或主体。每个模特和每件商品两两配对。 |
| `--quality <id>` | 画质档位（默认最便宜的一档）。 |
| `--ratio <id>` | 画面比例，含 `auto`（默认）。 |
| `--count <n>` | 每组配对生成的张数（默认 1）。 |
| `--enhance` | 提示词增强；仅在清单启用了该功能的工具上出现。 |

### 视频工具参数

| 参数 | 说明 |
| ---- | ---- |
| `--still <file\|url...>` | 静帧图，张数限制来自清单。 |
| `--duration <seconds>` | 视频时长（默认第一个选项）。 |
| `--ratio <id>` | 画面比例（默认第一个选项）。 |
| `--resolution <id>` | 分辨率（默认最便宜的一档）。 |
| `--motion-video <file\|url>` | 参考运镜视频（仅运镜控制）；原样上传，不做抠图。 |

### 通用参数

| 参数 | 说明 |
| ---- | ---- |
| `--notes <text>` | 本次生成的补充说明。 |
| `--no-cutout` | 跳过自动抠图（每张省 1 积分）。 |
| `--dry-run` | 只校验并打印请求载荷和积分预估；不上传、不扣费。 |
| `--no-wait` | 提交后立即返回 `runId`。 |
| `--timeout <seconds>` | 最长等待秒数（默认 900）。 |
| `--save <dir>` | 把成品下载到该目录。 |
| `--format json\|url` | `json`（默认）输出信封，`url` 每行输出一个成品地址。 |

## 其他命令

```bash
tufty status <runId> [--wait] [--timeout <seconds>] [--format json|url]
tufty upload <file|data-url|url> [--format json|url]   # 输出 tufty 存储上的公开地址
```

全局选项：`--api-key <key>`、`--base-url <url>`、`-l, --lang <en-US|zh-CN>`（会记住）、`--verbose`、`--refresh-manifest`、`-V, --version`、`-h, --help`。

## 输入如何处理

- 本地文件和 `data:` URL 上传到 tufty 存储。
- 已在 tufty 存储（`static.tufty.ai`）上的 http(s) 地址原样使用；其他地址由 CLI 下载后重新上传，因为服务端只接受自家存储上的图片。
- 每张输入图默认先自动抠图（每张 1 积分），`--no-cutout` 可跳过。
- 所有输入（数量、文件、选项）都在上传前校验，写错参数不会白花积分。

## 积分

- 图片工具：画质单价 ×（商品数 × 模特数）× `--count`，一次最多 16 张。
- 视频工具：round(每秒单价 × `--duration`)。
- 另加每张抠图输入图 1 积分。`--dry-run` 会打印准确的预估。

## 输出

```json
{
  "ok": true,
  "result": {
    "tool": "pet-dressup",
    "runId": "3f6c2a1e-8b4d-4e7a-9c55-0d2b7e1f4a90",
    "status": "completed",
    "outputs": [{ "type": "image", "url": "https://static.tufty.ai/.../result.png" }]
  }
}
```

配合 `--no-wait` 时 `status` 为 `running`、`outputs` 为空；配合 `--save` 时每个成品额外带 `path`。

失败时输出 `{ "ok": false, "code", "message", "details" }`。退出码：`0` 成功，`1` 接口或运行错误，`2` 参数或输入不合法。

| Code | 含义 |
| ---- | ---- |
| `no_api_key`、`unauthorized` | 没有密钥或密钥无效（401）。 |
| `insufficient_balance` | 积分不足（402），`details.required` 为所需积分。前往 <https://tufty.ai/dashboard/settings?tab=credits> 充值。 |
| `invalid_request` | 服务端拒绝请求（400），`details.serverCode` 为服务端错误码。 |
| `forbidden`、`not_found` | 403 / 404。 |
| `cli_version_too_low` | 需要升级 CLI（426）。 |
| `server_error`、`network_error` | 服务端或网络问题。 |
| `task_failed`、`timeout` | 任务失败，或在 `--timeout` 内未完成（用 `tufty status <runId> --wait` 继续等）。 |
| `usage_error`、`missing_input`、`too_many_inputs`、`too_many_images`、`file_not_found`、`invalid_video` | 命令不合法（退出码 2）。 |

## 环境变量

| 变量 | 用途 |
| ---- | ---- |
| `TUFTY_API_KEY` | API 密钥。 |
| `TUFTY_BASE_URL` | API 地址（默认 `https://tufty.ai`）。 |
| `TUFTY_CONFIG_DIR` | 配置与缓存目录（默认 `~/.tufty`）。 |
| `TUFTY_LANG` | `en-US` 或 `zh-CN`。 |

## 开发

```bash
npm install --workspaces=false   # 本目录位于网站仓库内，仓库根 package.json 声明了 workspaces
npm run build
npm test
node bin/tufty.cjs --help        # 直接运行 TS 源码，默认连 http://localhost:3300
npm run skills:sync:fixtures     # 用 tests/fixtures 重新生成 skills/
```

新增工具与发布流程见 [CLAUDE.md](./CLAUDE.md)。

## 源码与许可证

源码：[github.com/tufty-ai/tufty-cli](https://github.com/tufty-ai/tufty-cli)，以 [GNU AGPL-3.0-or-later 许可证](./LICENSE) 发布。
