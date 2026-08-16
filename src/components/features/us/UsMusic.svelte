<script lang="ts">
import { tick } from "svelte";

import { US_AUTHOR_NAMES, type UsPlaylist, type UsTrack } from "@/types/us";

import { uploadFiles } from "./api";

interface Props {
	playlists: UsPlaylist[];
	blobEnabled: boolean;
	/** 展开完整的歌单管理界面；收起时只保留底部的播放条 */
	expanded: boolean;
	onCreatePlaylist: (name: string) => Promise<string | null>;
	onRenamePlaylist: (id: string, name: string) => Promise<void>;
	onDeletePlaylist: (id: string) => Promise<void>;
	onAddTrack: (payload: {
		playlistId: string;
		title: string;
		artist: string;
		cover: string;
		url: string;
	}) => Promise<void>;
	onDeleteTrack: (playlistId: string, trackId: string) => Promise<void>;
}

const {
	playlists,
	blobEnabled,
	expanded,
	onCreatePlaylist,
	onRenamePlaylist,
	onDeletePlaylist,
	onAddTrack,
	onDeleteTrack,
}: Props = $props();

let audio: HTMLAudioElement | null = $state(null);
let activePlaylistId: string | null = $state(null);
let currentTrackId: string | null = $state(null);
let playing = $state(false);
let currentTime = $state(0);
let duration = $state(0);
let volume = $state(0.8);
let loopList = $state(true);

// 上传表单
let showUpload = $state(false);
let audioFile: File | null = $state(null);
let coverFile: File | null = $state(null);
let formTitle = $state("");
let formArtist = $state("");
let formPlaylistId = $state("");
let formNewPlaylist = $state("");
let hint = $state("");
let error = $state("");
let busy = $state(false);

const activePlaylist = $derived(
	playlists.find((item) => item.id === activePlaylistId) ??
		playlists[0] ??
		null,
);

/** 当前曲目可能不在当前查看的歌单里，所以在全部歌单中找 */
const currentTrack = $derived.by(() => {
	if (!currentTrackId) {
		return null;
	}
	for (const playlist of playlists) {
		const found = playlist.tracks.find((track) => track.id === currentTrackId);
		if (found) {
			return found;
		}
	}
	return null;
});

/** 正在播放的曲目所属歌单，决定上一首/下一首的范围 */
const playingQueue = $derived.by(() => {
	if (!currentTrackId) {
		return [] as UsTrack[];
	}
	const owner = playlists.find((playlist) =>
		playlist.tracks.some((track) => track.id === currentTrackId),
	);
	return owner?.tracks ?? [];
});

$effect(() => {
	if (audio) {
		audio.volume = volume;
	}
});

function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) {
		return "0:00";
	}
	const total = Math.floor(seconds);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

async function playTrack(track: UsTrack) {
	if (currentTrackId === track.id && audio) {
		await togglePlay();
		return;
	}
	currentTrackId = track.id;
	currentTime = 0;
	// 必须等 DOM 更新把新的 src 写进 <audio> 之后再 play，否则会播上一首
	await tick();
	if (audio) {
		try {
			await audio.play();
			playing = true;
		} catch {
			playing = false;
		}
	}
}

async function togglePlay() {
	if (!audio || !currentTrack) {
		return;
	}
	if (audio.paused) {
		try {
			await audio.play();
			playing = true;
		} catch {
			playing = false;
		}
	} else {
		audio.pause();
		playing = false;
	}
}

async function step(delta: number) {
	if (playingQueue.length === 0 || !currentTrackId) {
		return;
	}
	const index = playingQueue.findIndex((track) => track.id === currentTrackId);
	if (index === -1) {
		return;
	}
	const next = index + delta;
	if (next < 0 || next >= playingQueue.length) {
		if (!loopList) {
			return;
		}
		await playTrack(
			playingQueue[(next + playingQueue.length) % playingQueue.length],
		);
		return;
	}
	await playTrack(playingQueue[next]);
}

function handleEnded() {
	playing = false;
	step(1);
}

function seek(event: Event) {
	const value = Number((event.currentTarget as HTMLInputElement).value);
	if (audio && Number.isFinite(value)) {
		audio.currentTime = value;
		currentTime = value;
	}
}

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

function pickAudio(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	audioFile = input.files?.[0] ?? null;
	if (audioFile && !formTitle.trim()) {
		// 用文件名当默认曲名，省得每次手打
		formTitle = audioFile.name.replace(/\.[^.]+$/, "");
	}
}

function pickCover(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	coverFile = input.files?.[0] ?? null;
}

async function submitUpload(event: Event) {
	event.preventDefault();
	if (!audioFile) {
		error = "请先选择音频文件";
		return;
	}
	if (!formTitle.trim()) {
		error = "请填写曲名";
		return;
	}
	const newName = formNewPlaylist.trim();
	if (!formPlaylistId && !newName) {
		error = "请选择或新建一个歌单";
		return;
	}

	await run(async () => {
		let playlistId = formPlaylistId;
		if (newName) {
			const created = await onCreatePlaylist(newName);
			if (!created) {
				throw new Error("歌单创建失败");
			}
			playlistId = created;
		}

		hint = "上传音频…";
		const [uploadedAudio] = await uploadFiles([audioFile as File], blobEnabled);

		let coverUrl = "";
		if (coverFile) {
			hint = "上传封面…";
			const [uploadedCover] = await uploadFiles([coverFile], blobEnabled);
			coverUrl = uploadedCover?.url ?? "";
		}

		hint = "";
		await onAddTrack({
			playlistId,
			title: formTitle.trim(),
			artist: formArtist.trim(),
			cover: coverUrl,
			url: uploadedAudio?.url ?? "",
		});

		audioFile = null;
		coverFile = null;
		formTitle = "";
		formArtist = "";
		formNewPlaylist = "";
		activePlaylistId = playlistId;
		showUpload = false;
	});
	hint = "";
}

async function renamePlaylist(playlist: UsPlaylist) {
	const name = prompt("新的歌单名", playlist.name);
	if (name === null || !name.trim() || name === playlist.name) {
		return;
	}
	await run(() => onRenamePlaylist(playlist.id, name.trim()));
}

async function deletePlaylist(playlist: UsPlaylist) {
	if (
		!confirm(
			`删除歌单「${playlist.name}」及其中 ${playlist.tracks.length} 首曲目？`,
		)
	) {
		return;
	}
	await run(async () => {
		if (playingQueue.some((track) => track.id === currentTrackId)) {
			currentTrackId = null;
			playing = false;
		}
		await onDeletePlaylist(playlist.id);
		activePlaylistId = null;
	});
}

async function deleteTrack(playlist: UsPlaylist, track: UsTrack) {
	if (!confirm(`删除《${track.title}》？`)) {
		return;
	}
	await run(async () => {
		if (currentTrackId === track.id) {
			currentTrackId = null;
			playing = false;
		}
		await onDeleteTrack(playlist.id, track.id);
	});
}
</script>

<!-- 播放器本体常驻，切到别的标签页音乐也不会断 -->
<audio
	bind:this={audio}
	src={currentTrack?.url}
	onended={handleEnded}
	ontimeupdate={() => {
		currentTime = audio?.currentTime ?? 0;
	}}
	onloadedmetadata={() => {
		duration = audio?.duration ?? 0;
	}}
	onpause={() => {
		playing = false;
	}}
	onplay={() => {
		playing = true;
	}}
></audio>

{#if expanded}
	<section
		class="rounded-2xl border border-black/10 dark:border-white/10 bg-(--card-bg) p-5"
	>
		<header class="mb-4 flex flex-wrap items-center gap-2">
			<h2 class="text-base font-bold text-neutral-800 dark:text-neutral-100">
				音乐
			</h2>
			<button
				type="button"
				class="ml-auto rounded-md px-2 py-1 text-xs text-(--primary) hover:bg-(--btn-plain-bg-hover)"
				onclick={() => {
					showUpload = !showUpload;
					formPlaylistId = formPlaylistId || (activePlaylist?.id ?? "");
				}}
			>
				{showUpload ? "收起" : "＋ 上传音乐"}
			</button>
		</header>

		{#if showUpload}
			<form
				class="mb-5 space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10"
				onsubmit={submitUpload}
			>
				<label class="block text-xs">
					<span class="mb-1 block font-semibold text-neutral-500">
						音频文件
					</span>
					<input
						type="file"
						accept="audio/*"
						class="w-full text-xs"
						onchange={pickAudio}
					/>
				</label>

				<label class="block text-xs">
					<span class="mb-1 block font-semibold text-neutral-500">曲名</span>
					<input
						type="text"
						bind:value={formTitle}
						class="w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-(--primary) dark:border-white/15"
					/>
				</label>

				<label class="block text-xs">
					<span class="mb-1 block font-semibold text-neutral-500">
						作者（可留空）
					</span>
					<input
						type="text"
						bind:value={formArtist}
						class="w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-(--primary) dark:border-white/15"
					/>
				</label>

				<label class="block text-xs">
					<span class="mb-1 block font-semibold text-neutral-500">
						封面图片（可留空）
					</span>
					<input
						type="file"
						accept="image/*"
						class="w-full text-xs"
						onchange={pickCover}
					/>
				</label>

				<div class="grid gap-3 sm:grid-cols-2">
					<label class="block text-xs">
						<span class="mb-1 block font-semibold text-neutral-500">
							添加到歌单
						</span>
						<select
							bind:value={formPlaylistId}
							class="w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-(--primary) dark:border-white/15"
						>
							<option value="">（不选，新建）</option>
							{#each playlists as playlist (playlist.id)}
								<option value={playlist.id}>{playlist.name}</option>
							{/each}
						</select>
					</label>
					<label class="block text-xs">
						<span class="mb-1 block font-semibold text-neutral-500">
							或新建歌单
						</span>
						<input
							type="text"
							bind:value={formNewPlaylist}
							placeholder="新歌单名"
							class="w-full rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-(--primary) dark:border-white/15"
						/>
					</label>
				</div>

				{#if hint}
					<p class="text-xs text-(--primary)">{hint}</p>
				{/if}

				<button
					type="submit"
					disabled={busy}
					class="rounded-lg bg-(--primary) px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
				>
					上传
				</button>
			</form>
		{/if}

		{#if error}
			<p class="mb-3 text-sm text-red-600 dark:text-red-300">{error}</p>
		{/if}

		{#if playlists.length === 0}
			<p class="text-sm text-neutral-400">还没有歌单，上传一首歌就会有了。</p>
		{:else}
			<div class="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
				<ul class="space-y-1">
					{#each playlists as playlist (playlist.id)}
						<li>
							<button
								type="button"
								class="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors
									{activePlaylist?.id === playlist.id
									? 'bg-(--primary)/15 font-bold text-(--primary)'
									: 'text-neutral-600 hover:bg-(--btn-plain-bg-hover) dark:text-neutral-300'}"
								onclick={() => {
									activePlaylistId = playlist.id;
								}}
							>
								<span class="min-w-0 flex-1 truncate">{playlist.name}</span>
								<span class="shrink-0 text-xs text-neutral-400">
									{playlist.tracks.length}
								</span>
							</button>
						</li>
					{/each}
				</ul>

				<div>
					{#if activePlaylist}
						<div class="mb-2 flex flex-wrap items-center gap-2">
							<h3
								class="text-sm font-bold text-neutral-800 dark:text-neutral-100"
							>
								{activePlaylist.name}
							</h3>
							<span class="ml-auto flex gap-2">
								<button
									type="button"
									class="rounded-lg border border-black/10 px-2.5 py-1 text-xs text-neutral-600 hover:border-(--primary) dark:border-white/15 dark:text-neutral-300"
									onclick={() => renamePlaylist(activePlaylist)}
								>
									重命名
								</button>
								<button
									type="button"
									class="rounded-lg border border-red-500/40 px-2.5 py-1 text-xs text-red-600 dark:text-red-300"
									onclick={() => deletePlaylist(activePlaylist)}
								>
									删除歌单
								</button>
							</span>
						</div>

						{#if activePlaylist.tracks.length === 0}
							<p class="text-sm text-neutral-400">这个歌单还是空的。</p>
						{:else}
							<ul class="divide-y divide-black/5 dark:divide-white/10">
								{#each activePlaylist.tracks as track (track.id)}
									<li class="group flex items-center gap-3 py-2">
										<button
											type="button"
											class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/5 text-sm dark:bg-white/10"
											aria-label="播放"
											onclick={() => playTrack(track)}
										>
											{#if track.cover}
												<img
													src={track.cover}
													alt=""
													class="h-full w-full object-cover"
												/>
											{:else}
												<span aria-hidden="true">🎵</span>
											{/if}
										</button>
										<button
											type="button"
											class="min-w-0 flex-1 text-left"
											onclick={() => playTrack(track)}
										>
											<div
												class="truncate text-sm font-medium
													{currentTrackId === track.id
													? 'text-(--primary)'
													: 'text-neutral-800 dark:text-neutral-100'}"
											>
												{track.title}
											</div>
											<div class="truncate text-xs text-neutral-400">
												{track.artist || "未知作者"} · by
												{US_AUTHOR_NAMES[track.uploadedBy]}
											</div>
										</button>
										<button
											type="button"
											class="shrink-0 text-xs text-neutral-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
											onclick={() => deleteTrack(activePlaylist, track)}
										>
											删除
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				</div>
			</div>
		{/if}
	</section>
{/if}

{#if currentTrack}
	<!-- 底部常驻播放条 -->
	<div
		class="fixed bottom-0 left-0 right-0 z-50 border-t border-black/10 bg-(--card-bg)/95 backdrop-blur dark:border-white/10"
	>
		<div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/5 dark:bg-white/10"
			>
				{#if currentTrack.cover}
					<img
						src={currentTrack.cover}
						alt=""
						class="h-full w-full object-cover"
					/>
				{:else}
					<span aria-hidden="true">🎵</span>
				{/if}
			</div>

			<div class="hidden min-w-0 sm:block sm:w-40">
				<div
					class="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100"
				>
					{currentTrack.title}
				</div>
				<div class="truncate text-xs text-neutral-400">
					{currentTrack.artist || "未知作者"}
				</div>
			</div>

			<div class="flex shrink-0 items-center gap-1">
				<button
					type="button"
					aria-label="上一首"
					class="rounded-md px-2 py-1 text-neutral-500 hover:text-(--primary)"
					onclick={() => step(-1)}
				>
					⏮
				</button>
				<button
					type="button"
					aria-label={playing ? "暂停" : "播放"}
					class="rounded-full bg-(--primary) px-3 py-1.5 text-sm text-white"
					onclick={togglePlay}
				>
					{playing ? "⏸" : "▶"}
				</button>
				<button
					type="button"
					aria-label="下一首"
					class="rounded-md px-2 py-1 text-neutral-500 hover:text-(--primary)"
					onclick={() => step(1)}
				>
					⏭
				</button>
			</div>

			<div class="flex min-w-0 flex-1 items-center gap-2">
				<span class="shrink-0 font-mono text-[0.7rem] text-neutral-400">
					{formatTime(currentTime)}
				</span>
				<input
					type="range"
					min="0"
					max={duration || 0}
					step="0.1"
					value={currentTime}
					aria-label="播放进度"
					class="h-1 min-w-0 flex-1 accent-(--primary)"
					oninput={seek}
				/>
				<span class="shrink-0 font-mono text-[0.7rem] text-neutral-400">
					{formatTime(duration)}
				</span>
			</div>

			<div class="hidden shrink-0 items-center gap-2 lg:flex">
				<button
					type="button"
					class="rounded-md px-2 py-1 text-xs transition-colors
						{loopList ? 'text-(--primary)' : 'text-neutral-400'}"
					title="列表循环"
					onclick={() => {
						loopList = !loopList;
					}}
				>
					🔁
				</button>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					bind:value={volume}
					aria-label="音量"
					class="h-1 w-20 accent-(--primary)"
				/>
			</div>
		</div>
	</div>
{/if}
