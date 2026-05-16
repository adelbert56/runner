---
标题: MCP連接配置
日期: 2026-05-16
作者: 管理員
狀態: 暂不啟用
---

# 跑者广场 - MCP配置

本文档记录跑者广场是否需要 MCP（Model Context Protocol）連接，以及未来啟用时的边界。目前项目已经可以用本地 Python / Node 脚本与 GitHub Actions 完成資料更新，因此 MCP 只作为后续扩展方案，不是上线依赖。

## 目前阶段（v0.1）

**狀態**: 暂不啟用

目前通過本地脚本直接处理資料收集、整理和發布：

- 賽事爬蟲：`scripts/main.py`
- 官方平台補資料：`scripts/enrich_platforms.py`、`scripts/platforms/`
- 賽事同步与报告：`npm run data:refresh`
- 跑鞋 / 新聞候選內容：`npm run content:refresh`
- 營運儀表板：`npm run ops:dashboard`

这些流程已经由 `.github/workflows/` 自動排程，不需要额外 MCP 服務。

## 啟用 MCP 前的判断標準

只有出現下列情況才考慮啟用 MCP：

- Python parser 維護成本明显高于外部服務成本。
- 需要穩定浏览器渲染、验证码处理或复杂 JavaScript 页面解析。
- 需要跨装置收藏、會员、通知或資料库查询等后端能力。
- GitHub Actions 执行时间、頻率或并发需求超过目前静态站规模。
- 有明确 API key、費用预算、失败重试策略和資料隐私边界。

---

## 計畫集成的MCP（未来版本）

### 1. Web爬蟲 MCP
**用途**: 穩定、標準化的网站爬取

**配置示例**:
```json
{
  "name": "web_scraper_mcp",
  "type": "external_service",
  "service": "web-scraper-pro",
  "api_key": "{{MCP_WEB_SCRAPER_KEY}}",
  "rules_file": "./爬蟲規則.json",
  "enabled": false,
  "comment": "当Python爬蟲無法維護时啟用"
}
```

### 2. 資料庫 MCP
**用途**: 賽事数据持久化存储

**配置示例**:
```json
{
  "name": "database_mcp",
  "type": "database",
  "provider": "postgresql|mongodb|sqlite",
  "connection": {
    "host": "{{DB_HOST}}",
    "port": "{{DB_PORT}}",
    "database": "runner_plaza",
    "user": "{{DB_USER}}",
    "password": "{{DB_PASSWORD}}"
  },
  "enabled": false,
  "comment": "当Obsidian無法满足数据查询需求时啟用"
}
```

### 3. API集成 MCP
**用途**: 連接跑步App API（Strava、小米运动等）

**配置示例**:
```json
{
  "name": "strava_api_mcp",
  "type": "external_api",
  "service": "strava",
  "auth": {
    "type": "oauth2",
    "client_id": "{{STRAVA_CLIENT_ID}}",
    "client_secret": "{{STRAVA_CLIENT_SECRET}}"
  },
  "enabled": false,
  "comment": "用於取得用户個人跑步数据和活动统计"
}
```

### 4. 任務佇列 MCP
**用途**: 异步任務管理（长时间爬蟲任務）

**配置示例**:
```json
{
  "name": "task_queue_mcp",
  "type": "queue",
  "provider": "celery|rq|bullmq",
  "redis": {
    "host": "{{REDIS_HOST}}",
    "port": "{{REDIS_PORT}}"
  },
  "enabled": false,
  "comment": "当需要大规模、定时爬蟲任務时啟用"
}
```

### 5. 通知/邮件 MCP
**用途**: 定时通知、邮件推送

**配置示例**:
```json
{
  "name": "notification_mcp",
  "type": "messaging",
  "providers": [
    {
      "type": "email",
      "service": "smtp",
      "config": {
        "host": "{{SMTP_HOST}}",
        "port": "{{SMTP_PORT}}",
        "from": "noreply@runnerplaza.tw"
      }
    },
    {
      "type": "telegram",
      "token": "{{TELEGRAM_BOT_TOKEN}}",
      "chat_id": "{{CHAT_ID}}"
    }
  ],
  "enabled": false,
  "comment": "用於賽事更新提醒、投稿審核通知"
}
```

---

## 迁移路径

### Phase 1-2（目前）
- Python脚本爬蟲 ✓
- Obsidian本地存储 ✓
- GitHub Actions 自動排程 ✓
- GitHub Pages 静态發布 ✓
- 無MCP依赖

### Phase 3
- 考慮Web爬蟲MCP（如Python維護成本过高）
- 考慮通知MCP（賽事更新提醒）

### Phase 4+
- 資料庫MCP（数据量>10000条时）
- API集成MCP（需用户数据时）
- 任務佇列MCP（并发爬蟲优化）

---

## 环境变量配置

```bash
# .env 文件（禁止提交到版本控制）

# MCP通用
MCP_ENABLED=false

# Web爬蟲
MCP_WEB_SCRAPER_KEY=xxx
MCP_WEB_SCRAPER_URL=xxx

# 資料庫
DB_HOST=localhost
DB_PORT=5432
DB_USER=runner_user
DB_PASSWORD=xxx

# Strava API
STRAVA_CLIENT_ID=xxx
STRAVA_CLIENT_SECRET=xxx

# Redis/任務佇列
REDIS_HOST=localhost
REDIS_PORT=6379

# 通知服務
SMTP_HOST=smtp.gmail.com
TELEGRAM_BOT_TOKEN=xxx
```

---

## 啟用MCP的步骤

1. **取得API密钥** - 向相应服務申請
2. **更新配置文件** - 修改本文档 + .env
3. **測試連接** - 运行集成測試
4. **發布更新** - 更新 `SKILLS.md`、`第二大腦.md`、README 与 GitHub Actions
5. **監控性能** - 定期检查MCP延迟和错误率

---

## 常见问题

**Q: 為什麼現階段不用MCP?**
A: Python脚本更灵活、成本低、迭代快。等项目成熟后再考慮企业级MCP方案。

**Q: MCP會增加成本嗎?**
A: 大多数MCP服務有按使用量付费的选项，成本取决于爬蟲頻率和数据量。

**Q: 能同時用多個爬蟲MCP嗎?**
A: 可以，但建議分任務分配（如：運動筆記用MCP A，官網公告用MCP B），便於維護。

---

## 目前替代方案

| 需求 | 目前做法 | MCP 是否必要 |
| --- | --- | --- |
| 賽事更新 | Python 爬蟲 + 官方平台 adapters + GitHub Actions | 否 |
| 跑鞋 / 新聞內容 | Node 候選內容收集 + 自動上架 JSON | 否 |
| 資料品質報告 | Node scripts 输出 Markdown / JSON | 否 |
| 静态网站發布 | GitHub Pages | 否 |
| 個人收藏 | 浏览器 localStorage | 否 |
| 跨装置同步 / 通知 | 尚未做，需要后端或第三方服務 | 未来再评估 |

**最後更新**: 2026-05-16
**維護者**: 管理員
標籤: `#系统` `#MCP` `#配置`
