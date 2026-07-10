# Work Log

---
Task ID: 1
Agent: Main Agent
Task: 为所有图片上传模块添加 EXR/TIFF 导入支持，为所有导出功能添加格式选择

Work Log:
- 探索了项目中所有支持图片上传的模块（4个）和导出功能（7个）
- 创建了服务端图片转换 API (`/api/image-convert/route.ts`)，使用 sharp 处理 TIFF 导入/导出和 BMP 导出
- 创建了客户端 EXR 解码器 (`exr-decoder.ts`)，支持 HALF/FLOAT 像素类型和 NO_COMPRESSION/ZIP/RLE 压缩
- 修改了 `image-loader.ts`，集成 TIFF（通过服务端 API）和 EXR（通过客户端解码器）支持
- 创建了共享导出格式工具 (`image-formats.ts`)，支持 PNG/JPEG/WebP/TIFF/TIFF16/BMP 格式选择
- 修改了 `simulation-module.tsx`：更新 accept 属性，添加仿真结果和测试图案导出格式选择器
- 修改了 `pipeline-module.tsx`：更新 accept 属性，添加图片批处理导出格式选择器
- 修改了 `lut3d-module.tsx`：更新 accept 属性和拖放检查，添加图片导出格式选择器
- 修改了 `lut-extract-tab.tsx`：更新 accept 属性和文件类型检查，添加校准图导出格式选择器
- 更新了 `index.ts` 导出新模块
- 构建验证通过

Stage Summary:
- 所有图片上传位置现在支持 EXR 和 TIFF 导入
- 所有导出位置现在支持格式选择（PNG/JPEG/WebP/TIFF 8-bit/TIFF 16-bit/BMP）
- 新建文件：3个
- 修改文件：6个

---
Task ID: rgb-sim-fix
Agent: Main Agent
Task: 修复生产环境"仿真与验证 → RGB 仿真"点击后显示 "This page couldn't load" 的崩溃问题

Work Log:
- 复现：本地启动 standalone 生产服务器 (bun .next/standalone/server.js)，用 agent-browser 模拟用户点击 "仿真与验证" → "RGB 仿真" tab，成功复现 "Application error: a client-side exception has occurred"
- 切到 dev 模式 (next dev) 同样的操作路径，拿到详细错误：`Runtime ReferenceError: patternExportFormat is not defined @ src/components/modules/simulation-module.tsx (914:44) @ RGBSimulationTab`
- 定位根因：在 2026-06-15 的多格式导出重构中，`const [patternExportFormat, setPatternExportFormat] = useState<ExportImageFormat>('png')` 这行被错误地放进了 `ImageSimulationTab` 函数 (line 215)，但它的所有使用点 (line 905/914/988) 都在 `RGBSimulationTab` 函数里 —— 跨函数作用域引用未定义变量
- 为何 dev 没暴露：dev 模式下有 React 错误覆盖层，用户能看到具体报错；生产模式只有通用错误页 "This page couldn't load. Reload to try again, or go back."，看起来像路由/构建问题但其实是组件运行时错误
- 修复：把 `patternExportFormat` 的 useState 声明从 `ImageSimulationTab` 删除，移到 `RGBSimulationTab` 内（紧跟在 `patternSrc` 状态之后）
- 验证：重新 `next build` + 启动 standalone 生产服务器，agent-browser 点击 "RGB 仿真" tab → 正常渲染出图案类型/分辨率/生成/导出格式/下载控件；点击"生成"按钮 → 下载按钮变 enabled，确认图案生成成功；errors 命令无报错

Stage Summary:
- 根因：变量作用域错位（state 声明放错了函数体）
- 修复文件：src/components/modules/simulation-module.tsx
- 验证方式：dev 模式拿到 ReferenceError 详细堆栈 → 修复 → 生产模式 agent-browser 端到端验证通过
- 教训：生产模式的 "This page couldn't load" 不一定是构建/路由问题，遇到时优先用 dev 模式复现拿详细错误
