import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { del, head, put } from "@vercel/blob";

import type { UsAlbum, UsData, UsMediaKind } from "../../src/types/us.js";
import { seedData } from "./seed.js";

const DATA_BLOB_PATH = "us/data.json";
const LOCAL_DATA_FILE = path.join(process.cwd(), ".us-data", "data.json");
const LOCAL_MEDIA_DIR = path.join(process.cwd(), "public", "us-media");
const LOCAL_MEDIA_URL_PREFIX = "/us-media/";

export function blobEnabled(): boolean {
	if (process.env.BLOB_READ_WRITE_TOKEN) {
		return true;
	}
	// 新版 Blob 用 OIDC：BLOB_STORE_ID + Vercel 自动注入的 VERCEL_OIDC_TOKEN
	return Boolean(process.env.BLOB_STORE_ID && process.env.VERCEL);
}

export async function readData(): Promise<UsData> {
	const existing = blobEnabled() ? await readFromBlob() : await readFromDisk();
	if (existing) {
		const normalized = normalize(existing);
		if (seedUploadersNeedMigration(existing)) {
			await writeData(normalized);
		}
		return normalized;
	}
	// 首次访问时写入种子数据，之后就完全由控制端接管
	const seeded = seedData();
	await writeData(seeded);
	return seeded;
}

/**
 * 补齐新版本新增的字段。
 * 已经存在的存档是按旧结构写的，直接用会在读取时缺字段。
 *
 * playlists 缺失说明这份存档是加音乐功能之前写的，补上种子歌单；
 * 如果它已经是空数组，那是用户自己把歌单删空了，保持原样。
 */
function normalize(data: UsData): UsData {
	return {
		version: data.version ?? 1,
		moments: data.moments ?? [],
		specialDays: data.specialDays ?? [],
		albums: migrateSeedAlbumUploaders(data.albums ?? []),
		playlists: data.playlists ?? seedData().playlists,
	};
}

/** 仓库自带的种子照片统一记成小五段；之后两人自己上传的不受影响 */
function migrateSeedAlbumUploaders(albums: UsAlbum[]): UsAlbum[] {
	return albums.map((album) => ({
		...album,
		photos: album.photos.map((photo) =>
			photo.url.startsWith("/us-assets/")
				? { ...photo, uploadedBy: "d5" }
				: photo,
		),
	}));
}

function seedUploadersNeedMigration(data: UsData): boolean {
	return (data.albums ?? []).some((album) =>
		album.photos.some(
			(photo) =>
				photo.url.startsWith("/us-assets/") && photo.uploadedBy !== "d5",
		),
	);
}

export async function writeData(data: UsData): Promise<void> {
	const body = JSON.stringify(data, null, 2);
	if (blobEnabled()) {
		await put(DATA_BLOB_PATH, body, {
			access: "public",
			contentType: "application/json",
			addRandomSuffix: false,
			allowOverwrite: true,
			cacheControlMaxAge: 0,
		});
		return;
	}
	await mkdir(path.dirname(LOCAL_DATA_FILE), { recursive: true });
	await writeFile(LOCAL_DATA_FILE, body, "utf-8");
}

async function readFromBlob(): Promise<UsData | null> {
	let url: string;
	try {
		url = (await head(DATA_BLOB_PATH)).url;
	} catch {
		// head 在对象不存在时抛错，视为「还没初始化」
		return null;
	}
	// Blob 走 CDN，附带时间戳绕过缓存，避免另一个人刚发的动态读不到
	const res = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
	if (!res.ok) {
		return null;
	}
	return (await res.json()) as UsData;
}

async function readFromDisk(): Promise<UsData | null> {
	try {
		return JSON.parse(await readFile(LOCAL_DATA_FILE, "utf-8")) as UsData;
	} catch {
		return null;
	}
}

export function mediaKindFromType(type: string, name: string): UsMediaKind {
	if (type.startsWith("video/")) {
		return "video";
	}
	if (type.startsWith("audio/")) {
		return "audio";
	}
	if (type.startsWith("image/")) {
		return "image";
	}
	// 某些浏览器上传时不带 MIME，退化成按扩展名判断
	const ext = path.extname(name).toLowerCase();
	if ([".mp4", ".webm", ".mov", ".m4v"].includes(ext)) {
		return "video";
	}
	if ([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"].includes(ext)) {
		return "audio";
	}
	return "image";
}

export function safeFileName(name: string): string {
	const base = path.basename(name).replace(/[^\w.-]/g, "_");
	return base.length > 0 ? base.slice(-80) : "file";
}

export async function saveMedia(file: File): Promise<string> {
	const fileName = `${Date.now()}-${safeFileName(file.name)}`;
	if (blobEnabled()) {
		const result = await put(`us/media/${fileName}`, file, {
			access: "public",
			addRandomSuffix: true,
		});
		return result.url;
	}
	await mkdir(LOCAL_MEDIA_DIR, { recursive: true });
	const buffer = Buffer.from(await file.arrayBuffer());
	await writeFile(path.join(LOCAL_MEDIA_DIR, fileName), buffer);
	return `${LOCAL_MEDIA_URL_PREFIX}${fileName}`;
}

/**
 * 删除上传的媒体文件。仓库自带的 /us-assets/ 种子素材不会被删除，
 * 因为它们是构建产物的一部分，删掉会导致下次部署又出现。
 */
export async function deleteMedia(url: string): Promise<void> {
	try {
		if (url.startsWith(LOCAL_MEDIA_URL_PREFIX)) {
			await unlink(path.join(LOCAL_MEDIA_DIR, path.basename(url)));
			return;
		}
		if (blobEnabled() && url.startsWith("https://")) {
			await del(url);
		}
	} catch {
		// 文件已经不在了不算错误，数据里的引用照样要清掉
	}
}
