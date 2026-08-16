// 乐队成员数据
export interface Member {
	/** 中文人名 */
	name: string;
	/** 英文名 */
	englishName: string;
	/** 昵称 */
	nickname: string;
	/** 擅长乐器，一件一项。多件时卡片会按项换行，不会把词拆断 */
	instruments: string[];
	/** 成员照片，放在 public/images/members/ 下 */
	photo: string;
	/** 标签 */
	tags: string[];
}

export const members: Member[] = [
	{
		name: "李浩勋",
		englishName: "Haoxun Li",
		nickname: "小五段",
		instruments: ["木吉他"],
		photo: "/images/members/haoxun-li.webp",
		tags: ["智能", "灵巧", "独行"],
	},
	{
		name: "常臻哲",
		englishName: "Zhenzhe Chang",
		nickname: "三六",
		instruments: ["电吉他", "贝斯"],
		photo: "/images/members/zhenzhe-chang.webp",
		tags: ["环境", "远见", "突袭"],
	},
	{
		name: "姬晨旭",
		englishName: "Chenxu Ji",
		nickname: "姬哥",
		instruments: ["歌手", "电吉他"],
		photo: "/images/members/chenxu-ji.webp",
		tags: ["智能", "投资人", "迅捷"],
	},
];
