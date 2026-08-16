import type {
	UsAuthor,
	UsData,
	UsMedia,
	UsMediaKind,
	UsSessionInfo,
} from "@/types/us";

const ENDPOINT = "/api/us";

export class UsApiError extends Error {}

async function call<T>(
	action: string,
	init?: RequestInit & { json?: unknown },
): Promise<T> {
	const { json, ...rest } = init ?? {};
	const response = await fetch(`${ENDPOINT}?action=${action}`, {
		...rest,
		headers:
			json === undefined
				? rest.headers
				: { "content-type": "application/json", ...rest.headers },
		body: json === undefined ? rest.body : JSON.stringify(json),
	});

	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new UsApiError(payload?.error ?? `请求失败（${response.status}）`);
	}
	return payload as T;
}

export function getSession(): Promise<UsSessionInfo> {
	return call<UsSessionInfo>("session");
}

/** 登录第一步：只验密码，通过后界面才让选身份 */
export async function checkPassword(password: string): Promise<void> {
	await call("password.check", { method: "POST", json: { password } });
}

export function login(identity: UsAuthor, password: string): Promise<unknown> {
	return call("login", { method: "POST", json: { identity, password } });
}

export function logout(): Promise<unknown> {
	return call("logout", { method: "POST" });
}

export async function fetchData(): Promise<UsData> {
	return (await call<{ data: UsData }>("data")).data;
}

/** 所有写操作都返回完整数据，客户端直接整体替换，避免局部状态不同步 */
export async function mutate(
	action: string,
	payload: Record<string, unknown> = {},
): Promise<UsData> {
	return (
		await call<{ data: UsData }>(action, { method: "POST", json: payload })
	).data;
}

export function mediaKind(file: File): UsMediaKind {
	if (file.type.startsWith("video/")) {
		return "video";
	}
	if (file.type.startsWith("audio/")) {
		return "audio";
	}
	return "image";
}

/**
 * 上传文件并返回媒体描述。
 * 配置了 Vercel Blob 时走客户端直传（不受 4.5MB 函数请求体限制，视频也能传），
 * 否则退回到把文件 POST 给本地函数写入 public/us-media/。
 */
export async function uploadFiles(
	files: File[],
	blobEnabled: boolean,
	onProgress?: (done: number, total: number) => void,
): Promise<UsMedia[]> {
	if (files.length === 0) {
		return [];
	}

	if (!blobEnabled) {
		const form = new FormData();
		for (const file of files) {
			form.append("files", file);
		}
		const result = await call<{ media: UsMedia[] }>("upload", {
			method: "POST",
			body: form,
		});
		onProgress?.(files.length, files.length);
		return result.media;
	}

	const { upload } = await import("@vercel/blob/client");
	const media: UsMedia[] = [];
	for (const [index, file] of files.entries()) {
		const result = await upload(`us/media/${file.name}`, file, {
			access: "public",
			handleUploadUrl: `${ENDPOINT}?action=blob-upload`,
		});
		media.push({
			id: crypto.randomUUID(),
			kind: mediaKind(file),
			url: result.url,
			name: file.name,
		});
		onProgress?.(index + 1, files.length);
	}
	return media;
}
