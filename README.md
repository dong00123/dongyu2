# Dongyu Travel Agent

一个面向旅游规划与智能客服场景的 Node.js + Express 项目。

当前版本已经从单文件脚本整理成更适合继续扩展的企业级雏形，重点包括：

- 清晰分层：`config / controllers / services / routes / middleware / data / core`
- 环境配置集中管理：支持 `.env.local`
- 统一错误处理和健康检查
- 旅行 Agent、AI 对话、静态业务接口分离
- 前端静态页与后端 API 解耦

## 目录结构

```text
api/
  index.js                # 兼容旧启动入口
src/
  app.js                  # Express app 装配
  server.js               # 服务启动入口
  config/
  controllers/
  services/
  middleware/
  core/
  data/
public/
  *.html                  # 静态页面
```

## 启动方式

### 1. 安装依赖

```bash
npm install
```

### 2. 配置本地环境变量

复制 `.env.example` 为 `.env.local`，然后填写你的密钥。

### 3. 启动项目

```bash
npm start
```

启动后访问：

- 首页: `http://localhost:8000`
- 旅游 Agent: `http://localhost:8000/tourAgent.html`
- 健康检查: `http://localhost:8000/api/health`

## 已有能力

- `POST /api`：普通问答 / 多模态问答
- `POST /api/travel`：旅游规划 Agent（含多源检索增强）
- `POST /api/vision/detect`：图片目标检测（物体 / 位置 / 置信度 / 图片尺寸）
- `POST /api/multimodal/tasks`：多模态结构化处理（OCR、信息抽取、敏感信息脱敏、任务日志与成本统计）
- `GET /api/health`：系统健康检查
- 客服平台：知识库、工单、会话、满意度评价、配置、日志、角色等接口
- 用户系统：本地邮箱注册登录、QQ / 微信 OAuth 登录（需自行配置密钥）
- SQLite 持久化存储（`node:sqlite`，需要 Node.js >= 22.13.0）
- 静态业务接口：功能菜单、机器人、渠道、角色等

## 部署到 Render（https://dongyu-api.onrender.com）

`render.yaml` 中只声明了非敏感配置项。**密钥类环境变量（BWAI_API_KEY、TIANAPI_KEY、TAVILY_API_KEY、SERPER_API_KEY、APIFY_API_KEY、QQ_CLIENT_ID、QQ_CLIENT_SECRET、WECHAT_CLIENT_ID、WECHAT_CLIENT_SECRET）不会写入仓库**，部署后必须在 Render Dashboard 的 Environment 中手动配置，否则 AI 对话、旅游、多模态等能力会返回 503。

```bash
npm install
cp .env.example .env.local   # 本地开发时填写密钥
npm start
```

## 下一步推荐

1. 为 AI 服务增加限流、任务队列与日志落盘、请求链路追踪
2. 补充自动化测试与 CI/CD 流水线
3. 将 `data/dongyu.sqlite` 迁移到托管数据库（如 Render Postgres），避免重启丢数据
4. 为客服会话增加消息流式输出与人工接管工作台
5. 为视觉检测接入真正的 YOLO 推理服务，替代当前大模型结构化输出方案
