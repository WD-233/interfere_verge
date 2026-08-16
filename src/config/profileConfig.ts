import type { ProfileConfig } from "../types/config";

// 个人资料配置
export const profileConfig: ProfileConfig = {
	avatar: "/assets/home/interfere-verge-logo.jpg", // 相对于 /src 目录。如果以 '/' 开头，则相对于 /public 目录
	name: "Interfere Verge",
	bio: "I.F.V",
	typewriter: {
		enable: true, // 启用个人简介打字机效果
		speed: 80, // 打字速度（毫秒）
	},
	// 暂不展示社交平台图标，各账号搭好后再往这里加
	links: [],
};
