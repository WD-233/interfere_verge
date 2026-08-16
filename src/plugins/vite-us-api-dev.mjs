/**
 * 开发期把 /api/us 接到本地的 Vite 服务器上。
 *
 * 生产环境由 Vercel 直接把根目录 api/ 下的文件部署成 Serverless Function，
 * 与 Astro 构建完全无关；但 `astro dev` 不认识 api/ 目录，
 * 所以本地开发时用这个插件把请求转给同一个处理函数，避免两套实现。
 */

const API_PATH = "/api/us";
const HANDLER_MODULE = "/api/us.ts";

function collectBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}

function toWebRequest(req, body) {
	const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				headers.append(key, item);
			}
		} else if (value !== undefined) {
			headers.set(key, value);
		}
	}
	const hasBody = req.method !== "GET" && req.method !== "HEAD";
	return new Request(url, {
		method: req.method,
		headers,
		body: hasBody && body.length > 0 ? body : undefined,
	});
}

async function sendWebResponse(res, webResponse) {
	res.statusCode = webResponse.status;
	for (const [key, value] of webResponse.headers) {
		// set-cookie 可能有多条，Headers 迭代时已经拆开，用 append 语义写回
		if (key === "set-cookie") {
			const existing = res.getHeader("set-cookie");
			res.setHeader(
				"set-cookie",
				existing ? [].concat(existing, value) : [value],
			);
		} else {
			res.setHeader(key, value);
		}
	}
	res.end(Buffer.from(await webResponse.arrayBuffer()));
}

/**
 * Vercel 线上会把项目环境变量直接注入 process.env，
 * 但 astro dev 只把 .env 暴露到 import.meta.env，所以本地要手动读一次。
 */
function loadDotEnvIntoProcess(logger) {
	try {
		process.loadEnvFile();
	} catch {
		logger?.warn?.(
			"[us-api-dev] 未找到 .env，/us/ 需要 US_SPACE_PASSWORD 才能登录",
		);
	}
}

export function usApiDevPlugin() {
	return {
		name: "interfere-verge:us-api-dev",
		apply: "serve",
		// post + 手动 unshift：Astro 会把自己的 trailingSlash / routeGuard 中间件
		// 插到栈首，而 /api/us 没有结尾斜杠，会被 trailingSlash 中间件直接 404。
		// 所以要等 Astro 插完之后再把这个处理器放到最前面。
		enforce: "post",
		configureServer(server) {
			loadDotEnvIntoProcess(server.config.logger);

			const handle = async (req, res, next) => {
				if (!req.url?.split("?")[0].startsWith(API_PATH)) {
					next();
					return;
				}
				try {
					const module = await server.ssrLoadModule(HANDLER_MODULE);
					const body = await collectBody(req);
					const webRequest = toWebRequest(req, body);
					const method = (req.method ?? "GET").toUpperCase();
					const handler =
						method === "POST"
							? module.POST
							: method === "GET" || method === "HEAD"
								? module.GET
								: null;
					if (typeof handler !== "function") {
						throw new Error(`api/us.ts 没有导出 ${method} 处理函数`);
					}
					const webResponse = await handler(webRequest);
					await sendWebResponse(res, webResponse);
				} catch (error) {
					server.config.logger.error(
						`[us-api-dev] ${error instanceof Error ? error.stack : error}`,
					);
					res.statusCode = 500;
					res.setHeader("content-type", "application/json; charset=utf-8");
					res.end(
						JSON.stringify({ error: "本地 /api/us 处理失败，见终端日志" }),
					);
				}
			};

			return () => {
				server.middlewares.stack.unshift({ route: "", handle });
			};
		},
	};
}
