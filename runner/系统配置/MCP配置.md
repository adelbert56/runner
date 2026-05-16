---
标题: MCP连接配置
日期: 2026-05-16
作者: 管理员
状态: 暂不启用
---

# 跑者广场 - MCP配置

本文档记录跑者广场是否需要 MCP（Model Context Protocol）连接，以及未来启用时的边界。当前项目已经可以用本地 Python / Node 脚本与 GitHub Actions 完成资料更新，因此 MCP 只作为后续扩展方案，不是上线依赖。

## 当前阶段（v0.1）

**状态**: 暂不启用

目前通过本地脚本直接处理资料收集、整理和发布：

- 赛事爬虫：`scripts/main.py`
- 官方平台补资料：`scripts/enrich_platforms.py`、`scripts/platforms/`
- 赛事同步与报告：`npm run data:refresh`
- 跑鞋 / 新闻候选内容：`npm run content:refresh`
- 营运仪表板：`npm run ops:dashboard`

这些流程已经由 `.github/workflows/` 自动排程，不需要额外 MCP 服务。

## 启用 MCP 前的判断标准

只有出现下列情况才考虑启用 MCP：

- Python parser 维护成本明显高于外部服务成本。
- 需要稳定浏览器渲染、验证码处理或复杂 JavaScript 页面解析。
- 需要跨装置收藏、会员、通知或资料库查询等后端能力。
- GitHub Actions 执行时间、频率或并发需求超过目前静态站规模。
- 有明确 API key、费用预算、失败重试策略和资料隐私边界。

---

## 计划集成的MCP（未来版本）

### 1. Web爬虫 MCP
**用途**: 稳定、标准化的网站爬取

**配置示例**:
```json
{
  "name": "web_scraper_mcp",
  "type": "external_service",
  "service": "web-scraper-pro",
  "api_key": "{{MCP_WEB_SCRAPER_KEY}}",
  "rules_file": "./爬虫规则.json",
  "enabled": false,
  "comment": "当Python爬虫无法维护时启用"
}
```

### 2. 数据库 MCP
**用途**: 赛事数据持久化存储

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
  "comment": "当Obsidian无法满足数据查询需求时启用"
}
```

### 3. API集成 MCP
**用途**: 连接跑步App API（Strava、小米运动等）

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
  "comment": "用于获取用户个人跑步数据和活动统计"
}
```

### 4. 任务队列 MCP
**用途**: 异步任务管理（长时间爬虫任务）

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
  "comment": "当需要大规模、定时爬虫任务时启用"
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
  "comment": "用于赛事更新提醒、投稿审核通知"
}
```

---

## 迁移路径

### Phase 1-2（当前）
- Python脚本爬虫 ✓
- Obsidian本地存储 ✓
- GitHub Actions 自动排程 ✓
- GitHub Pages 静态发布 ✓
- 无MCP依赖

### Phase 3
- 考虑Web爬虫MCP（如Python维护成本过高）
- 考虑通知MCP（赛事更新提醒）

### Phase 4+
- 数据库MCP（数据量>10000条时）
- API集成MCP（需用户数据时）
- 任务队列MCP（并发爬虫优化）

---

## 环境变量配置

```bash
# .env 文件（禁止提交到版本控制）

# MCP通用
MCP_ENABLED=false

# Web爬虫
MCP_WEB_SCRAPER_KEY=xxx
MCP_WEB_SCRAPER_URL=xxx

# 数据库
DB_HOST=localhost
DB_PORT=5432
DB_USER=runner_user
DB_PASSWORD=xxx

# Strava API
STRAVA_CLIENT_ID=xxx
STRAVA_CLIENT_SECRET=xxx

# Redis/任务队列
REDIS_HOST=localhost
REDIS_PORT=6379

# 通知服务
SMTP_HOST=smtp.gmail.com
TELEGRAM_BOT_TOKEN=xxx
```

---

## 启用MCP的步骤

1. **获取API密钥** - 向相应服务申请
2. **更新配置文件** - 修改本文档 + .env
3. **测试连接** - 运行集成测试
4. **发布更新** - 更新 `SKILLS.md`、`第二大脑.md`、README 与 GitHub Actions
5. **监控性能** - 定期检查MCP延迟和错误率

---

## 常见问题

**Q: 为什么现阶段不用MCP?**  
A: Python脚本更灵活、成本低、迭代快。等项目成熟后再考虑企业级MCP方案。

**Q: MCP会增加成本吗?**  
A: 大多数MCP服务有按使用量付费的选项，成本取决于爬虫频率和数据量。

**Q: 能同时用多个爬虫MCP吗?**  
A: 可以，但建议分任务分配（如：运动笔记用MCP A，官网公告用MCP B），便于维护。

---

## 当前替代方案

| 需求 | 当前做法 | MCP 是否必要 |
| --- | --- | --- |
| 赛事更新 | Python 爬虫 + 官方平台 adapters + GitHub Actions | 否 |
| 跑鞋 / 新闻内容 | Node 候选内容收集 + 自动上架 JSON | 否 |
| 资料品质报告 | Node scripts 输出 Markdown / JSON | 否 |
| 静态网站发布 | GitHub Pages | 否 |
| 个人收藏 | 浏览器 localStorage | 否 |
| 跨装置同步 / 通知 | 尚未做，需要后端或第三方服务 | 未来再评估 |

**最后更新**: 2026-05-16
**维护者**: 管理员
标签: `#系统` `#MCP` `#配置`
