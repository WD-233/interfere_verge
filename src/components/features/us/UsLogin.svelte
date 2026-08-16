<script lang="ts">
import { US_AUTHOR_IDS, US_AUTHOR_NAMES, type UsAuthor } from "@/types/us";

import { authorTheme } from "./format";

interface Props {
	configured: boolean;
	/** 第一步：只校验密码，不发登录票据 */
	checkPassword: (password: string) => Promise<void>;
	/** 第二步：带上身份正式登录 */
	submit: (identity: UsAuthor, password: string) => Promise<void>;
	onAuthenticated: (identity: UsAuthor) => void;
}

const { configured, checkPassword, submit, onAuthenticated }: Props = $props();

let step: "password" | "identity" = $state("password");
let password = $state("");
let error = $state("");
let busy = $state(false);

async function handlePassword(event: Event) {
	event.preventDefault();
	if (busy) {
		return;
	}
	busy = true;
	error = "";
	try {
		await checkPassword(password);
		step = "identity";
	} catch (cause) {
		error = cause instanceof Error ? cause.message : "验证失败";
	} finally {
		busy = false;
	}
}

async function pickIdentity(identity: UsAuthor) {
	if (busy) {
		return;
	}
	busy = true;
	error = "";
	try {
		await submit(identity, password);
		password = "";
		onAuthenticated(identity);
	} catch (cause) {
		error = cause instanceof Error ? cause.message : "登录失败";
	} finally {
		busy = false;
	}
}
</script>

<div class="min-h-[70vh] flex items-center justify-center px-4">
	<div
		class="w-full max-w-sm rounded-2xl border border-black/10 dark:border-white/10 bg-(--card-bg) p-7 shadow-xl"
	>
		<div class="text-center mb-6">
			<div class="text-4xl font-black tracking-widest text-(--primary)">
				???
			</div>
		</div>

		{#if !configured}
			<p
				class="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300"
			>
				服务端还没配置 <code>US_SPACE_PASSWORD</code>，无法登录。
			</p>
		{/if}

		{#if step === "password"}
			<form onsubmit={handlePassword}>
				<label class="block mb-4">
					<span
						class="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-500"
					>
						密码
					</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="password"
						bind:value={password}
						autocomplete="current-password"
						autofocus
						class="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-(--primary)"
					/>
				</label>

				{#if error}
					<p class="mb-4 text-sm text-red-600 dark:text-red-300">
						{error}
					</p>
				{/if}

				<button
					type="submit"
					disabled={busy || !configured}
					class="w-full rounded-lg bg-(--primary) px-4 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-50"
				>
					{busy ? "验证中…" : "进入"}
				</button>
			</form>
		{:else}
			<div>
				<p
					class="mb-3 text-center text-sm font-semibold text-neutral-700 dark:text-neutral-200"
				>
					你是谁
				</p>
				<div class="grid grid-cols-2 gap-2">
					{#each US_AUTHOR_IDS as id (id)}
						<button
							type="button"
							disabled={busy}
							class="rounded-lg border px-3 py-3 text-sm font-bold transition-colors disabled:opacity-50 {authorTheme[
								id
							].card}"
							onclick={() => pickIdentity(id)}
						>
							{US_AUTHOR_NAMES[id]}
						</button>
					{/each}
				</div>

				{#if error}
					<p class="mt-4 text-sm text-red-600 dark:text-red-300">
						{error}
					</p>
				{/if}

				<button
					type="button"
					class="mt-4 w-full text-center text-xs text-neutral-400 hover:text-(--primary)"
					onclick={() => {
						step = "password";
						error = "";
					}}
				>
					返回上一步
				</button>
			</div>
		{/if}

		<a
			href="/"
			data-no-swup
			class="mt-4 block text-center text-xs text-neutral-400 hover:text-(--primary)"
		>
			返回共振边际主站
		</a>
	</div>
</div>
