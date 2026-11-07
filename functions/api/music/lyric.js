// 音乐播放器 · 歌词代理：把自建网易云 API 的 /lyric JSON 转成 Meting 约定的
// 纯文本 LRC（t.lrc 即本接口地址），前端 loadLyrics 直接 fetch 即可解析。
// GET /api/music/lyric?id=<歌曲ID>
const NETEASE_API = "https://musicapi.breezexing.xyz";

const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function text(body, status = 200, maxAge = 600) {
	return new Response(body, {
		status,
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": `public, max-age=${maxAge}`,
		},
	});
}

export async function onRequestGet(context) {
	const u = new URL(context.request.url);
	const id = u.searchParams.get("id") || "";
	if (!id) return text("", 400, 0);

	try {
		const res = await fetch(
			`${NETEASE_API}/lyric?id=${encodeURIComponent(id)}`,
			{
				headers: { "User-Agent": UA },
				signal: AbortSignal.timeout(9000),
			},
		);
		if (!res.ok) throw new Error(`上游 HTTP ${res.status}`);
		const data = await res.json();
		// 原文优先；没有原文时退回译文（有些纯音乐两边都是空，返回空串）
		const lrc = data?.lrc?.lyric || data?.tlyric?.lyric || "";
		return text(lrc, 200, lrc ? 600 : 60);
	} catch {
		return text("", 502, 0);
	}
}
