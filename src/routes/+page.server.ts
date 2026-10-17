import { redirect } from '@sveltejs/kit';

// The designer is the app; the old landing page only linked to a route that no longer exists.
export const load = () => {
	redirect(307, '/designer2');
};
