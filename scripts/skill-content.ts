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
	"background-swap": {
		emoji: "🏞️",
		description: {
			en: "Scene swap on tufty.ai: place a model or product photo into any new background or setting (beach, studio, street, cafe) without building a set. Use when the user wants to change or replace a photo's background, create lifestyle scene shots, or put a product in context.",
			zh: "场景替换（tufty.ai）：把模特图或商品图放进任意新场景（海边、影棚、街拍、咖啡馆），不用搭背景板。适用于换背景、替换照片背景、制作商品场景图和电商生活方式图。",
		},
		keywords: {
			zh: [
				"场景替换",
				"换背景",
				"替换背景",
				"商品换场景",
				"模特换背景",
				"电商场景图",
			],
			en: [
				"scene swap",
				"change background",
				"replace photo background",
				"product lifestyle shot",
				"put product in a scene",
			],
		},
		examples: [
			{
				title: {
					en: "Move a studio model shot to a sunset beach, portrait 3:4",
					zh: "把棚拍模特图换到日落海边，竖版 3:4",
				},
				command:
					'tufty background-swap --model ./model-white-bg.jpg --notes "sunset beach, warm backlight" --ratio 3:4',
				commandZh:
					'tufty background-swap --model ./model-white-bg.jpg --notes "日落海边，暖色逆光" --ratio 3:4',
			},
			{
				title: {
					en: "Model and handbag together in one scene, with prompt enhancement, two variants",
					zh: "模特和手袋一起放进同一个场景，启用提示词增强，出 2 张",
				},
				command:
					'tufty background-swap --model ./model.jpg --product ./handbag.jpg --notes "minimal marble studio" --enhance --count 2',
				commandZh:
					'tufty background-swap --model ./model.jpg --product ./handbag.jpg --notes "极简大理石影棚" --enhance --count 2',
			},
		],
		tips: {
			en: [
				"`--notes` describes the new scene: be concrete about place, light and mood.",
				"`--product` is optional for this tool; add it when the product should appear together with the model.",
			],
			zh: [
				"`--notes` 用来描述新场景：地点、光线、氛围写得越具体越好。",
				"这个工具的 `--product` 是可选的；需要商品和模特同框时再加上。",
			],
		},
	},
	"flat-to-3d": {
		emoji: "👕",
		description: {
			en: "Flat to 3D on tufty.ai: turn a flat-lay or hanger photo of a garment into a worn-looking, three-dimensional shot (ghost mannequin style) without a model. Use when the user has flat-lay clothing photos and wants volume, fit and drape for product listings.",
			zh: "平铺转3D（tufty.ai）：把平铺或挂拍的衣服照片变成立体的上身效果（隐形模特效果），不用请模特。适用于服装平铺图转立体图、电商详情页和商品主图。",
		},
		keywords: {
			zh: [
				"平铺转3D",
				"平铺图转立体",
				"衣服立体效果",
				"隐形模特",
				"平铺服装图",
				"挂拍转上身",
			],
			en: [
				"flat lay to 3D",
				"flat-lay garment photo",
				"ghost mannequin",
				"invisible mannequin effect",
				"3D clothing shot",
			],
		},
		examples: [
			{
				title: {
					en: "One flat-lay dress, high quality, portrait",
					zh: "一条平铺连衣裙，高画质，竖版",
				},
				command:
					"tufty flat-to-3d --product ./flatlay-dress.jpg --quality high --ratio 3:4",
			},
			{
				title: {
					en: "A tee shot front and back as one product, plus two more garments, saved locally",
					zh: "T 恤正反面算一件商品，再加两件衣服，一次跑完并下载",
				},
				command:
					"tufty flat-to-3d --product ./tee-front.jpg+./tee-back.jpg ./jeans.jpg ./jacket.jpg --save ./out",
			},
		],
		tips: {
			en: [
				"Shoot the garment flat on a plain background, fully visible and not folded.",
				"Front and back shots of the same garment belong in one product: join them with `+`.",
			],
			zh: [
				"衣服平铺在纯色背景上拍，完整展开、不要折叠。",
				"同一件衣服的正反面属于一件商品，用 `+` 连接。",
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
	"product-promo": {
		emoji: "🛍️",
		description: {
			en: "Product promo video on tufty.ai: cut one to nine product photos into a short promotional video (5 or 10 seconds, 720P or 1080P). Use when the user wants a product video, an ecommerce video ad, or a short promo clip made from product shots.",
			zh: "商品短片（tufty.ai）：用 1-9 张商品图剪出一条宣传短视频（5 或 10 秒，720P 或 1080P）。适用于商品视频、电商主图视频、带货短片。",
		},
		keywords: {
			zh: [
				"商品短片",
				"商品视频",
				"产品宣传视频",
				"电商主图视频",
				"带货短视频",
			],
			en: [
				"product promo video",
				"product video",
				"ecommerce video ad",
				"promo clip from product photos",
			],
		},
		examples: [
			{
				title: {
					en: "Three angles of a bag into a 10-second 1080P vertical promo",
					zh: "包包的三个角度剪成 10 秒 1080P 竖版短片",
				},
				command:
					"tufty product-promo --still ./bag-1.jpg ./bag-2.jpg ./bag-3.jpg --duration 10 --resolution 1080P --ratio 9:16",
			},
			{
				title: {
					en: "Check the credit cost of a 1080P run first",
					zh: "先估算 1080P 要多少积分",
				},
				command:
					"tufty product-promo --still ./sneaker.jpg --resolution 1080P --duration 10 --dry-run",
			},
		],
		tips: {
			en: [
				"Several angles of the same product give the edit more to work with.",
				"Resolution is priced per second (see `--resolution`); run with `--dry-run` to see the total.",
			],
			zh: [
				"同一件商品多给几个角度，剪出来的短片更丰富。",
				"分辨率按秒计价（见 `--resolution`）；加 `--dry-run` 先看总价。",
			],
		},
	},
	"motion-control": {
		emoji: "🎥",
		description: {
			en: "Motion control on tufty.ai: animate a still image by following the camera movement and subject motion of a reference video. Use when the user wants to copy a camera move, transfer motion from a reference clip, or control exactly how the camera and subject move.",
			zh: "运镜控制（tufty.ai）：让一张静图按参考视频的运镜和主体动作动起来。适用于模仿运镜、动作迁移、用参考视频控制镜头与主体的运动。",
		},
		keywords: {
			zh: ["运镜控制", "运镜模仿", "参考视频运镜", "动作迁移", "镜头运动控制"],
			en: [
				"motion control",
				"camera movement from a reference video",
				"motion transfer",
				"copy a camera move",
				"reference motion video",
			],
		},
		examples: [
			{
				title: {
					en: "Follow a dolly-in reference clip, 5 seconds, vertical",
					zh: "跟随一段推镜参考视频，5 秒，竖版",
				},
				command:
					"tufty motion-control --still ./model.jpg --motion-video ./dolly-in.mp4 --duration 5 --ratio 9:16",
			},
			{
				title: {
					en: "Reference video from a URL, 10 seconds, saved locally",
					zh: "参考视频用网络地址，10 秒，下载到本地",
				},
				command:
					"tufty motion-control --still ./corgi.jpg --motion-video https://example.com/walk-cycle.mp4 --duration 10 --save ./out",
			},
		],
		tips: {
			en: [
				"The reference video is uploaded as-is (no cutout). Keep it short and close to the chosen duration.",
				"Pick a still whose subject and framing resemble the reference clip.",
			],
			zh: [
				"参考视频原样上传、不抠图；尽量短，时长接近所选 `--duration`。",
				"静图的主体和构图尽量和参考视频相近。",
			],
		},
	},
	"replace-elements": {
		emoji: "🐾",
		description: {
			en: "Pet promos on tufty.ai: make a short video where a pet appears on camera with a product and sells it, from one to nine stills (the pet and the product). Use when the user wants a pet influencer style promo, a pet product video, or a cute pet ad.",
			zh: "萌宠带货（tufty.ai）：用 1-9 张静帧（宠物和商品）生成萌宠出镜带货的短视频，一条视频讲清卖点。适用于宠物带货视频、宠物用品推广、萌宠种草视频。",
		},
		keywords: {
			zh: [
				"萌宠带货",
				"宠物带货视频",
				"萌宠种草",
				"宠物用品推广视频",
				"猫狗带货",
			],
			en: [
				"pet promo video",
				"pet product video",
				"pet influencer ad",
				"pet selling a product",
				"cute pet ad",
			],
		},
		examples: [
			{
				title: {
					en: "A corgi presenting a bag of treats, 10 seconds, vertical",
					zh: "柯基出镜推荐一袋零食，10 秒，竖版",
				},
				command:
					'tufty replace-elements --still ./corgi.jpg ./dog-treats.jpg --duration 10 --ratio 9:16 --notes "the corgi sniffs the bag and wags its tail"',
				commandZh:
					'tufty replace-elements --still ./corgi.jpg ./dog-treats.jpg --duration 10 --ratio 9:16 --notes "柯基闻了闻零食袋，开心地摇尾巴"',
			},
			{
				title: {
					en: "A cat with a cat bed at 1080P, submit without waiting",
					zh: "猫咪和猫窝，1080P，提交后不等待",
				},
				command:
					"tufty replace-elements --still ./cat.jpg ./cat-bed.jpg --resolution 1080P --no-wait",
			},
		],
		tips: {
			en: [
				"Include at least one clear photo of the pet and one of the product.",
				"Describe the selling point or the action in `--notes`.",
			],
			zh: [
				"至少给一张清晰的宠物图和一张商品图。",
				"在 `--notes` 里写清卖点或想要的动作。",
			],
		},
	},
};
