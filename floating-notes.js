const rootScope = typeof window !== 'undefined' ? window : globalThis;

export function createFloatingNote(data = {}) {
  const floatingNotesLayer = rootScope.floatingNotesLayer;
  if (!floatingNotesLayer) return null;

  const {
    generateUniqueId,
    getFloatingNoteStyle,
    applyFloatingNoteStyle,
    getNotePlainTextFromHtml,
    ensureNoteData,
    notesRegistry,
    updateNoteData,
    syncNoteElementMeta,
    bringNoteToFront,
    cycleNotePriority,
    beginNoteLinking,
    createFlashcardFromNote,
    buildNoteOptionsMenu,
    closeFloatingNoteStyleMenu,
    syncNoteOptionsMenu,
    openFloatingNoteStyleMenu,
    getNoteCategoryInfo,
    resolveFloatingNoteInitialPosition,
    positionFloatingNote,
    attachExistingAnchor,
    startFloatingNoteDrag,
    applyFloatingNoteSize,
    floatingNoteResizeObserver,
    updateFloatingNoteSizeDataset,
    scheduleNotesViewRefresh,
    scheduleFloatingNotesViewportRefresh,
    currentPageRef,
    currentSectionId,
    DEFAULT_NOTE_TYPE,
    DEFAULT_NOTE_CATEGORY,
    DEFAULT_NOTE_PRIORITY,
    isEditMode
  } = rootScope;

  const note = document.createElement('div');
  note.className = 'floating-note enhanced-note';

  let noteId = data.id ? String(data.id).trim() : '';
  if (!noteId) {
    noteId = generateUniqueId('floating-note');
  }
  note.dataset.noteId = noteId;

  const metaSource = data.meta && typeof data.meta === 'object' ? data.meta : {};
  const resolvedStyleId = (() => {
    const incoming = data.style || metaSource.style;
    if (incoming && getFloatingNoteStyle(String(incoming).trim())) {
      return String(incoming).trim();
    }
    return 'default';
  })();

  applyFloatingNoteStyle(note, resolvedStyleId);

  const htmlContent = typeof data.html === 'string'
    ? data.html
    : (typeof metaSource.html === 'string' ? metaSource.html : '');

  const initialTitle = (() => {
    if (typeof data.title === 'string') {
      return data.title.trim();
    }
    if (data.title === null) {
      return null;
    }
    if (typeof metaSource.title === 'string') {
      return metaSource.title.trim();
    }
    if (metaSource.title === null) {
      return null;
    }
    return null;
  })();

  const topicId = data.topicId || metaSource.topicId || currentPageRef?.dataset.topicId || null;
  const sectionId = data.sectionId || metaSource.sectionId || currentSectionId || currentPageRef?.dataset.sectionId || null;
  const noteType = data.type || metaSource.type || DEFAULT_NOTE_TYPE;
  const category = (data.category || metaSource.category || DEFAULT_NOTE_CATEGORY);
  const priority = data.priority || metaSource.priority || DEFAULT_NOTE_PRIORITY;
  const tags = Array.isArray(data.tags) ? data.tags : metaSource.tags;
  const reviewed = (data.reviewed ?? metaSource.reviewed) ?? false;
  const reviewCount = Number.isFinite(data.reviewCount) ? data.reviewCount : (Number.isFinite(metaSource.reviewCount) ? metaSource.reviewCount : 0);
  const lastReviewed = data.lastReviewed || metaSource.lastReviewed || null;
  const createdAt = data.createdAt || metaSource.createdAt || null;
  const updatedAt = data.updatedAt || metaSource.updatedAt || null;
  const linkedTo = data.linkedTo || metaSource.linkedTo || null;
  const anchorId = data.anchorId || metaSource.anchorId || null;
  const parsedLeft = Number.parseFloat(data.left ?? metaSource.left);
  const parsedTop = Number.parseFloat(data.top ?? metaSource.top);
  const parsedWidth = Number.parseFloat(data.width ?? metaSource.width);
  const parsedHeight = Number.parseFloat(data.height ?? metaSource.height);
  const parsedPageOffsetLeft = Number.parseFloat(data.pageOffsetLeft ?? metaSource.pageOffsetLeft);
  const parsedPageOffsetTop = Number.parseFloat(data.pageOffsetTop ?? metaSource.pageOffsetTop);
  const parsedRelativeLeft = Number.parseFloat(data.relativeLeft ?? metaSource.relativeLeft);
  const parsedRelativeTop = Number.parseFloat(data.relativeTop ?? metaSource.relativeTop);

  const noteData = ensureNoteData(noteId, {
    id: noteId,
    style: resolvedStyleId,
    title: initialTitle,
    html: htmlContent,
    content: getNotePlainTextFromHtml(htmlContent),
    type: noteType,
    category,
    priority,
    tags,
    topicId,
    sectionId,
    linkedTo,
    anchorId,
    reviewed,
    reviewCount,
    lastReviewed,
    createdAt,
    updatedAt,
    left: Number.isFinite(parsedLeft) ? parsedLeft : null,
    top: Number.isFinite(parsedTop) ? parsedTop : null,
    width: Number.isFinite(parsedWidth) ? parsedWidth : null,
    height: Number.isFinite(parsedHeight) ? parsedHeight : null,
    pageOffsetLeft: Number.isFinite(parsedPageOffsetLeft) ? parsedPageOffsetLeft : null,
    pageOffsetTop: Number.isFinite(parsedPageOffsetTop) ? parsedPageOffsetTop : null,
    relativeLeft: Number.isFinite(parsedRelativeLeft) ? parsedRelativeLeft : null,
    relativeTop: Number.isFinite(parsedRelativeTop) ? parsedRelativeTop : null,
    element: note
  });
  notesRegistry.set(noteId, noteData);

  const header = document.createElement('div');
  header.className = 'note-header floating-note-header';

  const categoryWrap = document.createElement('div');
  categoryWrap.className = 'note-category';
  const categoryIcon = document.createElement('span');
  categoryIcon.className = 'note-icon';
  const categoryLabel = document.createElement('span');
  categoryLabel.className = 'note-label';
  categoryWrap.append(categoryIcon, categoryLabel);

  const actions = document.createElement('div');
  actions.className = 'note-actions floating-note-actions';

  const priorityBtn = document.createElement('button');
  priorityBtn.type = 'button';
  priorityBtn.className = 'note-priority';
  priorityBtn.title = 'Prioridad';

  const linkBtn = document.createElement('button');
  linkBtn.type = 'button';
  linkBtn.className = 'note-link';
  linkBtn.title = 'Anclar al texto';
  linkBtn.textContent = '🔗';

  const flashcardBtn = document.createElement('button');
  flashcardBtn.type = 'button';
  flashcardBtn.className = 'note-flashcard';
  flashcardBtn.title = 'Crear flashcard';
  flashcardBtn.textContent = '🎴';

  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'note-menu';
  menuBtn.title = 'Más opciones';
  menuBtn.textContent = '⋮';

  const optionsMenu = buildNoteOptionsMenu(note);
  if (optionsMenu) {
    optionsMenu.dataset.noteId = noteId;
    if (!document.body.contains(optionsMenu)) {
      document.body.appendChild(optionsMenu);
    }
  }

  actions.append(priorityBtn, linkBtn, flashcardBtn, menuBtn);
  header.append(categoryWrap, actions);

  const body = document.createElement('div');
  body.className = 'floating-note-body note-body';
  body.spellcheck = true;
  body.contentEditable = isEditMode ? 'true' : 'false';
  body.innerHTML = noteData.html || '';

  body.addEventListener('focus', () => {
    bringNoteToFront(note);
  });

  body.addEventListener('input', () => {
    const html = body.innerHTML;
    const textContent = getNotePlainTextFromHtml(html);
    updateNoteData(noteId, {
      html,
      content: textContent,
      updatedAt: new Date().toISOString()
    });
    syncNoteElementMeta(note, notesRegistry.get(noteId));
  });

  const footer = document.createElement('div');
  footer.className = 'note-footer';

  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'note-tags';

  footer.append(tagsContainer);

  note.append(header, body, footer);
  floatingNotesLayer.appendChild(note);

  note._ui = {
    categoryIcon,
    categoryLabel,
    categoryWrap,
    priorityBtn,
    tagsContainer,
    optionsMenu
  };

  priorityBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    cycleNotePriority(note);
  });

  linkBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    beginNoteLinking(note);
  });

  flashcardBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const currentData = notesRegistry.get(noteId);
    if (currentData) {
      createFlashcardFromNote(currentData);
    }
  });

  menuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    bringNoteToFront(note);
    const menu = optionsMenu;
    if (menu.classList.contains('show')) {
      closeFloatingNoteStyleMenu(menu);
    } else {
      syncNoteOptionsMenu(menu, notesRegistry.get(noteId));
      openFloatingNoteStyleMenu(menu, menuBtn);
    }
  });

  categoryWrap.addEventListener('click', (event) => {
    event.stopPropagation();
    bringNoteToFront(note);
    closeFloatingNoteStyleMenu(optionsMenu);
    const currentData = notesRegistry.get(noteId) || ensureNoteData(noteId);
    const categoryInfo = getNoteCategoryInfo(currentData.category);
    const hasCustomTitle = currentData.title !== null && currentData.title !== undefined;
    const promptDefault = hasCustomTitle ? currentData.title : categoryInfo.label;
    const proposed = window.prompt('Título de la nota', promptDefault);
    if (proposed === null) {
      return;
    }
    const finalTitle = proposed.trim();
    const updated = updateNoteData(noteId, { title: finalTitle }, { silent: true });
    syncNoteElementMeta(note, updated);
    scheduleNotesViewRefresh();
  });

  header.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.detail > 1) return;
    if (event.target.closest('button') || event.target.closest('.floating-note-style-menu') || event.target.closest('.note-category')) return;
    closeFloatingNoteStyleMenu(optionsMenu);
    startFloatingNoteDrag(note, event);
  });

  header.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopPropagation();
    bringNoteToFront(note);
    if (optionsMenu.classList.contains('show')) {
      closeFloatingNoteStyleMenu(optionsMenu);
    } else {
      syncNoteOptionsMenu(optionsMenu, notesRegistry.get(noteId));
      openFloatingNoteStyleMenu(optionsMenu, menuBtn);
    }
  });

  note.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.floating-note-style-menu')) {
      return;
    }
    bringNoteToFront(note);
    closeFloatingNoteStyleMenu();
  });

  if (floatingNoteResizeObserver) {
    try {
      floatingNoteResizeObserver.observe(note);
    } catch (err) {
      // ignore observer errors
    }
  } else {
    updateFloatingNoteSizeDataset(note);
  }

  if (Number.isFinite(parsedWidth) || Number.isFinite(parsedHeight)) {
    applyFloatingNoteSize(note, parsedWidth, parsedHeight);
  }

  // ✅ CORRECCIÓN APLICADA AQUÍ
  const defaultOffset = (rootScope.floatingNoteCreationOffset = (rootScope.floatingNoteCreationOffset ?? 0) + 40);
  const layerRect = floatingNotesLayer.getBoundingClientRect();

  // ✓ Sin sumar scrollX/scrollY porque la capa es position:fixed
  const layerPageLeft = layerRect.left;
  const layerPageTop = layerRect.top;
  const baseViewportLeft = 80 + (defaultOffset % 160);
  const baseViewportTop = 120 + (defaultOffset % 240);
  const fallbackLeft = Math.max(0, baseViewportLeft - layerPageLeft);
  const fallbackTop = Math.max(0, baseViewportTop - layerPageTop);

  const initialPosition = resolveFloatingNoteInitialPosition(noteData, fallbackLeft, fallbackTop);

  positionFloatingNote(note, initialPosition.left, initialPosition.top);
  bringNoteToFront(note);

  syncNoteElementMeta(note, noteData);
  attachExistingAnchor(note, noteData.anchorId);

  if (data.focus !== false && isEditMode) {
    setTimeout(() => body.focus(), 0);
  }

  scheduleNotesViewRefresh();
  scheduleFloatingNotesViewportRefresh();
  return note;
}

if (typeof window !== 'undefined') {
  window.createFloatingNote = createFloatingNote;
}
