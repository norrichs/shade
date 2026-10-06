export type MeshSourceFormat = 'glb' | 'gltf' | 'stl' | 'obj';

export type MeshDiagnostics = {
	triangles: number;
	vertices: number;
	/** Edges used by exactly one triangle. 0 for a closed mesh. */
	openEdges: number;
	/** Line / Points primitives skipped during cleaning. */
	droppedPrimitives: number;
};

/** Welded, triangle-indexed positions — the canonical mesh representation. */
export type IndexedMesh = {
	positions: Float32Array;
	index: Uint32Array;
};

export type CleanMesh = IndexedMesh & { diagnostics: MeshDiagnostics };

/** A stored mesh. Positions are cleaned and world-baked but NOT normalized. */
export type MeshAsset = CleanMesh & {
	id: string;
	fileName: string;
	sourceFormat: MeshSourceFormat;
	derivedFrom?: { assetId: string; targetTriangles: number };
	createdAt: string;
};
