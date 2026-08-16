import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { UsAuthor } from "../../src/types/us";

const COOKIE_NAME = "us_session";
const SESSION_DAYS = 30;
const VALID_IDENTITIES = new Set<string>(["d5", "36"]);

export function isConfigured(): boolean {
	return Boolean(process.env.US_SPACE_PASSWORD);
}

function sessionSecret(): string {
	// 没有单独配置签名密钥时退化为用密码派生，保证部署时只配一个变量也能跑
	return (
		process.env.US_SESSION_SECRET || `fallback:${process.env.US_SPACE_PASSWORD}`
	);
}

function b64url(input: Buffer | string): string {
	return Buffer.from(input)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
	return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function hmac(payload: string): string {
	return b64url(createHmac("sha256", sessionSecret()).update(payload).digest());
}

export function checkPassword(candidate: unknown): boolean {
	const expected = process.env.US_SPACE_PASSWORD;
	if (!expected || typeof candidate !== "string") {
		return false;
	}
	const a = Buffer.from(candidate);
	const b = Buffer.from(expected);
	// 长度不同时 timingSafeEqual 会抛错，先比长度再做定时安全比较
	return a.length === b.length && timingSafeEqual(a, b);
}

export function parseIdentity(value: unknown): UsAuthor | null {
	return typeof value === "string" && VALID_IDENTITIES.has(value)
		? (value as UsAuthor)
		: null;
}

export function createSessionCookie(identity: UsAuthor): string {
	const payload = b64url(
		JSON.stringify({
			identity,
			exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
			jti: randomUUID(),
		}),
	);
	const token = `${payload}.${hmac(payload)}`;
	const attrs = [
		`${COOKIE_NAME}=${token}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		`Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
	];
	if (process.env.VERCEL) {
		attrs.push("Secure");
	}
	return attrs.join("; ");
}

export function clearSessionCookie(): string {
	return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readIdentity(request: Request): UsAuthor | null {
	const cookieHeader = request.headers.get("cookie");
	if (!cookieHeader || !isConfigured()) {
		return null;
	}

	const raw = cookieHeader
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${COOKIE_NAME}=`))
		?.slice(COOKIE_NAME.length + 1);

	if (!raw) {
		return null;
	}

	const [payload, signature] = raw.split(".");
	if (!payload || !signature) {
		return null;
	}

	const expected = hmac(payload);
	if (
		expected.length !== signature.length ||
		!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
	) {
		return null;
	}

	try {
		const parsed = JSON.parse(fromB64url(payload).toString("utf-8"));
		if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) {
			return null;
		}
		return parseIdentity(parsed.identity);
	} catch {
		return null;
	}
}
