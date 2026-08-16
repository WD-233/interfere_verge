import type { UsAuthor } from "@/types/us";

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

/** 本地时区下的 YYYY-MM-DD，用于和日历格子对齐 */
export function dateKey(input: string | Date): string {
	const date = typeof input === "string" ? new Date(input) : input;
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 动态列表要求精确到秒 */
export function timeWithSeconds(iso: string): string {
	const date = new Date(iso);
	return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function fullTimestamp(iso: string): string {
	return `${dateKey(iso)} ${timeWithSeconds(iso)}`;
}

export function prettyDate(key: string): string {
	const [year, month, day] = key.split("-");
	return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

/** 两位发布者用不同配色区分 */
export const authorTheme: Record<
	UsAuthor,
	{ card: string; chip: string; dot: string }
> = {
	d5: {
		card: "bg-sky-500/10 border-sky-500/30 hover:border-sky-500/60",
		chip: "bg-sky-500/20 text-sky-700 dark:text-sky-200",
		dot: "bg-sky-500",
	},
	"36": {
		card: "bg-amber-500/10 border-amber-500/30 hover:border-amber-500/60",
		chip: "bg-amber-500/20 text-amber-700 dark:text-amber-200",
		dot: "bg-amber-500",
	},
};

export const reactionMeta: Record<string, { label: string; icon: string }> = {
	like: { label: "赞", icon: "👍" },
	dislike: { label: "踩", icon: "👎" },
	report: { label: "举报", icon: "🚨" },
	poop: { label: "答辩", icon: "💩" },
};
