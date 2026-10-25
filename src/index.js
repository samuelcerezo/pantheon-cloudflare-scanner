import { launch } from '@cloudflare/playwright';

const WAIT_MS = 1500;

function allowedUrl(value) {
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') return false;
		const host = url.hostname.toLowerCase();
		if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.test') || /^[\d.]+$/.test(host) || host.includes(':')) return false;
		return true;
	} catch {
		return false;
	}
}

async function inspect(browser, url, action) {
	const context = await browser.newContext({ locale: 'es-ES', viewport: { width: 1280, height: 900 } });
	const page = await context.newPage();
	const requests = new Set();
	page.on('request', request => {
		try {
			const host = new URL(request.url()).hostname;
			if (host) requests.add(host);
		} catch {}
	});
	try {
		await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
		if (new URL(page.url()).hostname !== new URL(url).hostname) throw new Error('unexpected_redirect');
		await page.waitForTimeout(WAIT_MS);
		let clicked = action === 'initial';
		if (action !== 'initial') {
			const selector = action === 'rejected'
				? '[data-cookie-reject-all], a[href="#pantheon-cookie-reject-all"], [data-pantheon-cookie-action="reject-all"]'
				: '[data-cookie-accept-all], a[href="#pantheon-cookie-accept-all"], [data-pantheon-cookie-action="accept-all"]';
			const button = page.locator(selector).first();
			if (await button.count()) {
				await button.click({ timeout: 5000 });
				await page.waitForTimeout(WAIT_MS);
				const consentName = await page.evaluate(() => window.cookiesConfig?.cookieName || 'cookie_consent');
				clicked = (await context.cookies()).some(cookie => cookie.name === consentName);
			}
		}
		const cookies = await context.cookies();
		const storage = await page.evaluate(() => {
			const keys = store => {
				try { return Array.from({ length: store.length }, (_, index) => store.key(index)).filter(Boolean); }
				catch { return []; }
			};
			return { localStorage: keys(localStorage), sessionStorage: keys(sessionStorage) };
		});
		return {
			clicked,
			cookies: cookies.map(({ name, domain, path, httpOnly, secure, sameSite, expires }) => ({ name, domain, path, httpOnly, secure, sameSite, expires })),
			requests: [...requests].sort(),
			storage,
		};
	} finally {
		await context.close();
	}
}

export default {
	async fetch(request, env) {
		if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
		const authorization = request.headers.get('authorization') || '';
		if (!env.SCANNER_TOKEN || authorization !== `Bearer ${env.SCANNER_TOKEN}`) return new Response('Unauthorized', { status: 401 });
		let payload;
		try { payload = await request.json(); }
		catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
		const url = typeof payload?.url === 'string' ? payload.url : '';
		const hosts = String(env.ALLOWED_HOSTS || env.ALLOWED_HOST || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
		if (!allowedUrl(url) || !hosts.includes(new URL(url).hostname.toLowerCase())) {
			return Response.json({ error: 'invalid_target' }, { status: 400 });
		}
		let browser;
		try {
			browser = await launch(env.BROWSER);
			const states = {};
			for (const action of ['initial', 'rejected', 'accepted']) states[action] = await inspect(browser, url, action);
			return Response.json({ states }, { headers: { 'Cache-Control': 'no-store' } });
		} catch (error) {
			const message = String(error?.message || '');
			if (/429|time limit exceeded|quota|limit exceeded|rate limit/i.test(message)) {
				return Response.json({ error: 'browser_limit' }, { status: 429, headers: { 'Retry-After': '86400', 'Cache-Control': 'no-store' } });
			}
			const reason = message.includes('unexpected_redirect') ? 'unexpected_redirect' : (/timeout/i.test(message) ? 'navigation_timeout' : (!browser ? 'browser_unavailable' : 'scan_failed'));
			return Response.json({ error: reason }, { status: 502 });
		} finally {
			if (browser) await browser.close();
		}
	},
};
