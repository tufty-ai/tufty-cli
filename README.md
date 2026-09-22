# @tufty/cli

[English](./README.md) · [中文](./README.zh-CN.md)

Command-line interface for the [tufty.ai](https://tufty.ai) studio tools: pet dress-up, and short videos from photos. Built for terminals and AI agents: stdout is always a JSON envelope, progress goes to stderr.

> The npm package name and scope are not final yet.

## Install

```bash
npm install -g @tufty/cli
# or run on demand
npx @tufty/cli <command>
```

Requires Node.js 18 or newer.

## Authenticate

```bash
tufty login               # device-code login in the browser; saves the key automatically
tufty auth set sk-...     # or save a key you already have
tufty auth get [--show]   # show the key in use (masked by default)
tufty logout
```

Get a key at <https://tufty.ai/dashboard/organization/api-key>. The CLI looks for a key in this order: `--api-key` → `TUFTY_API_KEY` → `~/.tufty/config.json` → interactive login (terminals only, never in CI).

## Quick start

```bash
tufty tools list
tufty tools describe pet-dressup

# see the request and the credit estimate first (no upload, no charge)
tufty pet-dressup --product ./sweater.jpg --model ./corgi.jpg --quality medium --ratio 1:1 --dry-run

# run it and download the results
tufty pet-dressup --product ./sweater.jpg --model ./corgi.jpg --quality medium --ratio 1:1 --save ./out
```

## Tools

The tool commands are generated from the server's tool manifest, so options and prices always match the website. `tufty <tool> -h` shows the current flags.

| Command | Type | Inputs |
| ------- | ---- | ------ |
| `tufty pet-dressup` | image | `--product` (1+), `--model` (1+) |
| `tufty image-to-video` | video | `--still` (exactly 1) |

### Image tool flags

| Flag | Meaning |
| ---- | ------- |
| `--product <file\|url...>` | Product image(s). Several products run one by one; join up to 4 shots of one product with `+` (`front.jpg+back.jpg`). |
| `--model <file\|url...>` | Model image(s): the pet, person or subject. Each model is paired with every product. |
| `--quality <id>` | Quality tier (default: the cheapest). |
| `--ratio <id>` | Aspect ratio, including `auto` (default). |
| `--count <n>` | Images per product/model pairing (default 1). |
| `--enhance` | Prompt enhancement; only on tools whose manifest enables it. |

### Video tool flags

| Flag | Meaning |
| ---- | ------- |
| `--still <file\|url...>` | Still image(s); the count limits come from the manifest. |
| `--duration <seconds>` | Video length (default: the first option). |
| `--ratio <id>` | Aspect ratio (default: the first option). |
| `--resolution <id>` | Resolution (default: the cheapest). |
| `--motion-video <file\|url>` | Reference motion video; only on tools whose manifest enables it. Uploaded as-is, never cut out. |

### Common flags

| Flag | Meaning |
| ---- | ------- |
| `--notes <text>` | Extra instructions for the run. |
| `--no-cutout` | Skip the automatic subject cutout (saves 1 credit per image). |
| `--dry-run` | Validate and print the payload plus credit estimate; uploads and charges nothing. |
| `--no-wait` | Return the `runId` right after submitting. |
| `--timeout <seconds>` | Max seconds to wait (default 900). |
| `--save <dir>` | Download the outputs into this directory. |
| `--format json\|url` | `json` (default) prints the envelope, `url` prints one output URL per line. |

## Other commands

```bash
tufty status <runId> [--wait] [--timeout <seconds>] [--format json|url]
tufty upload <file|data-url|url> [--format json|url]   # prints the public URL on tufty storage
```

Global options: `--api-key <key>`, `--base-url <url>`, `-l, --lang <en-US|zh-CN>` (remembered), `--verbose`, `--refresh-manifest`, `-V, --version`, `-h, --help`.

## How inputs are handled

- Local files and `data:` URLs are uploaded to tufty storage.
- http(s) URLs on tufty storage (`static.tufty.ai`) are used as-is; any other URL is downloaded by the CLI and re-uploaded, because the service only accepts images on its own storage.
- Every input image first goes through automatic subject cutout (1 credit per image) unless you pass `--no-cutout`.
- All inputs are validated (counts, files, choices) before anything is uploaded, so a typo never costs credits.

## Credits

- Image tools: quality credits × (products × models) × `--count`, at most 16 images per run.
- Video tools: round(credits per second × `--duration`).
- Plus 1 credit per input image cut out. `--dry-run` prints the exact estimate.

## Output

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

With `--no-wait`, `status` is `running` and `outputs` is empty. With `--save`, each output also has `path`.

Failures print `{ "ok": false, "code", "message", "details" }`. Exit codes: `0` success, `1` API or runtime error, `2` invalid flags or inputs.

| Code | Meaning |
| ---- | ------- |
| `no_api_key`, `unauthorized` | No key, or an invalid key (401). |
| `insufficient_balance` | Not enough credits (402); `details.required` has the amount. Top up at <https://tufty.ai/dashboard/settings?tab=credits>. |
| `invalid_request` | Server rejected the request (400); `details.serverCode` has the server's code. |
| `forbidden`, `not_found` | 403 / 404. |
| `cli_version_too_low` | Upgrade the CLI (426). |
| `server_error`, `network_error` | Server or network problem. |
| `task_failed`, `timeout` | The run failed, or did not finish within `--timeout` (resume with `tufty status <runId> --wait`). |
| `usage_error`, `missing_input`, `too_many_inputs`, `too_many_images`, `file_not_found`, `invalid_video` | Invalid command (exit code 2). |

## Environment variables

| Variable | Purpose |
| -------- | ------- |
| `TUFTY_API_KEY` | API key. |
| `TUFTY_BASE_URL` | API base URL (default `https://tufty.ai`). |
| `TUFTY_CONFIG_DIR` | Config and cache directory (default `~/.tufty`). |
| `TUFTY_LANG` | `en-US` or `zh-CN`. |

## Development

```bash
npm install --workspaces=false   # this folder sits inside the website repo, whose package.json declares workspaces
npm run build
npm test
node bin/tufty.cjs --help        # runs the TypeScript source, default base URL http://localhost:3300
npm run skills:sync:fixtures     # regenerate skills/ from tests/fixtures
```

See [CLAUDE.md](./CLAUDE.md) for the add-a-tool and publishing checklist.

## Source & License

Source code: [github.com/tufty-ai/tufty-cli](https://github.com/tufty-ai/tufty-cli). Released under the [GNU AGPL-3.0-or-later](./LICENSE).
