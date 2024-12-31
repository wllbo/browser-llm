# browser-llm

Run Large Language Models locally - better than edge, it's already in your browser 💪

**[🎮 Try it out 👾](https://wllbo.github.io/browser-llm/)**

## Key Features

- 💰 **No Fees**: No keys, no costs, no quotas
- 🏎️ **Fast Inference**: Runs on WASM with WebGPU acceleration
- 🔒 **Privacy First**: Pure client-side processing
- 🏕️ **Offline Ready**: Download model once, use anywhere
- 🔄 **Streaming**: Token-by-token output with minimal latency
- 📱 **Device Agnostic**: Just needs a modern browser with sufficient memory for the model

## How It Works

The application is built with vanilla JavaScript and uses emerging web standards:

- **WebAssembly (WASM)**: Core runtime for model inference
- **WebGPU**: Hardware acceleration for supported devices
- **Web Workers**: Offloads model inference to prevent UI blocking
- **[transformers.js](https://github.com/huggingface/transformers.js)**: Runs transformer models directly in the browser
- **[onnxruntime-web](https://github.com/microsoft/onnxruntime)**: Optimized inference engine
- **Model Loading**: LRU caching system (max 3 models) with quantization fallback (4-bit → 8-bit)

<div align="center">
  <img src="image.png" width="800" alt="Browser LLM Demo">
</div>

### Browser Support 

| Feature | Chrome | Firefox | Safari | Edge |
|---------|---------|----------|---------|-------|
| WASM    | ✅      | ✅       | ✅      | ✅    |
| WebGPU  | ✅      | 🚧       | 🚧      | ✅    |