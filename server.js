
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";

// -- Express App Setup --
const app = express();
const port = process.env.PORT || 3000;

// -- ES Module Workaround for __dirname --
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -- Middleware --
app.use(express.json()); // To parse JSON bodies
app.use(express.static(path.join(__dirname, 'public'))); // To serve static files

// -- Gemini API Setup --
const systemInstruction = `Eres un asistente de estudio médico experto. Tu propósito es responder preguntas basándote estrictamente en el contexto proporcionado por las notas de estudio del usuario.
- Si la respuesta no se encuentra en el contexto, indica claramente que la información no está en las notas.
- NO inventes información ni utilices conocimientos externos.
- Sintetiza la información de las notas para ofrecer una respuesta concisa y precisa.
- Formatea tu respuesta utilizando HTML simple para mayor claridad (por ejemplo, usa <b> para negrita, <ul> y <li> para listas, y <p> para párrafos). No uses etiquetas <br>, en su lugar usa párrafos o divs.`;

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// -- API Route --
app.post('/api/ask-ai', async (req, res) => {
    try {
        if (!process.env.API_KEY) {
            // Send a clear error message to the client
            return res.status(500).json({ error: 'Error de configuración del servidor: La clave API de Gemini (API_KEY) no se ha encontrado. Asegúrate de que esté configurada en las variables de entorno de Netlify.' });
        }

        const { question, context } = req.body;

        if (!question) {
            return res.status(400).json({ error: 'La pregunta no puede estar vacía.' });
        }

        const fullPrompt = `CONTEXTO DE LAS NOTAS:\n---\n${context || 'No se proporcionó contexto.'}\n---\n\nPREGUNTA DEL USUARIO:\n${question}`;
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: fullPrompt,
            config: {
                systemInstruction: systemInstruction,
            },
        });

        const answer = response.text;

        res.status(200).json({ answer });

    } catch (error) {
        console.error('Error en la ruta /api/ask-ai:', error);
        res.status(500).json({ error: error.message || 'Ocurrió un error interno en el servidor.' });
    }
});

// -- Catch-all route to serve index.html for any other request --
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -- Start Server --
app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});