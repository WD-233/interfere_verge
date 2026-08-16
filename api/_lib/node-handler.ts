/**
 * Vercel 根目录 /api 在非 Next 项目里走的是 Node (req, res) 默认导出。
 * 只导出 GET/POST 时，POST 登录请求会直接 500，前端就显示「请求失败（500）」。
 */

type NodeReq = {
	method?: string;
	url?: string;
	headers: Record<string, string | string[] | undefined>;
	body?: unknown;
};

type NodeRes = {
	statusCode: number;
	setHeader(name: string, value: string | number | string[]): void;
	getHeader(name: string): string | number | string[] | undefined;
	end(chunk?: unknown): void;
};

export async function asNodeHandler(
	handle: (request: Request) => Promise<Response>,
	req: NodeReq,
	res: NodeRes,
): Promise<void> {
	try {
		const webResponse = await handle(toWebRequest(req));
		res.statusCode = webResponse.status;
		for (const [key, value] of webResponse.headers) {
			if (key === "set-cookie") {
				const existing = res.getHeader("set-cookie");
				const previous =
					existing === undefined
						? []
						: Array.isArray(existing)
							? existing.map(String)
							: [String(existing)];
				res.setHeader("set-cookie", [...previous, value]);
			} else {
				res.setHeader(key, value);
			}
		}
		res.end(Buffer.from(await webResponse.arrayBuffer()));
	} catch (error) {
		console.error("[us api] node handler", error);
		res.statusCode = 500;
		res.setHeader("content-type", "application/json; charset=utf-8");
		res.end(JSON.stringify({ error: "服务器出错了，稍后再试" }));
	}
}

function toWebRequest(req: NodeReq): Request {
	const proto = String(req.headers["x-forwarded-proto"] ?? "https")
		.split(",")[0]
		.trim();
	const host = String(req.headers.host ?? "localhost");
	const url = `${proto}://${host}${req.url ?? "/"}`;
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value === undefined) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				headers.append(key, item);
			}
		} else {
			headers.set(key, value);
		}
	}

	const method = (req.method ?? "GET").toUpperCase();
	const hasBody = method !== "GET" && method !== "HEAD";
	return new Request(url, {
		method,
		headers,
		body: hasBody ? encodeBody(req.body, headers) : undefined,
	});
}

function encodeBody(body: unknown, headers: Headers): string | undefined {
	if (body === undefined || body === null) {
		return undefined;
	}
	if (typeof body === "string") {
		return body;
	}
	if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
		return Buffer.from(body).toString("utf8");
	}
	if (!headers.has("content-type")) {
		headers.set("content-type", "application/json");
	}
	return JSON.stringify(body);
}
