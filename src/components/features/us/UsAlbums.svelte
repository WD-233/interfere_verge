<script lang="ts">
import {
	US_AUTHOR_NAMES,
	type UsAlbum,
	type UsMedia,
	type UsPhoto,
} from "@/types/us";

import { uploadFiles } from "./api";
import { fullTimestamp } from "./format";

interface Props {
	albums: UsAlbum[];
	blobEnabled: boolean;
	onCreate: (name: string) => Promise<void>;
	onRename: (id: string, name: string) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
	onAddPhotos: (albumId: string, media: UsMedia[]) => Promise<void>;
	onDeletePhotos: (albumId: string, photoIds: string[]) => Promise<void>;
}

const {
	albums,
	blobEnabled,
	onCreate,
	onRename,
	onDelete,
	onAddPhotos,
	onDeletePhotos,
}: Props = $props();

let openAlbumId: string | null = $state(null);
/** 默认单击是预览；开启多选模式后单击才是勾选 */
let selectMode = $state(false);
let selection: string[] = $state([]);
let previewIndex: number | null = $state(null);
let newAlbumName = $state("");
let creating = $state(false);
let hint = $state("");
let error = $state("");
let busy = $state(false);

const openAlbum = $derived(
	openAlbumId
		? (albums.find((album) => album.id === openAlbumId) ?? null)
		: null,
);

const previewPhoto = $derived(
	openAlbum && previewIndex !== null
		? (openAlbum.photos[previewIndex] ?? null)
		: null,
);

async function run(task: () => Promise<void>) {
	if (busy) {
		return;
	}
	busy = true;
	error = "";
	try {
		await task();
	} catch (cause) {
		error = cause instanceof Error ? cause.message : "操作失败";
	} finally {
		busy = false;
	}
}

function open(id: string) {
	openAlbumId = id;
	selectMode = false;
	selection = [];
	previewIndex = null;
}

function closeAlbum() {
	openAlbumId = null;
	selectMode = false;
	selection = [];
	previewIndex = null;
}

function handlePhotoClick(photo: UsPhoto, index: number) {
	if (selectMode) {
		selection = selection.includes(photo.id)
			? selection.filter((id) => id !== photo.id)
			: [...selection, photo.id];
		return;
	}
	previewIndex = index;
}

function stepPreview(delta: number) {
	if (!openAlbum || previewIndex === null) {
		return;
	}
	const total = openAlbum.photos.length;
	previewIndex = (previewIndex + delta + total) % total;
}

function handlePreviewKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") {
		previewIndex = null;
	} else if (event.key === "ArrowRight") {
		stepPreview(1);
	} else if (event.key === "ArrowLeft") {
		stepPreview(-1);
	}
}

/**
 * 走一遍 fetch 再用 object URL 下载。
 * 直接给 <a download> 加属性对跨域地址（Blob 存储）是无效的，浏览器会变成打开而不是下载。
 */
async function download(photo: UsPhoto) {
	const name = photo.name || `${photo.id}.jpg`;
	try {
		const response = await fetch(photo.url);
		if (!response.ok) {
			throw new Error(String(response.status));
		}
		const objectUrl = URL.createObjectURL(await response.blob());
		const link = document.createElement("a");
		link.href = objectUrl;
		link.download = name;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(objectUrl);
	} catch {
		window.open(photo.url, "_blank", "noopener");
	}
}

async function handleUpload(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	const files = Array.from(input.files ?? []);
	const albumId = openAlbumId;
	if (files.length === 0 || !albumId) {
		return;
	}
	await run(async () => {
		const media = await uploadFiles(files, blobEnabled, (done, total) => {
			hint = `上传中 ${done}/${total}`;
		});
		hint = "";
		await onAddPhotos(albumId, media);
	});
	input.value = "";
}

async function handleCreate(event: Event) {
	event.preventDefault();
	const name = newAlbumName.trim();
	if (!name) {
		return;
	}
	await run(async () => {
		await onCreate(name);
		newAlbumName = "";
		creating = false;
	});
}

async function handleRename(album: UsAlbum) {
	const name = prompt("新的相册名", album.name);
	if (name === null || name.trim() === "" || name === album.name) {
		return;
	}
	await run(() => onRename(album.id, name.trim()));
}

async function handleDeleteAlbum(album: UsAlbum) {
	if (
		!confirm(`删除相册「${album.name}」及其中 ${album.photos.length} 张图片？`)
	) {
		return;
	}
	await run(async () => {
		await onDelete(album.id);
		closeAlbum();
	});
}

async function handleDeleteSelected() {
	const albumId = openAlbumId;
	if (!albumId || selection.length === 0) {
		return;
	}
	if (!confirm(`删除选中的 ${selection.length} 张图片？`)) {
		return;
	}
	await run(async () => {
		await onDeletePhotos(albumId, selection);
		selection = [];
	});
}
</script>

<svelte:window onkeydown={previewPhoto ? handlePreviewKeydown : undefined} />

<section
	class="rounded-2xl border border-black/10 dark:border-white/10 bg-(--card-bg) p-5"
>
	{#if openAlbum === null}
		<header class="mb-4 flex items-center justify-between">
			<h2 class="text-base font-bold text-neutral-800 dark:text-neutral-100">
				相册
			</h2>
			<button
				type="button"
				class="rounded-md px-2 py-1 text-xs text-(--primary) hover:bg-(--btn-plain-bg-hover)"
				onclick={() => {
					creating = !creating;
				}}
			>
				{creating ? "收起" : "＋ 新建相册"}
			</button>
		</header>

		{#if creating}
			<form class="mb-4 flex gap-2" onsubmit={handleCreate}>
				<input
					type="text"
					bind:value={newAlbumName}
					placeholder="相册名"
					class="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-(--primary) dark:border-white/15"
				/>
				<button
					type="submit"
					disabled={busy}
					class="rounded-lg bg-(--primary) px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
				>
					创建
				</button>
			</form>
		{/if}

		{#if error}
			<p class="mb-3 text-sm text-red-600 dark:text-red-300">{error}</p>
		{/if}

		{#if albums.length === 0}
			<p class="text-sm text-neutral-400">还没有相册。</p>
		{:else}
			<!-- 相册预览只显示名字，按需求不带描述/日期/地点/标签 -->
			<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{#each albums as album (album.id)}
					<li>
						<button
							type="button"
							class="group relative flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-black/5 dark:border-white/15 dark:bg-white/5"
							onclick={() => open(album.id)}
						>
							{#if album.photos.length > 0}
								<img
									src={album.photos[0].url}
									alt=""
									loading="lazy"
									class="absolute inset-0 h-full w-full object-cover opacity-45 transition-transform duration-300 group-hover:scale-105"
								/>
							{/if}
							<span
								class="relative z-10 px-2 text-center text-base font-bold text-neutral-900 drop-shadow-[0_1px_3px_rgba(255,255,255,0.8)] dark:text-white dark:drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
							>
								{album.name}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<header class="mb-4 flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="text-sm text-neutral-500 hover:text-(--primary)"
				onclick={closeAlbum}
			>
				← 返回相册列表
			</button>
			<h2
				class="ml-1 text-base font-bold text-neutral-800 dark:text-neutral-100"
			>
				{openAlbum.name}
			</h2>
			<span class="text-xs text-neutral-400">
				{openAlbum.photos.length} 张
			</span>

			<span class="ml-auto flex flex-wrap gap-2">
				<label
					class="cursor-pointer rounded-lg border border-black/10 px-3 py-1 text-xs text-neutral-600 hover:border-(--primary) dark:border-white/15 dark:text-neutral-300"
				>
					＋ 添加图片
					<input
						type="file"
						multiple
						accept="image/*"
						class="hidden"
						onchange={handleUpload}
					/>
				</label>
				<button
					type="button"
					class="rounded-lg border px-3 py-1 text-xs transition-colors
						{selectMode
						? 'border-(--primary) bg-(--primary)/15 text-(--primary)'
						: 'border-black/10 text-neutral-600 hover:border-(--primary) dark:border-white/15 dark:text-neutral-300'}"
					onclick={() => {
						selectMode = !selectMode;
						selection = [];
					}}
				>
					{selectMode ? "退出多选" : "多选"}
				</button>
				<button
					type="button"
					class="rounded-lg border border-black/10 px-3 py-1 text-xs text-neutral-600 hover:border-(--primary) dark:border-white/15 dark:text-neutral-300"
					onclick={() => handleRename(openAlbum)}
				>
					重命名
				</button>
				<button
					type="button"
					class="rounded-lg border border-red-500/40 px-3 py-1 text-xs text-red-600 dark:text-red-300"
					onclick={() => handleDeleteAlbum(openAlbum)}
				>
					删除相册
				</button>
			</span>
		</header>

		{#if hint}
			<p class="mb-3 text-xs text-(--primary)">{hint}</p>
		{/if}
		{#if error}
			<p class="mb-3 text-sm text-red-600 dark:text-red-300">{error}</p>
		{/if}

		{#if selectMode}
			<div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
				<span class="text-neutral-500">已选 {selection.length} 张</span>
				<button
					type="button"
					class="text-(--primary)"
					onclick={() => {
						selection = openAlbum.photos.map((photo) => photo.id);
					}}
				>
					全选
				</button>
				<button
					type="button"
					class="text-neutral-500"
					onclick={() => {
						selection = [];
					}}
				>
					清空
				</button>
				{#if selection.length > 0}
					<button
						type="button"
						disabled={busy}
						class="ml-auto rounded-lg border border-red-500/40 px-3 py-1 text-red-600 disabled:opacity-50 dark:text-red-300"
						onclick={handleDeleteSelected}
					>
						删除所选
					</button>
				{/if}
			</div>
		{:else}
			<p class="mb-3 text-xs text-neutral-400">
				点击照片可以预览和下载；要批量删除就先点「多选」。
			</p>
		{/if}

		{#if openAlbum.photos.length === 0}
			<p class="text-sm text-neutral-400">这个相册还是空的。</p>
		{:else}
			<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
				{#each openAlbum.photos as photo, index (photo.id)}
					{@const isSelected = selection.includes(photo.id)}
					<li
						class="overflow-hidden rounded-xl border transition-colors
							{isSelected
							? 'border-(--primary) ring-2 ring-(--primary)/40'
							: 'border-black/10 dark:border-white/15'}"
					>
						<button
							type="button"
							class="relative block w-full"
							onclick={() => handlePhotoClick(photo, index)}
						>
							<img
								src={photo.url}
								alt={photo.name ?? ""}
								loading="lazy"
								class="aspect-square w-full object-cover"
							/>
							{#if selectMode}
								<span
									class="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[0.65rem] font-bold
										{isSelected
										? 'border-(--primary) bg-(--primary) text-white'
										: 'border-white/80 bg-black/30 text-transparent'}"
								>
									✓
								</span>
							{/if}
						</button>
						<div
							class="px-2 py-1.5 text-[0.7rem] leading-tight text-neutral-500 dark:text-neutral-400"
						>
							<div>{fullTimestamp(photo.uploadedAt)}</div>
							<div>by {US_AUTHOR_NAMES[photo.uploadedBy]}</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>

{#if previewPhoto && openAlbum}
	<!-- 图片预览层：左右切换、下载、Esc 关闭 -->
	<div
		class="fixed inset-0 z-100 flex flex-col bg-black/85 backdrop-blur-sm"
		role="presentation"
		onclick={() => {
			previewIndex = null;
		}}
	>
		<div
			class="flex items-center justify-between gap-3 px-4 py-3 text-xs text-white/80"
			role="presentation"
			onclick={(event) => event.stopPropagation()}
		>
			<div class="min-w-0">
				<div class="truncate">{previewPhoto.name ?? "照片"}</div>
				<div class="text-white/50">
					{fullTimestamp(previewPhoto.uploadedAt)} · by
					{US_AUTHOR_NAMES[previewPhoto.uploadedBy]}
					· {(previewIndex ?? 0) + 1}/{openAlbum.photos.length}
				</div>
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<button
					type="button"
					class="rounded-lg border border-white/25 px-3 py-1.5 hover:bg-white/10"
					onclick={() => download(previewPhoto)}
				>
					下载
				</button>
				<button
					type="button"
					aria-label="关闭"
					class="rounded-lg border border-white/25 px-3 py-1.5 hover:bg-white/10"
					onclick={() => {
						previewIndex = null;
					}}
				>
					关闭
				</button>
			</div>
		</div>

		<div class="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
			{#if openAlbum.photos.length > 1}
				<button
					type="button"
					aria-label="上一张"
					class="absolute left-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20"
					onclick={(event) => {
						event.stopPropagation();
						stepPreview(-1);
					}}
				>
					‹
				</button>
				<button
					type="button"
					aria-label="下一张"
					class="absolute right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20"
					onclick={(event) => {
						event.stopPropagation();
						stepPreview(1);
					}}
				>
					›
				</button>
			{/if}
			<img
				src={previewPhoto.url}
				alt={previewPhoto.name ?? ""}
				class="max-h-full max-w-full object-contain"
				onclick={(event) => event.stopPropagation()}
			/>
		</div>
	</div>
{/if}
