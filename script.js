const worker = new Worker('worker.js', { type: 'module' });

async function checkRuntimeSupport() {
    const runtimeBadge = document.getElementById('runtimeSupport').querySelector('.badge-value');
    
    const hasWasm = typeof WebAssembly === 'object' && 
                   typeof WebAssembly.instantiate === 'function';
    
    if (!hasWasm) {
        runtimeBadge.textContent = 'Not supported';
        runtimeBadge.classList.add('not-supported');
        return;
    }

    let accelerator = null;
    // TODO: Add WebNN when it is supported
    if ('gpu' in navigator) {
        accelerator = 'WebGPU';
    }
    
    runtimeBadge.textContent = accelerator 
        ? `WASM + ${accelerator}`
        : 'WASM';
    runtimeBadge.classList.add('supported');
}

class UIController {
    constructor() {
        this.generateBtn = document.getElementById('generateBtn');
        this.outputElement = document.getElementById('output');
        this.generatingStatus = document.getElementById('generatingStatus');
        this.modelSelector = document.getElementById('modelSelector');
        this.textInput = document.getElementById('textInput');
        this.maxTokensSlider = document.getElementById('maxTokens');
        this.showingAlternateMessage = false;
        this.defaultMaxTokens = 256;
        this.maxTokens = this.defaultMaxTokens;
        this.outputLengthBadge = document.getElementById('outputLength').querySelector('.badge-value');
    }

    initialize() {
        this.maxTokensSlider.value = this.defaultMaxTokens;
        this.outputLengthBadge.textContent = this.defaultMaxTokens;
        this.maxTokensSlider.addEventListener('input', () => this.handleMaxTokensChange());
        
        this.generateBtn.addEventListener('click', () => this.handleGenerateClick());
        checkRuntimeSupport();
        
        this.initTooltips();
    }

    initTooltips() {
        const badges = document.querySelectorAll('.status-badge[data-tooltip]');
        badges.forEach(badge => {
            const maxTokensBadge = badge.id === 'outputLength';
            
            if (maxTokensBadge) {
                badge.addEventListener('touchstart', (e) => {
                    if (!e.target.matches('#maxTokens')) {
                        e.preventDefault();
                    }
                    badge.classList.add('showing-tooltip');
                }, { passive: false });
            } else {
                badge.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    badge.classList.add('showing-tooltip');
                }, { passive: false });
            }

            const hideTooltip = () => badge.classList.remove('showing-tooltip');
            badge.addEventListener('touchend', hideTooltip);
            badge.addEventListener('touchcancel', hideTooltip);
        });
    }

    handleMaxTokensChange() {
        this.maxTokens = parseInt(this.maxTokensSlider.value);
        this.outputLengthBadge.textContent = this.maxTokens;
    }

    handleGenerateClick() {
        console.log('Starting generation with model:', this.modelSelector.value);
        this.setGeneratingState();
        
        worker.onmessage = (e) => this.handleWorkerMessage(e);
        worker.postMessage({ 
            type: 'init', 
            data: { 
                modelId: this.modelSelector.value,
                maxTokens: this.maxTokens
            }
        });
    }

    setGeneratingState() {
        this.generateBtn.disabled = true;
        this.generateBtn.style.display = 'none';
        this.outputElement.textContent = '';
        this.generatingStatus.style.display = 'block';
        this.generatingStatus.innerHTML = `
            <div class="progress-bar"></div>
            <div class="status-text bright">Initializing...</div>
        `;
    }

    handleWorkerMessage(e) {
        const { type, text, error, message, stats, cached } = e.data;
        const statusBar = this.generatingStatus.querySelector('.progress-bar');
        const statusText = this.generatingStatus.querySelector('.status-text');

        switch (type) {
            case 'status':
            case 'init_step':
                if (message === 'Trying alternate model format...') {
                    this.showingAlternateMessage = true;
                    statusBar.classList.remove('downloading');
                    setTimeout(() => {
                        this.showingAlternateMessage = false;
                        if (statusText.textContent === message) {
                            statusText.textContent = 'Downloading ONNX model... 0%';
                        }
                    }, 2000);
                }
                statusText.textContent = message;
                break;

            case 'progress':
                if (e.data.isNewDownload) {
                    statusBar.style.width = '0%';
                }
                statusBar.classList.add('downloading');
                statusBar.style.width = e.data.percent + '%';
                if (!this.showingAlternateMessage) {
                    statusText.textContent = `Downloading ONNX model... ${e.data.percent}%`;
                }
                if (e.data.percent === 100) {
                    statusBar.classList.remove('downloading');
                }
                break;

            case 'ready':
                statusBar.classList.remove('downloading');
                statusBar.style.width = '100%';
                statusBar.classList.add('success');
                statusText.textContent = cached ? 'Using cached model' : 'Model loaded successfully!';
                
                setTimeout(() => {
                    statusBar.style.opacity = '0';
                    statusText.textContent = 'Starting generation...';
                    statusText.classList.remove('bright');
                    worker.postMessage({ 
                        type: 'generate', 
                        data: { 
                            prompt: [
                                { role: "system", content: "You are a friendly assistant." },
                                { role: "user", content: this.textInput.value }
                            ]
                        }
                    });
                }, cached ? 1000 : 1500);
                break;

            case 'text':
                if (!this.generatingStatus.classList.contains('generating')) {
                    this.generatingStatus.classList.add('generating');
                }
                const textNode = document.createTextNode(text);
                this.outputElement.appendChild(textNode);
                this.outputElement.scrollTop = this.outputElement.scrollHeight;
                break;

            case 'stats':
                statusText.classList.remove('bright');
                statusText.textContent = `Generating... (${stats.tokenCount} tokens, ${stats.tokensPerSecond} tokens/sec)`;
                break;

            case 'complete':
                this.generatingStatus.classList.remove('generating');
                statusText.textContent = `Complete! Generated ${stats.totalTokens} tokens in ${stats.totalTime}s (${stats.averageSpeed} tokens/sec)`;
                this.generateBtn.disabled = false;
                this.generateBtn.style.display = 'block';
                
                this.outputElement.classList.add('flash-complete');
                setTimeout(() => {
                    this.outputElement.classList.remove('flash-complete');
                }, 2000);
                break;

            case 'error':
                this.generatingStatus.classList.remove('generating');
                console.error('Error:', error);
                this.outputElement.textContent = `Error: ${error}`;
                statusText.textContent = `Error: ${error}`;
                statusBar.style.width = '0%';
                this.generateBtn.disabled = false;
                this.generateBtn.style.display = 'block';
                break;
        }
    }
}

const uiController = new UIController();
uiController.initialize();
