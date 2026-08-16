# 共振边际 / Interfere Verge — 改动日志

本文件记录在 Mizuki 原始模板基础上，为共振边际乐队官网所做的全部改动。
**后续每次改动都追加到这个文件里**，最新的记录放在最上面。

原则：不改动 Mizuki 的框架结构与构建流程，只做配置、内容和新增页面。

---

## 2026-08-17 — 修复太阳站 Vercel 500

线上输入密码后出现「请求失败（500）」，构建日志里是 `api/_lib/auth.ts`、`api/_lib/store.ts` 的 **TS2591**（找不到 `process` / `Buffer` / `node:crypto` / `node:fs`）。

原因有两层：
1. 根目录 `tsconfig.json` 是给 Astro（`moduleResolution: bundler`）用的，Vercel 编译 `/api` 时没带上 Node 类型。
2. `api/us.ts` 用了 `export default { fetch }`，Vercel 会按 Edge 运行；Edge 没有 `Buffer` / `node:fs`，函数一加载就崩。前端拿不到 `{ error }` JSON，于是显示「请求失败（500）」。

改动：
- `tsconfig.json` 加上 `"types": ["astro/client", "node"]`，并增加 `api/tsconfig.json`
- `api/us.ts` 改成 `GET` / `POST` 导出，并声明 `runtime: "nodejs"`
- `src/plugins/vite-us-api-dev.mjs` 同步改成调用 `GET` / `POST`（本地 `astro dev` 之前还在调 `default.fetch`，会报「本地 /api/us 处理失败」）
- `vercel.json` 为 `api/us.ts` 指定 `maxDuration: 60`

部署后请确认 Vercel 环境变量里有 `US_SPACE_PASSWORD`、`US_SESSION_SECRET`，并且 Blob store 已关联到该项目（会自动注入 `BLOB_READ_WRITE_TOKEN`）。

---

## 2026-08-17 — 首页隐藏演示文、太阳站密码、成员姬晨旭

### 1. 首页只保留三篇演出记录

Mizuki 的 Examples / Guides 演示文本来就标了 `draft: true`，但模板在 `pnpm dev` 里仍会显示草稿。
`src/utils/content-utils.ts` 改为**任何环境都过滤草稿**，并额外隐藏 `Examples`、`Guides` 两个类别。
演示文件仍留在仓库里（测试依赖那些路径），不会出现在首页和档案。

### 2. 太阳站进入密码

本地 `.env` 里的 `US_SPACE_PASSWORD` 已更换。密码只写在环境变量里，**不进仓库**。

改密码的方法：
1. 本地：改项目根目录 `.env` 的 `US_SPACE_PASSWORD=新密码`，然后重启 `pnpm dev`。
2. 线上：Vercel 项目 → Settings → Environment Variables → 改同名变量，保存后重新部署。
3. `.env` 已在 `.gitignore` 中，不要把真实密码写进代码或这篇日志。

上一节部署说明里写过的旧值已经作废，线上请按新密码更新环境变量。

### 3. 成员页

- 大标题 `Members` → `成员`（`src/pages/members.astro`）
- 新增姬晨旭 / Chenxu Ji（姬哥；歌手、电吉他；智能 / 投资人 / 迅捷）
- 预览图：`public/images/members/chenxu-ji.webp`（由 `src/my_fig/members/Chenxu Ji/` 下原图压缩）
- `scripts/prepare-band-assets.mjs` 的成员映射表已加上对应一行

### 4. 太阳站相册上传者

种子相册 `d5` 和 `我们` 里现有照片的 `uploadedBy` 从 `36`（三六）改为 `d5`（小五段）。
已经生成过的本地 `.us-data/data.json` 或 Vercel Blob 存档，下次读取 `/api/us` 时会自动改写种子照片的上传者；之后两人自己上传的新照片不受影响。

---

## 2026-08-17 — 中文化、内容上线与太阳站

### 1. 图片压缩（新增 `scripts/prepare-band-assets.mjs`）

`src/my_fig/` 里的原图是手机原片，合计 **264.6MB**（相册 52 张就占 222MB，另有一个 90MB 的 wav）。
直接进 Git 会有真问题：GitHub 单文件超 100MB 直接拒推，仓库会大到难以克隆，
Astro 还要逐张处理文章配图，构建时间会失控。

所以加了一个可重复运行的脚本，用项目已有的 `sharp` 把图压到 web 尺寸
（长边最多 2560px、WebP、质量 82，按 EXIF 自动转正），**原图一张没删，全部留在 `src/my_fig/`**：

```bash
pnpm run prepare-band-assets   # 往 src/my_fig/ 加了新照片后重跑一次即可
```

上次会话直接复制过来的成员照片和太阳站种子素材也一起纳入压缩，结果 **318.6MB → 18.9MB**：

| 内容 | 源目录 | 输出 |
| --- | --- | --- |
| 首页背景图 4 张 | `src/my_fig/background/desktop-banner` | `public/assets/banner/` |
| 相册 Ours 52 张 | `src/my_fig/albums/First` | `public/images/albums/First/` |
| 三篇文章配图 15 张 | `src/my_fig/main/2026xxxx` | `src/content/posts/live-2026-xx-xx/` |
| 成员照片 2 张 | `src/my_fig/members` | `public/images/members/` |
| 太阳站相册 d5 / 我们 14 张 | `src/my_fig/36/albums` | `public/us-assets/albums/` |
| 太阳站动态配图 1 张 | `src/my_fig/36/content/20260814xx` | `public/us-assets/moments/20260814/` |

整个待提交体积从 70.9MB 降到 **20.4MB**（其中大头还是 Mizuki 自带的演示音乐和 Live2D 贴图）。

命名规则按用途区分，重跑结果稳定：

- 公开相册用原文件名的短哈希（`p<hash>.webp`）。导出串本身没有含义，
  而且相册扫描器会把文件名里的下划线当成标签分隔符，用哈希能避开这个坑。
  封面仍取自原来那张，所以相册预览图没变。
- 太阳站种子相册用序号（`01.webp`…），成员照片和动态配图用 `rename` 映射表指定确定的名字，
  因为这些路径写在 `api/_lib/seed.ts` 和 `src/data/members.ts` 里，名字必须可控。
  **加新成员时，往 `rename` 表里补一行即可。**

### 2. 界面中文化

站点语言从 `en` 切到 **`zh_CN`**（`src/config/siteConfig.ts` 的 `SITE_LANG`）。
Mizuki 自带完整的中文词条，所以设置面板（调色盘图标里那一整套：主题色、壁纸、壁纸效果、
横幅选项、特效、布局、功能等）也一并变成中文，不需要逐条去改组件。

按你的要求在 `src/i18n/languages/zh_CN.ts` 覆盖了几条措辞：

| 键 | 原中文 | 改为 |
| --- | --- | --- |
| `home` | 主页 | 首页 |
| `archive` | 归档 | 档案 |
| `about` | 关于我们 | 共振边际 |
| `categories` | 分类 | 类别 |
| `tocEmpty` | 当前页面没有目录 | 无目录 |
| `siteStats` | 站点统计 | 统计 |
| `albumsSubtitle` | 记录生活中的美好瞬间 | 记录一些瞬间 |

导航栏里三项是自定义字面量，直接在 `src/config/navBarConfig.ts` 改：
`Ours` → **我们的**，`Albums` → **相册**，`Members` → **成员**，About 下的子项 → **共振边际**。
`Links`/`About` 走 i18n，本来就是「链接」「关于」。`???` 保持不变（是入口，不该被看懂）。

> 设置面板里剩下的英文只有 `aria-label`（无障碍标签，屏幕阅读器用，界面上看不到），没有动。

### 3. 首页与页脚

- 去掉了 banner 副标题：`siteConfig.banner.homeText` 里删掉 `subtitle` 字段即可，
  Banner 组件在 `subtitle` 缺失时不渲染那一行（留空数组反而会渲染一个空行）。
- 页脚整段替换为 `© 共振边际 / Interfere Verge. All Rights Reserved.`，
  RSS / Atom / Sitemap 三个链接和第二行都去掉了。顺带清掉了因此不再使用的
  `profileConfig`、`url`、`currentYear` 引用。

### 4. 背景图

`siteConfig.banner.src` 和 `backgroundWallpaper.ts` 的 `src` 都换成了新的 4 张，
桌面端和移动端用同一组。

> 注意这里有**两处**背景配置：顶部横幅（`siteConfig.banner`）和全屏壁纸模式
> （`backgroundWallpaper.ts`）。只改前者的话，切到全屏壁纸模式还会看到旧图，所以两个都改了。
> 旧的 `public/assets/desktop-banner/` 和 `mobile-banner/` 没有删——它们和
> `src/assets/public/` 下的镜像文件有一致性测试，删了会让 `pnpm test` 失败。

### 5. 修掉「相册/成员页首次进入布局错乱」

**根因不是布局代码**，而是 `astro.config.mjs` 里的
`updateHead: process.env.NODE_ENV === "production"`：开发模式下 Swup 不更新 `<head>`，
无刷新跳转时新页面**自己那份 CSS 根本没被加载**，所以图片按原始尺寸铺开、tag 也没样式；
按 F5 是整页加载，样式自然就有了。

改法是让这两页的样式不再依赖 `<head>` 更新——挪进全局样式表：

- `src/pages/albums.astro` 里的 `<style is:global>` 网格规则 → 移到 `src/styles/albums.css`
- `src/styles/members.css` → 由 `src/styles/main.css` 统一 `@import`，页面里不再单独 import

`main.css` 是全站首屏就加载的，因此开发和生产都不会再有这个问题（也顺带消除了线上的样式闪烁）。

### 6. 成员卡片：多件乐器不再被拆断

原来 `instruments` 是一个字符串，「电吉他、贝斯」在窄列里配合 `word-break: break-word`
会被逐字拆成三行。改成数组，每件乐器渲染成一个 `whitespace-nowrap` 的片段，
中间用 `·` 分隔，**换行只发生在乐器之间，不会把词拆开**：

```ts
instruments: ["电吉他", "贝斯"]   // src/data/members.ts
```

### 7. 正文内容

- Mizuki 的 8 篇演示文章全部加上 `draft: true`（`content-pipeline-fixture.mdx`、
  `guide/index.md`、`image-grid-demo.md`、`markdown-extended.md`、`markdown-mermaid.md`、
  `markdown-tutorial.md`、`video.md`、`encrypted-post.md`）。
  用 `draft` 而不是删文件，是因为测试用例依赖 `content-pipeline-fixture.mdx` 和
  `guide/cover.webp` 的**文件路径**，移走会让 `pnpm test` 失败。
  文件都留着，想恢复把 `draft` 改回 `false` 即可。

  > 一个 Mizuki 的既有行为：草稿在 `pnpm dev` 里仍然可见（方便预览未发布内容），
  > 只有生产构建才会过滤。所以本地开发你还会看到这 8 篇，**部署到线上就没有了**
  > （已用构建产物验证）。想让开发环境也一起隐藏，跟我说一句就行。

- 新增三篇演出记录，配图已随文章目录一起进构建管线：

| 文章 | 日期 | 类别 | 标签 |
| --- | --- | --- | --- |
| 2026年第三届校园十佳歌手大赛 | 2026-01-08 | 校内演出 | HIAS、十佳歌手大赛 |
| 2026年第三届草坪音乐节 | 2026-05-27 | 校内演出 | HIAS、草坪音乐节 |
| 2026年毕业演出 | 2026-06-23 | 校内演出 | HIAS、毕业演出 |

### 8. 相册 Ours

`info.json` 你自己已经改好了（标题 Ours、描述、日期、地点、标签），**我一个字没动**，
只把 52 张照片压好放进去，封面沿用原来那张。

### 9. 太阳站（原 `/us/`）

#### 登录改成两步

先只验密码，通过后才出现「你是谁」和两个身份。为此加了一个
`?action=password.check` 接口：只校验密码、**不下发登录票据**，
身份选好之后才真正调 `login` 拿 Cookie（已实测 `password.check` 不返回 Cookie）。

#### 页面调整

- 左上角 `???` → **太阳站**（登录前那一屏仍然是 `???`，入口不提前暴露）
- 去掉右上角「主站」（退出后的界面已有返回主站的入口）
- 删除 Special Days 会弹确认框
- 日历可以**点年份选年、点月份选月**，年份还能整页翻；有动态/纪念日的年月会高亮，翻很久以前的日子不用一个月一个月点
- 隐藏了主站的 Live2D 看板娘和主站音乐播放器：给 `Layout.astro` 加了
  `siteWidgets` 属性（默认 `true`），`us.astro` 传 `false`

#### 相册

- 「多选」变成一个**模式开关**：默认单击是**预览**（大图浮层，支持左右切换、Esc 关闭、下载），
  点「多选」后单击才是勾选
- 下载走 `fetch` + object URL，因为 `<a download>` 对跨域地址（Blob 存储）无效，
  浏览器会变成打开而不是下载

#### 发动态

- 「发布动态」「发布新动态」→ **我要bb**；输入框提示 → **想bb点什么…**
- 「语音」措辞改成 **音频**（指上传文件）
- 另外加了真正的**按住说话**：用 `MediaRecorder` 录音，松手自动作为音频附件上传。
  会自动挑浏览器支持的容器（opus/webm → mp4 → ogg），没权限或不支持时给出提示并建议改用上传文件

#### 背景音乐

新增 `UsMusic.svelte`：

- 支持**新建 / 重命名 / 删除歌单**，**上传音乐**（音频文件、曲名必填；作者、封面图可留空；
  可选已有歌单或直接新建歌单），删除曲目
- 底部常驻播放条：播放/暂停、上一首/下一首、进度拖动、音量、列表循环
- 播放器**常挂载**，在动态/相册/音乐之间切标签页音乐不会断（真正的背景音乐）
- 数据结构新增 `playlists`，旧存档读取时会自动补上（`api/_lib/store.ts` 的 `normalize`）

> **《写给未来的诗》没有进仓库**：原文件是 90MB 的 wav，接近 GitHub 100MB 硬限制，
> 也不适合网页播放。按你的选择，种子数据里只建了一个空的「太阳站」歌单，
> 部署后用太阳站的「＋ 上传音乐」把 wav 和封面 `fly.jpg` 传上去即可
> —— 走客户端直传 Blob，不受 4.5MB 函数请求体限制，大文件没问题。

### 10. 验证结果

- `pnpm run type-check`：通过
- `pnpm run check`（astro check，344 文件）：0 errors / 0 warnings / 0 hints
- `pnpm test`：39 + 8 全部通过
- `pnpm build`：通过，**21 个页面**（演示文章已从生产产物中消失，只剩新增的 3 篇）
- 构建产物逐项核对：首页文案/页脚/背景图/语言、相册 52 张、文章配图进管线、`/us/` 无看板娘与主站播放器
- `/api/us` 实测：两步登录、`password.check` 不发 Cookie、歌单与曲目增删改、越权与参数校验
- 种子素材 15 个 URL 全部可访问（改成 `.webp` 后逐个 HEAD 验证过，避免图裂）

### 11. 本次新增的已知问题

1. **旧的示例背景图仍在仓库里**（`public/assets/desktop-banner/`、`mobile-banner/` 及
   `src/assets/public/` 下的镜像）。它们已经不再被引用，但有一致性测试盯着，
   要清理需要连测试一起改，本次没动。
2. 草稿文章在开发环境仍可见（见第 7 节）。
3. **`src/my_fig/` 已加入 `.gitignore`。** 里面是手机原图和 90MB 的 wav，合计约 350MB，
   一旦 `git add .` 就会把仓库撑坏（wav 也接近 GitHub 的 100MB 硬限制）。
   站点实际用的是压缩后的派生文件，已经提交在 `public/` 和 `src/content/posts/` 下。
   **原图请自己另外备份**（比如网盘或本地），因为它们不再进版本管理；
   如果你确实想连原图一起版本管理，把 `.gitignore` 里那一行删掉即可。

---

## 2026-08-14 — 初次改造

### 0. 部署前你必须做的三件事

1. **改站点地址**：`src/config/siteConfig.ts` 里的 `siteURL` 目前是占位值
   `https://interfere-verge.vercel.app/`，换成 Vercel 给的真实域名（结尾保留斜杠）。
   它影响 sitemap、RSS 和分享链接。
2. **在 Vercel 配三个环境变量**（Settings → Environment Variables）：
   | 变量名 | 值 | 说明 |
   | --- | --- | --- |
   | `US_SPACE_PASSWORD` | `333666666` | 进入 `/us/` 的密码 |
   | `US_SESSION_SECRET` | 一串随机字符 | 登录票据签名密钥，用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成 |
   | `BLOB_READ_WRITE_TOKEN` | 自动注入 | 见下一条 |
3. **开通 Vercel Blob**：Vercel 项目 → Storage → Create Database → Blob，
   创建后关联到本项目，`BLOB_READ_WRITE_TOKEN` 会自动注入，不用手填。
   这是 `/us/` 存放动态数据和上传的图片/语音/视频的地方。
   **没开 Blob 的话 `/us/` 在线上无法保存任何内容。**

密码没有写进仓库（按你的选择走环境变量）。本地开发用根目录的 `.env`，
该文件已在 `.gitignore` 中，不会被提交。

---

### 1. 品牌替换（去掉模板痕迹）

| 文件 | 改动 |
| --- | --- |
| `src/config/siteConfig.ts` | `title` → `Interfere Verge`；`subtitle` → `共振边际乐队官方网站`；`siteURL` 换占位域名；`siteStartDate` → `2026-08-18`；`navbarTitle.text` → `Interfere Verge`，`icon`/`logo` 指向乐队 logo；`favicon` 设为乐队 logo |
| `src/config/profileConfig.ts` | `avatar` 换成乐队 logo；`name` → `Interfere Verge`；`bio` → `I.F.V`；`links` 清空（社交图标全部移除） |
| `src/config/pioConfig.ts` | Live2D 看板娘的欢迎语、触摸语等全部换成中文乐队台词；`link` 指向 `/members/` |
| `src/components/organisms/footer/Footer.astro` | 删掉 "Powered by Astro & Mizuki Version 9.0" 一行，换成 `Interfere Verge / 共振边际` |
| `src/content/spec/about.md` | 整篇重写为乐队介绍。原来的 "Theme Features" 及其以下全部内容已删除，模板自带的 GitHub 卡片也一并去掉 |
| `scripts/check-global-style-loading.mjs` | 构建检查原本强制要求关于页里存在模板的 GitHub 卡片，关于页改成乐队内容后这条断言必然失败。只删掉这一条 markup 断言，保留真正有意义的样式加载校验 |

新增图片资源（从 `src/my_fig/` 复制到 `public/`，原文件保留未动）：

- `public/assets/home/interfere-verge-logo.jpg` ← `interfere_verge_logo1.jpg`
- `public/images/members/haoxun-li.jpg`、`public/images/members/zhenzhe-chang.jpg`
- `public/images/albums/First/{cover.jpg,01.jpg,02.jpg}`
- `public/us-assets/moments/20260814/plan-complete.png`
- `public/us-assets/albums/d5/01–06.jpg`、`public/us-assets/albums/with/01–08.jpg(jpeg)`

### 2. 导航栏

`src/config/navBarConfig.ts` 重写了菜单：

- `Home`、`Archive`：保持不变。
- `Links`：只留 `Bilibili`，**没有挂链接**（`url: "#"`），账号搭好后把 `url` 换成空间地址并加 `external: true`。
- `My` → **`Ours`**：只保留 `Albums`（原来叫 Gallery），新增 `Members`；`Anime`/`Diary`/`Devices` 已移除。
- `About`：保留 `About`，`Friends` → **`???`**（指向 `/us/`）。
- `Others`：整栏删除。

`src/config/siteConfig.ts` 的 `featurePages` 把 `anime`/`diary`/`friends`/`projects`/`skills`/`timeline`/`devices`/`aiTools` 全部关成 `false`，只留 `albums: true`。
这样即使有人直接访问 `/anime/` 也会跳到 404，同时对 SEO 更干净。

> 补充：`???` 这一项加了新字段 `noSwup: true`。因为 Swup 只替换 `<main>` 里的内容，
> 而 `/us/` 的排版跟主站完全不同（没有导航栏和侧边栏），无刷新跳转会残留上一页的框架。
> 为此在 `src/types/config.ts` 的 `NavBarLink` 里加了可选的 `noSwup`，
> 并在 `DropdownMenu.astro` / `NavMenuPanel.astro` 里渲染成 `data-no-swup`（Swup 默认会忽略带这个属性的链接）。

### 3. 相册

- **示例相册没有删文件，只是隐藏了**（改 `info.json` 里的 `hidden: true`）：
  - `public/images/albums/AcgExample/info.json`
  - `public/images/albums/EncryptedExample/info.json` — 按你的要求保留加密写法作参考，
    `password` / `passwordHint` 字段原样留着，另加了 `_note` 说明。
    以后想用加密相册，把 `hidden` 改回 `false` 照着写即可。
  - `ExternalExample` / `HiddenExample` 原本就是隐藏的，未改动。
- 新增公开相册 `public/images/albums/First/info.json`：标题 `First`，
  标签 `2026` / `HIAS` / `器乐社`，两张调试图片，封面用了第一张。

### 4. 首页

`src/config/siteConfig.ts` 的 `banner.homeText`：

- 大字标题：`わたしの部屋` → `共振边际乐队`
- 打字机循环文案：`其实是呲杆了`、`蜜。`、`我们今天不要迟到好吗？`

### 5. 侧边栏

- 第一栏（Profile）：见「品牌替换」，名字 `Interfere Verge`，简介 `I.F.V`，下方五个社交图标已全部移除。
- 第二栏（Announcement）：`src/config/announcementConfig.ts` 内容改成 `其实是一窝子神人。`，
  `Learn More` 按钮的链接从 `/about/` 改为 `/members/`。

### 6. Members 页面（新增）

仿照原 Anime 页的卡片布局，但去掉了评分、追番状态、进度条、Year、Studio 和外链。

| 文件 | 作用 |
| --- | --- |
| `src/data/members.ts` | 成员数据，**以后加人只改这一个文件** |
| `src/components/features/members/MemberCard.astro` | 单张成员卡片 |
| `src/components/features/members/index.ts` | 导出入口 |
| `src/styles/members.css` | 卡片网格（横向卡片，宽屏两列） |
| `src/pages/members.astro` | 页面本体 |

卡片信息顺序：照片 → 中文名 → 英文名 → 昵称 → 擅长乐器 → 标签。

已录入两位：

- 李浩勋 / Haoxun Li / 小五段 / 木吉他 / 智能、灵巧、独行
- 常臻哲 / Zhenzhe Chang / 三六 / 电吉他、贝斯 / 环境、远见、突袭

### 7. 私密空间 `/us/`（新增，最大的一块）

#### 为什么需要后端

Mizuki 是纯静态站点。你要的「在线编辑、两个控制端、点赞评论、上传图片语音视频」
必须有服务端存储，否则浏览器里改的东西存不下来、对方也看不到。

采用的方案是 **Vercel 根目录 `/api` 函数 + Vercel Blob 存储**：

- Astro 构建**完全没动**：还是 `output: "static"`，没装适配器，`dist/` 目录结构、
  `pagefind` 索引、`pnpm preview`、构建检查脚本全部照原样工作。
- Vercel 会把项目根目录 `api/` 下的文件独立部署成 Serverless Function，
  这是平台级能力，跟用什么框架无关。所以两边互不干扰。

#### 服务端文件

| 文件 | 作用 |
| --- | --- |
| `api/us.ts` | 唯一的函数入口，用 `?action=xxx` 区分操作（只占一个函数额度） |
| `api/_lib/auth.ts` | 密码校验 + HMAC 签名的登录 Cookie（HttpOnly，30 天） |
| `api/_lib/store.ts` | 数据与媒体读写。有 Blob 用 Blob，没有则退回本地文件 |
| `api/_lib/seed.ts` | 首次访问时写入的初始内容 |
| `src/types/us.ts` | 前后端共用的数据类型 |

> `api/` 下以 `_` 开头的文件不会被 Vercel 当成函数，只作为依赖被打包。

登录方式：**一个共用密码 + 登录时选身份**（小五段 / 三六）。
身份存在签名 Cookie 里，之后所有发布、上传、评论都自动带上发布者，
这就是你要的「两个人各有一个控制端」。

#### 存储

- 线上：动态/纪念日/相册数据存成 Blob 上的一个 `us/data.json`，
  上传的媒体存到 `us/media/`。
- 本地开发（没配 Blob 时）：数据写 `.us-data/data.json`，媒体写 `public/us-media/`，
  两者都已加入 `.gitignore`。
- 上传走**客户端直传 Blob**，绕开 Serverless Function 4.5MB 的请求体限制，
  所以视频也传得上去（单文件上限设为 200MB）。没配 Blob 时退回经函数转发。

#### 页面与组件

| 文件 | 作用 |
| --- | --- |
| `src/pages/us.astro` | 页面外壳。**故意不用 `MainGridLayout`**，没有导航栏/侧边栏/banner，排版和主站完全分开；带 `noindex` 且不进 sitemap |
| `src/components/features/us/UsSpace.svelte` | 根组件，管登录态、数据、视图切换 |
| `src/components/features/us/UsLogin.svelte` | 密码 + 身份选择 |
| `src/components/features/us/UsCalendar.svelte` | 日历。有动态的日子显示圆点，纪念日标红并加 ★ |
| `src/components/features/us/UsMomentComposer.svelte` | 发布/编辑动态，可挂图片、语音、视频 |
| `src/components/features/us/UsMomentDetail.svelte` | 正文页：图文/音频/视频排版 + 评论回复 + 四种态度 |
| `src/components/features/us/UsSpecialDays.svelte` | Special Days 列表，可增删 |
| `src/components/features/us/UsAlbums.svelte` | 相册：预览只显示相册名；进去后每张图带上传时间和上传人；支持新建/重命名/删除相册、添加/多选删除图片 |
| `src/components/features/us/api.ts` | 前端请求封装 + 上传 |
| `src/components/features/us/format.ts` | 时间格式化、两人配色、态度图标 |

按需求实现的细节：

- 动态预览**只有发布时间（精确到秒）和标题**，按时间倒序（后发的在上面）。
- 两个发布人用不同底色区分：小五段 = 蓝色系，三六 = 琥珀色系。
- 四种态度：👍 赞、👎 踩、🚨 举报、💩 答辩，可反复切换，鼠标悬停能看到是谁投的。
- 评论支持回复（两层），只能删自己的；删父评论会连带删掉它下面的回复。
- 只能编辑/删除自己发的动态（服务端校验，不是只藏按钮）。

#### 本地开发支持

`src/plugins/vite-us-api-dev.mjs`（新增）+ `astro.config.mjs` 里挂上这个 Vite 插件：
`astro dev` 本身不认识 `api/` 目录，这个插件把 `/api/us` 的请求转给同一个处理函数，
避免维护两套实现。**只在开发时生效，不影响生产构建。**

> 里面有个坑值得记一下：Astro 的 `trailingSlash: "always"` 会把 `/api/us`（无结尾斜杠）
> 直接判 404，而且它的中间件是插到栈首的。所以插件用了 `enforce: "post"`
> 并手动 `stack.unshift`，才能排到 Astro 的中间件前面。

#### 初始内容

首次访问 `/us/` 时自动写入：

- 一条动态：小五段发布，图片 `plan-complete.png`，文本「余烬双星计划的最后一块拼图，此页面搭成！」
- 一个纪念日：2026-08-18「余烬双星计划启动」
- 两个相册：`d5`（6 张）和 `我们`（8 张）

之后所有增删改都由控制端接管，不会再读种子数据。

### 8. 其他改动的文件

| 文件 | 改动 |
| --- | --- |
| `astro.config.mjs` | 挂载开发期 API 插件；sitemap 排除 `/us/` |
| `tsconfig.json` | `include` 加上 `api/**/*`，让 `pnpm run type-check` 也覆盖后端代码 |
| `.env.example` | 补充私密空间的三个环境变量说明 |
| `.gitignore` | 忽略 `.us-data/` 和 `public/us-media/` |
| `package.json` | 新增依赖 `@vercel/blob` |

### 9. 验证结果

- `pnpm run type-check`：通过
- `pnpm run check`（astro check，344 个文件）：0 errors / 0 warnings / 0 hints
- `pnpm build`：通过，27 个页面，pagefind 索引和字体检查都正常
- `/api/us` 全流程实测通过：未登录被拦、错误密码被拒、登录发 Cookie、
  种子数据正确、发布/评论/回复/四种态度/相册增删、越权操作被服务端拒绝、退出登录

### 10. 已知问题与待办

1. **图片/视频的直链是公开的。** `/us/` 页面本身有密码保护，列表和正文必须登录才拿得到，
   但媒体文件本身（`/us-assets/…` 和 Blob 链接）只要知道完整地址就能打开。
   Blob 地址是随机后缀、猜不到，但这不等于访问控制。真要严格隔离得再加一层代理。
2. **两人同时编辑可能互相覆盖。** 数据是整个 JSON 读出改完写回，
   两个人在同一秒提交的话后写的会盖掉前一个。两个人用基本碰不上，先不加锁。
3. **Blob 走 CDN，对方可能晚一点才看到。** 已经用时间戳参数绕缓存了，
   自己发的内容立刻可见，对方最坏情况下要等一会儿。
4. **示例文章还在。** 按你的选择保留了 `src/content/posts/` 下 8 篇 Mizuki 教程文章，
   它们**会公开显示在首页和归档里，正文里还带 Mizuki 字样**。
   想清干净就删掉 `src/content/posts/` 里除自己文章外的文件。
   同理 `src/data/` 下的 `friends.ts` / `projects.ts` / `skills.ts` / `timeline.ts` / `anime.ts` / `devices.ts`
   还是示例数据，但对应页面已关闭，不会显示。
5. **`d5` 和 `我们` 两个相册的上传人写的是「三六」**，因为原始文件放在 `src/my_fig/36/` 下，
   我只能这么猜。要改的话，第一次访问 `/us/` 之后直接删掉相册重建，或者改 `api/_lib/seed.ts` 里的 `uploadedBy`。
6. **Bilibili 菜单项是空占位**，账号开好后按第 2 节说明补链接。
7. `src/my_fig/` 里的原始图片我一张都没删，只是复制了一份到 `public/`。确认没问题后可以自行清理。
