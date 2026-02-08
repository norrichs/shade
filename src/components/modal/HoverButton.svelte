<script lang="ts">
	let {
		onClick,
		color = 'aliceblue',
		shortTitle,
		mainTitle
	}: {
		onClick: () => void;
		color?: string;
		shortTitle: string;
		mainTitle: string | string[];
	} = $props();

	const getSplitTitle = (title: string | string[]) => {
		const words = Array.isArray(title) ? title : title.split(' ');
		const mappedWords = words.map((word) => [word[0], `${word.slice(1)}`]);
		return mappedWords;
	};

	let words = $derived(getSplitTitle(mainTitle));
</script>

<button onclick={onClick} style={`--color: ${color}`}>
	<div class="title-container">
		{#each words as word}
			<div class="word">
				<div class="word-initial">{word[0]}</div>
				<div class="word-rest">{word[1]}</div>
			</div>
		{/each}
	</div>
</button>

<style>
	button {
		background-color: var(--color);
		overflow: visible;
		border: none;
		padding: 8px;
		border-radius: 4px;
		box-shadow: 0 0 10px 0 black;
		min-width: 40px;
	}
	.title-container {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: center;
	}
	.word {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		gap: 0px;
	}
	.word-initial {
		font-size: 1.25em;
	}
	.word-rest {
		font-size: 1.25em;
		max-width: 0;
		overflow: hidden;
		white-space: nowrap;
	}
	button:hover .title-container {
		gap: 4px;
		transition: gap 0.3s ease-in;
		margin-right: 8px;
		transition: margin-right 0.3s ease-in;
	}
	button:hover .word-rest {
		max-width: 70px;
		transition: max-width 0.3s ease-in;
	}
</style>
