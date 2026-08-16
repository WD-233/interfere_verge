/**
 * 私密空间（/us/）的数据模型。
 * 这份文件同时被浏览器端组件和 /api/us 服务端函数引用，
 * 因此只能包含纯类型与纯常量，不要引入任何依赖运行环境的代码。
 */

/** 两个发布者：d5 = 小五段，36 = 三六 */
export type UsAuthor = "d5" | "36";

export const US_AUTHOR_IDS: UsAuthor[] = ["d5", "36"];

export const US_AUTHOR_NAMES: Record<UsAuthor, string> = {
	d5: "小五段",
	"36": "三六",
};

export type UsMediaKind = "image" | "audio" | "video";

export interface UsMedia {
	id: string;
	kind: UsMediaKind;
	url: string;
	name?: string;
}

export interface UsComment {
	id: string;
	author: UsAuthor;
	text: string;
	createdAt: string;
	/** 被回复的评论 id，为空表示直接评论动态 */
	replyTo?: string | null;
}

export type UsReactionKind = "like" | "dislike" | "report" | "poop";

export const US_REACTION_KINDS: UsReactionKind[] = [
	"like",
	"dislike",
	"report",
	"poop",
];

/** 每种态度记录投过票的人，便于切换和显示是谁投的 */
export type UsReactions = Record<UsReactionKind, UsAuthor[]>;

export interface UsMoment {
	id: string;
	author: UsAuthor;
	title: string;
	text: string;
	media: UsMedia[];
	/** ISO 字符串，精确到秒 */
	createdAt: string;
	updatedAt?: string | null;
	comments: UsComment[];
	reactions: UsReactions;
}

export interface UsSpecialDay {
	id: string;
	/** YYYY-MM-DD */
	date: string;
	title: string;
}

export interface UsPhoto {
	id: string;
	url: string;
	/** ISO 字符串 */
	uploadedAt: string;
	uploadedBy: UsAuthor;
	name?: string;
}

export interface UsAlbum {
	id: string;
	name: string;
	createdAt: string;
	photos: UsPhoto[];
}

export interface UsTrack {
	id: string;
	title: string;
	/** 作者可留空 */
	artist?: string;
	/** 封面图可留空 */
	cover?: string;
	url: string;
	uploadedAt: string;
	uploadedBy: UsAuthor;
}

export interface UsPlaylist {
	id: string;
	name: string;
	createdAt: string;
	tracks: UsTrack[];
}

export interface UsData {
	version: number;
	moments: UsMoment[];
	specialDays: UsSpecialDay[];
	albums: UsAlbum[];
	playlists: UsPlaylist[];
}

export interface UsSessionInfo {
	authed: boolean;
	identity: UsAuthor | null;
	/** 是否配置了 Vercel Blob；决定上传走直传还是走函数转发 */
	blobEnabled: boolean;
	/** 服务端是否配置了密码，没配置时给出提示 */
	configured: boolean;
}

export function emptyReactions(): UsReactions {
	return { like: [], dislike: [], report: [], poop: [] };
}
