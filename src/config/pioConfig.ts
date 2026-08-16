import type { PioConfig } from "../types/config";

// Pio 看板娘配置
export const pioConfig: PioConfig = {
	enable: true, // 启用看板娘
	models: ["/pio/models/NOIR/noir.model3.json"], // 默认模型路径
	position: "left", // 模型位置
	width: 280, // 默认宽度
	height: 250, // 默认高度
	mode: "draggable", // 默认为可拖拽模式
	hiddenOnMobile: true, // 默认在移动设备上隐藏
	hideAboutMenu: false, // 隐藏内置 About 菜单按钮
	dialog: {
		welcome: "欢迎来到共振边际！", // 欢迎词
		touch: ["蜜。", "别乱摸！", "再摸就呲杆了！", "我们今天不要迟到好吗？"], // 触摸提示
		home: "点这里回到首页！", // 首页提示
		skin: ["想看看我的新衣服吗？", "新衣服好看吧～"], // 换装提示
		close: "QWQ 下次见～", // 关闭提示
		link: "/members/", // 关于链接
	},
};
