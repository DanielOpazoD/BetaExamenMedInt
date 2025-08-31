export async function callOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Falta la clave API');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages
    })
  });
  if (!res.ok) throw new Error('Error en la solicitud a OpenAI');
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

export async function improveText(text) {
  return callOpenAI([
    { role: 'system', content: 'Eres un asistente que mejora redacciones en español.' },
    { role: 'user', content: `Mejora la redacción del siguiente texto sin cambiar su significado:\n${text}` }
  ]);
}

export async function askNotesQuestion(question, notes) {
  return callOpenAI([
    { role: 'system', content: 'Eres un asistente que responde preguntas basándote en notas proporcionadas.' },
    { role: 'user', content: `Notas:\n${notes}\n\nPregunta: ${question}` }
  ]);
}
