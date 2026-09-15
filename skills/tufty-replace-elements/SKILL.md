---
name: tufty-replace-elements
version: 1.1.0
description: "Pet promos on tufty.ai: make a short video where a pet appears on camera with a product and sells it, from one to nine stills (the pet and the product). Use when the user wants a pet influencer style promo, a pet product video, or a cute pet ad. 萌宠带货（tufty.ai）：用 1-9 张静帧（宠物和商品）生成萌宠出镜带货的短视频，一条视频讲清卖点。适用于宠物带货视频、宠物用品推广、萌宠种草视频。"
metadata: {"clawdbot":{"emoji":"🐾","requires":{"bins":["npm","npx"]},"install":"npm install -g @tufty/cli@1.1.0","installAlternative":"npx @tufty/cli@1.1.0","homepage":"https://tufty.ai","source":"https://github.com/tufty-ai/tufty-cli","author":"tufty.ai","license":"AGPL-3.0-or-later","npm":"https://www.npmjs.com/package/@tufty/cli","configLocation":"~/.tufty/config.json","apiEndpoints":["tufty.ai","static.tufty.ai"]},"openclaw":{"systemPrompt":"When invoking this skill, use tufty replace-elements -h for help."}}
---

# 萌宠带货 Pet Promos

[English](./SKILL.md) · [中文](./SKILL-cn.md)

Put a pet on camera to sell the product. Pet promos on tufty.ai: make a short video where a pet appears on camera with a product and sells it, from one to nine stills (the pet and the product). Use when the user wants a pet influencer style promo, a pet product video, or a cute pet ad.

## Trigger Keywords

- pet promo video
- pet product video
- pet influencer ad
- pet selling a product
- cute pet ad
- 萌宠带货
- 宠物带货视频
- 萌宠种草
- 宠物用品推广视频
- 猫狗带货
- replace-elements

## Authentication

All requests require a tufty.ai API key. The recommended way to authenticate is:

```bash
tufty login
```

This runs a device-code flow: it opens an authorization page in the browser and also prints the link, so it works in remote shells too. Once approved, the CLI **automatically saves your API key** to its local config.

### Alternative: Set the Key Manually

If you already have an API key, save it directly:

```bash
tufty auth set YOUR_API_KEY
```

The key is stored in `~/.tufty/config.json` (`%USERPROFILE%\.tufty\config.json` on Windows), readable only by your OS user. You can also pass it per invocation with `--api-key` or the `TUFTY_API_KEY` environment variable. Lookup order: `--api-key` → `TUFTY_API_KEY` → config file → interactive login (terminals only, never in CI).

### Getting Your API Key Manually

1. Sign in or create an account at [tufty.ai](https://tufty.ai)
2. Open [tufty.ai/dashboard/organization/api-key](https://tufty.ai/dashboard/organization/api-key) (also linked from the user menu)
3. Copy the key; it starts with `sk-`

Keys can be **rotated or revoked at any time** from the same page.

## About & Provenance

- **Homepage**: [tufty.ai](https://tufty.ai)
- **Source code**: [github.com/tufty-ai/tufty-cli](https://github.com/tufty-ai/tufty-cli) (AGPL-3.0-or-later)
- **Maintainer**: tufty.ai
- **npm package**: `@tufty/cli` (pinned to `1.1.0` in this skill's install spec)
- **Config file**: `~/.tufty/config.json`

You can run it on demand without a global install:

```bash
npx @tufty/cli@1.1.0 <command>
```

Or install globally with the exact pinned version declared in `metadata.clawdbot.install`: `npm install -g @tufty/cli@1.1.0`.

## How It Works

This skill is a thin client over the tufty.ai hosted API. When you invoke it:

- The `--still` images you pass can be local paths, `data:` URLs or http(s) URLs. Local files and data URLs are uploaded to tufty storage (`static.tufty.ai`). URLs already on tufty storage are used as-is; any other URL is downloaded by the CLI and re-uploaded, because the service only accepts images hosted on tufty storage.
- Every input image first goes through **automatic subject cutout, which costs 1 credit per image**. Pass `--no-cutout` to skip it and use the uploaded image as-is.
- The CLI then submits the run to `tufty.ai` and polls every 3 seconds until it completes (up to `--timeout`, default 900 seconds). `--no-wait` returns the `runId` immediately.
- Generated outputs are hosted on `static.tufty.ai`; `--save <dir>` downloads them.
- Pricing: credits per second: 720P=31.75, 1080P=78.59. Total = round(credits per second x `--duration`), plus 1 credit per still cut out (e.g. 5s at 720P = 159 credits + cutouts). `--dry-run` prints the exact request and the estimate without uploading or charging anything.

Your API key is only sent to `tufty.ai`; it is never attached to storage uploads or downloads. See [tufty.ai](https://tufty.ai) for the full service terms.

## Usage

**CRITICAL INSTRUCTION FOR AGENT**:
Execute `tufty replace-elements` to get the result.

```bash
tufty replace-elements -h

Usage: tufty replace-elements [options]

[video] Pet Promos: Put a pet on camera to sell the product.

Options:
  --still <file|url...>  Still image(s) for the video: local path, data: URL or http(s) URL (1-9)
  --duration <seconds>   Video length in seconds (choices: "5", "10", default: "5")
  --ratio <id>           Video aspect ratio (choices: "9:16", "1:1", "16:9", default: "9:16")
  --resolution <id>      Output resolution; credits per second: 720P=31.75, 1080P=78.59 (choices: "720P", "1080P",
                         default: "720P")
  --notes <text>         Extra instructions for this run (free text, max 2000 chars)
  --no-cutout            Skip the automatic subject cutout on input images (saves 1 credit per image)
  --dry-run              Validate inputs and print the request payload + credit estimate; uploads and charges nothing
  --no-wait              Return the runId right after submitting instead of waiting for the result
  --timeout <seconds>    Max seconds to wait for the run to finish (default: "900")
  --save <dir>           Download the outputs into this directory
  --format <mode>        stdout format: json = full envelope, url = one output URL per line (choices: "json", "url",
                         default: "json")
  -h, --help             display help for command

Credits:
  image = quality credits x pairs x count, pairs = products x models
  video = round(credits per second x duration)
  + 1 credit per input image cut out (skip with --no-cutout)

Output (stdout JSON envelope):
  { ok: true, result: { tool, runId, status, outputs: [{ type, url, path? }] } }
  With --no-wait: status "running" and outputs [] -> poll with `tufty status <runId> --wait`
  On failure: { ok: false, code, message, details? } (exit 1; usage errors exit 2)
```

## Output Format

```json
{
  "ok": true,
  "result": {
    "tool": "replace-elements",
    "runId": "3f6c2a1e-8b4d-4e7a-9c55-0d2b7e1f4a90",
    "status": "completed",
    "outputs": [
      {
        "type": "video",
        "url": "https://static.tufty.ai/studio/3f6c2a1e-8b4d-4e7a-9c55-0d2b7e1f4a90/result.mp4"
      }
    ]
  }
}
```

> - With `--no-wait`: `status` is `"running"` and `outputs` is `[]`; fetch the result later with `tufty status <runId> --wait`.
> - With `--save <dir>`: each output also carries `path`, the absolute local file path.
> - With `--format url`: stdout is just the output URLs, one per line.
> - `--dry-run` returns `{ tool, dryRun: true, payload, estimatedCredits, creditBreakdown: { generation, cutout } }`.
> - Errors: `{ "ok": false, "code": "...", "message": "...", "details": { ... } }` with exit code 1 (exit code 2 for invalid flags or inputs). Progress logs go to stderr, never stdout.

## Examples

```bash
# A corgi presenting a bag of treats, 10 seconds, vertical
tufty replace-elements --still ./corgi.jpg ./dog-treats.jpg --duration 10 --ratio 9:16 --notes "the corgi sniffs the bag and wags its tail"

# A cat with a cat bed at 1080P, submit without waiting
tufty replace-elements --still ./cat.jpg ./cat-bed.jpg --resolution 1080P --no-wait
```

## Error Handling

| Code | When | What to do |
| ---- | ---- | ---------- |
| `no_api_key` / `unauthorized` | No API key found, or the key is invalid (HTTP 401) | Get a key at https://tufty.ai/dashboard/organization/api-key, run `tufty auth set <key>` (or `tufty login`), then retry |
| `insufficient_balance` | Not enough credits (HTTP 402; `details.required` = credits needed) | Top up at https://tufty.ai/dashboard/settings?tab=credits |
| `missing_input` / `too_many_inputs` / `too_many_images` / `file_not_found` / `invalid_video` / `usage_error` | Invalid flags or inputs, rejected before anything is uploaded (exit code 2) | Fix the command; see `tufty <tool> -h` |
| `invalid_request` | Server rejected the request (HTTP 400; `details.serverCode`, e.g. `unknown_template`, `reference_not_allowed`) | Check the inputs; `tufty tools describe <tool>` shows the current options |
| `cli_version_too_low` | CLI is older than the server accepts (HTTP 426) | `npm install -g @tufty/cli@latest`, then retry |
| `task_failed` | Generation failed on the server (`details.serverCode`) | Retry, or change the input images / `--notes` |
| `timeout` | Run not finished within `--timeout` (`details.runId`) | `tufty status <runId> --wait` |
| `not_found` | Unknown `runId` (HTTP 404) | Check the runId |
| `server_error` / `network_error` / `upload_failed` / `download_failed` | Server, storage or network problem | Retry later |

> **AGENT CRITICAL INSTRUCTION**:
> 1. If the execution result returns `code: "insufficient_balance"`, you MUST explicitly inform the user that their credits are insufficient and guide them to recharge: [https://tufty.ai/dashboard/settings?tab=credits](https://tufty.ai/dashboard/settings?tab=credits)
> 2. If the execution result returns `code: "unauthorized"` or `code: "no_api_key"`, you MUST inform the user to get their API key from [https://tufty.ai/dashboard/organization/api-key](https://tufty.ai/dashboard/organization/api-key) and save it using `tufty auth set <key>`, then resume the task.

## Tips

- Include at least one clear photo of the pet and one of the product.
- Describe the selling point or the action in `--notes`.
- Run with `--dry-run` first when the user has not confirmed the credit cost.
- Visit https://tufty.ai for more information.
