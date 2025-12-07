# chrome_translator_llm

这是一个 Chrome 插件开发模板，可以快速连接 OpenAI 兼容或本地 LLM 进行翻译。

## 功能
- 配置基础地址、API Key、模型、温度、默认目标语言等参数，兼容 OpenAI-like 与本地服务。
- 弹窗内输入待翻译文本与目标语言，一键调用 `/v1/chat/completions` 进行翻译，翻译中显示动态省略号提示。
- 参考沉浸式翻译的体验，支持在网页中划词后呼出悬浮按钮并展示翻译浮窗，页面全文翻译时会在原文旁出现动态省略号直至替换译文。
- 设置保存在 `chrome.storage.sync`，便于多设备同步。

## 使用方法
1. 在 Chrome 中打开 `chrome://extensions` 并开启「开发者模式」。
2. 选择「加载已解压的扩展程序」，指向本仓库根目录。
3. 在扩展图标弹出的窗口中填写接口信息（本地模型可留空 API Key），并可配置默认目标语言与是否启用划词翻译。
4. 输入待翻译文本和目标语言，点击「翻译」即可获得结果；或在网页中选中文字后点击悬浮「翻译选中」按钮查看浮窗译文。

## 打包
- 执行 `bash scripts/pack.sh` 生成 `dist/llm-translator-extension.zip`，可直接用于在 Chrome 扩展管理页上传。

## 文件结构
- `manifest.json`：扩展配置（MV3）。
- `service-worker.js`：后台服务，发送 LLM 请求、管理存储。
- `content-script.js`：注入网页，监听划词并展示沉浸式翻译浮窗。
- `popup.html` / `popup.js` / `popup.css`：弹窗界面与交互逻辑。
- `icons/`：扩展图标。
