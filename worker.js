import { pipeline, TextStreamer } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.0/+esm';

// Cache for generators
const generators = new Map();
let generator = null;
let maxTokens = 256;  // Default value

async function sendStatus(message, minDisplayTime = 500) {
    self.postMessage({ type: 'status', message });
    await new Promise(resolve => setTimeout(resolve, minDisplayTime));
}

function handleModelProgress(progress, isNewDownload = false) {
    console.log('[Worker] Model download progress:', progress.status, progress);
    
    // Only show progress for the model file
    const isModelFile = progress.file?.includes('model_quantized.onnx') || 
                       progress.file?.includes('decoder_model_merged_quantized.onnx');
    
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

async function initializeGenerator(modelId, configMaxTokens) {
    try {
        maxTokens = configMaxTokens;
        // Check if we already have this model loaded
        if (generators.has(modelId)) {
            generator = generators.get(modelId);
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
            device: "wasm",
            dtype: 'q8',
            progress_callback: (progress) => handleModelProgress(progress, false)
        };
        
        try {
            await sendStatus('Downloading model files...');
            generator = await pipeline('text-generation', modelId, baseConfig);
        } catch (error) {
            // If default fails, try with decoder_model_merged
            if (error.message && (error.message.includes('Could not locate file') || error.message.includes('404'))) {
                console.log('Default failed, trying with decoder_model_merged...');
                
                self.postMessage({ 
                    type: 'init_step', 
                    message: 'Trying alternate model format...'
                });
                
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Reset progress before starting new download
                self.postMessage({ 
                    type: 'progress', 
                    percent: 0,
                    message: 'Downloading ONNX model... 0%',
                    isNewDownload: true
                });
                
                generator = await pipeline('text-generation', modelId, {
                    ...baseConfig,
                    model_file_name: "decoder_model_merged",
                    progress_callback: (progress) => handleModelProgress(progress, true)
                });
            } else {
                throw error;
            }
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
                self.postMessage({ type: 'text', text });
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