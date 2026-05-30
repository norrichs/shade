import { Triangle, Vector3 } from 'three';
import {
	isDegenerateEdge,
	FAN_DEGENERATE_EPSILON,
	buildFanSections,
	windFanSectionsOutward
} from '../fill-fan';

describe('isDegenerateEdge', () => {
	test('returns true for coincident points', () => {
		const p = new Vector3(1, 2, 3);
		expect(isDegenerateEdge(p, p.clone())).toBe(true);
	});
	test('returns true for points within epsilon', () => {
		const a = new Vector3(0, 0, 0);
		const b = new Vector3(FAN_DEGENERATE_EPSILON / 10, 0, 0);
		expect(isDegenerateEdge(a, b)).toBe(true);
	});
	test('returns false for clearly distinct points', () => {
		expect(isDegenerateEdge(new Vector3(0, 0, 0), new Vector3(1, 0, 0))).toBe(false);
	});
});

describe('buildFanSections', () => {
	const perimeter = [
		new Vector3(1, 0, 0),
		new Vector3(0, 1, 0),
		new Vector3(-1, 0, 0),
		new Vector3(0, -1, 0)
	];
	const centroid = new Vector3(0, 0, 0);

	test('produces m+1 sections of 2 points each (last wraps to first)', () => {
		const sections = buildFanSections(perimeter, centroid);
		expect(sections).toHaveLength(perimeter.length + 1);
		sections.forEach((s) => expect(s.points).toHaveLength(2));
		// each section: [P_k, C]; inner point equals centroid
		sections.forEach((s) => expect(s.points[1].equals(centroid)).toBe(true));
		// wrap-around: last section outer point equals first perimeter point
		expect(sections[sections.length - 1].points[0].equals(perimeter[0])).toBe(true);
	});

	test('section layout yields m quads with one real + one degenerate facet (axial-right formula)', () => {
		// Verify facets manually using the axial-right generateFacetPair formula:
		//   facet 2j   (real):       (sections[j].points[0], sections[j].points[1], sections[j+1].points[0])
		//   facet 2j+1 (degenerate): (sections[j+1].points[1], sections[j+1].points[0], sections[j].points[1])
		// With sections[k] = [P_k, C] and sections[m] = [P_0, C]:
		//   real:       (P_j, C, P_{j+1})                  — area > 0
		//   degenerate: (C, P_{j+1}, C)                    — area == 0 (two vertices = C)
		const sections = buildFanSections(perimeter, centroid);
		const m = perimeter.length;
		// One band (sectionLength=2 → sectionLength-1=1 band), 2*m facets total
		expect(sections).toHaveLength(m + 1);
		for (let j = 0; j < m; j++) {
			// real facet: a=P_j, b=C, c=P_{j+1}
			const a = sections[j].points[0]; // P_j
			const b = sections[j].points[1]; // C
			const c = sections[j + 1].points[0]; // P_{j+1}
			expect(a.equals(perimeter[j])).toBe(true);
			expect(b.equals(centroid)).toBe(true);
			const realArea = new Triangle(a, b, c).getArea();
			expect(realArea).toBeGreaterThan(1e-9); // non-degenerate

			// degenerate facet: a=C, b=P_{j+1}, c=C → two coincident vertices
			const da = sections[j + 1].points[1]; // C
			const db = sections[j + 1].points[0]; // P_{j+1}
			const dc = sections[j].points[1]; // C
			expect(da.equals(centroid)).toBe(true);
			expect(dc.equals(centroid)).toBe(true);
			const degenerateArea = new Triangle(da, db, dc).getArea();
			expect(degenerateArea).toBeLessThan(1e-9);
		}
	});
});

describe('windFanSectionsOutward', () => {
	// Perimeter on plane z=1, centroid at z=1, projection center at origin → outward = +z
	const perimeter = [
		new Vector3(1, 0, 1),
		new Vector3(0, 1, 1),
		new Vector3(-1, 0, 1),
		new Vector3(0, -1, 1)
	];
	const centroid = new Vector3(0, 0, 1);
	const projCenter = new Vector3(0, 0, 0);

	const firstFacetNormalDotOutward = (sections: ReturnType<typeof buildFanSections>) => {
		const p0 = sections[0].points[0];
		const p1 = sections[0].points[1];
		const p2 = sections[1].points[0];
		const n = new Vector3().subVectors(p1, p0).cross(new Vector3().subVectors(p2, p0));
		const c = new Vector3().addVectors(p0, p1).add(p2).divideScalar(3);
		return n.dot(new Vector3().subVectors(c, projCenter));
	};

	test('result has first real facet normal pointing outward (dot > 0)', () => {
		const wound = windFanSectionsOutward(buildFanSections(perimeter, centroid), projCenter);
		expect(firstFacetNormalDotOutward(wound)).toBeGreaterThan(0);
	});

	test('reversing perimeter order still yields outward winding', () => {
		const reversed = [...perimeter].reverse();
		const wound = windFanSectionsOutward(buildFanSections(reversed, centroid), projCenter);
		expect(firstFacetNormalDotOutward(wound)).toBeGreaterThan(0);
	});
});
