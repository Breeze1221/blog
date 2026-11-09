import type { AnalyticsConfig } from "../types/analyticsConfig";

export const analyticsConfig: AnalyticsConfig = {
	// Google Analytics ID
	googleAnalyticsId: "",
	// Microsoft Clarity ID
	microsoftClarityId: "",
	// Umami 统计配置
	umamiAnalytics: {
		// Umami Website ID
		websiteId: "fb6f8022-f7eb-48bd-885d-c1afc16e803f",
		// 公开分享 ID（统计页 azuma 版用；配合下方 shareApiBase 取数）
		shareId: "dvu6Vig8Ba9AMAfh",
		// 必须是绝对地址：统计组件用 new URL() 拼接口，相对地址会直接抛 Invalid URL、数据全挂。
		// 本站部署在 Vercel（无 Cloudflare Pages Functions），同源代理由 vercel.json 的
		// rewrites 把 /api/umami/* 转发到 Umami 实例；若代理未生效可临时改回
		// "https://umami.breezexing.xyz" 直连（对方带 Access-Control-Allow-Origin: *）
		shareApiBase: "https://breezexing.xyz/api/umami",
		// Umami 上线之前的历史量（本站统计一直走 Umami，无历史量可叠）
		historicalStats: { visitors: 0, pageviews: 0 },
		// Umami JS地址，支持使用自建
		scriptUrl: "https://umami.breezexing.xyz/script.js",
		// Umami 会话回放脚本地址，支持使用自建
		replaysScriptUrl: "https://umami.breezexing.xyz/recorder.js",
		// 是否追踪出站链接
		trackOutboundLinks: true,
		// 是否收集浏览器性能指标
		collectWebVitals: false,
		// 会话回放配置
		replays: {
			// 是否启用会话回放
			enabled: false,
			// 录制会话采样率，范围 0-1，例如 0.15 表示记录 15% 的会话
			sampleRate: 0.15,
			// 隐私遮罩级别："moderate" 会遮罩所有输入框；"strict" 额外遮罩页面全部文本
			maskLevel: "moderate",
			// 单次录制最大时长（毫秒）
			maxDuration: 300000,
			// 需要排除录制的元素 CSS 选择器，例如 ".sensitive-widget"
			blockSelector: "",
		},
	},
	// 51la 统计配置
	la51Analytics: {
		// 51la 统计 ID
		Id: "",
		// 自定义 SDK JS 地址，防止 DNS 污染，留空使用默认地址
		sdkUrl: "",
		// 多个统计 ID 的数据分离标识，留空则使用 Id
		ck: "",
		// 是否开启事件分析功能
		autoTrack: false,
		//  Hash路由模式, 项目使用History API路由, 所以不必开启默认false
		hashMode: false,
		// 是否开启网站录屏功能
		screenRecord: true,
	},
};
