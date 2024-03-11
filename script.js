import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0';

env.allowLocalModels = false;

document.getElementById('generateBtn').addEventListener('click', async function() {
    const selectedModel = document.getElementById('modelSelector').value;
    const userInput = document.getElementById('textInput').value;
    const outputElement = document.getElementById('output');

    try {
        const generator = await pipeline('text-generation', selectedModel);
        
        const messages = [
            { "role": "system", "content": "You are a friendly assistant." },
            { "role": "user", "content": userInput },
        ];

        const prompt = generator.tokenizer.apply_chat_template(messages, {
            tokenize: false, add_generation_prompt: true,
        });

        const result = await generator(prompt, {
            max_new_tokens: 256,
            penalty_alpha: 0.45,
            top_k: 3,
            repetition_penalty: 1.03,
            guidance_scale: 1.3,
        });

        console.log("Generated Text: " + result[0].generated_text)
        const assistantResponses = result[0].generated_text.split('assistant');
        outputElement.textContent = assistantResponses[assistantResponses.length - 1].trim();
    } catch (error) {
        console.error(error);
        outputElement.textContent = 'Error generating response: ' + error;
    }
});
