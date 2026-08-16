<script lang="ts">
import { onDestroy } from "svelte";

import type { UsMedia, UsMoment } from "@/types/us";

import { uploadFiles } from "./api";

interface Props {
	blobEnabled: boolean;
	/** 传入则为编辑模式 */
	editing?: UsMoment | null;
	onSubmit: (payload: {
		title: string;
		text: string;
		media: UsMedia[];
	}) => Promise<void>;
	onCancel: () => void;
}

const { blobEnabled, editing = null, onSubmit, onCancel }: Props = $props();

let title = $state(editing?.title ?? "");
let text = $state(editing?.text ?? "");
let media: UsMedia[] = $state(editing ? [...editing.media] : []);
let uploadHint = $state("");
let error = $state("");
let busy = $state(false);

// 录音状态
let recording = $state(false);
let recordSeconds = $state(0);
let recorder: MediaRecorder | null = null;
let recordTimer: ReturnType<typeof setInterval> | null = null;
let chunks: Blob[] = [];

function stopTimer() {
	if (recordTimer) {
		clearInterval(recordTimer);
		recordTimer = null;
	}
}

onDestroy(() => {
	stopTimer();
	if (recorder && recorder.state !== "inactive") {
		recorder.stop();
	}
});

async function attach(files: File[]) {
	if (files.length === 0) {
		return;
	}
	busy = true;
	error = "";
	try {
		const uploaded = await uploadFiles(files, blobEnabled, (done, total) => {
			uploadHint = `上传中 ${done}/${total}`;
		});
		media = [...media, ...uploaded];
		uploadHint = "";
	} catch (cause) {
		error = cause instanceof Error ? cause.message : "上传失败";
		uploadHint = "";
	} finally {
		busy = false;
	}
}

async function handleFiles(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	await attach(Array.from(input.files ?? []));
	input.value = "";
}

function recordExtension(mimeType: string): string {
	if (mimeType.includes("mp4")) {
		return "m4a";
	}
	if (mimeType.includes("ogg")) {
		return "ogg";
	}
	return "webm";
}

function pickRecorderMimeType(): string | undefined {
	// 各浏览器支持的容器不一样，挑一个能用的；都不行就交给浏览器默认
	const candidates = [
		"audio/webm;codecs=opus",
		"audio/webm",
		"audio/mp4",
		"audio/ogg;codecs=opus",
	];
	return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

async function startRecording() {
	if (recording || busy) {
		return;
	}
	if (
		!navigator.mediaDevices?.getUserMedia ||
		typeof MediaRecorder === "undefined"
	) {
		error = "这个浏览器不支持录音，可以改用上传音频文件";
		return;
	}

	let stream: MediaStream;
	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	} catch {
		error = "打不开麦克风，检查一下浏览器的麦克风权限";
		return;
	}

	error = "";
	chunks = [];
	const mimeType = pickRecorderMimeType();
	recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

	recorder.ondataavailable = (event) => {
		if (event.data.size > 0) {
			chunks.push(event.data);
		}
	};

	recorder.onstop = async () => {
		for (const track of stream.getTracks()) {
			track.stop();
		}
		const type = recorder?.mimeType || "audio/webm";
		recorder = null;
		const blob = new Blob(chunks, { type });
		chunks = [];
		if (blob.size === 0) {
			return;
		}
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		await attach([
			new File([blob], `voice-${stamp}.${recordExtension(type)}`, { type }),
		]);
	};

	recorder.start();
	recording = true;
	recordSeconds = 0;
	recordTimer = setInterval(() => {
		recordSeconds += 1;
	}, 1000);
}

function stopRecording() {
	if (!recording) {
		return;
	}
	recording = false;
	stopTimer();
	if (recorder && recorder.state !== "inactive") {
		recorder.stop();
	}
}

function removeMedia(id: string) {
	media = media.filter((item) => item.id !== id);
}

async function handleSubmit(event: Event) {
	event.preventDefault();
	if (busy) {
		return;
	}
	busy = true;
	error = "";
	try {
		await onSubmit({ title, text, media });
	} catch (cause) {
		error = cause instanceof Error ? cause.message : "发布失败";
	} finally {
		busy = false;
	}
}
</script>

<form
	class="rounded-2xl border border-black/10 dark:border-white/10 bg-(--card-bg) p-5"
	onsubmit={handleSubmit}
>
	<h2 class="mb-4 text-base font-bold text-neutral-800 dark:text-neutral-100">
		{editing ? "编辑动态" : "我要bb"}
	</h2>

	<input
		type="text"
		bind:value={title}
		placeholder="标题（留空会取正文第一行）"
		class="mb-3 w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-(--primary)"
	/>

	<textarea
		bind:value={text}
		rows="5"
		placeholder="想bb点什么…"
		class="mb-3 w-full resize-y rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-(--primary)"
	></textarea>

	<div class="mb-3 flex flex-wrap items-center gap-2">
		<label
			class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-black/20 px-3 py-2 text-xs text-neutral-500 hover:border-(--primary) hover:text-(--primary) dark:border-white/20"
		>
			<span>＋ 添加图片 / 音频 / 视频</span>
			<input
				type="file"
				multiple
				accept="image/*,audio/*,video/*"
				class="hidden"
				onchange={handleFiles}
			/>
		</label>

		<!-- 按住说话：录完松手自动作为语音附件上传 -->
		<button
			type="button"
			disabled={busy}
			class="inline-flex select-none items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors disabled:opacity-50
				{recording
				? 'border-red-500 bg-red-500/15 text-red-600 dark:text-red-300'
				: 'border-black/20 text-neutral-500 hover:border-(--primary) hover:text-(--primary) dark:border-white/20'}"
			onpointerdown={startRecording}
			onpointerup={stopRecording}
			onpointerleave={stopRecording}
			onpointercancel={stopRecording}
			oncontextmenu={(event) => event.preventDefault()}
		>
			{#if recording}
				<span class="h-2 w-2 animate-pulse rounded-full bg-red-500"></span>
				<span>录音中 {recordSeconds}s，松手结束</span>
			{:else}
				<span>🎤 按住说话</span>
			{/if}
		</button>
	</div>

	{#if uploadHint}
		<p class="mb-3 text-xs text-(--primary)">{uploadHint}</p>
	{/if}

	{#if media.length > 0}
		<ul class="mb-3 flex flex-wrap gap-2">
			{#each media as item (item.id)}
				<li
					class="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-black/5 dark:border-white/15 dark:bg-white/5"
				>
					{#if item.kind === "image"}
						<img
							src={item.url}
							alt={item.name ?? ""}
							class="h-full w-full object-cover"
						/>
					{:else}
						<span class="text-2xl" aria-hidden="true">
							{item.kind === "video" ? "🎬" : "🎧"}
						</span>
					{/if}
					<button
						type="button"
						aria-label="移除"
						class="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white"
						onclick={() => removeMedia(item.id)}
					>
						×
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if error}
		<p class="mb-3 text-sm text-red-600 dark:text-red-300">{error}</p>
	{/if}

	<div class="flex gap-2">
		<button
			type="submit"
			disabled={busy}
			class="rounded-lg bg-(--primary) px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
		>
			{editing ? "保存" : "发布"}
		</button>
		<button
			type="button"
			class="rounded-lg border border-black/10 px-4 py-2 text-sm text-neutral-600 dark:border-white/15 dark:text-neutral-300"
			onclick={onCancel}
		>
			取消
		</button>
	</div>
</form>
