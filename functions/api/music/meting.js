// 音乐播放器 · Meting 兼容代理
// 前端（导航/侧栏 MusicManager、明信音乐球、开屏云上音乐）统一走这里，
// 后端把自建网易云 API（musicapi.breezexing.xyz）转成 Meting 数组格式。
// GET /api/music/meting?server=netease&type=playlist&id=<歌单ID>
// 返回：[{ title, author, url, pic, lrc }]
const NETEASE_API = "https://musicapi.breezexing.xyz";

const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchJson(url, timeout = 9000) {
	const res = await fetch(url, {
		headers: { "User-Agent": UA },
		signal: AbortSignal.timeout(timeout),
	});
	if (!res.ok) throw new Error("上游 HTTP " + res.status);
	return res.json();
}

// https 页面下 http 音频/封面会被浏览器按混合内容拦掉，网易云 CDN 同路径支持 https
const httpsUrl = (u) =>
	typeof u === "string" ? u.replace(/^http:\/\//i, "https://") : u;

function toTrack(song, url) {
	return {
		title: song?.name || "",
		author: (song?.ar || []).map((a) => a.name).join(" / "),
		url: httpsUrl(url || ""),
		pic: httpsUrl(song?.al?.picUrl || ""),
		// Meting 口径的 lrc 是歌词地址：这里指向本站歌词代理，前端 fetch 拿到纯文本 LRC
		lrc: song?.id
			? `/api/music/lyric?id=${encodeURIComponent(String(song.id))}`
			: "",
	};
}

async function fetchUrls(ids) {
	const urlById = new Map();
	const batches = [];
	for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
	const results = await Promise.allSettled(
		batches.map((batch) =>
			fetchJson(
				`${NETEASE_API}/song/url/v1?id=${encodeURIComponent(batch.join(","))}&level=exhigh`,
			),
		),
	);
	for (const result of results) {
		if (result.status !== "fulfilled") continue;
		for (const item of result.value?.data || []) {
			if (item?.url) urlById.set(String(item.id), item.url);
		}
	}
	return urlById;
}

async function playlist(id) {
	const data = await fetchJson(
		`${NETEASE_API}/playlist/track/all?id=${encodeURIComponent(id)}&limit=500&offset=0`,
	);
	const songs = Array.isArray(data?.songs) ? data.songs : [];
	if (!songs.length) return [];
	const urlById = await fetchUrls(songs.map((s) => s.id));
	return songs
		.map((song) => toTrack(song, urlById.get(String(song.id))))
		.filter((track) => track.url);
}

async function song(id) {
	const [detail, urls] = await Promise.all([
		fetchJson(`${NETEASE_API}/song/detail?ids=${encodeURIComponent(id)}`),
		fetchJson(
			`${NETEASE_API}/song/url/v1?id=${encodeURIComponent(id)}&level=exhigh`,
		),
	]);
	const item = detail?.songs?.[0];
	if (!item) return [];
	return [toTrack(item, urls?.data?.[0]?.url)].filter((t) => t.url);
}

function json(data, status = 200, extraHeaders = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json", ...extraHeaders },
	});
}

export async function onRequestGet(context) {
	const { request } = context;

	// 来源白名单：只放行自家页面调用，防止接口被站外白嫖
	const ALLOWED_HOSTS = [
		"lanerc.me",
		"origin.lanerc.me",
		"hk.lanerc.me",
		"breezexing.xyz",
		"www.breezexing.xyz",
		"firefly-6sp.pages.dev",
		"localhost",
		"127.0.0.1",
	];
	const srcHost = (() => {
		for (const h of ["referer", "origin"]) {
			const v = request.headers.get(h);
			if (v) {
				try {
					return new URL(v).hostname;
				} catch {}
			}
		}
		return "";
	})();
	const allowed =
		ALLOWED_HOSTS.includes(srcHost) ||
		srcHost === "vercel.app" ||
		srcHost.endsWith(".vercel.app");
	if (!allowed) return json({ error: "forbidden" }, 403);

	const u = new URL(request.url);
	const server = u.searchParams.get("server") || "netease";
	const type = u.searchParams.get("type") || "playlist";
	const id = u.searchParams.get("id") || "";
	if (server !== "netease" || !id) {
		return json({ error: "参数缺失或平台不支持" }, 400);
	}

	try {
		const list =
			type === "playlist" || type === "album"
				? await playlist(id)
				: await song(id);
		return json(list, 200, { "Cache-Control": "public, max-age=300" });
	} catch (e) {
		return json({ error: String(e?.message || e) }, 502);
	}
}
