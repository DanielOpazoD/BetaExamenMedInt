import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    // Merge actual environment variables with those from .env files
    const env = { ...process.env, ...loadEnv(mode, '.', '') };
    const openaiKey = env.OPENAI_API_KEY || '';
    return {
      define: {
        // Expose the OpenAI key to the client bundle when building
        'process.env.API_KEY': JSON.stringify(openaiKey),
        'process.env.OPENAI_API_KEY': JSON.stringify(openaiKey),
        'import.meta.env.VITE_OPENAI_API_KEY': JSON.stringify(openaiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
