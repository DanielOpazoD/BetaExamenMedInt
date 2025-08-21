# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

### Features

- Nueva herramienta en el editor para redimensionar lateralmente notas o bloques HTML insertados mediante el botón ↔️ de la barra de herramientas.

## Print layout

To keep card grids aligned when printing to PDF, load `index.css` and wrap printable sections as follows:

```html
<div class="print-scale" style="--print-scale:0.9">
  <div class="print-grid">
    <!-- card elements here -->
  </div>
</div>
```

- The grid uses two fluid columns with a uniform gap and avoids fixed widths or negative margins.
- `--print-scale` controls internal scaling so the browser print dialog can stay at 100%.
- Add `data-paper="letter"` on the `<html>` element to switch to US Letter paper; otherwise A4 is used.
- All cards use `page-break-inside: avoid` to stay on the same page.
- Backgrounds and borders print with their original colors.

