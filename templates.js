const templates = JSON.parse(localStorage.getItem('templates') || '[]');
let editMode = false;
let currentTag = null;
let currentSearch = '';
let sortMode = 'newest';
let currentPage = 1;
const pageSize = 12;
let deletedTemplate = null;

const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const editToggle = document.getElementById('edit-toggle');
const grid = document.getElementById('templates-grid');
const tagScroll = document.getElementById('tag-scroll');
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');
const toast = document.getElementById('toast');

function save() {
  localStorage.setItem('templates', JSON.stringify(templates));
}

function uniqueTags() {
  const set = new Set();
  templates.forEach(t => t.tags?.forEach(tag => set.add(tag)));
  return Array.from(set);
}

function renderTags() {
  tagScroll.innerHTML = '';
  uniqueTags().forEach(tag => {
    const chip = document.createElement('button');
    chip.textContent = tag;
    chip.className = 'px-2 py-1 rounded-full border whitespace-nowrap' + (currentTag===tag? ' bg-blue-100' : '');
    chip.addEventListener('click', () => {
      currentTag = currentTag === tag ? null : tag;
      currentPage = 1;
      render();
    });
    tagScroll.appendChild(chip);
  });
}

function render() {
  renderTags();
  let items = templates.slice();
  if (currentSearch) {
    items = items.filter(t => t.title.toLowerCase().includes(currentSearch));
  }
  if (currentTag) {
    items = items.filter(t => t.tags?.includes(currentTag));
  }
  items.sort((a,b)=>{
    if(a.favorite&&!b.favorite) return -1;
    if(!a.favorite&&b.favorite) return 1;
    if (sortMode==='az') return a.title.localeCompare(b.title);
    return b.created - a.created;
  });
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage-1)*pageSize;
  const pageItems = items.slice(start, start+pageSize);
  grid.innerHTML = '';
  pageItems.forEach(t => {
    const card = document.createElement('div');
    card.className = 'template-card border rounded p-3 bg-white shadow';
    if(editMode) card.classList.add('editing');
    const fav = document.createElement('button');
    fav.innerHTML = '⭐';
    if(t.favorite) fav.classList.add('favorite');
    fav.addEventListener('click',()=>{t.favorite=!t.favorite;save();render();});
    const actions = document.createElement('div');
    actions.className = 'template-actions';
    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click',()=>{/* editar */});
    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click',()=>del(t.id));
    actions.append(editBtn, delBtn);
    const title = document.createElement('h3');
    title.className='font-semibold mb-2 flex justify-between';
    title.append(document.createTextNode(t.title), fav);
    const preview = document.createElement('div');
    preview.className='text-sm text-gray-600';
    preview.innerHTML = t.content.slice(0,80) + '...';
    card.append(actions,title,preview);
    grid.appendChild(card);
  });
  pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
  prevBtn.disabled = currentPage===1;
  nextBtn.disabled = currentPage===totalPages;
}

function del(id){
  const idx = templates.findIndex(t=>t.id===id);
  if(idx>-1){
    deletedTemplate = {item: templates[idx], index: idx};
    templates.splice(idx,1);
    save();
    render();
    showToast('Eliminada ✓ <button id="undo" class="underline ml-2">Deshacer</button>');
    document.getElementById('undo').addEventListener('click',()=>{
      templates.splice(deletedTemplate.index,0,deletedTemplate.item);
      save();
      hideToast();
      render();
    });
    setTimeout(()=>{deletedTemplate=null;hideToast();},5000);
  }
}

function showToast(html){
  toast.innerHTML = html;
  toast.classList.remove('hidden');
}
function hideToast(){
  toast.classList.add('hidden');
}

searchInput.addEventListener('input',()=>{currentSearch=searchInput.value.toLowerCase();currentPage=1;render();});
sortSelect.addEventListener('change',()=>{sortMode=sortSelect.value;render();});
editToggle.addEventListener('click',()=>{editMode=!editMode;editToggle.classList.toggle('bg-blue-800');render();});
prevBtn.addEventListener('click',()=>{if(currentPage>1){currentPage--;render();}});
nextBtn.addEventListener('click',()=>{currentPage++;render();});

document.getElementById('export-btn').addEventListener('click',()=>{
  const blob = new Blob([JSON.stringify(templates)],{type:'application/json'});
  const a = document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='templates.json';
  a.click();
});

const importInput = document.getElementById('import-file');
importInput.addEventListener('change',e=>{
  const file=e.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{const data=JSON.parse(ev.target.result);if(Array.isArray(data)){templates.splice(0,templates.length,...data);save();render();}}
    catch(err){console.error(err);}
  };
  reader.readAsText(file);
});
document.getElementById('import-btn').addEventListener('click',()=>importInput.click());
document.getElementById('save-btn').addEventListener('click',save);

// populate example data if empty
if(templates.length===0){
  templates.push({id:1,title:'Ejemplo',content:'<p>Contenido de ejemplo</p>',tags:['demo'],favorite:false,created:Date.now()});
  save();
}

render();
