# Multimodal Image Runtime（运行时细粒度文档）

## 1. 关键文件

- `apps/gateway/public/index.html`
- `apps/gateway/public/chat.js`
- `apps/gateway/public/chat.css`
- `apps/gateway/server.js`
- `apps/runtime/loop/toolLoopRunner.js`
- `apps/runtime/rpc/runtimeRpcWorker.js`
- `apps/runtime/llm/openaiReasoner.js`

## 2. 端到端链路

### 2.1 WebUI 上传与发送

`chat.js` 支持多图上传（默认最多 4 张）：

- 文件读入：`FileReader.readAsDataURL`
- 发送结构：`type=run` + `input_images[]`
- 单图字段：
  - `client_id`
  - `name`
  - `mime_type`
  - `size_bytes`
  - `data_url`

### 2.2 Gateway 参数校验

`server.js` 在 `enqueueRpc()` 前校验：

- `input_images` 必须是数组
- 每张必须是合法 `data:image/...;base64,...`
- 图片数量、`data_url` 长度、估算字节大小均受限

校验通过后写入 JSON-RPC：

- `method=runtime.run`
- `params.input_images` 透传给 runtime worker

### 2.3 Runtime 组装多模态消息

`toolLoopRunner.run()` 新增 `inputImages` 入参：

- 无图片：按原逻辑发送 `user.content = string`
- 有图片：构造成 OpenAI-compatible 多段 content
  - `{ type: "text", text: ... }`
  - `{ type: "image_url", image_url: { url: data_url } }`

### 2.4 模型请求容错

`openaiReasoner.decide()` 新增重试机制：

- 网络异常（含 `fetch failed` / timeout / socket 类）自动重试
- `408/409/429/5xx` 自动重试
- 线性退避（`retryDelayMs * attempt`）
- 重试耗尽后输出包含 `base_url/model/attempts` 的错误

## 3. 图片持久化与重启恢复

### 3.1 存储策略

Gateway 在 `onRunStart` 落盘用户图片：

- 目录：`data/session-images/<sessionId>/`
- 文件名：`<client_id>.<ext>`
- 公网访问路径：`/api/session-images/:sessionId/:fileName`

### 3.2 会话记录内容

Session message metadata 保存：

- `input_images[].client_id`
- `input_images[].name`
- `input_images[].mime_type`
- `input_images[].size_bytes`
- `input_images[].url`

前端渲染时优先使用：

1. 内存缓存 `messageImageCache`（当前页即时预览）
2. `previewUrl`（重启后仍可回显）

## 4. 前端交互

### 4.1 图片预览

- 消息附件渲染为可点击缩略图
- 点击弹出 lightbox
- 关闭方式：遮罩点击 / Close 按钮 / `Esc`

### 4.2 动效

- lightbox 遮罩淡入
- 图片缩放+位移动画
- 关闭按钮同步过渡

### 4.3 输入区固定

聊天页采用 `100dvh` 固定视口布局：

- 消息区独立滚动
- 输入区固定底部
- 无需整页滚到底才能输入

## 5. 可配置项

### 5.1 图片上传

- `MAX_INPUT_IMAGES`（默认 `4`）
- `MAX_INPUT_IMAGE_BYTES`（默认 `8MB`）
- `MAX_INPUT_IMAGE_DATA_URL_CHARS`（默认 `ceil(MAX_INPUT_IMAGE_BYTES * 1.5)`）
- `SESSION_IMAGE_STORE_DIR`（默认 `data/session-images`）

### 5.2 LLM 请求重试

可在 `config/providers.yaml` provider 节点配置：

- `max_retries`（默认 `2`）
- `retry_delay_ms`（默认 `300`）

也可用环境变量兜底：

- `LLM_REQUEST_MAX_RETRIES`
- `LLM_REQUEST_RETRY_DELAY_MS`

## 6. 回归测试覆盖

- `test/runtime/toolLoopRunner.test.js`
  - 多模态 `user.content[]` 组装
- `test/runtime/runtimeRpcWorker.test.js`
  - `input_images` 输入转发
- `test/runtime/openaiReasoner.test.js`
  - 网络重试成功/失败场景
- `test/integration/gateway.e2e.test.js`
  - 图片 E2E 流程
  - 图片 URL 可回读
  - 大小限制拒绝场景
