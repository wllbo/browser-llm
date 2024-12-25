// Create worker with module support
const worker = new Worker('worker.js', { type: 'module' });

class UIController {
    constructor() {
        this.generateBtn = document.getElementById('generateBtn');
        this.outputElement = document.getElementById('output');
        this.generatingStatus = document.getElementById('generatingStatus');
        this.modelSelector = document.getElementById('modelSelector');
        this.textInput = document.getElementById('textInput');
        this.showingAlternateMessage = false;
    }

    initialize() {
        this.generateBtn.addEventListener('click', () => this.handleGenerateClick());
    }

    handleGenerateClick() {
        console.log('Starting generation with model:', this.modelSelector.value);
        this.setGeneratingState();
        
        worker.onmessage = (e) => this.handleWorkerMessage(e);
        worker.postMessage({ 
            type: 'init', 
            data: { modelId: this.modelSelector.value }
        });
    }

    setGeneratingState() {
        this.generateBtn.disabled = true;
        this.generateBtn.style.display = 'none';
        this.outputElement.textContent = '';
        this.generatingStatus.style.display = 'block';
        this.generatingStatus.innerHTML = `
            <div class="progress-bar"></div>
            <div class="status-text">Initializing...</div>
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
                if (e.data.isNewDownload) statusBar.style.width = '0%';
                statusBar.style.width = e.data.percent + '%';
                if (!this.showingAlternateMessage) {
                    statusText.textContent = `Downloading ONNX model... ${e.data.percent}%`;
                }
                break;

            case 'ready':
                statusBar.style.width = '100%';
                statusBar.classList.add('success');
                statusText.textContent = cached ? 'Using cached model' : 'Model loaded successfully!';
                
                setTimeout(() => {
                    statusBar.style.opacity = '0';
                    statusText.textContent = 'Starting generation...';
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
                const textNode = document.createTextNode(text);
                this.outputElement.appendChild(textNode);
                this.outputElement.scrollTop = this.outputElement.scrollHeight;
                break;

            case 'stats':
                statusText.textContent = `Generating... (${stats.tokenCount} tokens, ${stats.tokensPerSecond} tokens/sec)`;
                break;

            case 'complete':
                statusText.textContent = `Complete! Generated ${stats.totalTokens} tokens in ${stats.totalTime}s (${stats.averageSpeed} tokens/sec)`;
                this.generateBtn.disabled = false;
                this.generateBtn.style.display = 'block';
                break;

            case 'error':
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

// Initialize the UI controller
const uiController = new UIController();
uiController.initialize();
