# 🏃 跑者广场 (Runner Plaza)

> 一个为台湾中部跑者打造的社区平台：赛事聚合 + 心得分享 + 数据分析

## 项目概览

**跑者广场**是一个多层次的跑步社区系统：

- 📝 **知识库**: Obsidian vault，存储赛事信息和心得分享
- 🤖 **自动化**: Claude Code Skills + Python爬虫，自动爬取和处理赛事数据
- 💾 **第二大脑**: Claude Code Memory系统，存储项目规则和决策
- 🌐 **未来展示**: 计划开发网站/App展示内容

---

## 📂 项目结构

```
Runner/
├── README.md                          # 本文件
├── runner/                             # Obsidian vault根目录
│   ├── 歡迎.md                        # 项目首页
│   ├── 赛事/                          # 赛事信息
│   │   ├── 2026-中部赛事列表.md      # 赛事汇总表
│   │   └── 爬虫日志.md               # 爬虫运行日志
│   ├── 心得/                          # 个人分享
│   │   ├── 装备/                     # 跑鞋、服装、手表评测
│   │   ├── 训练/                     # 训练日志、课表
│   │   ├── 比赛/                     # 赛事体验、成绩分享
│   │   └── 营养/                     # 饮食、补给建议
│   ├── 社区/                          # 社区系统
│   │   ├── 投稿指南.md               # 投稿格式和流程
│   │   ├── 审核队列.md               # 待审核投稿
│   │   └── 已发布.md                 # 已发布内容索引
│   ├── 数据分析/                      # 统计和分析
│   │   ├── 赛事统计.md               # 赛事热度、参赛人数
│   │   └── 参赛人数趋势.md           # 长期趋势分析
│   ├── 系统配置/                      # 配置文件
│   │   ├── 标签体系.md               # Obsidian标签规范
│   │   ├── 爬虫规则.json             # 爬虫配置
│   │   ├── MCP配置.md                # 外部集成配置
│   │   └── .obsidian/                # Obsidian应用配置
│   └── attachments/                   # 图片和附件
│
├── .claude/                            # Claude Code配置
│   ├── memory/                        # 第二大脑系统（Claude的持久化记忆）
│   │   ├── project_context.md         # 项目背景
│   │   ├── data_sources.md            # 数据源规范
│   │   ├── content_guidelines.md      # 内容规范
│   │   ├── automation_status.md       # 自动化状态
│   │   └── MEMORY.md                  # 内存索引
│   ├── plans/                         # 项目规划
│   │   └── virtual-napping-puppy.md  # Phase制实施计划
│   └── settings.json                  # Claude Code权限配置
│
└── scripts/                            # Python脚本（待开发）
    ├── scrapers/                      # 爬虫脚本
    │   ├── runner_plaza_scraper.py   # 跑者广场爬虫
    │   ├── sports_note_scraper.py    # 运动笔记爬虫
    │   └── ...
    ├── processors/                    # 数据处理脚本
    │   ├── content_processor.py       # 内容格式化
    │   └── dedup.py                   # 去重逻辑
    └── scheduler.py                   # 定时任务调度
```

---

## 🚀 快速开始

### 1. 查看项目（用户/编辑）

```bash
# 打开Obsidian
1. 打开 Runner 文件夹为vault
2. 点击 歡迎.md 了解项目
3. 浏览各个文件夹的内容
```

### 2. 投稿新内容

```bash
1. 阅读 runner/社区/投稿指南.md
2. 准备内容（按格式要求）
3. 发送到 投稿群组（Line/Telegram）
4. 等待24小时内审核 ✓
```

### 3. 启动爬虫（开发者）

```bash
# 待Phase 2完成
# python scripts/scheduler.py --start
```

### 4. 启动网站预览

```bash
npm run dev
```

打开 `http://localhost:4173/site/` 查看目前的网站版本。网站会读取 `runner/赛事/赛事数据库.json`，并展示中部赛事、跑鞋心得、练跑知识与新闻更新。

网站功能：

- 赛事查询与筛选
- 收藏赛事（储存在浏览器）
- 外部报名网站连结
- 开报/截止时间标记
- 下载 `.ics` 行事历档，Android 与 iPhone 可汇入手机行事历

### 5. 启动爬虫环境

```bash
uv sync
uv run python scripts/main.py --dry-run
```

正式更新资料库与 Obsidian 文件：

```bash
uv run python scripts/main.py
uv run python scripts/enrich_platforms.py
npm run data:refresh
```

### 6. 检查赛事资料品质

不重跑爬虫也可以先盘点现有资料缺口：

```bash
npm run data:quality
```

这个指令会产生：

- `runner/赛事/待补资料队列.json`：给人工补资料或下一轮爬虫使用的缺漏清单
- `runner/赛事/资料品质报告.md`：依欄位、縣市和優先序整理的資料品質報告
- `runner/赛事/爬虫追踪计划.md`：依開報窗口、賽事日期與缺漏欄位安排下次重爬時機

目前重点检查官方报名连结、开报时间、截止时间、精确地点、主办单位、费用、名额与资料查证时间。
很多賽事早期只公布日期，追蹤計畫會把它們排到接近開報日再查，不會把所有缺漏都當成現在必須人工補完。

人工补资料后，可以直接套用到网站资料：

```bash
npm run data:apply
```

若要「套用人工补充 → 重新产生资料品质报告」，使用：

```bash
npm run data:refresh
```

若要只測試官方平台補資料，不寫入檔案：

```bash
uv run python scripts/enrich_platforms.py --dry-run
```

目前官方平台補資料支援：

- iRunner
- Lohas
- bao-ming / 伊貝特
- EventGo
- Focusline
- CTRun
- JoinNow

平台爬蟲會保守補空欄位，人工補充仍有最高優先權。補完後會產生 `runner/赛事/平台爬虫覆盖报告.md`，用來看哪些平台命中、哪些頁面抓不到或解析失敗。

### 7. 定期更新赛事资料

GitHub Actions 已提供 `.github/workflows/data-refresh.yml`，会每天 06:30（Asia/Taipei）执行：

```bash
uv run python scripts/main.py
uv run python scripts/enrich_platforms.py
npm run data:refresh
```

这个流程会尝试重跑爬虫、套用人工补充、更新资料品质报告和爬虫追踪计划，并在资料有变化时自动提交。也可以在 GitHub Actions 页面手动执行 `Refresh race data`。

資料更新 SOP：

- [資料更新 SOP](runner/系统配置/资料更新SOP.md)
- [代理人實作準則](SKILLS.md)
- [第二大腦索引](runner/系统配置/第二大脑.md)
- 每月追蹤固定排在每月 1 號與 15 號。
- 開報日前後會提高檢查優先度，報名截止或賽事過期後降低追蹤頻率。

### 8. GitHub Pages 部署

项目已提供 `.github/workflows/pages.yml`。推送到 `main` 后，GitHub Actions 会部署静态网站。

部署入口：

```text
https://adelbert56.github.io/runner/site/
```

如果第一次部署没有出现页面，请到 GitHub repo 的 Settings → Pages，把 Build and deployment source 设为 GitHub Actions。

---

## 📋 项目进度

### Phase 1: 基础设施 ✅
- [x] Obsidian项目结构设计
- [x] Memory系统建立（4个核心文档）
- [x] 投稿指南 + 标签体系
- [x] 爬虫规则配置（JSON）
- [ ] Obsidian链接测试

**Status**: 进行中 (完成度 80%)

### Phase 2: 爬虫系统 🔨 (下周开始)
- [ ] race-scraper-skill 开发
- [ ] Python爬虫脚本 (5个网站)
- [ ] 数据去重逻辑
- [ ] Obsidian自动更新

**预计时间**: 7天

### Phase 3: 内容处理 ⏳
- [ ] content-processor-skill
- [ ] community-manager-skill
- [ ] 投稿队列自动化

**预计时间**: 7天

### Phase 4: 数据分析 ⏳
- [ ] analytics-skill
- [ ] Obsidian统计视图
- [ ] 网站API接口

**预计时间**: 7天

### v1.0: 网站展示 🌐
- [x] 静态网站预览版（site/）
- [ ] 前端框架（Next.js/Vue）
- [ ] 后端API（FastAPI/Node）
- [ ] Obsidian <> 网站同步
- [ ] 用户评论系统

**预计时间**: 4-6周

---

## 🛠️ 技术栈

### 现阶段（v0.1）
- **知识库**: Obsidian (Markdown)
- **自动化**: Claude Code Skills
- **爬虫**: Python (requests/selenium)
- **存储**: 本地文件 (JSON/Markdown)

### 计划（v0.5+）
- **前端**: Next.js / React
- **后端**: FastAPI / Node.js
- **数据库**: PostgreSQL / MongoDB
- **部署**: Docker + AWS/GCP

---

## 📖 重要文档

### 用户文档
- [投稿指南](runner/社区/投稿指南.md) - 如何投稿
- [标签体系](runner/系统配置/标签体系.md) - 如何分类内容
- [2026赛事列表](runner/赛事/2026-中部赛事列表.md) - 赛事信息

### 开发文档
- [项目规划](../.claude/plans/virtual-napping-puppy.md) - Phase制实施计划
- [Memory系统](../.claude/memory/MEMORY.md) - 第二大脑索引
- [爬虫规则](runner/系统配置/爬虫规则.json) - 爬虫配置
- [数据源规范](../.claude/memory/data_sources.md) - 各网站爬虫策略

### 系统文档
- [MCP配置](runner/系统配置/MCP配置.md) - 外部集成计划
- [自动化状态](../.claude/memory/automation_status.md) - Skills开发进度

---

## 🎯 核心数据流

```
投稿 → 社群 → 审核队列 ✓
                  ↓
                 格式化 (content-processor-skill)
                  ↓
          添加标签/元数据
                  ↓
            发布到Obsidian
                  ↓
          同步到网站 (未来)

网站爬虫 → 爬取赛事 (race-scraper-skill) → 去重
                  ↓
          格式化为Markdown
                  ↓
        自动更新赛事列表
                  ↓
          生成统计报告 (analytics-skill)
```

---

## 📊 预期效果

### 当前状态
- 📝 手动投稿系统
- 🔍 人工维护赛事库
- 📂 知识库组织

### 3个月后（v0.5）
- ✅ 自动爬虫运行
- ✅ 内容自动分类
- ✅ 社区管理自动化
- ✅ 赛事热度分析

### 6个月后（v1.0）
- ✅ 网站上线
- ✅ 个人数据追踪
- ✅ 推荐算法
- ✅ 社交分享

---

## 🤝 贡献指南

### 投稿内容
1. 参考 [投稿指南](runner/社区/投稿指南.md)
2. 发送到投稿群组
3. 等待审核

### 改进建议
1. 提Issue或评论
2. 或直接修改Obsidian文件
3. 通知管理员审核

### 开发参与
1. Fork本项目
2. 新建分支 (feature/xxx)
3. 提交Pull Request

---

## 📞 联系方式

- **投稿**: [投稿群组](待公布)
- **建议反馈**: @管理员
- **Bug报告**: GitHub Issues

---

## 📜 许可证

暂未指定，欢迎建议。

---

## 🙏 致谢

感谢所有贡献者的分享和支持！

---

**项目启动**: 2026-05-15  
**当前版本**: v0.1 (Beta)  
**维护者**: 管理员小组  
**最后更新**: 2026-05-15

祝你跑步愉快！🏃‍♂️🏃‍♀️
