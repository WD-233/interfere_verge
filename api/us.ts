import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";

import type {
	UsAlbum,
	UsAuthor,
	UsData,
	UsMedia,
	UsMoment,
	UsPlaylist,
	UsReactionKind,
	UsSessionInfo,
} from "../src/types/us";
import {
	checkPassword,
	clearSessionCookie,
	createSessionCookie,
	isConfigured,
	parseIdentity,
	readIdentity,
} from "./_lib/auth";
import {
	blobEnabled,
	deleteMedia,
	mediaKindFromType,
	readData,
	safeFileName,
	saveMedia,
	writeData,
} from "./_lib/store";

const REACTION_KINDS = new Set<string>(["like", "dislike", "report", "poop"]);
/** 客户端直传 Blob 时允许的单文件上限 */
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/**
 * 必须跑在 Node.js 上：鉴权和本地回退存储用了 process / Buffer / node:fs。
 * `export default { fetch }` 会被 Vercel 当成 Edge，启动时直接 500。
 */
export const config = {
	runtime: "nodejs",
	maxDuration: 60,
};

export function GET(request: Request): Promise<Response> {
	return handle(request);
}

export function POST(request: Request): Promise<Response> {
	return handle(request);
}

async function handle(request: Request): Promise<Response> {
	const action = new URL(request.url).searchParams.get("action") ?? "";
	try {
		if (request.method === "GET") {
			return await handleGet(action, request);
		}
		if (request.method === "POST") {
			return await handlePost(action, request);
		}
		return json({ error: "Method not allowed" }, 405);
	} catch (error) {
		console.error(`[us api] action=${action}`, error);
		return json({ error: "服务器出错了，稍后再试" }, 500);
	}
}

function json(body: unknown, status = 200, cookie?: string): Response {
	const headers = new Headers({
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store, max-age=0",
	});
	if (cookie) {
		headers.append("set-cookie", cookie);
	}
	return new Response(JSON.stringify(body), { status, headers });
}

async function handleGet(action: string, request: Request): Promise<Response> {
	if (action === "session") {
		const identity = readIdentity(request);
		const info: UsSessionInfo = {
			authed: Boolean(identity),
			identity,
			blobEnabled: blobEnabled(),
			configured: isConfigured(),
		};
		return json(info);
	}

	if (action === "data") {
		if (!readIdentity(request)) {
			return json({ error: "未登录" }, 401);
		}
		return json({ data: await readData() });
	}

	return json({ error: "Unknown action" }, 400);
}

async function handlePost(action: string, request: Request): Promise<Response> {
	if (action === "login") {
		if (!isConfigured()) {
			return json({ error: "服务端还没配置 US_SPACE_PASSWORD 环境变量" }, 503);
		}
		const body = await readJson(request);
		const identity = parseIdentity(body.identity);
		if (!identity) {
			return json({ error: "请选择身份" }, 400);
		}
		if (!checkPassword(body.password)) {
			return json({ error: "密码不对" }, 401);
		}
		return json({ ok: true, identity }, 200, createSessionCookie(identity));
	}

	// 只校验密码，不发登录票据。登录界面先过密码，再让用户选身份。
	if (action === "password.check") {
		if (!isConfigured()) {
			return json({ error: "服务端还没配置 US_SPACE_PASSWORD 环境变量" }, 503);
		}
		const body = await readJson(request);
		return checkPassword(body.password)
			? json({ ok: true })
			: json({ error: "密码不对" }, 401);
	}

	if (action === "logout") {
		return json({ ok: true }, 200, clearSessionCookie());
	}

	const me = readIdentity(request);
	if (!me) {
		return json({ error: "未登录" }, 401);
	}

	// 大文件直传 Blob：这里只负责签发上传令牌，文件不经过函数，绕开 4.5MB 请求体限制
	if (action === "blob-upload") {
		const body = (await request.json()) as HandleUploadBody;
		const result = await handleUpload({
			request,
			body,
			onBeforeGenerateToken: async () => ({
				addRandomSuffix: true,
				maximumSizeInBytes: MAX_UPLOAD_BYTES,
				tokenPayload: JSON.stringify({ identity: me }),
			}),
		});
		return json(result);
	}

	// 本地开发（未配置 Blob）时的上传通道，文件经由函数落到 public/us-media/
	if (action === "upload") {
		const form = await request.formData();
		const media: UsMedia[] = [];
		for (const entry of form.getAll("files")) {
			if (!(entry instanceof File) || entry.size === 0) {
				continue;
			}
			media.push({
				id: crypto.randomUUID(),
				kind: mediaKindFromType(entry.type, entry.name),
				url: await saveMedia(entry),
				name: safeFileName(entry.name),
			});
		}
		return json({ media });
	}

	const body = await readJson(request);

	switch (action) {
		case "moment.create":
			return mutate((data) => {
				const title = str(body.title).trim();
				const text = str(body.text).trim();
				if (!title && !text) {
					throw new BadRequest("标题和正文不能都为空");
				}
				const now = new Date().toISOString();
				const moment: UsMoment = {
					id: crypto.randomUUID(),
					author: me,
					title: title || firstLine(text),
					text,
					media: parseMedia(body.media),
					createdAt: str(body.createdAt) || now,
					updatedAt: null,
					comments: [],
					reactions: { like: [], dislike: [], report: [], poop: [] },
				};
				data.moments.push(moment);
			});

		case "moment.update":
			return mutate((data) => {
				const moment = findMoment(data, str(body.id));
				requireOwner(moment.author, me, "只能编辑自己发的动态");
				const title = str(body.title).trim();
				const text = str(body.text).trim();
				if (!title && !text) {
					throw new BadRequest("标题和正文不能都为空");
				}
				moment.title = title || firstLine(text);
				moment.text = text;
				moment.media = parseMedia(body.media);
				moment.updatedAt = new Date().toISOString();
			});

		case "moment.delete":
			return mutate(async (data) => {
				const moment = findMoment(data, str(body.id));
				requireOwner(moment.author, me, "只能删除自己发的动态");
				await Promise.all(moment.media.map((item) => deleteMedia(item.url)));
				data.moments = data.moments.filter((item) => item.id !== moment.id);
			});

		case "comment.create":
			return mutate((data) => {
				const moment = findMoment(data, str(body.momentId));
				const text = str(body.text).trim();
				if (!text) {
					throw new BadRequest("评论不能为空");
				}
				const replyTo = str(body.replyTo) || null;
				if (replyTo && !moment.comments.some((c) => c.id === replyTo)) {
					throw new BadRequest("被回复的评论不存在");
				}
				moment.comments.push({
					id: crypto.randomUUID(),
					author: me,
					text,
					createdAt: new Date().toISOString(),
					replyTo,
				});
			});

		case "comment.delete":
			return mutate((data) => {
				const moment = findMoment(data, str(body.momentId));
				const commentId = str(body.commentId);
				const comment = moment.comments.find((c) => c.id === commentId);
				if (!comment) {
					throw new BadRequest("评论不存在");
				}
				requireOwner(comment.author, me, "只能删除自己的评论");
				// 连带删掉挂在它下面的回复，避免出现孤儿回复
				moment.comments = moment.comments.filter(
					(c) => c.id !== commentId && c.replyTo !== commentId,
				);
			});

		case "reaction.toggle":
			return mutate((data) => {
				const moment = findMoment(data, str(body.momentId));
				const kind = str(body.kind);
				if (!REACTION_KINDS.has(kind)) {
					throw new BadRequest("未知的态度类型");
				}
				const list = moment.reactions[kind as UsReactionKind] ?? [];
				moment.reactions[kind as UsReactionKind] = list.includes(me)
					? list.filter((author) => author !== me)
					: [...list, me];
			});

		case "specialDay.create":
			return mutate((data) => {
				const date = str(body.date).trim();
				const title = str(body.title).trim();
				if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
					throw new BadRequest("日期格式应为 YYYY-MM-DD");
				}
				if (!title) {
					throw new BadRequest("请填写纪念内容");
				}
				data.specialDays.push({ id: crypto.randomUUID(), date, title });
				data.specialDays.sort((a, b) => a.date.localeCompare(b.date));
			});

		case "specialDay.delete":
			return mutate((data) => {
				const id = str(body.id);
				data.specialDays = data.specialDays.filter((day) => day.id !== id);
			});

		case "album.create":
			return mutate((data) => {
				const name = str(body.name).trim();
				if (!name) {
					throw new BadRequest("请填写相册名");
				}
				data.albums.push({
					id: crypto.randomUUID(),
					name,
					createdAt: new Date().toISOString(),
					photos: [],
				});
			});

		case "album.rename":
			return mutate((data) => {
				const album = findAlbum(data, str(body.id));
				const name = str(body.name).trim();
				if (!name) {
					throw new BadRequest("请填写相册名");
				}
				album.name = name;
			});

		case "album.delete":
			return mutate(async (data) => {
				const album = findAlbum(data, str(body.id));
				await Promise.all(album.photos.map((photo) => deleteMedia(photo.url)));
				data.albums = data.albums.filter((item) => item.id !== album.id);
			});

		case "album.addPhotos":
			return mutate((data) => {
				const album = findAlbum(data, str(body.albumId));
				const media = parseMedia(body.media);
				if (media.length === 0) {
					throw new BadRequest("没有选择图片");
				}
				const uploadedAt = new Date().toISOString();
				for (const item of media) {
					album.photos.push({
						id: item.id,
						url: item.url,
						uploadedAt,
						uploadedBy: me,
						name: item.name,
					});
				}
			});

		case "playlist.create":
			return mutate((data) => {
				const name = str(body.name).trim();
				if (!name) {
					throw new BadRequest("请填写歌单名");
				}
				data.playlists.push({
					id: crypto.randomUUID(),
					name,
					createdAt: new Date().toISOString(),
					tracks: [],
				});
			});

		case "playlist.rename":
			return mutate((data) => {
				const playlist = findPlaylist(data, str(body.id));
				const name = str(body.name).trim();
				if (!name) {
					throw new BadRequest("请填写歌单名");
				}
				playlist.name = name;
			});

		case "playlist.delete":
			return mutate(async (data) => {
				const playlist = findPlaylist(data, str(body.id));
				await Promise.all(
					playlist.tracks.flatMap((track) =>
						track.cover
							? [deleteMedia(track.url), deleteMedia(track.cover)]
							: [deleteMedia(track.url)],
					),
				);
				data.playlists = data.playlists.filter(
					(item) => item.id !== playlist.id,
				);
			});

		case "track.add":
			return mutate((data) => {
				const playlist = findPlaylist(data, str(body.playlistId));
				const title = str(body.title).trim();
				const url = str(body.url).trim();
				if (!title) {
					throw new BadRequest("请填写曲名");
				}
				if (!url) {
					throw new BadRequest("请先选择音频文件");
				}
				playlist.tracks.push({
					id: crypto.randomUUID(),
					title,
					artist: str(body.artist).trim() || undefined,
					cover: str(body.cover).trim() || undefined,
					url,
					uploadedAt: new Date().toISOString(),
					uploadedBy: me,
				});
			});

		case "track.delete":
			return mutate(async (data) => {
				const playlist = findPlaylist(data, str(body.playlistId));
				const trackId = str(body.trackId);
				const track = playlist.tracks.find((item) => item.id === trackId);
				if (!track) {
					throw new BadRequest("曲目不存在");
				}
				await deleteMedia(track.url);
				if (track.cover) {
					await deleteMedia(track.cover);
				}
				playlist.tracks = playlist.tracks.filter((item) => item.id !== trackId);
			});

		case "album.deletePhotos":
			return mutate(async (data) => {
				const album = findAlbum(data, str(body.albumId));
				const ids = new Set(strArray(body.photoIds));
				const removed = album.photos.filter((photo) => ids.has(photo.id));
				if (removed.length === 0) {
					throw new BadRequest("没有选择图片");
				}
				await Promise.all(removed.map((photo) => deleteMedia(photo.url)));
				album.photos = album.photos.filter((photo) => !ids.has(photo.id));
			});

		default:
			return json({ error: "Unknown action" }, 400);
	}
}

class BadRequest extends Error {}

async function mutate(
	apply: (data: UsData) => void | Promise<void>,
): Promise<Response> {
	const data = await readData();
	try {
		await apply(data);
	} catch (error) {
		if (error instanceof BadRequest) {
			return json({ error: error.message }, 400);
		}
		throw error;
	}
	await writeData(data);
	return json({ data });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
	try {
		const parsed = await request.json();
		return parsed && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function str(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function strArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item) => typeof item === "string")
		: [];
}

function firstLine(text: string): string {
	const line = text.split("\n")[0].trim();
	return line.length > 60 ? `${line.slice(0, 60)}…` : line || "无题";
}

function parseMedia(value: unknown): UsMedia[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.flatMap((item): UsMedia[] => {
		if (!item || typeof item !== "object") {
			return [];
		}
		const candidate = item as Record<string, unknown>;
		const url = str(candidate.url);
		const kind = str(candidate.kind);
		if (!url || !["image", "audio", "video"].includes(kind)) {
			return [];
		}
		return [
			{
				id: str(candidate.id) || crypto.randomUUID(),
				kind: kind as UsMedia["kind"],
				url,
				name: str(candidate.name) || undefined,
			},
		];
	});
}

function findMoment(data: UsData, id: string): UsMoment {
	const moment = data.moments.find((item) => item.id === id);
	if (!moment) {
		throw new BadRequest("动态不存在");
	}
	return moment;
}

function findAlbum(data: UsData, id: string): UsAlbum {
	const album = data.albums.find((item) => item.id === id);
	if (!album) {
		throw new BadRequest("相册不存在");
	}
	return album;
}

function findPlaylist(data: UsData, id: string): UsPlaylist {
	const playlist = data.playlists.find((item) => item.id === id);
	if (!playlist) {
		throw new BadRequest("歌单不存在");
	}
	return playlist;
}

function requireOwner(owner: UsAuthor, me: UsAuthor, message: string): void {
	if (owner !== me) {
		throw new BadRequest(message);
	}
}
