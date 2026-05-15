---
标题: MCP连接配置
日期: 2026-05-15
作者: 管理员
状态: 规划中
---

# 跑者广场 - MCP配置

本文档记录MCP（Model Context Protocol）连接的规划和配置。

## 当前阶段（v0.1）

**状态**: 规划中（暂未启用）

目前通过**Python爬虫脚本**直接处理数据爬取和集成，无需外部MCP。

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
4. **发布更新** - 更新Skills以使用新MCP
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

**最后更新**: 2026-05-15  
**维护者**: 管理员  
标签: `#系统` `#MCP` `#配置`
