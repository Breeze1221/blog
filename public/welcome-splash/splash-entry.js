/*
 * 首页开屏层的「托底」脚本：iframe 本身由 Layout 渲染在 body 最前面，
 * 资格（本次会话第一屏 = 首页）已在 <head> 里同步判定并写到 <html> 的
 * splash-eligible 上，所以首帧就是夜色遮罩，正文不会先闪出来。
 *
 * 本脚本只负责三件事：
 *   1. 给可见的 iframe 挂上 src（没资格的会话 iframe 保持 display:none，不浪费请求）；
 *   2. 收到开屏页的 postMessage({type:"splash:dismiss"}) 后淡出并移除遮罩；
 *   3. 离开首页 / iframe 加载失败时兜底揭幕，避免把正文永久锁在下面。
 */
(function () {
	var ID = "welcomeSplashFrame";
	var frame = document.getElementById(ID);
	if (!frame) return;

	function isHome() {
		return location.pathname === "/" || location.pathname === "/index.html";
	}

	function currentFrame() {
		return document.getElementById(ID);
	}

	// 没资格（本会话已看过 / 第一屏不是首页）：直接移除，CSS 也已隐藏
	if (!document.documentElement.classList.contains("splash-eligible")) {
		frame.remove();
		return;
	}

	var dismissed = false;

	function markDone() {
		try {
			sessionStorage.setItem("welcomeSplashDone", "1");
		} catch (e) {}
	}

	function dismiss(immediate) {
		if (dismissed) return;
		dismissed = true;
		// 只有真正揭幕才算「本会话已看过」；资格判定阶段不记账
		markDone();
		var el = currentFrame();
		if (!el) {
			document.documentElement.classList.remove("splash-eligible");
			document.documentElement.style.removeProperty("overflow");
			return;
		}
		if (immediate) {
			el.remove();
			document.documentElement.classList.remove("splash-eligible");
			document.documentElement.style.removeProperty("overflow");
			return;
		}
		// 淡出期间保留 splash-eligible，否则 display 会立刻变 none，过渡直接被吃掉
		el.classList.add("splash-out");
		setTimeout(function () {
			el.remove();
			document.documentElement.classList.remove("splash-eligible");
			document.documentElement.style.removeProperty("overflow");
		}, 500);
	}

	// 12s 内没等到 iframe 的 load，就当作开屏不可用，直接揭幕
	var watchdog = setTimeout(function () {
		dismiss(true);
	}, 12000);
	frame.addEventListener("load", function () {
		clearTimeout(watchdog);
	});
	frame.addEventListener("error", function () {
		dismiss(true);
	});

	// 资格已定，这里才真正开始加载开屏页
	if (!frame.getAttribute("src")) {
		frame.src = "/welcome-splash/index.html?embed=1";
	}

	window.addEventListener("message", function (event) {
		if (event.origin !== location.origin || !event.data) return;
		if (event.data.type === "splash:dismiss") dismiss();
	});

	// 站内软导航离开首页时兜底揭幕；回到首页也不再重播（splash-eligible 已移除）
	document.addEventListener("astro:page-load", function () {
		if (!isHome()) dismiss(true);
	});
})();
