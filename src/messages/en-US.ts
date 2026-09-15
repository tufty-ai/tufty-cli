import type { Messages } from "./types";

export const messages: Messages = {
	cli: {
		description:
			"tufty.ai studio tools in your terminal. stdout is a JSON envelope; progress goes to stderr.",
		apiKeyOption: "API key (overrides TUFTY_API_KEY and the config file)",
		baseUrlOption: "API base URL (overrides TUFTY_BASE_URL)",
		verboseOption: "Print debug logs to stderr",
		refreshManifestOption:
			"Skip the 10-minute local tool-list cache and fetch it from the server",
		langOption: "Output language (en-US or zh-CN); remembered for later runs",
		unsupportedLocale: (locale, supported) =>
			`Unsupported locale: ${locale}. Supported: ${supported}`,
		unknownCommand: (name) => `Unknown command '${name}'`,
		manifestUnavailable: (baseUrl) =>
			`Could not load the tool list from ${baseUrl}. Check your network or --base-url, then retry.`,
	},
	auth: {
		description: "Manage the API key",
		setDescription: "Save an API key to the config file",
		setKeyArg: "API key (sk-...)",
		getDescription: "Show the API key in use (masked by default)",
		getShowOption: "Show the full key instead of a masked one",
		loginDescription:
			"Log in with a device code in the browser (works in remote shells too)",
		loginSuccess: "Logged in; API key saved to the config file",
		logoutDescription: "Log out (remove the API key from the config file)",
		logoutSuccess: "Logged out; API key removed from the config file",
		logoutNothing: "No API key in the config file; nothing to remove",
		logoutEnvWarning:
			"Note: TUFTY_API_KEY is still set in the environment and will keep being used. Unset it to log out completely.",
		notConfigured: "No API key configured",
		noApiKey: (keyUrl) =>
			`No API key found. Pass --api-key, set TUFTY_API_KEY, run \`tufty login\`, or get a key at ${keyUrl} and run \`tufty auth set <key>\`.`,
	},
	login: {
		starting: "\n[tufty] Starting login...",
		visit: (url) =>
			`Open this link in any browser to authorize the CLI:\n${url}\n`,
		polling: (minutes) =>
			`Waiting for authorization (link valid for ${minutes} minutes)...`,
		expired: "The login request expired or was rejected",
		timeout: (minutes) => `Login was not completed within ${minutes} minutes`,
	},
	tools: {
		namespaceDescription: "Browse the studio tools",
		listDescription: "List all studio tools",
		describeDescription:
			"Print one tool's full entry: inputs, options, prices and limits",
		describeIdArg: "Tool id, e.g. pet-dressup",
		toolNotFound: (id) => `No studio tool with id '${id}'`,
		statusDescription: "Check a run by runId, or wait for it with --wait",
		statusWaitOption: "Poll until the run completes or fails",
		productOption: (min) =>
			`Product image(s): local path, data: URL or http(s) URL. Several products run one by one; join up to 4 shots of ONE product with "+" (front.jpg+back.jpg). ${min > 0 ? `At least ${min}.` : "Optional."}`,
		modelOption: (min) =>
			`Model image(s) (the pet, person or subject): local path, data: URL or http(s) URL. Each model is paired with every product. ${min > 0 ? `At least ${min}.` : "Optional."}`,
		qualityOption: (pricing) =>
			`Quality tier; credits per output image: ${pricing}`,
		ratioImageOption: (sizes) =>
			`Aspect ratio; auto lets the model decide (${sizes})`,
		countOption: "Images generated for each product/model pairing",
		enhanceOption: "Apply the tool's built-in prompt enhancement",
		stillOption: (range) =>
			`Still image(s) for the video: local path, data: URL or http(s) URL (${range})`,
		exactly: (n) => `exactly ${n}`,
		durationOption: "Video length in seconds",
		ratioVideoOption: "Video aspect ratio",
		resolutionOption: (pricing) =>
			`Output resolution; credits per second: ${pricing}`,
		motionVideoOption:
			"Reference motion video to follow (local path or http(s) URL); uploaded as-is, never cut out",
		notesOption: "Extra instructions for this run (free text, max 2000 chars)",
		noCutoutOption:
			"Skip the automatic subject cutout on input images (saves 1 credit per image)",
		dryRunOption:
			"Validate inputs and print the request payload + credit estimate; uploads and charges nothing",
		noWaitOption:
			"Return the runId right after submitting instead of waiting for the result",
		timeoutOption: "Max seconds to wait for the run to finish",
		saveOption: "Download the outputs into this directory",
		formatOption:
			"stdout format: json = full envelope, url = one output URL per line",
		helpAfter: `
Credits:
  image = quality credits x pairs x count, pairs = products x models
  video = round(credits per second x duration)
  + 1 credit per input image cut out (skip with --no-cutout)

Output (stdout JSON envelope):
  { ok: true, result: { tool, runId, status, outputs: [{ type, url, path? }] } }
  With --no-wait: status "running" and outputs [] -> poll with \`tufty status <runId> --wait\`
  On failure: { ok: false, code, message, details? } (exit 1; usage errors exit 2)`,
		statusHelpAfter: `
Output: { ok: true, result: { tool, runId, status, outputs: [{ type, url }] } }
A failed run returns { ok: false, code: "task_failed", ... }.`,
		missingInput: (flag, min, got) =>
			`--${flag} needs at least ${min} image(s), got ${got}`,
		tooManyInputs: (flag, max, got) =>
			`--${flag} accepts at most ${max} image(s), got ${got}`,
		tooManyParts: (value, max) =>
			`"${value}" joins more than ${max} images; one product can have at most ${max} shots`,
		tooManyImages: (pairs, count, max) =>
			`${pairs} product/model pairing(s) x --count ${count} = ${pairs * count} images; one run makes at most ${max}. Split the run or lower --count.`,
		fileNotFound: (p) => `File not found: ${p}`,
		invalidTimeout: (value) =>
			`--timeout must be a positive number of seconds, got '${value}'`,
		costEstimate: (total, generation, cutout) =>
			`[cost-estimate] ~${total} credits (generation ${generation} + cutout ${cutout})`,
		uploading: (label) => `Uploading ${label}...`,
		cuttingOut: (label) => `Cutting out the subject: ${label}`,
		cutoutDegraded: (label) =>
			`[cutout] ${label}: degraded result, the subject could not be isolated cleanly; check the output`,
		cutoutEmpty: (label) =>
			`[cutout] ${label}: no subject found, using the uploaded image as-is`,
		cutoutNotStored: (label) =>
			`[cutout] ${label}: the cutout was not stored on tufty storage, using the uploaded image as-is`,
		submitted: (runId, credits) =>
			`Run submitted: ${runId}${credits !== undefined ? ` (${credits} credits reserved)` : ""}`,
		waiting: (runId) =>
			`Waiting for the result... (safe to interrupt: resume with \`tufty status ${runId} --wait\`)`,
		completed: (count) => `Run completed with ${count} output(s):`,
		runFailed: (reason) => `Run failed: ${reason}`,
		runTimeout: (seconds, runId) =>
			`Run did not finish within ${seconds}s. Check again with \`tufty status ${runId} --wait\``,
		saved: (p) => `[save] ${p}`,
	},
	api: {
		networkError: (url, reason) => `Could not reach ${url}: ${reason}`,
		badResponse: (url) => `Unexpected response from ${url}`,
		requestFailed: (status) => `Request failed with status ${status}`,
		unauthorized: (keyUrl) =>
			`API key is missing or invalid. Get one at ${keyUrl} and run \`tufty auth set <key>\`.`,
		insufficientBalance: (required) =>
			`Not enough credits${required !== undefined ? ` (this step needs ${required})` : ""}.`,
		insufficientBalanceHint: (rechargeUrl) =>
			`[tufty] Not enough credits. Top up at ${rechargeUrl} and run the command again.`,
		forbidden: "Access denied.",
		notFound: "Not found.",
		invalidRequest: (serverCode) =>
			`The server rejected the request${serverCode ? ` (${serverCode})` : ""}.`,
		serverError: (status, serverCode) =>
			`Server error ${status}${serverCode ? ` (${serverCode})` : ""}. Try again later.`,
		versionTooLow: (upgradeCommand) =>
			`This CLI version is no longer supported. Upgrade with \`${upgradeCommand}\` and retry.`,
		uploadFailed: (reason) => `Upload failed: ${reason}`,
		remoteDownloadFailed: (url, reason) =>
			`Could not download ${url} for re-upload: ${reason}`,
		videoTruncated: (type, declared, actual) =>
			`Video file is incomplete: box '${type}' declares ${declared} bytes but the file ends at ${actual} bytes (export or download probably did not finish). Check the source video and retry.`,
		videoNoMoov:
			"Video file has no moov atom (index); it is probably corrupt or not fully exported. Check the source video and retry.",
		downloadFailed: (url, attempts, reason) =>
			`Failed to download ${url} after ${attempts} attempts: ${reason}`,
	},
	upload: {
		description:
			"Upload a file to tufty storage and print its public URL. Accepts a local path, data: URL or http(s) URL (tufty-hosted URLs pass through; other URLs are downloaded and re-uploaded).",
		fileArg: "Local path, data: URL or http(s) URL",
	},
};
