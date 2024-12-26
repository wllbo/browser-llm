import { pipeline, TextStreamer } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.3/+esm';

// Cache for generators
const MAX_CACHE_SIZE = 3;
const generators = new Map();
let generator = null;
let maxTokens = 256;  // Default value

async function sendStatus(message, minDisplayTime = 500) {
    self.postMessage({ type: 'status', message });
    await new Promise(resolve => setTimeout(resolve, minDisplayTime));
}

function handleModelProgress(progress, isNewDownload = false) {    
    // Only show progress for the model file
    const isModelFile = progress.file?.endsWith('.onnx');
    
    if (!isModelFile) return;
    
    switch (progress.status) {
        case 'progress':
            const percent = Math.round((progress.loaded / progress.total) * 100);
            self.postMessage({ 
                type: 'progress', 
                percent,
                message: 'Downloading ONNX model... ' + percent + '%',
                isNewDownload
            });
            
            if (percent === 100) {
                self.postMessage({ 
                    type: 'status', 
                    message: 'Loading ONNX model into memory...'
                });
            }
            break;
            
        case 'done':
            self.postMessage({ 
                type: 'status', 
                message: 'Initializing WASM runtime...'
            });
            break;
    }
}

async function tryLoadModel(modelId, config, retryMessage) {    
    self.postMessage({ 
        type: 'init_step', 
        message: retryMessage
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Reset progress before starting new download
    self.postMessage({ 
        type: 'progress', 
        percent: 0,
        message: 'Downloading ONNX model... 0%',
        isNewDownload: true
    });
    
    return await pipeline('text-generation', modelId, config);
}

async function initializeGenerator(modelId, configMaxTokens) {
    try {
        maxTokens = configMaxTokens;
        if (generators.has(modelId)) {
            // Move to end by removing and re-adding
            generator = generators.get(modelId);
            generators.delete(modelId);
            generators.set(modelId, generator);
            self.postMessage({ type: 'ready', cached: true });
            return;
        }
        
        // Model file suffix reference:
        // 'fp32' -> .onnx      
        // 'fp16' -> _fp16.onnx
        // 'int8' -> _int8.onnx
        // 'uint8' -> _uint8.onnx
        // 'q8' -> _quantized.onnx
        // 'q4' -> _q4.onnx
        // 'q4f16' -> _q4f16.onnx
        // 'bnb4' -> _bnb4.onnx
        const baseConfig = {
            device: "auto",
            dtype: 'q4',
            progress_callback: (progress) => handleModelProgress(progress, false)
        };
        
        const retryConfigs = [
            { 
                config: baseConfig,
                message: 'Downloading model files...'
            },
            { 
                config: { ...baseConfig, dtype: 'q8', progress_callback: (progress) => handleModelProgress(progress, true) },
                message: 'Trying q8 model quantization...'
            },
            { 
                config: { ...baseConfig, dtype: 'q8', model_file_name: "decoder_model_merged", progress_callback: (progress) => handleModelProgress(progress, true) },
                message: 'Trying alternate model file...'
            }
        ];

        for (const { config, message } of retryConfigs) {
            try {
                await sendStatus(message);
                generator = await tryLoadModel(modelId, config, message);
                break;
            } catch (error) {
                if (!error.message?.includes('Could not locate file') && !error.message?.includes('404')) {
                    throw error;
                }
                if (config === retryConfigs[retryConfigs.length - 1].config) {
                    throw error;
                }
            }
        }
        
        // Remove oldest if at capacity
        if (generators.size >= MAX_CACHE_SIZE) {
            const oldestKey = generators.keys().next().value;
            generators.delete(oldestKey);
        }
        
        // Cache the generator
        generators.set(modelId, generator);
        self.postMessage({ type: 'ready', cached: false });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
}

async function generateText(prompt) {
    try {
        if (!generator) {
            throw new Error('Generator not initialized');
        }

        let startTime = performance.now();
        let tokenCount = 0;
        
        self.postMessage({ type: 'status', message: 'Preparing model for generation...' });
        
        const streamer = new TextStreamer(generator.tokenizer, {
            skip_prompt: true,
            token_callback_function: () => {
                tokenCount++;
                const elapsed = performance.now() - startTime;
                const tokensPerSecond = (tokenCount / elapsed) * 1000;
                self.postMessage({ 
                    type: 'stats', 
                    stats: {
                        tokenCount,
                        tokensPerSecond: Math.round(tokensPerSecond * 100) / 100
                    }
                });
            },
            callback_function: (text) => {
                text = text.replace(/<\|im_end\|>/g, '');
                text = text.replace(/<\/s>/g, '');
                if (text) {
                    self.postMessage({ type: 'text', text });
                }
            }
        });
        
        await generator(prompt, {
            max_new_tokens: maxTokens,
            top_k: 3,
            repetition_penalty: 1.1,
            streamer,
            do_sample: true,
            temperature: 0.7
        });
        
        const totalTime = (performance.now() - startTime) / 1000;
        self.postMessage({ 
            type: 'complete',
            stats: {
                totalTokens: tokenCount,
                totalTime: Math.round(totalTime * 100) / 100,
                averageSpeed: Math.round((tokenCount / totalTime) * 100) / 100
            }
        });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
}

self.onmessage = async function(e) {
    const { type, data } = e.data;
    switch (type) {
        case 'init':
            await initializeGenerator(data.modelId, data.maxTokens);
            break;
        case 'generate':
            await generateText(data.prompt);
            break;
    }
}; 