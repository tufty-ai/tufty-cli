/**
 * 技能文档里清单给不了的部分：触发描述、关键词、示例、提示。
 * 新增工具必须在这里补一条，否则 sync-skills 报错退出。示例里用到的 flag 会在生成时
 * 对照 CLI 真实选项校验，写错了同样报错。
 */

export type SkillExample = {
	title: { en: string; zh: string };
	command: string;
	/** 中文文档里用的命令（通常只是 --notes 换成中文），缺省同 command */
	commandZh?: string;
};

export type SkillContent = {
	emoji: string;
	/** frontmatter description：写清楚「什么时候该用这个技能」 */
	description: { en: string; zh: string };
	keywords: { en: string[]; zh: string[] };
	examples: SkillExample[];
	tips: { en: string[]; zh: string[] };
};

export const SKILL_CONTENT: Record<string, SkillContent> = {
	"pet-dressup": {
		emoji: "🐶",
		description: {
			en: "Pet dress-up on tufty.ai: put any garment (sweater, hoodie, raincoat, costume) onto a photo of a dog or cat and get realistic try-on images without a photoshoot. Use when the user wants to dress up a pet, preview how clothing looks on their pet, or create pet apparel product shots.",
			zh: "宠物换装（tufty.ai）：把任意服饰（毛衣、卫衣、雨衣、节日装）穿到猫狗照片上，生成逼真的上身效果图，不用约拍。适用于给宠物试衣服、预览宠物穿搭、制作宠物服装电商图。",
		},
		keywords: {
			zh: [
				"宠物换装",
				"给狗穿衣服",
				"给猫穿衣服",
				"宠物试衣",
				"宠物服装上身图",
				"宠物衣服效果图",
			],
			en: [
				"pet outfit try-on",
				"dress up my dog",
				"put clothes on my cat",
				"pet clothing mockup",
				"pet apparel product photo",
			],
		},
		examples: [
			{
				title: {
					en: "Put one sweater on one corgi, square, medium quality",
					zh: "把一件毛衣穿到柯基身上，1:1，中画质",
				},
				command:
					"tufty pet-dressup --product ./sweater.jpg --model ./corgi.jpg --quality medium --ratio 1:1",
			},
			{
				title: {
					en: "One hoodie shot front and back, tried on two dogs, two images each, saved locally",
					zh: "同一件卫衣的正反面作为一件商品，试穿到两只狗身上，每组 2 张，下载到本地",
				},
				command:
					"tufty pet-dressup --product ./hoodie-front.jpg+./hoodie-back.jpg --model ./corgi.jpg ./shiba.jpg --count 2 --save ./out",
			},
			{
				title: { en: "Check the credit cost first", zh: "先看要花多少积分" },
				command:
					"tufty pet-dressup --product ./sweater.jpg --model ./corgi.jpg --quality high --dry-run",
			},
		],
		tips: {
			en: [
				"Use a clear, well-lit photo of the pet with its whole body visible; flat-lay or hanger shots of the garment work best.",
				"Every product is paired with every pet: 2 products x 2 pets x `--count 2` = 8 images (at most 16 per run).",
			],
			zh: [
				"宠物照片要清晰、光线好、身体完整；服饰用平铺图或挂拍图效果最好。",
				"每件商品会和每只宠物两两配对：2 件商品 x 2 只宠物 x `--count 2` = 8 张（一次最多 16 张）。",
			],
		},
	},
	"image-to-video": {
		emoji: "🎬",
		description: {
			en: "Image to video on tufty.ai: animate a single fashion, pet or product photo into a short shareable video clip (5 or 10 seconds; 9:16, 1:1 or 16:9). Use when the user wants to make a photo move, turn a picture into a video, or create a short clip for social media.",
			zh: "图转视频（tufty.ai）：把一张时尚、宠物或商品图片变成可分享的短视频（5 或 10 秒；9:16、1:1、16:9）。适用于让照片动起来、图片生成视频、制作社媒短视频。",
		},
		keywords: {
			zh: [
				"图转视频",
				"图片生成视频",
				"让照片动起来",
				"照片变视频",
				"静图转动态",
			],
			en: [
				"image to video",
				"animate a photo",
				"photo to video",
				"make a picture move",
				"short video from an image",
			],
		},
		examples: [
			{
				title: {
					en: "A 5-second vertical clip from a lookbook photo",
					zh: "用一张 lookbook 图生成 5 秒竖版短视频",
				},
				command:
					"tufty image-to-video --still ./lookbook.jpg --duration 5 --ratio 9:16",
			},
			{
				title: {
					en: "10-second square clip with motion direction; return immediately and poll later",
					zh: "10 秒方形视频并描述动作；提交后立即返回，稍后再查",
				},
				command:
					'tufty image-to-video --still ./cat-in-sweater.png --duration 10 --ratio 1:1 --notes "the cat turns its head and blinks" --no-wait',
				commandZh:
					'tufty image-to-video --still ./cat-in-sweater.png --duration 10 --ratio 1:1 --notes "猫咪转头眨眼" --no-wait',
			},
			{
				title: {
					en: "Wait for a run submitted with --no-wait",
					zh: "等待用 --no-wait 提交的任务",
				},
				command: "tufty status <runId> --wait",
			},
		],
		tips: {
			en: [
				"Video runs take several minutes. With `--no-wait`, poll with `tufty status <runId> --wait`.",
				"Use `--notes` to describe the motion you want.",
			],
			zh: [
				"视频生成需要几分钟。用了 `--no-wait` 的话，之后用 `tufty status <runId> --wait` 取结果。",
				"用 `--notes` 描述想要的动作。",
			],
		},
	},
};
