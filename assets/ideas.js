/* Browse the preserved workshop submissions. No tracking or writes. */
(() => {
  const search = document.getElementById('ideaSearch');
  const sort = document.getElementById('ideaSort');
  const list = document.getElementById('ideaArchive');
  if (!search || !sort || !list) return;
  const cards = [...list.querySelectorAll('[data-idea-card]')];
  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    cards.sort((a, b) => sort.value === 'score'
      ? Number(b.dataset.score) - Number(a.dataset.score) || Number(a.dataset.seq) - Number(b.dataset.seq)
      : Number(a.dataset.seq) - Number(b.dataset.seq));
    let count = 0;
    for (const card of cards) {
      card.hidden = !!query && !card.textContent.toLocaleLowerCase().includes(query);
      if (!card.hidden) count++;
      list.append(card);
    }
    document.getElementById('ideaResultCount').textContent = `Showing ${count} of ${cards.length} ideas`;
    document.getElementById('ideaNoResults').hidden = count !== 0;
  }
  search.addEventListener('input', render);
  sort.addEventListener('change', render);
  render();
})();
