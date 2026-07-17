# 沙发换皮 & 陪伴位素材 · 生成提示词包(Q21)

> 现状:首页陪伴位的沙发是**纯 CSS 线性座面**(`.room-sofa`,`app.css` §9),零资产、随主题变色、永不糊。
> 本文档是未来「换皮沙发」与陪伴位配套素材的生成提示词与接入规格——**本轮不实现换皮功能**,只把路铺好。

---

## 1. 素材规格(所有沙发皮肤统一)

| 项 | 规格 |
| --- | --- |
| 格式 | PNG,透明背景(必须) |
| 画布 | 1200 × 520 px(@3x;实际显示约 400 × 173) |
| 构图 | 沙发正视图,水平居中;**座面顶缘位于画布垂直 42% 处**(立绘臀线对位点);左右各留 ≥60px 透明边 |
| 光源 | 正上方偏左 15°,软阴影;阴影只允许落在沙发自身,**不要投地面影**(地面影由 CSS 负责,随主题变) |
| 风格 | 扁平微立体(flat 2.5D),2-3 个色阶,无描边或 1px 同色系深描边;禁止照片质感、禁止强高光 |
| 命名 | `sofa-<skin-id>@3x.png`,放 `src/renderer/assets/room/` |

**接入点(未来实现)**:`.room-sofa` 从 CSS 形状切换为 `background-image` 或 `<img>`;`Settings → 她 → 沙发皮肤` 增加一组 skin-card(复用 `companion-skin-grid` 样式)。座位锚点协议(`#pet-seat-anchor`)不受任何影响。

---

## 2. 皮肤 A · 石英玫瑰布艺(默认皮,与 token 对齐)

**中文提示词**

> 一张极简扁平插画风格的双人布艺小沙发,正视图,居中构图,透明背景 PNG。主体颜色 #f6dde7(浅玫瑰粉),坐垫缝线与侧面暗部用 #e8c3d4,底部四只小圆木脚颜色 #b98a9e。形态圆润低矮,靠背为一条连续的胶囊弧线,两侧扶手微微内收,像 macOS 图标一样干净。光源来自左上方,柔和过渡,无强高光,无描边,无地面投影,无任何文字。

**English prompt**

> Minimal flat-illustration loveseat sofa, front view, centered, transparent background PNG. Body color #f6dde7 soft rose pink, seam and shading in #e8c3d4, four small round wooden legs in #b98a9e. Low rounded silhouette, one continuous capsule-shaped backrest, slightly tucked-in armrests, clean like a macOS app icon. Soft light from upper left, no harsh highlights, no outline, no floor shadow, no text.

**Negative / 负面提示**

> text, watermark, logo, human, character, photo-realistic, 3D render, gradient background, floor, wall, shadow on ground, clutter, pattern, stripes

---

## 3. 换皮示例 × 3

### B · 奶油云朵(浅色主题·治愈)
> 极简扁平插画,云朵形状的奶油白色泡芙沙发,正视图,透明背景。主体 #fbf7f2,暗部 #ead9cf,坐垫像三团相连的圆云,矮圆木脚 #c9a98f。轮廓超圆润,零锐角。柔光,无描边,无地面影,无文字。
> *(EN)* Minimal flat cream puff sofa shaped like three connected clouds, front view, transparent PNG, body #fbf7f2, shading #ead9cf, short round wooden legs #c9a98f, ultra-rounded, soft light, no outline, no floor shadow, no text.

### C · 藤编暖阳(浅色主题·自然)
> 极简扁平插画,浅藤编织纹理的单排小沙发,米杏色坐垫 #f4e3d0,藤架 #d9b88f,织纹只用两阶色块示意、不画细线,正视图,透明背景,柔光,无描边,无地面影,无文字。
> *(EN)* Minimal flat rattan loveseat, beige cushion #f4e3d0, rattan frame #d9b88f, weave suggested with two-tone blocks only (no thin lines), front view, transparent PNG, soft light, no outline, no floor shadow, no text.

### D · 深夜丝绒(深色主题款)
> 极简扁平插画,深玫瑰紫丝绒小沙发,正视图,透明背景。主体 #4a2b3a,亮部 #6d4257,金铜色细脚 #b98a5e。绒感用两阶色块过渡表现,不加噪点。低矮圆润,无描边,无地面影,无文字。
> *(EN)* Minimal flat deep-rose velvet loveseat, front view, transparent PNG, body #4a2b3a, highlight #6d4257, slim brass legs #b98a5e, velvet implied by two-tone blocking (no noise), low rounded silhouette, no outline, no floor shadow, no text.

> 出新皮肤时,把主体/暗部/脚三个色值替换即可复用 A 的完整提示词骨架;深色主题款主体明度控制在 L 20-35(oklch),否则在 `#191418` 底上会糊。

---

## 4. 陪伴位立绘补充提示(与 ruohan 现有画风对齐)

现有回退立绘规格:**941 × 1672 px,PNG 透明底,竖构图全身**(`assets/companions/ruohan-default/live2d/fallback/`)。补新姿势时保持:

**画风锚定语(每条提示词都带)**

> 日系厚涂赛璐璐混合风,干净线稿,柔和粉调肤色,大面积平涂 + 少量柔光渐变;发色深棕带玫瑰反光;瞳色暖棕;服装以奶白 + 浅玫瑰(#f6dde7 系)为主;整体亲切安静、非性感;透明背景 PNG,941×1672,全身,无文字无水印。

**姿势库(逐条生成)**

1. **沙发坐姿·看书**:她坐在(画面外的)沙发上,双腿并拢微侧,膝上摊一本浅色小书,低头浅笑。臀线位于画面垂直 58% 处(与沙发座面对位)。
2. **沙发坐姿·抱枕发呆**:抱一只奶白圆枕,下巴轻靠,眼神放空但柔和。
3. **窗台坐姿**(pet 窗 window-seat 用):侧身坐,一腿垂下一腿曲起,手撑在身侧,回头看向镜头方向,头发被微风带起一点。
4. **伏案陪写**(taskbar 替补):趴在桌沿,双手叠放,脸侧枕在手背上看向前方,神情鼓励。

**Negative / 负面提示(全姿势通用)**

> nsfw, suggestive, cleavage, text, watermark, signature, background, floor, furniture, extra fingers, deformed hands, photo-realistic

> 沙发与立绘**分开生成、分层合成**:座面对位点(沙发 42% / 立绘 58%)对齐后,任何皮肤 × 任何姿势可自由组合。
