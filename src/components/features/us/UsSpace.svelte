<script lang="ts">
import { onMount } from "svelte";

import {
	US_AUTHOR_NAMES,
	type UsAuthor,
	type UsData,
	type UsMedia,
	type UsMoment,
	type UsReactionKind,
} from "@/types/us";

import * as api from "./api";
import { authorTheme, dateKey, prettyDate, timeWithSeconds } from "./format";
import UsAlbums from "./UsAlbums.svelte";
import UsCalendar from "./UsCalendar.svelte";
import UsLogin from "./UsLogin.svelte";
import UsMomentComposer from "./UsMomentComposer.svelte";
import UsMomentDetail from "./UsMomentDetail.svelte";
import UsMusic from "./UsMusic.svelte";
import UsSpecialDays from "./UsSpecialDays.svelte";

let ready = $state(false);
let identity: UsAuthor | null = $state(null);
let configured = $state(true);
let blobEnabled = $state(false);
let data: UsData | null = $state(null);
let error = $state("");

let tab: "feed" | "albums" | "music" = $state("feed");
let selectedDate: string | null = $state(null);
let openMomentId: string | null = $state(null);
let composerMode: "closed" | "create" | "edit" = $state("closed");

const moments = $derived(data?.moments ?? []);

/** 后发的在上面 */
const sortedMoments = $derived(
	[...moments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
);

const visibleMoments = $derived(
	selectedDate === null
		? sortedMoments
		: sortedMoments.filter(
				(moment) => dateKey(moment.createdAt) === selectedDate,
			),
);

const openMoment = $derived(
	openMomentId
		? (moments.find((moment) => moment.id === openMomentId) ?? null)
		: null,
);

const editingMoment = $derived(composerMode === "edit" ? openMoment : null);

onMount(async () => {
	try {
		const session = await api.getSession();
		configured = session.configured;
		blobEnabled = session.blobEnabled;
		identity = session.identity;
		if (session.authed) {
			data = await api.fetchData();
		}
	} catch (cause) {
		error = cause instanceof Error ? cause.message : "初始化失败";
	} finally {
		ready = true;
	}
});

async function afterLogin(who: UsAuthor) {
	identity = who;
	data = await api.fetchData();
}

async function handleLogout() {
	await api.logout();
	identity = null;
	data = null;
	openMomentId = null;
	tab = "feed";
}

/** 所有写操作共用：出错时把提示留在页面上，不丢用户输入 */
async function apply(
	action: string,
	payload: Record<string, unknown> = {},
): Promise<UsData> {
	error = "";
	try {
		data = await api.mutate(action, payload);
		return data;
	} catch (cause) {
		error = cause instanceof Error ? cause.message : "操作失败";
		throw cause;
	}
}

/** 新建歌单后要把 id 交回给上传流程，所以对比一下新增的那条 */
async function createPlaylist(name: string): Promise<string | null> {
	const before = new Set((data?.playlists ?? []).map((item) => item.id));
	const next = await apply("playlist.create", { name });
	return next.playlists.find((item) => !before.has(item.id))?.id ?? null;
}

async function submitMoment(payload: {
	title: string;
	text: string;
	media: UsMedia[];
}) {
	if (composerMode === "edit" && openMoment) {
		await apply("moment.update", { id: openMoment.id, ...payload });
	} else {
		await apply("moment.create", payload);
	}
	composerMode = "closed";
}

async function deleteMoment(moment: UsMoment) {
	await apply("moment.delete", { id: moment.id });
	openMomentId = null;
}

function momentPreviewClass(moment: UsMoment): string {
	return authorTheme[moment.author].card;
}
</script>

{#if !ready}
	<div class="flex min-h-[60vh] items-center justify-center text-neutral-400">
		载入中…
	</div>
{:else if identity === null}
	<UsLogin
		{configured}
		checkPassword={api.checkPassword}
		submit={api.login}
		onAuthenticated={afterLogin}
	/>
{:else}
	<!-- 底部有常驻播放条，留出空间免得挡住内容 -->
	<div class="mx-auto w-full max-w-6xl px-4 py-8 pb-28">
		<header
			class="mb-6 flex flex-wrap items-center gap-3 border-b border-black/10 pb-4 dark:border-white/10"
		>
			<h1 class="text-2xl font-black tracking-wide text-(--primary)">
				太阳站
			</h1>
			<span
				class="rounded-full px-2.5 py-0.5 text-xs font-bold {authorTheme[
					identity
				].chip}"
			>
				{US_AUTHOR_NAMES[identity]} 的控制端
			</span>

			<nav class="ml-auto flex items-center gap-1">
				<button
					type="button"
					class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
						{tab === 'feed'
						? 'bg-(--primary)/15 text-(--primary)'
						: 'text-neutral-500 hover:text-(--primary)'}"
					onclick={() => {
						tab = "feed";
						openMomentId = null;
					}}
				>
					动态
				</button>
				<button
					type="button"
					class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
						{tab === 'albums'
						? 'bg-(--primary)/15 text-(--primary)'
						: 'text-neutral-500 hover:text-(--primary)'}"
					onclick={() => {
						tab = "albums";
					}}
				>
					相册
				</button>
				<button
					type="button"
					class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
						{tab === 'music'
						? 'bg-(--primary)/15 text-(--primary)'
						: 'text-neutral-500 hover:text-(--primary)'}"
					onclick={() => {
						tab = "music";
					}}
				>
					音乐
				</button>
				<button
					type="button"
					class="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:text-red-500"
					onclick={handleLogout}
				>
					退出
				</button>
			</nav>
		</header>

		{#if error}
			<p
				class="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300"
			>
				{error}
			</p>
		{/if}

		{#if data === null}
			<p class="text-neutral-400">没有数据。</p>
		{:else}
			{#if tab === "albums"}
				<UsAlbums
					albums={data.albums}
					{blobEnabled}
					onCreate={(name) => apply("album.create", { name })}
					onRename={(id, name) => apply("album.rename", { id, name })}
					onDelete={(id) => apply("album.delete", { id })}
					onAddPhotos={(albumId, media) =>
						apply("album.addPhotos", { albumId, media })}
					onDeletePhotos={(albumId, photoIds) =>
						apply("album.deletePhotos", { albumId, photoIds })}
				/>
			{:else if tab === "feed"}
				<div class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
					<aside class="space-y-4">
						<UsCalendar
							moments={data.moments}
							specialDays={data.specialDays}
							selected={selectedDate}
							onSelect={(key) => {
								selectedDate = key;
								openMomentId = null;
							}}
						/>
						<UsSpecialDays
							days={data.specialDays}
							onCreate={(date, title) =>
								apply("specialDay.create", { date, title })}
							onDelete={(id) => apply("specialDay.delete", { id })}
						/>
					</aside>

					<main class="space-y-4">
						{#if composerMode !== "closed"}
							<UsMomentComposer
								{blobEnabled}
								editing={editingMoment}
								onSubmit={submitMoment}
								onCancel={() => {
									composerMode = "closed";
								}}
							/>
						{/if}

						{#if openMoment}
							<UsMomentDetail
								moment={openMoment}
								me={identity}
								onBack={() => {
									openMomentId = null;
								}}
								onEdit={() => {
									composerMode = "edit";
								}}
								onDelete={() => deleteMoment(openMoment)}
								onComment={(text, replyTo) =>
									apply("comment.create", {
										momentId: openMoment.id,
										text,
										replyTo,
									})}
								onDeleteComment={(commentId) =>
									apply("comment.delete", {
										momentId: openMoment.id,
										commentId,
									})}
								onReact={(kind: UsReactionKind) =>
									apply("reaction.toggle", {
										momentId: openMoment.id,
										kind,
									})}
							/>
						{:else}
							<div class="flex flex-wrap items-center gap-3">
								<h2
									class="text-lg font-bold text-neutral-800 dark:text-neutral-100"
								>
									{selectedDate ? prettyDate(selectedDate) : "全部动态"}
								</h2>
								{#if selectedDate}
									<button
										type="button"
										class="text-xs text-(--primary)"
										onclick={() => {
											selectedDate = null;
										}}
									>
										显示全部
									</button>
								{/if}
								{#if composerMode === "closed"}
									<button
										type="button"
										class="ml-auto rounded-lg bg-(--primary) px-4 py-2 text-sm font-bold text-white"
										onclick={() => {
											composerMode = "create";
										}}
									>
										我要bb
									</button>
								{/if}
							</div>

							{#if visibleMoments.length === 0}
								<p class="py-10 text-center text-sm text-neutral-400">
									{selectedDate ? "这一天什么都没发生。" : "还没有动态。"}
								</p>
							{:else}
								<!-- 预览只显示发布时间（精确到秒）和标题，颜色区分发布人 -->
								<ul class="space-y-3">
									{#each visibleMoments as moment (moment.id)}
										<li>
											<button
												type="button"
												class="group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors {momentPreviewClass(
													moment,
												)}"
												onclick={() => {
													openMomentId = moment.id;
													composerMode = "closed";
												}}
											>
												<span
													class="shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-bold {authorTheme[
														moment.author
													].chip}"
												>
													{US_AUTHOR_NAMES[moment.author]}
												</span>
												<time
													class="shrink-0 font-mono text-xs text-neutral-500 dark:text-neutral-400"
													datetime={moment.createdAt}
												>
													{#if selectedDate === null}
														{dateKey(moment.createdAt)}
													{/if}
													{timeWithSeconds(moment.createdAt)}
												</time>
												<span
													class="min-w-0 flex-1 truncate font-bold text-neutral-800 dark:text-neutral-100"
												>
													{moment.title}
												</span>
												<span
													class="shrink-0 text-(--primary) opacity-0 transition-opacity group-hover:opacity-100"
													aria-hidden="true">›</span
												>
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						{/if}
					</main>
				</div>
			{/if}

			<!-- 常驻挂载，切换标签页时音乐不中断 -->
			<UsMusic
				playlists={data.playlists}
				{blobEnabled}
				expanded={tab === "music"}
				onCreatePlaylist={createPlaylist}
				onRenamePlaylist={(id, name) =>
					apply("playlist.rename", { id, name }).then(() => undefined)}
				onDeletePlaylist={(id) =>
					apply("playlist.delete", { id }).then(() => undefined)}
				onAddTrack={(payload) =>
					apply("track.add", payload).then(() => undefined)}
				onDeleteTrack={(playlistId, trackId) =>
					apply("track.delete", { playlistId, trackId }).then(() => undefined)}
			/>
		{/if}
	</div>
{/if}
