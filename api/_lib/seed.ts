import type { UsAlbum, UsData, UsPhoto } from "../../src/types/us.js";

/**
 * 首次运行时写入的初始内容。
 * 图片来自仓库里的 public/us-assets/，之后通过控制端上传的内容会存进 Blob。
 */

function photos(
	albumId: string,
	files: string[],
	uploadedBy: UsPhoto["uploadedBy"],
	uploadedAt: string,
): UsPhoto[] {
	return files.map((file, index) => ({
		id: `${albumId}-${index + 1}`,
		url: `/us-assets/albums/${albumId}/${file}`,
		uploadedAt,
		uploadedBy,
		name: file,
	}));
}

function seedAlbums(): UsAlbum[] {
	return [
		{
			id: "d5",
			name: "d5",
			createdAt: "2026-08-14T00:00:00+08:00",
			photos: photos(
				"d5",
				["01.webp", "02.webp", "03.webp", "04.webp", "05.webp", "06.webp"],
				"d5",
				"2026-08-14T00:00:00+08:00",
			),
		},
		{
			id: "with",
			name: "我们",
			createdAt: "2026-08-14T00:00:00+08:00",
			photos: photos(
				"with",
				[
					"01.webp",
					"02.webp",
					"03.webp",
					"04.webp",
					"05.webp",
					"06.webp",
					"07.webp",
					"08.webp",
				],
				"d5",
				"2026-08-14T00:00:00+08:00",
			),
		},
	];
}

export function seedData(): UsData {
	return {
		version: 1,
		moments: [
			{
				id: "seed-plan-complete",
				author: "d5",
				title: "余烬双星计划的最后一块拼图，此页面搭成！",
				text: "余烬双星计划的最后一块拼图，此页面搭成！",
				media: [
					{
						id: "seed-plan-complete-img",
						kind: "image",
						url: "/us-assets/moments/20260814/plan-complete.webp",
						name: "plan-complete.webp",
					},
				],
				createdAt: "2026-08-14T11:00:00+08:00",
				updatedAt: null,
				comments: [],
				reactions: { like: [], dislike: [], report: [], poop: [] },
			},
		],
		specialDays: [
			{
				id: "seed-plan-start",
				date: "2026-08-18",
				title: "余烬双星计划启动",
			},
		],
		albums: seedAlbums(),
		// 歌单先建好，曲目通过太阳站的上传功能加进来（音频文件不进仓库）
		playlists: [
			{
				id: "sun-station",
				name: "太阳站",
				createdAt: "2026-08-14T00:00:00+08:00",
				tracks: [],
			},
		],
	};
}
