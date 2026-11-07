import { setMaxListeners } from "node:events";
import cloudflare from "@astrojs/cloudflare";
import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import swup from "@swup/astro";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";
import expressiveCode from "astro-expressive-code";
import icon from "astro-icon";
import { pluginLanguageLogo } from "ec-lang-logo"; /* Language Logo */
import { pluginCollapsible } from "expressive-code-collapsible"; /* Collapsible */
import { pluginLanguageBadge } from "expressive-code-language-badge"; /* Language Badge */
import katex from "katex";
import "katex/dist/contrib/mhchem.mjs"; // 加载 mhchem 扩展
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeCallouts from "rehype-callouts";
import rehypeCodeGroup from "rehype-code-group"; /* Tab 代码块 */
import rehypeComponents from "rehype-components"; /* Render the custom directive content */
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkAdmonitionToBlockquoteCallout from "remark-admonition-to-blockquote-callout";
import remarkDirective from "remark-directive"; /* Handle directives */
import remarkMath from "remark-math";
import remarkSectionize from "remark-sectionize";
import {
	commentConfig,
	dynamicConfig,
	expressiveCodeConfig,
	fontConfig,
	fontsList,
	mermaidConfig,
	plantumlConfig,
	siteConfig,
} from "./src/config";
import I18nKey from "./src/i18n/i18nKey";
import { i18n } from "./src/i18n/translation";
import { GithubCardComponent } from "./src/plugins/rehype-component-github-card.mjs";
import { rehypeDiagramPanZoom } from "./src/plugins/rehype-diagram-panzoom.mjs";
import rehypeEmailProtection from "./src/plugins/rehype-email-protection.mjs";
import rehypeExternalLinks from "./src/plugins/rehype-external-links.mjs";
import rehypeFigure from "./src/plugins/rehype-figure.mjs";
import rehypeImageReferrerPolicy from "./src/plugins/rehype-image-referrerpolicy.mjs";
import { rehypeMermaid } from "./src/plugins/rehype-mermaid.mjs";
import { rehypePlantuml } from "./src/plugins/rehype-plantuml.mjs";
import { parseDirectiveNode } from "./src/plugins/remark-directive-rehype.js";
import { remarkExcerpt } from "./src/plugins/remark-excerpt.js";
import { remarkImageGrid } from "./src/plugins/remark-image-grid.js";
import { remarkMermaid } from "./src/plugins/remark-mermaid.js";
import { remarkPlantuml } from "./src/plugins/remark-plantuml.js";
import { remarkReadingTime } from "./src/plugins/remark-reading-time.mjs";
import { remarkMark } from "./src/plugins/remark-mark.js";
import { remarkWikiLink } from "./src/plugins/remark-wiki-link.js";
import { collectUsedFontCssVars } from "./src/utils/fontHelper";
import * as metingHandler from "./functions/api/music/meting.js";
import * as lyricHandler from "./functions/api/music/lyric.js";
import * as playlistHandler from "./functions/api/music/playlist.js";
import * as resolveHandler from "./functions/api/music/resolve.js";

// 本地 `pnpm dev` / `pnpm preview` 不会运行 Cloudflare Pages Functions，
// 这里把 functions/api/music/* 挂到 Vite 中间件上，保证本地也能加载歌单。
const MUSIC_API_HANDLERS = {
	"/api/music/meting": metingHandler,
	"/api/music/lyric": lyricHandler,
	"/api/music/playlist": playlistHandler,
	"/api/music/resolve": resolveHandler,
};

// Functions 里用到 caches.default，Node 侧补个内存实现。
// 键必须按 URL（不能是 String(Request)），命中后也要返回克隆，否则第二个请求
// 读到已被消费的 body 会抛 “Body has already been read”。
function installCachesPolyfill() {
	// 配置热重启会复用同一个 Node 进程，用标记判断是否已装过，避免重复重建 Map
	if (globalThis.caches?.__musicApiDev) return;
	const keyOf = (key) =>
		typeof key === "string" ? key : key?.url ? key.url : String(key);
	const store = new Map();
	globalThis.caches = {
		default: {
			async match(key) {
				const hit = store.get(keyOf(key));
				return hit ? hit.clone() : undefined;
			},
			async put(key, response) {
				store.set(keyOf(key), response.clone());
			},
			async delete(key) {
				return store.delete(keyOf(key));
			},
		},
	};
	globalThis.caches.__musicApiDev = true;
}

function musicApiDevPlugin() {
	const middleware = async (req, res, next) => {
		const path = String(req.url || "")
			.split("?")[0]
			.replace(/\/+$/, "");
		const handler = MUSIC_API_HANDLERS[path];
		if (!handler || typeof handler.onRequestGet !== "function") {
			next();
			return;
		}
		try {
			installCachesPolyfill();
			const origin = `http://${req.headers.host || "localhost"}`;
			const request = new Request(`${origin}${req.url}`, {
				method: req.method || "GET",
				headers: req.headers,
			});
			const response = await handler.onRequestGet({
				request,
				env: {},
				params: {},
				waitUntil: () => {},
				next: () => new Response("Not Found", { status: 404 }),
			});
			res.statusCode = response.status;
			response.headers.forEach((value, key) => res.setHeader(key, value));
			res.end(await response.text());
		} catch (error) {
			console.error("[music-api-dev]", error?.stack || error);
			res.statusCode = 502;
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify({ error: String(error?.message || error) }));
		}
	};
	// Astro 的 trailingSlash 中间件会先一步把 /api/music/meting（无尾斜杠）判成 404，
	// 所以这里直接插到 Connect 栈最前面，保证音乐接口优先命中。
	const registerAtFront = (server) => {
		const stack = server.middlewares?.stack;
		if (Array.isArray(stack)) {
			stack.unshift({ route: "", handle: middleware });
			return;
		}
		server.middlewares.use(middleware);
	};
	return {
		name: "music-api-dev",
		configureServer(server) {
			// Astro 在本插件的 `configureServer` 返回钩子里才把 trailingSlash 中间件插到栈首，
			// 所以这里也返回一个后置钩子，等它插完再把音乐接口插到最前面。
			return () => registerAtFront(server);
		},
		configurePreviewServer(server) {
			registerAtFront(server);
		},
	};
}

if (process.env.NODE_ENV === "development") {
	setMaxListeners(20);
}

const adapter = process.env.CF_WORKERS
	? cloudflare({
			prerenderEnvironment: "node",
		})
	: undefined;

// https://astro.build/config
export default defineConfig({
	site: siteConfig.site_url,

	base: "/",
	trailingSlash: "always",

	// 字体配置 - 只加载实际使用的字体，跳过未引用的以加快构建
	fonts: (() => {
		// 禁用字体功能时直接返回空数组，跳过 Astro Font API 集成
		if (!fontConfig.enable) return [];

		const used = collectUsedFontCssVars(fontConfig);
		return fontsList
			.filter((f) => used.has(f.cssVariable))
			.map((f) => {
				let provider;
				switch (f.provider) {
					case "google":
						provider = fontProviders.google();
						break;
					case "fontsource":
						provider = fontProviders.fontsource();
						break;
					case "local":
						provider = fontProviders.local();
						break;
					case "bunny":
						provider = fontProviders.bunny();
						break;
					case "fontshare":
						provider = fontProviders.fontshare();
						break;
					case "npm":
						provider = fontProviders.npm();
						break;
					default:
						provider = f.provider;
				}
				return { ...f, provider };
			});
	})(),

	adapter,

	// 图像优化配置
	image: {
		// 组件可自行传入 layout/widths；这里只控制 Markdown 正文图片
		layout: "none",
	},

	integrations: [
		swup({
			theme: false,
			animationClass: "transition-swup-", // see https://swup.js.org/options/#animationselector
			// the default value `transition-` cause transition delay
			// when the Tailwind class `transition-all` is used
			containers: [
				"#banner-overlay-container",
				"#banner-dim-container",
				"#swup-container",
				"#left-sidebar-dynamic",
				"#right-sidebar-dynamic",
				"#floating-toc-wrapper",
			],
			smoothScrolling: false,
			cache: true,
			preload: {
				hover: true,
				visible: false,
			},
			accessibility: true,
			updateHead: true,
			updateBodyClass: false,
			globalInstance: true,
			// 滚动相关配置优化
			resolveUrl: (url) => url,
			animateHistoryBrowsing: false,
			skipPopStateHandling: (event) => {
				// 跳过锚点链接的处理，让浏览器原生处理
				return event.state?.url?.includes("#");
			},
		}),
		icon({
			include: {
				"material-symbols": ["*"],
				"fa7-brands": ["*"],
				"fa7-regular": ["*"],
				"fa7-solid": ["*"],
				"simple-icons": ["*"],
				mdi: ["*"],
				mingcute: ["*"],
			},
		}),
		expressiveCode({
			themes: [expressiveCodeConfig.darkTheme, expressiveCodeConfig.lightTheme],
			useDarkModeMediaQuery: false,
			themeCssSelector: (theme) => `[data-theme='${theme.name}']`,
			plugins: [
				// pluginLanguageBadge 配置 - 从expressiveCodeConfig读取设置
				...(expressiveCodeConfig.pluginLanguageBadge?.enable === true
					? [pluginLanguageBadge()]
					: []),
				// pluginLanguageLogo 配置 - 从expressiveCodeConfig读取设置
				...(expressiveCodeConfig.pluginLanguageLogo?.enable === true
					? [
							pluginLanguageLogo({
								color: expressiveCodeConfig.pluginLanguageLogo.color ?? "mono",
								excludedLangs:
									expressiveCodeConfig.pluginLanguageLogo.excludedLangs ?? [],
							}),
						]
					: []),
				pluginCollapsibleSections(),
				pluginLineNumbers(),
				// pluginCollapsible 配置 - 从expressiveCodeConfig读取设置，使用i18n文本
				...(expressiveCodeConfig.pluginCollapsible?.enable === true
					? [
							pluginCollapsible({
								lineThreshold:
									expressiveCodeConfig.pluginCollapsible.lineThreshold || 15,
								previewLines:
									expressiveCodeConfig.pluginCollapsible.previewLines || 8,
								defaultCollapsed:
									expressiveCodeConfig.pluginCollapsible.defaultCollapsed ??
									true,
								expandButtonText: i18n(I18nKey.codeCollapsibleShowMore),
								collapseButtonText: i18n(I18nKey.codeCollapsibleShowLess),
								expandedAnnouncement: i18n(I18nKey.codeCollapsibleExpanded),
								collapsedAnnouncement: i18n(I18nKey.codeCollapsibleCollapsed),
							}),
						]
					: []),
			],
			defaultProps: {
				wrap: false,
				overridesByLang: {
					shellsession: {
						showLineNumbers: false,
					},
				},
			},
			styleOverrides: {
				borderRadius: "0.75rem",
				codeFontSize: "0.875rem",
				codeFontFamily:
					"var(--font-code, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace)",
				codeLineHeight: "1.5rem",
				frames: {},
				textMarkers: {
					delHue: 0,
					insHue: 180,
					markHue: 250,
				},
				languageBadge: {
					fontSize: "0.75rem",
					fontWeight: "bold",
					borderRadius: "0.25rem",
					opacity: "1",
					borderWidth: "0px",
					borderColor: "transparent",
				},
			},
			frames: {
				// 保留原生复制按钮，外观由 src/styles/expressive-code.css 覆盖成主题风格
				showCopyToClipboardButton: true,
			},
		}),
		svelte(),
		sitemap({
			filter: (page) => {
				// 根据页面开关配置过滤sitemap
				const url = new URL(page);
				const pathname = url.pathname;
				if (pathname === "/dynamic/" && !siteConfig.pages.dynamic) {
					return false;
				}
				if (pathname.startsWith("/gallery/") && !siteConfig.pages.gallery) {
					return false;
				}
				if (pathname === "/friends/" && !siteConfig.pages.friends) {
					return false;
				}
				if (pathname === "/guestbook/" && !siteConfig.pages.guestbook) {
					return false;
				}
				if (pathname === "/booknav/" && !siteConfig.pages.booknav) {
					return false;
				}
				if (pathname === "/bilibili/" && !siteConfig.pages.bilibili) {
					return false;
				}
				if (pathname === "/bangumi/" && !siteConfig.pages.bangumi) {
					return false;
				}
				if (pathname === "/vndb/" && !siteConfig.pages.vndb) {
					return false;
				}
				if (pathname === "/myanimelist/" && !siteConfig.pages.mal) {
					return false;
				}
				// 动态页评论嵌入页：评论关闭时重定向到 /404/，不应进 sitemap
				if (
					pathname === "/dynamic/comments/" &&
					(dynamicConfig.showComment === false ||
						!commentConfig.type ||
						commentConfig.type === "none")
				) {
					return false;
				}
				if (pathname === "/sponsor/" && !siteConfig.pages.sponsor) {
					return false;
				}
				return true;
			},
		}),
		mdx(),
	],
	markdown: {
		processor: unified({
			remarkPlugins: [
				...(siteConfig.post.rehypeCallouts.enablePythonMarkdownAdmonitions !==
				false
					? [remarkAdmonitionToBlockquoteCallout]
					: []),
				remarkMath,
				remarkReadingTime,
				remarkWikiLink,
				remarkImageGrid,
				remarkMark,
				remarkExcerpt,
				remarkDirective,
				remarkSectionize,
				parseDirectiveNode,
				remarkMermaid,
				[remarkPlantuml, plantumlConfig],
			],
			rehypePlugins: [
				[rehypeKatex, { katex }],
				[rehypeCallouts, { theme: siteConfig.post.rehypeCallouts.theme }],
				rehypeSlug,
				rehypeCodeGroup,
				[rehypeMermaid, mermaidConfig],
				rehypePlantuml,
				rehypeDiagramPanZoom,
				rehypeFigure,
				[
					rehypeImageReferrerPolicy,
					{ domains: siteConfig.imageOptimization?.noReferrerDomains || [] },
				],
				[rehypeExternalLinks, { siteUrl: siteConfig.site_url }],
				[rehypeEmailProtection, { method: "base64" }], // 邮箱保护插件，支持 'base64' 或 'rot13'
				[
					rehypeComponents,
					{
						components: {
							github: GithubCardComponent,
						},
					},
				],
				[
					rehypeAutolinkHeadings,
					{
						behavior: "append",
						properties: {
							className: ["anchor"],
						},
						content: {
							type: "element",
							tagName: "span",
							properties: {
								className: ["anchor-icon"],
								"data-pagefind-ignore": true,
							},
							children: [
								{
									type: "text",
									value: "#",
								},
							],
						},
					},
				],
			],
		}),
	},
	vite: {
		plugins: [tailwindcss(), musicApiDevPlugin()],
		server: {
			watch: {
				ignored: ["**/package/**", "**/Firefly-docs/**"],
			},
		},
		resolve: {
			alias: {
				"@rehype-callouts-theme": `rehype-callouts/theme/${siteConfig.post.rehypeCallouts.theme}`,
			},
		},
		build: {
			minify: "esbuild",
			esbuildOptions: {
				minify: true,
				// 删除 debugger 语句；console.log / console.debug 无副作用，未使用返回值时会被 dead code elimination 移除，
				// console.warn / console.error 保留，确保生产环境出错时仍有日志可查
				drop: ["debugger"],
				pure: ["console.log", "console.debug"],
			},
			rollupOptions: {
				onwarn(warning, warn) {
					// temporarily suppress this warning
					if (
						warning.message.includes("is dynamically imported by") &&
						warning.message.includes("but also statically imported by")
					) {
						return;
					}
					warn(warning);
				},
			},
			// CSS 优化
			cssCodeSplit: true,
			cssMinify: "esbuild",
			assetsInlineLimit: 4096,
		},
	},
});
