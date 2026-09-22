---
name: tufty-pet-dressup
version: 1.1.1
description: "Pet dress-up on tufty.ai: put any garment (sweater, hoodie, raincoat, costume) onto a photo of a dog or cat and get realistic try-on images without a photoshoot. Use when the user wants to dress up a pet, preview how clothing looks on their pet, or create pet apparel product shots. 宠物换装（tufty.ai）：把任意服饰（毛衣、卫衣、雨衣、节日装）穿到猫狗照片上，生成逼真的上身效果图，不用约拍。适用于给宠物试衣服、预览宠物穿搭、制作宠物服装电商图。"
metadata: {"clawdbot":{"emoji":"🐶","requires":{"bins":["npm","npx"]},"install":"npm install -g @tufty/cli@1.1.1","installAlternative":"npx @tufty/cli@1.1.1","homepage":"https://tufty.ai","source":"https://github.com/tufty-ai/tufty-cli","author":"tufty.ai","license":"AGPL-3.0-or-later","npm":"https://www.npmjs.com/package/@tufty/cli","configLocation":"~/.tufty/config.json","apiEndpoints":["tufty.ai","static.tufty.ai"]},"openclaw":{"systemPrompt":"When invoking this skill, use tufty pet-dressup -h for help."}}
---

# 宠物换装 Pet Dress-Up

[English](./SKILL.md) · [中文](./SKILL-cn.md)

See any outfit on your pet — no photoshoot needed. Pet dress-up on tufty.ai: put any garment (sweater, hoodie, raincoat, costume) onto a photo of a dog or cat and get realistic try-on images without a photoshoot. Use when the user wants to dress up a pet, preview how clothing looks on their pet, or create pet apparel product shots.

## Trigger Keywords

- pet outfit try-on
- dress up my dog
- put clothes on my cat
- pet clothing mockup
- pet apparel product photo
- 宠物换装
- 给狗穿衣服
- 给猫穿衣服
- 宠物试衣
- 宠物服装上身图
- 宠物衣服效果图
- pet-dressup

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
- **npm package**: `@tufty/cli` (pinned to `1.1.1` in this skill's install spec)
- **Config file**: `~/.tufty/config.json`

You can run it on demand without a global install:

```bash
npx @tufty/cli@1.1.1 <command>
```

Or install globally with the exact pinned version declared in `metadata.clawdbot.install`: `npm install -g @tufty/cli@1.1.1`.

## How It Works

This skill is a thin client over the tufty.ai hosted API. When you invoke it:

- The `--product` / `--model` images you pass can be local paths, `data:` URLs or http(s) URLs. Local files and data URLs are uploaded to tufty storage (`static.tufty.ai`). URLs already on tufty storage are used as-is; any other URL is downloaded by the CLI and re-uploaded, because the service only accepts images hosted on tufty storage.
- Every input image first goes through **automatic subject cutout, which costs 1 credit per image**. Pass `--no-cutout` to skip it and use the uploaded image as-is.
- The CLI then submits the run to `tufty.ai` and polls every 3 seconds until it completes (up to `--timeout`, default 900 seconds). `--no-wait` returns the `runId` immediately.
- Generated outputs are hosted on `static.tufty.ai`; `--save <dir>` downloads them.
- Pricing: credits per output image: low=6, medium=18, high=49, xhigh=71, max=94. Total = quality credits x (products x models) x `--count`, plus 1 credit per input image cut out. `--dry-run` prints the exact request and the estimate without uploading or charging anything.

Your API key is only sent to `tufty.ai`; it is never attached to storage uploads or downloads. See [tufty.ai](https://tufty.ai) for the full service terms.

## Usage

**CRITICAL INSTRUCTION FOR AGENT**:
Execute `tufty pet-dressup` to get the result.

```bash
tufty pet-dressup -h

Usage: tufty pet-dressup [options]

[image] Pet Dress-Up: See any outfit on your pet — no photoshoot needed.

Options:
  --product <file|url...>  Product image(s): local path, data: URL or http(s) URL. Several products run one by one;
                           join up to 4 shots of ONE product with "+" (front.jpg+back.jpg). At least 1.
  --model <file|url...>    Model image(s) (the pet, person or subject): local path, data: URL or http(s) URL. Each
                           model is paired with every product. At least 1.
  --quality <id>           Quality tier; credits per output image: low=6, medium=18, high=49, xhigh=71, max=94
                           (choices: "low", "medium", "high", "xhigh", "max", default: "low")
  --ratio <id>             Aspect ratio; auto lets the model decide (1:1=1024x1024, 3:4=1024x1536, 9:16=1024x1536)
                           (choices: "auto", "1:1", "3:4", "9:16", default: "auto")
  --count <n>              Images generated for each product/model pairing (choices: "1", "2", "3", "4", default: "1")
  --enhance                Apply the tool's built-in prompt enhancement
  --notes <text>           Extra instructions for this run (free text, max 2000 chars)
  --no-cutout              Skip the automatic subject cutout on input images (saves 1 credit per image)
  --dry-run                Validate inputs and print the request payload + credit estimate; uploads and charges nothing
  --no-wait                Return the runId right after submitting instead of waiting for the result
  --timeout <seconds>      Max seconds to wait for the run to finish (default: "900")
  --save <dir>             Download the outputs into this directory
  --format <mode>          stdout format: json = full envelope, url = one output URL per line (choices: "json", "url",
                           default: "json")
  -h, --help               display help for command

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
    "tool": "pet-dressup",
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

> - With `--no-wait`: `status` is `"running"` and `outputs` is `[]`; fetch the result later with `tufty status <runId> --wait`.
> - With `--save <dir>`: each output also carries `path`, the absolute local file path.
> - With `--format url`: stdout is just the output URLs, one per line.
> - `--dry-run` returns `{ tool, dryRun: true, payload, estimatedCredits, creditBreakdown: { generation, cutout } }`.
> - Errors: `{ "ok": false, "code": "...", "message": "...", "details": { ... } }` with exit code 1 (exit code 2 for invalid flags or inputs). Progress logs go to stderr, never stdout.

## Examples

```bash
# Put one sweater on one corgi, square, medium quality
tufty pet-dressup --product ./sweater.jpg --model ./corgi.jpg --quality medium --ratio 1:1

# One hoodie shot front and back, tried on two dogs, two images each, saved locally
tufty pet-dressup --product ./hoodie-front.jpg+./hoodie-back.jpg --model ./corgi.jpg ./shiba.jpg --count 2 --save ./out

# Check the credit cost first
tufty pet-dressup --product ./sweater.jpg --model ./corgi.jpg --quality high --dry-run
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

- Use a clear, well-lit photo of the pet with its whole body visible; flat-lay or hanger shots of the garment work best.
- Every product is paired with every pet: 2 products x 2 pets x `--count 2` = 8 images (at most 16 per run).
- Run with `--dry-run` first when the user has not confirmed the credit cost.
- Visit https://tufty.ai for more information.
