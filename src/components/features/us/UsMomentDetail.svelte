<script lang="ts">
import {
	US_AUTHOR_NAMES,
	US_REACTION_KINDS,
	type UsAuthor,
	type UsComment,
	type UsMoment,
	type UsReactionKind,
} from "@/types/us";

import { authorTheme, fullTimestamp, reactionMeta } from "./format";

interface Props {
	moment: UsMoment;
	me: UsAuthor;
	onBack: () => void;
	onEdit: () => void;
	onDelete: () => Promise<void>;
	onComment: (text: string, replyTo: string | null) => Promise<void>;
	onDeleteComment: (commentId: string) => Promise<void>;
	onReact: (kind: UsReactionKind) => Promise<void>;
}

const {
	moment,
	me,
	onBack,
	onEdit,
	onDelete,
	onComment,
	onDeleteComment,
	onReact,
}: Props = $props();

let commentText = $state("");
let replyTo: string | null = $state(null);
let busy = $state(false);

const theme = $derived(authorTheme[moment.author]);
const isMine = $derived(moment.author === me);

/** 顶层评论 + 挂在它下面的回复 */
const threads = $derived.by(() => {
	const roots = moment.comments.filter((comment) => !comment.replyTo);
	return roots.map((root) => ({
		root,
		replies: moment.comments.filter((comment) => comment.replyTo === root.id),
	}));
});

const replyTarget = $derived(
	replyTo ? moment.comments.find((comment) => comment.id === replyTo) : null,
);

async function run(task: () => Promise<void>) {
	if (busy) {
		return;
	}
	busy = true;
	try {
		await task();
	} finally {
		busy = false;
	}
}

async function submitComment(event: Event) {
	event.preventDefault();
	const text = commentText.trim();
	if (!text) {
		return;
	}
	await run(async () => {
		await onComment(text, replyTo);
		commentText = "";
		replyTo = null;
	});
}

function authorChip(author: UsAuthor) {
	return authorTheme[author].chip;
}

function commentLabel(comment: UsComment): string {
	return US_AUTHOR_NAMES[comment.author];
}
</script>

<article class="space-y-4">
	<button
		type="button"
		class="text-sm text-neutral-500 hover:text-(--primary)"
		onclick={onBack}
	>
		← 返回列表
	</button>

	<div
		class="rounded-2xl border p-6 {theme.card}"
	>
		<header class="mb-4">
			<div class="mb-2 flex flex-wrap items-center gap-2">
				<span
					class="rounded-full px-2.5 py-0.5 text-xs font-bold {theme.chip}"
				>
					{US_AUTHOR_NAMES[moment.author]}
				</span>
				<time
					class="text-xs text-neutral-500 dark:text-neutral-400"
					datetime={moment.createdAt}
				>
					{fullTimestamp(moment.createdAt)}
				</time>
				{#if moment.updatedAt}
					<span class="text-xs text-neutral-400">
						（编辑于 {fullTimestamp(moment.updatedAt)}）
					</span>
				{/if}
			</div>
			<h1
				class="text-2xl font-bold leading-snug text-neutral-900 dark:text-neutral-50"
			>
				{moment.title}
			</h1>
		</header>

		{#if moment.text}
			<div
				class="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-neutral-700 dark:text-neutral-200"
			>
				{moment.text}
			</div>
		{/if}

		{#if moment.media.length > 0}
			<div class="mt-5 space-y-3">
				{#each moment.media as item (item.id)}
					{#if item.kind === "image"}
						<a href={item.url} target="_blank" rel="noopener noreferrer">
							<img
								src={item.url}
								alt={item.name ?? moment.title}
								loading="lazy"
								class="max-h-[70vh] w-full rounded-xl object-contain bg-black/5 dark:bg-white/5"
							/>
						</a>
					{:else if item.kind === "video"}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							src={item.url}
							controls
							preload="metadata"
							class="w-full rounded-xl bg-black"
						></video>
					{:else}
						<audio src={item.url} controls class="w-full"></audio>
					{/if}
				{/each}
			</div>
		{/if}

		<footer
			class="mt-6 flex flex-wrap items-center gap-2 border-t border-black/10 dark:border-white/10 pt-4"
		>
			{#each US_REACTION_KINDS as kind (kind)}
				{@const voters = moment.reactions[kind] ?? []}
				<button
					type="button"
					disabled={busy}
					title={voters.length > 0
						? voters.map((author) => US_AUTHOR_NAMES[author]).join("、")
						: reactionMeta[kind].label}
					class="rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50
						{voters.includes(me)
						? 'border-(--primary) bg-(--primary)/15 text-(--primary)'
						: 'border-black/10 dark:border-white/15 text-neutral-500 hover:border-(--primary)/50'}"
					onclick={() => run(() => onReact(kind))}
				>
					{reactionMeta[kind].icon}
					{reactionMeta[kind].label}
					{#if voters.length > 0}
						<span class="ml-0.5 font-bold">{voters.length}</span>
					{/if}
				</button>
			{/each}

			{#if isMine}
				<span class="ml-auto flex gap-2">
					<button
						type="button"
						class="rounded-lg border border-black/10 dark:border-white/15 px-3 py-1 text-xs text-neutral-600 dark:text-neutral-300 hover:border-(--primary)"
						onclick={onEdit}
					>
						编辑
					</button>
					<button
						type="button"
						disabled={busy}
						class="rounded-lg border border-red-500/40 px-3 py-1 text-xs text-red-600 dark:text-red-300 disabled:opacity-50"
						onclick={() => {
							if (confirm("确定删除这条动态？")) {
								run(onDelete);
							}
						}}
					>
						删除
					</button>
				</span>
			{/if}
		</footer>
	</div>

	<section
		class="rounded-2xl border border-black/10 dark:border-white/10 bg-(--card-bg) p-5"
	>
		<h2
			class="mb-4 text-sm font-bold text-neutral-800 dark:text-neutral-100"
		>
			评论 {moment.comments.length > 0 ? `（${moment.comments.length}）` : ""}
		</h2>

		{#if threads.length === 0}
			<p class="mb-4 text-sm text-neutral-400">还没有评论。</p>
		{:else}
			<ul class="mb-5 space-y-3">
				{#each threads as thread (thread.root.id)}
					<li>
						{@render commentBlock(thread.root)}
						{#if thread.replies.length > 0}
							<ul class="mt-2 space-y-2 border-l-2 border-black/10 dark:border-white/10 pl-4">
								{#each thread.replies as reply (reply.id)}
									<li>{@render commentBlock(reply)}</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<form onsubmit={submitComment}>
			{#if replyTarget}
				<p class="mb-2 text-xs text-neutral-500">
					正在回复 <strong>{commentLabel(replyTarget)}</strong>
					<button
						type="button"
						class="ml-2 text-(--primary)"
						onclick={() => {
							replyTo = null;
						}}
					>
						取消
					</button>
				</p>
			{/if}
			<textarea
				bind:value={commentText}
				rows="2"
				placeholder="说两句…"
				class="mb-2 w-full resize-y rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-(--primary)"
			></textarea>
			<button
				type="submit"
				disabled={busy}
				class="rounded-lg bg-(--primary) px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
			>
				发送
			</button>
		</form>
	</section>
</article>

{#snippet commentBlock(comment: UsComment)}
	<div class="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2">
		<div class="mb-1 flex flex-wrap items-center gap-2">
			<span
				class="rounded-full px-2 py-0.5 text-[0.7rem] font-bold {authorChip(
					comment.author,
				)}"
			>
				{commentLabel(comment)}
			</span>
			<time class="text-[0.7rem] text-neutral-400" datetime={comment.createdAt}>
				{fullTimestamp(comment.createdAt)}
			</time>
			<span class="ml-auto flex gap-2">
				<button
					type="button"
					class="text-[0.7rem] text-neutral-400 hover:text-(--primary)"
					onclick={() => {
						replyTo = comment.replyTo ?? comment.id;
					}}
				>
					回复
				</button>
				{#if comment.author === me}
					<button
						type="button"
						class="text-[0.7rem] text-neutral-400 hover:text-red-500"
						onclick={() => run(() => onDeleteComment(comment.id))}
					>
						删除
					</button>
				{/if}
			</span>
		</div>
		<p
			class="whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-200"
		>
			{comment.text}
		</p>
	</div>
{/snippet}
