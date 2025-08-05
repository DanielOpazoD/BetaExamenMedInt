import { GoogleGenAI } from "@google/genai";

const API_KEY = 'REEMPLAZA_CON_TU_API_KEY';

class AiService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
    this.history = [];
    this.templates = {
      summary: (ctx, o) => `En ${o.lang} y con un tono ${o.tone}, resume el siguiente contenido en no más de ${o.length} palabras. Proporciona primero "Razonamiento:" y luego "Respuesta:".\n${ctx}`,
      flashcards: (ctx, o) => `En ${o.lang} y con un tono ${o.tone}, crea tarjetas de estudio (pregunta: respuesta) basadas en el siguiente contenido. Limita cada tarjeta a ${o.length} palabras. Proporciona primero "Razonamiento:" y luego "Respuesta:".\n${ctx}`,
      translate: (ctx, o) => `Traduce al ${o.lang} con un tono ${o.tone} el siguiente contenido. Proporciona primero "Razonamiento:" y luego "Respuesta:".\n${ctx}`,
      questions: (ctx, o) => `En ${o.lang} y con un tono ${o.tone}, genera preguntas tipo examen con respuestas breves basadas en este contenido. Limita cada respuesta a ${o.length} palabras. Proporciona primero "Razonamiento:" y luego "Respuesta:".\n${ctx}`,
      qa: (question, o) => `Responde en ${o.lang} con un tono ${o.tone} y no más de ${o.length} palabras a la siguiente consulta del usuario utilizando el contexto. Proporciona primero "Razonamiento:" y luego "Respuesta:".\n\nContexto:\n${o.context}\n\nPregunta: ${question}`,
    };
  }

  isConfigured() {
    return !!this.client;
  }

  async generate(prompt, { model = 'gemini-1.5-flash', onStream } = {}) {
    if (!this.client) throw new Error('La API Key de Gemini no está configurada.');
    try {
      const response = await this.client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      const text = response.text;
      if (onStream) {
        for (const token of text.split(/\s+/)) {
          onStream(token + ' ');
          await new Promise(r => setTimeout(r, 30));
        }
      }
      this.history.push({ prompt, response: text });
      return text;
    } catch (err) {
      console.error('AI Error:', err);
      throw new Error('No se pudo contactar a la IA');
    }
  }

  buildPrompt(tool, text, options) {
    const tpl = this.templates[tool];
    if (tpl) return tpl(text, options);
    return text;
  }

  splitReasoning(text) {
    const match = text.match(/Razonamiento:\s*([\s\S]*?)\nRespuesta:\s*([\s\S]*)/i);
    if (match) {
      return { reasoning: match[1].trim(), answer: match[2].trim() };
    }
    return { reasoning: '', answer: text.trim() };
  }

  async ask(tool, text, options = {}, onStream) {
    const prompt = this.buildPrompt(tool, text, options);
    const raw = await this.generate(prompt, { model: options.model, onStream });
    return this.splitReasoning(raw);
  }

  getHistory() {
    return this.history;
  }
}

const aiService = new AiService(API_KEY);
export default aiService;
