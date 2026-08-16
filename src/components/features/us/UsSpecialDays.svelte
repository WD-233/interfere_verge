<script lang="ts">
import type { UsSpecialDay } from "@/types/us";

import { prettyDate } from "./format";

interface Props {
	days: UsSpecialDay[];
	onCreate: (date: string, title: string) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
}

const { days, onCreate, onDelete }: Props = $props();

let adding = $state(false);
let date = $state("");
let title = $state("");
let error = $state("");
let busy = $state(false);

async function requestDelete(day: UsSpecialDay) {
	// 纪念日就那么几条，误触删掉很难找回，所以先确认
	if (!confirm(`确定删除纪念日「${prettyDate(day.date)} ${day.title}」？`)) {
		return;
	}
	await onDelete(day.id);
}

async function submit(event: Event) {
	event.preventDefault();
	if (busy) {
		return;
	}
	busy = true;
	error = "";
	try {
		await onCreate(date, title);
		date = "";
		title = "";
		adding = false;
	} catch (cause) {
		error = cause instanceof Error ? cause.message : "添加失败";
	} finally {
		busy = false;
	}
}
</script>

<section
	class="rounded-2xl border border-black/10 dark:border-white/10 bg-(--card-bg) p-4"
>
	<header class="mb-3 flex items-center justify-between">
		<h2 class="text-base font-bold text-neutral-800 dark:text-neutral-100">
			Special Days
		</h2>
		<button
			type="button"
			class="rounded-md px-2 py-1 text-xs text-(--primary) hover:bg-(--btn-plain-bg-hover)"
			onclick={() => {
				adding = !adding;
			}}
		>
			{adding ? "收起" : "＋ 添加"}
		</button>
	</header>

	{#if adding}
		<form class="mb-4 space-y-2" onsubmit={submit}>
			<input
				type="date"
				bind:value={date}
				class="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-(--primary)"
			/>
			<input
				type="text"
				bind:value={title}
				placeholder="纪念内容"
				class="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-(--primary)"
			/>
			{#if error}
				<p class="text-xs text-red-600 dark:text-red-300">{error}</p>
			{/if}
			<button
				type="submit"
				disabled={busy}
				class="w-full rounded-lg bg-(--primary) px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
			>
				保存
			</button>
		</form>
	{/if}

	{#if days.length === 0}
		<p class="text-sm text-neutral-400">还没有记录。</p>
	{:else}
		<ol class="space-y-2">
			{#each days as day (day.id)}
				<li
					class="group flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2"
				>
					<span class="mt-0.5 text-rose-500" aria-hidden="true">★</span>
					<div class="min-w-0 flex-1">
						<div
							class="text-xs font-bold text-rose-600 dark:text-rose-300"
						>
							{prettyDate(day.date)}
						</div>
						<div
							class="text-sm text-neutral-700 dark:text-neutral-200"
						>
							{day.title}
						</div>
					</div>
					<button
						type="button"
						aria-label="删除"
						class="opacity-0 transition-opacity group-hover:opacity-100 text-xs text-neutral-400 hover:text-red-500"
						onclick={() => requestDelete(day)}
					>
						×
					</button>
				</li>
			{/each}
		</ol>
	{/if}
</section>
