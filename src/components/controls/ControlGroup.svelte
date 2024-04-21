<div class="control-group"><slot /></div>

<style>
	.control-group {
		margin: 4px;
		background-color: #ebe1e1;
		border-radius: 5px;
		padding: 10px;
		width: 400px;
		display: grid;
		grid-template-columns: 1fr 2fr;
	}
	.control-group input {
		width: 40px;
	}
	.control-group select {
		width: 120px;
	}
	.readout {
		margin: 0.5em;
		padding: 0.5em;
		border: 1px solid black;
		border-radius: 8px;
		background-color: aliceblue;
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.75em;
	}
</style>
