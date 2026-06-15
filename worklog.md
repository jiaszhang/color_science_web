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
