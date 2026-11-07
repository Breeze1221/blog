/* ============================================================================
   开屏氛围页脚本：玻璃雨滴 + 可擦除雾 + 雨/雾滑块
   - 全部使用原生 Canvas 2D，无任何第三方依赖
   - 依赖 DOM：#rain、#wWipe、#wcRain、#wcMist、#wcRainVal、#wcMistVal、#wFog
   - 可选 DOM：#themeToggle、.reveal、.w-enter、#wAudio
   - 嵌入模式（?embed=1）下点「进入」只通知父窗口，不在本 iframe 内导航
   ============================================================================ */
(() => {
	"use strict";

	const root = document.documentElement;
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const isEmbed = new URLSearchParams(location.search).get("embed") === "1";

	/* ---------------------------------------------------------------------- */
	/* 零、主题同步：开屏配色跟随博客内部（localStorage theme / hue）          */
	/* ---------------------------------------------------------------------- */
	const DEFAULT_HUE = 174;

	function readLocal(key) {
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	}

	function hslToRgb(h, s, l) {
		h = ((h % 360) + 360) % 360;
		s /= 100;
		l /= 100;
		const c = (1 - Math.abs(2 * l - 1)) * s;
		const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
		const m = l - c / 2;
		let r = 0;
		let g = 0;
		let b = 0;
		if (h < 60) [r, g, b] = [c, x, 0];
		else if (h < 120) [r, g, b] = [x, c, 0];
		else if (h < 180) [r, g, b] = [0, c, x];
		else if (h < 240) [r, g, b] = [0, x, c];
		else if (h < 300) [r, g, b] = [x, 0, c];
		else [r, g, b] = [c, 0, x];
		return [r, g, b].map((v) => Math.round((v + m) * 255));
	}

	function toHex(rgb) {
		return (
			"#" +
			rgb.map((v) => v.toString(16).padStart(2, "0")).join("")
		);
	}

	function applyBlogTheme() {
		const stored = readLocal("theme") || "system";
		const mode =
			stored === "system"
				? window.matchMedia("(prefers-color-scheme: dark)").matches
					? "dark"
					: "light"
				: stored;
		root.dataset.theme = mode;
		const dark = mode === "dark";
		const parsedHue = Number.parseFloat(readLocal("hue") || "");
		const hue = Number.isFinite(parsedHue) ? parsedHue : DEFAULT_HUE;

		const accent = hslToRgb(hue, dark ? 62 : 55, dark ? 78 : 36);
		const accent2 = hslToRgb(hue + 18, dark ? 50 : 45, dark ? 72 : 34);
		const h1Tail = hslToRgb(hue, dark ? 50 : 42, dark ? 68 : 42);
		const p1 = hslToRgb(hue, 70, dark ? 58 : 45);
		const p2 = hslToRgb(hue + 20, 55, dark ? 55 : 48);

		root.style.setProperty("--accent", toHex(accent));
		root.style.setProperty("--accent2", toHex(accent2));
		root.style.setProperty("--h1-tail", toHex(h1Tail));
		root.style.setProperty("--p1", p1.join(", "));
		root.style.setProperty("--p2", p2.join(", "));
		root.style.setProperty(
			"--bg-glow-1",
			`rgba(${p1.join(", ")}, ${dark ? 0.3 : 0.26})`,
		);
		root.style.setProperty(
			"--bg-glow-2",
			`rgba(${p2.join(", ")}, ${dark ? 0.24 : 0.22})`,
		);
	}

	/* ---------------------------------------------------------------------- */
	/* 一、玻璃雨：雨丝 + 凝结水珠                                             */
	/* ---------------------------------------------------------------------- */
	const canvas = document.getElementById("rain");
	if (!canvas) return;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	const rainInput = document.getElementById("wcRain");
	const mistInput = document.getElementById("wcMist");
	const rainValue = document.getElementById("wcRainVal");
	const mistValue = document.getElementById("wcMistVal");
	const fogEl = document.getElementById("wFog");

	// 参数：滑块控制。rain 影响雨丝/水珠数量，mist 影响光晕与雾浓度
	const state = {
		rain: Number(rainInput?.value ?? 60),
		mist: Number(mistInput?.value ?? 35),
	};

	let W = 0;
	let H = 0;
	let DPR = 1;

	/** 一条雨水流（玻璃上缓慢下淌的竖长条） */
	function createStreak(anywhere) {
		return {
			x: Math.random() * W,
			y: anywhere ? Math.random() * H : -60 - Math.random() * H * 0.3,
			len: 40 + Math.random() * 90,
			speed: 0.35 + Math.random() * 1.1 + state.rain * 0.012,
			width: 0.8 + Math.random() * 1.8,
			sway: Math.random() * Math.PI * 2,
			opacity: 0.1 + Math.random() * 0.22,
		};
	}

	/** 一颗凝结水珠（带高光和底部折射亮点） */
	function createDroplet(anywhere) {
		return {
			x: Math.random() * W,
			y: anywhere ? Math.random() * H : -10,
			r: 1.2 + Math.random() * 3.4,
			speed: 0.12 + Math.random() * 0.4 + state.rain * 0.004,
			sway: Math.random() * Math.PI * 2,
			phase: Math.random() * Math.PI * 2,
		};
	}

	let streaks = [];
	let droplets = [];

	function reseed() {
		streaks = [];
		droplets = [];
		const streakCount = Math.floor(state.rain * 1.6);
		const dropletCount = Math.floor(state.rain * 0.7);
		for (let i = 0; i < streakCount; i += 1) streaks.push(createStreak(true));
		for (let i = 0; i < dropletCount; i += 1) droplets.push(createDroplet(true));
	}

	function resizeRain() {
		DPR = Math.min(window.devicePixelRatio || 1, 2);
		W = window.innerWidth;
		H = window.innerHeight;
		canvas.width = Math.round(W * DPR);
		canvas.height = Math.round(H * DPR);
		canvas.style.width = `${W}px`;
		canvas.style.height = `${H}px`;
		ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
		reseed();
		sizeWipe();
	}

	/** 亮色主题下雨丝需要偏暗，否则白雨在浅底上几乎不可见 */
	function rainPalette() {
		return root.dataset.theme === "light"
			? { tail: "110,135,140", head: "70,95,90" }
			: { tail: "200,215,255", head: "255,255,255" };
	}

	function renderRain() {
		ctx.clearRect(0, 0, W, H);
		const palette = rainPalette();

		// 水流
		const streakTarget = Math.floor(state.rain * 1.6);
		if (streaks.length < streakTarget && Math.random() < 0.4) {
			streaks.push(createStreak(false));
		}
		for (let i = streaks.length - 1; i >= 0; i -= 1) {
			const s = streaks[i];
			s.y += s.speed;
			s.sway += 0.01;
			s.x += Math.sin(s.sway) * 0.18;
			if (s.y - s.len > H || s.x < -10) {
				streaks.splice(i, 1);
				continue;
			}
			const gradient = ctx.createLinearGradient(0, s.y - s.len, 0, s.y);
			gradient.addColorStop(0, `rgba(${palette.tail},0)`);
			gradient.addColorStop(0.7, `rgba(${palette.tail},${s.opacity})`);
			gradient.addColorStop(1, `rgba(${palette.head},${s.opacity * 1.2})`);
			ctx.strokeStyle = gradient;
			ctx.lineWidth = s.width;
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(s.x, s.y - s.len);
			ctx.lineTo(s.x, s.y);
			ctx.stroke();
		}

		// 水珠
		const dropletTarget = Math.floor(state.rain * 0.7);
		if (droplets.length < dropletTarget && Math.random() < 0.25) {
			droplets.push(createDroplet(false));
		}
		for (let i = droplets.length - 1; i >= 0; i -= 1) {
			const d = droplets[i];
			d.y += d.speed;
			d.phase += 0.03;
			d.x += Math.sin(d.phase) * 0.25;
			if (d.y - d.r > H || d.x < -10) {
				droplets.splice(i, 1);
				continue;
			}
			const r = d.r;
			// 水珠本体：径向渐变模拟折射
			const body = ctx.createRadialGradient(
				d.x - r * 0.35,
				d.y - r * 0.35,
				r * 0.1,
				d.x,
				d.y,
				r,
			);
			if (root.dataset.theme === "light") {
				body.addColorStop(0, "rgba(255,255,255,0.5)");
				body.addColorStop(0.55, "rgba(150,175,170,0.18)");
				body.addColorStop(1, "rgba(80,110,100,0.3)");
			} else {
				body.addColorStop(0, "rgba(255,255,255,0.32)");
				body.addColorStop(0.55, "rgba(190,205,255,0.14)");
				body.addColorStop(1, "rgba(150,170,255,0.3)");
			}
			ctx.fillStyle = body;
			ctx.beginPath();
			ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
			ctx.fill();

			// 高光
			ctx.fillStyle =
				root.dataset.theme === "light"
					? "rgba(255,255,255,0.85)"
					: "rgba(255,255,255,0.75)";
			ctx.beginPath();
			ctx.arc(d.x - r * 0.35, d.y - r * 0.4, r * 0.18, 0, Math.PI * 2);
			ctx.fill();

			// 底部折射亮点
			ctx.fillStyle = "rgba(255,255,255,0.35)";
			ctx.beginPath();
			ctx.arc(d.x + r * 0.3, d.y + r * 0.25, r * 0.1, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	let rafId = 0;

	function loop() {
		renderRain();
		rafId = window.requestAnimationFrame(loop);
	}

	function startRain() {
		window.cancelAnimationFrame(rafId);
		rafId = 0;
		if (reduceMotion.matches) {
			renderRain(); // 无障碍偏好：只画一帧静态雨
			return;
		}
		rafId = window.requestAnimationFrame(loop);
	}

	/* ---------------------------------------------------------------------- */
	/* 二、雾层：鼠标划过擦开，约 10 秒后自动凝回                               */
	/* ---------------------------------------------------------------------- */
	const wipeCanvas = document.getElementById("wWipe");
	const wipe = wipeCanvas?.getContext("2d") ?? null;

	const wipeStrokes = []; // { pts: [{x,y}], width, strength }
	let currentStroke = null;
	const WIPE_DECAY = 0.02; // 每 200ms 衰减量 → 约 10 秒恢复

	function hazeRgb() {
		return root.dataset.theme === "light" ? "120,110,170" : "208,224,244";
	}

	/** 画一层淡雾：整体薄雾 + 边缘渐变 + 两团雾斑 */
	function paintHaze() {
		if (!wipe) return;
		const rgb = hazeRgb();
		wipe.globalCompositeOperation = "source-over";
		wipe.clearRect(0, 0, W, H);
		wipe.fillStyle = `rgba(${rgb},.10)`;
		wipe.fillRect(0, 0, W, H);

		const edge = wipe.createRadialGradient(
			W * 0.5,
			H * 0.5,
			Math.min(W, H) * 0.2,
			W * 0.5,
			H * 0.5,
			Math.max(W, H) * 0.75,
		);
		edge.addColorStop(0, `rgba(${rgb},0)`);
		edge.addColorStop(1, `rgba(${rgb},.10)`);
		wipe.fillStyle = edge;
		wipe.fillRect(0, 0, W, H);

		blotch(0.16, 0.18, 0.5, 0.05);
		blotch(0.84, 0.76, 0.55, 0.04);
	}

	function blotch(x, y, r, alpha) {
		if (!wipe) return;
		const rgb = hazeRgb();
		const gradient = wipe.createRadialGradient(
			W * x,
			H * y,
			0,
			W * x,
			H * y,
			Math.max(W, H) * r,
		);
		gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
		gradient.addColorStop(1, `rgba(${rgb},0)`);
		wipe.fillStyle = gradient;
		wipe.fillRect(0, 0, W, H);
	}

	/** 按笔画当前强度重画擦痕：强度越弱擦得越浅 = 雾正在恢复 */
	function renderStroke(stroke) {
		if (!wipe) return;
		const strength = Math.max(0, stroke.strength);
		if (strength <= 0.02) return;

		wipe.globalCompositeOperation = "destination-out";
		wipe.lineCap = "round";
		wipe.lineJoin = "round";
		wipe.strokeStyle = `rgba(0,0,0,${(0.95 * strength).toFixed(3)})`;
		wipe.lineWidth = stroke.width;
		wipe.shadowBlur = 0; // 恢复路径必须零阴影，否则雾无法真正复原

		if (stroke.pts.length === 1) {
			const [point] = stroke.pts;
			wipe.beginPath();
			wipe.arc(point.x, point.y, stroke.width / 2, 0, Math.PI * 2);
			wipe.fill();
		} else {
			for (let i = 1; i < stroke.pts.length; i += 1) {
				wipe.beginPath();
				wipe.moveTo(stroke.pts[i - 1].x, stroke.pts[i - 1].y);
				wipe.lineTo(stroke.pts[i].x, stroke.pts[i].y);
				wipe.stroke();
			}
		}

		wipe.shadowBlur = 0;
		wipe.globalCompositeOperation = "source-over";
	}

	function redrawFog() {
		if (!wipe) return;
		wipe.globalCompositeOperation = "source-over";
		wipe.clearRect(0, 0, W, H);
		paintHaze();
		for (const stroke of wipeStrokes) renderStroke(stroke);
		wipe.globalCompositeOperation = "source-over";
	}

	/** 实时擦一段，保证鼠标移动时有即时反馈 */
	function wipeLiveSegment(x1, y1, x2, y2, width) {
		if (!wipe) return;
		wipe.globalCompositeOperation = "destination-out";
		wipe.lineCap = "round";
		wipe.lineJoin = "round";
		wipe.strokeStyle = "rgba(0,0,0,.95)";
		wipe.lineWidth = width;
		wipe.shadowBlur = 16;
		wipe.shadowColor = "rgba(0,0,0,.9)";
		wipe.beginPath();
		wipe.moveTo(x1, y1);
		wipe.lineTo(x2, y2);
		wipe.stroke();
		wipe.shadowBlur = 0;
		wipe.globalCompositeOperation = "source-over";
	}

	function sizeWipe() {
		if (!wipeCanvas || !wipe) return;
		wipeCanvas.width = Math.round(W * DPR);
		wipeCanvas.height = Math.round(H * DPR);
		wipeCanvas.style.width = `${W}px`;
		wipeCanvas.style.height = `${H}px`;
		wipe.setTransform(DPR, 0, 0, DPR, 0, 0);
		redrawFog();
	}

	// 鼠标/手指在页面任意处移动 → 擦开雾；画布本身不拦截点击
	document.addEventListener("pointermove", (event) => {
		const point = { x: event.clientX, y: event.clientY };
		if (!currentStroke) {
			currentStroke = { pts: [point], width: 26, strength: 1 };
			wipeStrokes.push(currentStroke);
			// 防止长时间浏览后笔画数组无限增长
			if (wipeStrokes.length > 3000) {
				wipeStrokes.splice(0, wipeStrokes.length - 3000);
			}
			return;
		}
		const last = currentStroke.pts[currentStroke.pts.length - 1];
		if (Math.hypot(point.x - last.x, point.y - last.y) < 3) return;
		if (currentStroke.pts.length > 600) {
			currentStroke = null;
			return;
		}
		currentStroke.pts.push(point);
		currentStroke.strength = 1;
		wipeLiveSegment(last.x, last.y, point.x, point.y, currentStroke.width);
	});

	document.addEventListener("pointerdown", () => {
		currentStroke = null; // 重新起笔，避免与旧笔画连成长线
	});
	document.addEventListener("pointerleave", () => {
		currentStroke = null;
	});

	// 雾气恢复循环
	window.setInterval(() => {
		if (!wipeStrokes.length) return;
		let alive = false;
		for (let i = wipeStrokes.length - 1; i >= 0; i -= 1) {
			wipeStrokes[i].strength -= WIPE_DECAY;
			if (wipeStrokes[i].strength > 0.02) alive = true;
			else wipeStrokes.splice(i, 1);
		}
		if (alive) redrawFog();
	}, 200);

	// 主题切换时重画雾色（擦痕按当前强度保留）
	new MutationObserver(() => {
		redrawFog();
		startRain();
	}).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

	/* ---------------------------------------------------------------------- */
	/* 三、滑块：RAIN 控制雨量，MIST 控制光晕与雾                              */
	/* ---------------------------------------------------------------------- */
	function applyMist() {
		const amount = state.mist / 100;
		const glows = [
			[".w-glow-1", 0.5 + amount * 0.5],
			[".w-glow-2", 0.35 + amount * 0.45],
			[".w-glow-3", 0.25 + amount * 0.35],
		];
		for (const [selector, opacity] of glows) {
			const el = document.querySelector(selector);
			if (el) el.style.opacity = String(opacity);
		}
		if (fogEl) fogEl.style.opacity = String(amount * 0.55);
	}

	rainInput?.addEventListener("input", () => {
		state.rain = Number(rainInput.value);
		if (rainValue) rainValue.textContent = String(state.rain);
		if (reduceMotion.matches) renderRain();
	});

	mistInput?.addEventListener("input", () => {
		state.mist = Number(mistInput.value);
		if (mistValue) mistValue.textContent = String(state.mist);
		applyMist();
	});

	/* ---------------------------------------------------------------------- */
	/* 四、主题开关                                                           */
	/* ---------------------------------------------------------------------- */
	const themeToggle = document.getElementById("themeToggle");

	function paintThemeIcon() {
		if (!themeToggle) return;
		themeToggle.textContent = root.dataset.theme === "light" ? "☀" : "☾";
	}

	themeToggle?.addEventListener("click", () => {
		const next = root.dataset.theme === "light" ? "dark" : "light";
		try {
			localStorage.setItem("theme", next);
		} catch {
			/* localStorage 不可用时仅切换本次开屏 */
		}
		applyBlogTheme();
		paintThemeIcon();
	});

	/* ---------------------------------------------------------------------- */
	/* 五、入场动画                                                           */
	/* ---------------------------------------------------------------------- */
	const revealEls = document.querySelectorAll(".reveal");
	function playReveal() {
		const shot = new URLSearchParams(location.search).has("shot");
		revealEls.forEach((el, index) => {
			const node = /** @type {HTMLElement} */ (el);
			node.style.opacity = "0";
			if (shot) {
				node.style.opacity = "1";
				node.style.transform = "none";
				return;
			}
			node.style.animation = reduceMotion.matches
				? "welcomeUp .18s ease-out forwards"
				: "welcomeUp 1.1s cubic-bezier(.2,.7,.3,1) forwards";
			node.style.animationDelay = reduceMotion.matches
				? "0s"
				: `${0.3 + index * 0.18}s`;
		});
	}

	/* ---------------------------------------------------------------------- */
	/* 云上音乐：歌单 601947159，点击开屏页直接播放                            */
	/* ---------------------------------------------------------------------- */
	const MUSIC_PLAYLIST_ID = "601947159";
	const musicAudio = /** @type {HTMLAudioElement | null} */ (
		document.getElementById("wMusic")
	);
	const musicLink = document.getElementById("wAudio");
	const musicNote = musicLink?.querySelector(".w-audio-note");
	const musicText = musicLink?.querySelector(".w-audio-text");
	let musicTracks = null;
	let musicLoading = false;

	function setMusicText(text) {
		if (musicText) musicText.textContent = text;
	}

	async function fetchProxyTracks() {
		const res = await fetch(
			`/api/music/meting?server=netease&type=playlist&id=${MUSIC_PLAYLIST_ID}`,
		);
		if (!res.ok) throw new Error("proxy " + res.status);
		const data = await res.json();
		if (!Array.isArray(data) || !data.length) throw new Error("empty");
		return data;
	}

	async function fetchDirectTracks() {
		const detail = await fetch(
			`https://musicapi.breezexing.xyz/playlist/track/all?id=${MUSIC_PLAYLIST_ID}&limit=100&offset=0`,
		).then((r) => r.json());
		const songs = (detail?.songs || []).slice(0, 50);
		if (!songs.length) throw new Error("empty");
		const urls = await fetch(
			`https://musicapi.breezexing.xyz/song/url/v1?id=${songs.map((s) => s.id).join(",")}&level=exhigh`,
		).then((r) => r.json());
		const urlById = new Map(
			(urls?.data || [])
				.filter((x) => x?.url)
				.map((x) => [String(x.id), x.url]),
		);
		return songs
			.map((song) => ({
				title: song.name || "",
				url: (urlById.get(String(song.id)) || "").replace(
					/^http:\/\//i,
					"https://",
				),
			}))
			.filter((track) => track.url);
	}

	async function loadMusicTracks() {
		if (musicTracks) return musicTracks;
		let tracks = [];
		try {
			tracks = await fetchProxyTracks();
		} catch {
			tracks = await fetchDirectTracks();
		}
		musicTracks = tracks;
		return tracks;
	}

	async function toggleMusic() {
		if (!musicAudio || !musicLink) return;
		if (!musicAudio.src) {
			if (musicLoading) return;
			musicLoading = true;
			setMusicText("云上音乐 · 加载中");
			try {
				const tracks = await loadMusicTracks();
				const first = tracks.find((track) => track?.url);
				if (!first) throw new Error("empty");
				musicAudio.src = first.url;
				setMusicText(first.title || "云上音乐");
			} catch {
				setMusicText("云上音乐 · 暂时不可用");
				musicLoading = false;
				return;
			}
			musicLoading = false;
		}
		if (musicAudio.paused) {
			try {
				await musicAudio.play();
			} catch {
				setMusicText("云上音乐 · 点击重试");
			}
		} else {
			musicAudio.pause();
		}
	}

	musicLink?.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		void toggleMusic();
	});

	musicAudio?.addEventListener("play", () => {
		if (musicNote) musicNote.textContent = "❚❚";
	});
	musicAudio?.addEventListener("pause", () => {
		if (musicNote) musicNote.textContent = "♪";
	});
	musicAudio?.addEventListener("error", () => {
		if (musicNote) musicNote.textContent = "♪";
		setMusicText("云上音乐 · 播放失败");
	});

	/* ---------------------------------------------------------------------- */
	/* 六、进入动作                                                           */
	/* ---------------------------------------------------------------------- */
	function enter(href) {
		document.body.classList.add("leaving");
		window.setTimeout(() => {
			if (isEmbed) {
				// 被首页 iframe 嵌入时不能自己导航，交给父窗口揭幕
				parent.postMessage({ type: "splash:dismiss" }, location.origin);
				return;
			}
			location.href = href;
		}, 650);
	}

	window.addEventListener(
		"click",
		(event) => {
			const target = /** @type {HTMLElement | null} */ (event.target);
			const link = target?.closest?.(".w-enter");
			if (!(link instanceof HTMLAnchorElement)) return;
			const href = link.getAttribute("href");
			if (!href) return;
			event.preventDefault();
			enter(href);
		},
		true,
	);

	/* ---------------------------------------------------------------------- */
	/* 七、启动                                                               */
	/* ---------------------------------------------------------------------- */
	applyBlogTheme();
	resizeRain();
	applyMist();
	playReveal();
	paintThemeIcon();
	startRain();

	window.addEventListener("resize", () => {
		resizeRain();
		startRain();
	});

	reduceMotion.addEventListener("change", startRain);
})();
