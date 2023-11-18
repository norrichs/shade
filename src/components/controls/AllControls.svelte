<script lang="ts">
	import type { ShadesConfig, LevelConfig, StrutConfig } from '$lib/generate-shape';
	import type { CutoutConfig, PatternConfig } from '$lib/cut-pattern/cut-pattern';
	import type { Persistable } from '$lib/persistable';

	export let settingStore;
	let selectedSettings = $settingStore;
	let path: (string | number)[] = [];

	type Setting =
		| {
				[key: string]: any;
				type: 'number' | 'boolean' | 'string' | 'hash' | 'array';
				key: string;
				value: any;
				depth: number;
		  }
		| {
				[key: string]: any;
				type: 'enum';
				key: string;
				value: any;
				depth: number;
				options: string[];
		  };

	type SettingType = 'number' | 'string' | 'enum' | 'boolean' | 'hash' | 'array';

	const inferType = (setting: [string, any]): SettingType => {
		const [key, value] = setting;
		if (typeof value === 'number') {
			return 'number';
		}
		if (typeof value === 'boolean') {
			return 'boolean';
		}
		if (Array.isArray(value)) {
			return 'array';
		}
		if (typeof value === 'string') {
			return 'enum';
		}
		return 'hash';
	};

	const isRow = (type: SettingType) => ['number', 'enum', 'boolean'].includes(type);

	const optionsFor = (key: string): string[] | undefined => {
		const options = {
			radiate: ['level', 'orthogonal', 'hybrid']
		};

		if (Object.hasOwn(options, key)) {
			return options[key];
		}
		return undefined;
	};

	const getSettingsArray = (cfg: object, depth = 0) => {
		const arr: Setting[] = [];

		Object.entries(cfg).forEach((entry) => {
			const type = inferType(entry);
			const setting =
				type === 'enum'
					? {
							key: entry[0],
							value: entry[1],
							depth,
							type,
							options: optionsFor(`${entry[0]}`)
					  }
					: {
							key: entry[0],
							value: entry[1],
							depth,
							type
					  };
			arr.push(setting);
		});
		return arr;
	};
	const selectSettings = (key: string, index?: number) => {
		console.debug('select Settings', key);
		if (typeof index === 'number') {
			path = [...path, key, index];
      selectedSettings = selectedSettings[key][index];
		} else {
			path = [...path, key];
      selectedSettings = selectedSettings[key];
		}

	};

	const updateStore = () => {
		console.debug('updateStore',path.length, path, $settingStore, selectedSettings);
		if (path.length === 0) {
			$settingStore = selectedSettings;
		} else if (path.length === 1) {
			$settingStore[path[0]] = selectedSettings;
		} else if (path.length === 2) {
			$settingStore[path[0]][path[1]] = selectedSettings;
		} else if (path.length === 3) {
			$settingStore[path[0]][path[1]][path[2]] = selectedSettings;
		} else if (path.length === 4) {
			$settingStore[path[0]][path[1]][path[2]][path[3]] = selectedSettings;
		} else if (path.length === 5) {
			$settingStore[path[0]][path[1]][path[2]][path[3]][path[4]]= selectedSettings;
		} else if (path.length === 6) {
			$settingStore[path[0]][path[1]][path[2]][path[3]][path[4]][path[5]] = selectedSettings;
		} else if (path.length === 7) {
			$settingStore[path[0]][path[1]][path[2]][path[3]][path[4]][path[5]][path[6]] = selectedSettings;
		} else if (path.length === 8) {
			$settingStore[path[0]][path[1]][path[2]][path[3]][path[4]][path[5]][path[6]][path[7]] = selectedSettings;
		}
	};

	const gotoBreadcrumb = (crumb: string, index: number) => {
		path = path.slice(0, index);
		console.debug(index, crumb, path);
		if (path.length === 0) {
			selectedSettings = $settingStore;
		} else if (path.length === 1) {
			selectedSettings = $settingStore[path[0]];
		} else if (path.length === 2) {
			selectedSettings = $settingStore[path[0]][path[1]];
		} else if (path.length === 3) {
			selectedSettings = $settingStore[path[0]][path[1]][path[2]];
		} else if (path.length === 4) {
			selectedSettings = $settingStore[path[0]][path[1]][path[2]][path[3]];
		}
	};

	$: allSettings = getSettingsArray(selectedSettings);
</script>

<div class="control-object">
	<nav class="breadcrumb">
		{#each ['config', ...path] as p, index}
			<button on:click={() => gotoBreadcrumb(p, index)}>{p}</button>
		{/each}
	</nav>
	{#each allSettings as s}
		<div class={isRow(s.type) ? 'row' : 'group'}>
			<div class={`label ${['array', 'hash'].includes(s.type) ? 'openable' : ''}`}>{s.key}</div>
			<div class="value">
				{#if s.type === 'hash'}
					<button class="go-button" on:click={() => selectSettings(s.key)}>Go</button>
				{:else if s.type === 'number'}
					<input type="number" bind:value={selectedSettings[s.key]} on:change={updateStore} />
				{:else if s.type === 'boolean'}
					<input type="checkbox" bind:checked={selectedSettings[s.key]} on:change={updateStore} />
				{:else if s.type === 'enum'}
					{#if Array.isArray(s.options)}
						<select bind:value={selectedSettings[s.key]} on:change={updateStore}>
							{#each s.options as op}
								<option>{op}</option>
							{/each}
						</select>
					{:else}
						<span>{s.value}</span>
					{/if}
				{:else if s.type === 'array'}
					<div class="array-container">
						{#each s.value as elem, index}
							<div class="row">
								<span>{`${index}`}</span>
								<button class="go-button" on:click={() => selectSettings(s.key, index)}>Go</button>
							</div>
						{/each}
					</div>
				{:else}
					<span>{s.value}</span>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.breadcrumb {
		background-color: lightblue;
		border: 1px lightgrey;
		border-radius: 1em;
		display: flex;
		flex-direction: row;
		padding: 0.25em;
	}
	.breadcrumb > button {
		background-color: transparent;
		border: none;
		outline: none;
	}
	.control-object {
		padding: 1em;
		width: 400px;
		display: flex;
		flex-direction: column;
	}
	.control-object .row {
		padding-left: 1em;
		display: flex;
		flex-direction: row;
		gap: 10px;
	}
	.control-object .group {
		display: flex;
		flex-direction: row;
	}
	.control-object .array-container {
		border: 1px solid black;
		background-color: azure;
		border-radius: 5px;
		display: flex;
		flex-direction: column;
		padding: 10px;
	}
	.control-object .label {
		width: 190px;
	}
	.control-object .value {
		width: 190px;
	}
	.control-object .value input,
	.control-object .value select {
		width: 100%;
	}
	.go-button {
		max-width: 40px;
		outline: none;
	}
</style>
