# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `OPENAI_API_KEY` in your Netlify environment settings (or in [.env.local](.env.local) for local testing)
3. Run the app:
   `npm run dev`

### Features

- Nueva herramienta en el editor para redimensionar lateralmente notas o bloques HTML insertados mediante el botón ↔️ de la barra de herramientas.
- Experiencia de edición mejorada: multicursor, selección en bloques y reorganización de líneas con arrastrar y soltar.
- Botones para corregir la sangría de un bloque seleccionado.  Usa ↦ para aumentar un nivel de `indent-n` o ↤ para reducirlo.

## Resizable tables

Files `resizable-table.css` and `resizable-table.js` provide a vanilla component to resize tables.
Use the class `resizable-table` on `<table>` elements and call `initResizableTables()` after inserting
or pasting new tables. The function marks each table with `data-resizable-initialized="true"` so
repeated calls are safe. To remove listeners simply remove the table element; global listeners stop
acting when the table disappears.

`resizable-table-demo.html` shows three example tables and how to initialise the component.
