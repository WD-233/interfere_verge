<script lang="ts">
import type { UsMoment, UsSpecialDay } from "@/types/us";

import { dateKey } from "./format";

interface Props {
	moments: UsMoment[];
	specialDays: UsSpecialDay[];
	selected: string | null;
	onSelect: (key: string | null) => void;
}

const { moments, specialDays, selected, onSelect }: Props = $props();

const WEEK_DAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTHS = [
	"1月",
	"2月",
	"3月",
	"4月",
	"5月",
	"6月",
	"7月",
	"8月",
	"9月",
	"10月",
	"11月",
	"12月",
];
const YEAR_PAGE_SIZE = 12;

const today = new Date();
const todayKey = dateKey(today);

let year = $state(today.getFullYear());
let month = $state(today.getMonth());
/** day = 正常日历，month/year = 快速跳转面板 */
let view: "day" | "month" | "year" = $state("day");
let yearPageStart = $state(today.getFullYear() - 6);

const momentCounts = $derived.by(() => {
	const counts = new Map<string, number>();
	for (const moment of moments) {
		const key = dateKey(moment.createdAt);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
});

const specialByDate = $derived.by(() => {
	const map = new Map<string, UsSpecialDay[]>();
	for (const day of specialDays) {
		map.set(day.date, [...(map.get(day.date) ?? []), day]);
	}
	return map;
});

/** 有内容的年月，用于在快速跳转面板上做标记 */
const activeMonths = $derived.by(() => {
	const set = new Set<string>();
	for (const moment of moments) {
		set.add(dateKey(moment.createdAt).slice(0, 7));
	}
	for (const day of specialDays) {
		set.add(day.date.slice(0, 7));
	}
	return set;
});

const activeYears = $derived.by(() => {
	const set = new Set<number>();
	for (const key of activeMonths) {
		set.add(Number(key.slice(0, 4)));
	}
	return set;
});

const cells = $derived.by(() => {
	const firstWeekday = new Date(year, month, 1).getDay();
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const result: Array<{
		day: number;
		key: string;
		count: number;
		special: UsSpecialDay[];
	} | null> = Array.from({ length: firstWeekday }, () => null);

	for (let day = 1; day <= daysInMonth; day++) {
		const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
		result.push({
			day,
			key,
			count: momentCounts.get(key) ?? 0,
			special: specialByDate.get(key) ?? [],
		});
	}
	return result;
});

const yearPage = $derived(
	Array.from({ length: YEAR_PAGE_SIZE }, (_, index) => yearPageStart + index),
);

function shiftMonth(delta: number) {
	const next = new Date(year, month + delta, 1);
	year = next.getFullYear();
	month = next.getMonth();
}

function backToToday() {
	year = today.getFullYear();
	month = today.getMonth();
	view = "day";
	onSelect(null);
}

function monthKeyOf(targetYear: number, targetMonth: number): string {
	return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`;
}
</script>

<section
	class="rounded-2xl border border-black/10 dark:border-white/10 bg-(--card-bg) p-4"
>
	<header class="mb-3 flex items-center justify-between gap-2">
		<!-- 点年份/月份可以快速跳转，翻很久以前的日子不用一个月一个月点 -->
		<h2 class="flex items-center gap-1 text-base font-bold">
			<button
				type="button"
				class="rounded-md px-1.5 py-0.5 text-neutral-800 hover:bg-(--btn-plain-bg-hover) hover:text-(--primary) dark:text-neutral-100"
				onclick={() => {
					yearPageStart = year - 6;
					view = view === "year" ? "day" : "year";
				}}
			>
				{year} 年
			</button>
			<button
				type="button"
				class="rounded-md px-1.5 py-0.5 text-neutral-800 hover:bg-(--btn-plain-bg-hover) hover:text-(--primary) dark:text-neutral-100"
				onclick={() => {
					view = view === "month" ? "day" : "month";
				}}
			>
				{MONTHS[month]}
			</button>
		</h2>
		<div class="flex shrink-0 items-center gap-1">
			<button
				type="button"
				class="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-(--btn-plain-bg-hover) hover:text-(--primary)"
				onclick={backToToday}
			>
				今天
			</button>
			{#if view === "day"}
				<button
					type="button"
					aria-label="上一月"
					class="rounded-md px-2 py-1 text-neutral-500 hover:bg-(--btn-plain-bg-hover) hover:text-(--primary)"
					onclick={() => shiftMonth(-1)}
				>
					‹
				</button>
				<button
					type="button"
					aria-label="下一月"
					class="rounded-md px-2 py-1 text-neutral-500 hover:bg-(--btn-plain-bg-hover) hover:text-(--primary)"
					onclick={() => shiftMonth(1)}
				>
					›
				</button>
			{/if}
		</div>
	</header>

	{#if view === "year"}
		<div class="mb-2 flex items-center justify-between text-xs">
			<button
				type="button"
				class="rounded-md px-2 py-1 text-neutral-500 hover:text-(--primary)"
				onclick={() => {
					yearPageStart -= YEAR_PAGE_SIZE;
				}}
			>
				‹ 更早
			</button>
			<span class="text-neutral-400">
				{yearPage[0]} – {yearPage[yearPage.length - 1]}
			</span>
			<button
				type="button"
				class="rounded-md px-2 py-1 text-neutral-500 hover:text-(--primary)"
				onclick={() => {
					yearPageStart += YEAR_PAGE_SIZE;
				}}
			>
				更晚 ›
			</button>
		</div>
		<div class="grid grid-cols-3 gap-1">
			{#each yearPage as value (value)}
				<button
					type="button"
					class="rounded-lg py-2 text-sm transition-colors
						{value === year
						? 'bg-(--primary) font-bold text-white'
						: 'text-neutral-700 hover:bg-(--btn-plain-bg-hover) dark:text-neutral-300'}
						{activeYears.has(value) && value !== year ? 'font-bold text-(--primary)' : ''}"
					onclick={() => {
						year = value;
						view = "month";
					}}
				>
					{value}
				</button>
			{/each}
		</div>
	{:else if view === "month"}
		<div class="grid grid-cols-3 gap-1">
			{#each MONTHS as label, index (label)}
				<button
					type="button"
					class="rounded-lg py-2 text-sm transition-colors
						{index === month
						? 'bg-(--primary) font-bold text-white'
						: 'text-neutral-700 hover:bg-(--btn-plain-bg-hover) dark:text-neutral-300'}
						{activeMonths.has(monthKeyOf(year, index)) && index !== month
						? 'font-bold text-(--primary)'
						: ''}"
					onclick={() => {
						month = index;
						view = "day";
					}}
				>
					{label}
				</button>
			{/each}
		</div>
	{:else}
		<div
			class="mb-1 grid grid-cols-7 gap-1 text-center text-[0.7rem] font-medium text-neutral-400"
		>
			{#each WEEK_DAYS as label (label)}
				<span>{label}</span>
			{/each}
		</div>

		<div class="grid grid-cols-7 gap-1">
			{#each cells as cell, index (cell?.key ?? `blank-${index}`)}
				{#if cell === null}
					<span></span>
				{:else}
					<button
						type="button"
						title={cell.special.map((day) => day.title).join("、")}
						class="relative aspect-square rounded-lg text-sm transition-colors
							{selected === cell.key
							? 'bg-(--primary) font-bold text-white'
							: 'text-neutral-700 hover:bg-(--btn-plain-bg-hover) dark:text-neutral-300'}
							{cell.key === todayKey && selected !== cell.key
							? 'ring-1 ring-(--primary)/60'
							: ''}
							{cell.special.length > 0 && selected !== cell.key
							? 'bg-rose-500/15 font-bold text-rose-600 dark:text-rose-300'
							: ''}"
						onclick={() =>
							onSelect(selected === cell.key ? null : cell.key)}
					>
						{cell.day}
						{#if cell.special.length > 0}
							<span
								class="absolute right-1 top-0.5 text-[0.6rem] leading-none"
								aria-hidden="true">★</span
							>
						{/if}
						{#if cell.count > 0}
							<span
								class="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full
									{selected === cell.key ? 'bg-white' : 'bg-(--primary)'}"
							></span>
						{/if}
					</button>
				{/if}
			{/each}
		</div>

		<p class="mt-3 text-[0.7rem] leading-relaxed text-neutral-400">
			圆点表示当天有动态，<span class="text-rose-500">★</span> 是纪念日。
		</p>
	{/if}
</section>
