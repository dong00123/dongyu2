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
- `POST /api/travel`：旅游规划 Agent
- `GET /api/health`：系统健康检查
- 多组客服模拟接口：知识库、工单、配置、日志、角色等

## 下一步推荐

如果你继续往真正的企业项目推进，建议下一阶段做这些事：

1. 接入数据库，把知识库、工单、配置改成持久化存储
2. 增加鉴权和后台管理角色
3. 增加日志落盘、请求链路追踪和审计
4. 把搜索、票务、酒店、POI 接入真实 provider
5. 为旅行规划增加缓存、限流和任务队列
6. 增加测试、CI/CD 和容器部署
```
