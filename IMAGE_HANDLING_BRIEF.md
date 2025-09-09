# Image Handling Integration Brief

This project uses a custom `contenteditable` element for editing notes. The editor container is declared in `index.html` and accessed in `index.js` during initialization. To add comprehensive image support using [CKEditor 5](https://github.com/ckeditor/ckeditor5), follow the guidance below.

## Current Editor Locations
- **Editor container**: `index.html` line 403 defines the element `<div id="notes-editor" ...>` where the editor lives.
- **Editor initialization**: `index.js` line 103 obtains this element with `const notesEditor = getElem('notes-editor');`.

## Goal
Enable the following capabilities in the HTML editor:
- Insert images from computer (toolbar button)
- Drag‑and‑drop & paste images
- Resize with visible handles and size presets
- Layout styles: inline, wrapText, breakText
- Toggle captions, set alt text, and link images

## Recommended Approach
Use the CKEditor 5 **super-build** (or a custom build) which already bundles the required plugins:
`AutoImage, ImageBlock, ImageInline, ImageInsert, ImageInsertViaUrl, ImageUpload, ImageResize, ImageStyle, ImageToolbar, ImageCaption, ImageTextAlternative, LinkImage, PictureEditing`.

### 1. Include CKEditor
Add the CDN script to `index.html` (before `index.js`):
```html
<script src="https://cdn.ckeditor.com/ckeditor5/41.1.0/super-build/ckeditor.js"></script>
```

### 2. Replace the `contenteditable` editor
In `index.js`, replace direct manipulation of `notesEditor` with CKEditor initialization:
```javascript
import "./index.css";

// ...inside DOMContentLoaded
ClassicEditor
  .create( document.querySelector( '#notes-editor' ), {
    toolbar: [ 'undo', 'redo', 'insertImage', 'link', 'alignment' ],
    image: {
      styles: [ 'inline', 'wrapText', 'breakText' ],
      toolbar: [
        'toggleImageCaption', 'imageTextAlternative', '|',
        'imageStyle:inline', 'imageStyle:wrapText', 'imageStyle:breakText', '|',
        'resizeImage'
      ],
      resizeUnit: '%',
      resizeOptions: [
        { name: 'resizeImage:original', label: 'Original', value: null },
        { name: 'resizeImage:25', label: '25%', value: '25' },
        { name: 'resizeImage:50', label: '50%', value: '50' },
        { name: 'resizeImage:75', label: '75%', value: '75' },
        { name: 'resizeImage:100', label: '100%', value: '100' }
      ]
    },
    extraPlugins: [ CKBase64UploadAdapter ] // use Base64 for prototypes
  } )
  .then( editor => {
    window.notesEditor = editor; // expose if other modules need it
  } )
  .catch( console.error );
```
Adapt other functions that previously manipulated `notesEditor` (e.g., history or drag‑and‑drop logic) to interact with the CKEditor API (`editor.getData()`, `editor.setData()` etc.).

### 3. Essential CSS
In `index.css` ensure images are responsive:
```css
.ck-content img {
  max-width: 100%;
  height: auto;
}
```

## Uploading Strategy
- **Prototype**: Enable `CKBase64UploadAdapter` so images are stored as base64 within the HTML.
- **Production**: Implement a custom upload adapter or configure `simpleUpload`/`cloudServices` to send images to a backend and use returned URLs.

## QA Checklist
1. Insert via toolbar button and local file.
2. Drag‑and‑drop image files into the editor.
3. Paste images from clipboard.
4. Resize via handles and size presets.
5. Apply inline, wrapText, and breakText styles.
6. Toggle caption and edit alt text.
7. Link an image using the link tool.
8. Persist content and ensure all attributes (size, style, alt, caption, link) survive reload.

Refer to the CKEditor 5 documentation for additional configuration options or build customization.
