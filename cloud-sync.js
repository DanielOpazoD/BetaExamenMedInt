export function setupCloudIntegration() {
  const btn = document.getElementById('cloud-sync-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const provider = prompt('Proveedor de nube (drive/dropbox):', 'drive');
    if (!provider) return;
    try {
      const data = localStorage.getItem('temarioState') || '';
      console.log(`Syncing with ${provider}`, data);
      alert(`Sincronización con ${provider} completada (simulada).`);
    } catch (err) {
      console.error('Cloud sync failed', err);
      alert('Fallo la sincronización.');
    }
  });
}
