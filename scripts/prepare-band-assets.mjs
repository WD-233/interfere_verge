/**
 * 把 src/my_fig/ 里的原图压成适合上网的尺寸，输出到站点会用到的位置。
 *
 * 手机原图动辄 4MB 一张，直接提交进 Git 会让仓库迅速膨胀、构建变慢，
 * 也没有必要——网页上肉眼看不出区别。原图一律保留在 src/my_fig/ 不动，
 * 这个脚本只负责生成派生文件，可以随时重复运行。
 *
 * 用法：pnpm run prepare-band-assets
 * 往 src/my_fig/ 里加了新照片之后重跑一次即可。
 */

import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MAX_EDGE = 2560;
const QUALITY = 82;
const IMAGE_EXTENSIONS = new Set([
	".jpg",
	".jpeg",
	".png",
	".webp",
	".avif",
	".bmp",
	".tif",
	".tiff",
]);

/**
 * naming:
 *   "basename" 用原文件名（适合在 Markdown 里引用的文章配图）
 *   "index"    按排序后的序号命名 01.webp、02.webp…（私密相册的种子素材，
 *              原名是无意义的导出串，序号让 seed.ts 里的引用保持简单）
 *   "hash"     用原文件名的短哈希（公开相册照片，避免下划线：
 *              相册扫描器会把文件名里的下划线当成标签分隔符）
 *   "map"      按 rename 表逐个指定输出名
 */
const jobs = [
	{
		label: "首页背景图",
		from: "src/my_fig/background/desktop-banner",
		to: "public/assets/banner",
		naming: "basename",
	},
	{
		label: "相册 Ours",
		from: "src/my_fig/albums/First",
		to: "public/images/albums/First",
		naming: "hash",
		// 保持封面和之前一致，避免相册预览图变化
		coverFrom: "mmexport1782257115776.jpg",
	},
	{
		label: "文章配图 2026-01-08",
		from: "src/my_fig/main/20260108",
		to: "src/content/posts/live-2026-01-08",
		naming: "basename",
	},
	{
		label: "文章配图 2026-05-27",
		from: "src/my_fig/main/20260527",
		to: "src/content/posts/live-2026-05-27",
		naming: "basename",
	},
	{
		label: "文章配图 2026-06-23",
		from: "src/my_fig/main/20260623",
		to: "src/content/posts/live-2026-06-23",
		naming: "basename",
	},
	{
		label: "成员照片",
		from: "src/my_fig/members",
		to: "public/images/members",
		naming: "map",
		recursive: true,
		// 新成员照片放进 src/my_fig/members/<英文名>/ 后，在这里加一行映射
		rename: {
			"Haoxun Li/eee88d6b9fc90fd7c4f46c272bdc9591.jpg": "haoxun-li.webp",
			"Zhenzhe Chang/aebfd1996eafddf9b767fa8671c28828.jpg":
				"zhenzhe-chang.webp",
			"Chenxu Ji/cbc05a202b4da2e2cbcd3ddccf06e72a.jpg": "chenxu-ji.webp",
		},
	},
	// 以下三项是太阳站的种子素材，路径写在 api/_lib/seed.ts 里，改名要同步过去
	{
		label: "太阳站相册 d5",
		from: "src/my_fig/36/albums/d5",
		to: "public/us-assets/albums/d5",
		naming: "index",
	},
	{
		label: "太阳站相册 我们",
		from: "src/my_fig/36/albums/with",
		to: "public/us-assets/albums/with",
		naming: "index",
	},
	{
		label: "太阳站动态配图",
		from: "src/my_fig/36/content/20260814xx",
		to: "public/us-assets/moments/20260814",
		naming: "map",
		rename: {
			"7330f844284407274121e8532cfdc48c.png": "plan-complete.webp",
		},
	},
];

function listImages(dir, recursive = false) {
	const walk = (current, prefix) =>
		readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
			const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				return recursive ? walk(path.join(current, entry.name), relative) : [];
			}
			return IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
				? [relative]
				: [];
		});

	return walk(dir, "").sort((a, b) => a.localeCompare(b, "en"));
}

function targetName(file, job, index) {
	if (job.naming === "map") {
		return job.rename?.[file] ?? null;
	}
	if (job.naming === "index") {
		return `${String(index + 1).padStart(2, "0")}.webp`;
	}
	if (job.naming === "hash") {
		const hash = createHash("sha1").update(file).digest("hex").slice(0, 10);
		return `p${hash}.webp`;
	}
	const base = path
		.basename(file, path.extname(file))
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return `${base || createHash("sha1").update(file).digest("hex").slice(0, 10)}.webp`;
}

async function convert(sourcePath, targetPath) {
	await sharp(sourcePath)
		.rotate() // 按 EXIF 摆正，手机竖拍图否则会躺下
		.resize({
			width: MAX_EDGE,
			height: MAX_EDGE,
			fit: "inside",
			withoutEnlargement: true,
		})
		.webp({ quality: QUALITY })
		.toFile(targetPath);
	return statSync(targetPath).size;
}

let totalBefore = 0;
let totalAfter = 0;

for (const job of jobs) {
	const fromDir = path.join(root, job.from);
	const toDir = path.join(root, job.to);

	if (!existsSync(fromDir)) {
		console.warn(`跳过 ${job.label}：源目录不存在 ${job.from}`);
		continue;
	}

	mkdirSync(toDir, { recursive: true });

	// 清掉上一次生成的图片，避免删了原图之后派生文件还留着。
	// info.json / index.md 等非图片文件保持不动。
	for (const existing of readdirSync(toDir)) {
		if (IMAGE_EXTENSIONS.has(path.extname(existing).toLowerCase())) {
			rmSync(path.join(toDir, existing));
		}
	}

	const files = listImages(fromDir, job.recursive);
	let jobBefore = 0;
	let jobAfter = 0;
	let converted = 0;

	for (const [index, file] of files.entries()) {
		const name = targetName(file, job, index);
		if (!name) {
			console.warn(`  ! ${file} 没有在 rename 表里，已跳过`);
			continue;
		}
		const sourcePath = path.join(fromDir, file);
		jobBefore += statSync(sourcePath).size;
		jobAfter += await convert(sourcePath, path.join(toDir, name));
		converted += 1;
	}

	if (job.coverFrom) {
		const coverSource = path.join(fromDir, job.coverFrom);
		if (existsSync(coverSource)) {
			jobAfter += await convert(coverSource, path.join(toDir, "cover.webp"));
		} else {
			console.warn(`  ! 找不到指定封面 ${job.coverFrom}，相册将没有封面`);
		}
	}

	totalBefore += jobBefore;
	totalAfter += jobAfter;

	const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
	console.log(
		`${job.label}: ${converted} 张，${mb(jobBefore)}MB → ${mb(jobAfter)}MB  (${job.to})`,
	);
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
console.log(`\n合计 ${mb(totalBefore)}MB → ${mb(totalAfter)}MB`);
