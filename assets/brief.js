/* A public idea can seed a local draft. Nothing is submitted or tracked. */
(() => {
  const seq = new URLSearchParams(location.search).get('idea');
  const panel = document.getElementById('selected-idea');
  if (!seq || !panel) return;
  const title = document.getElementById('selected-idea-title');
  const status = document.getElementById('selected-idea-status');
  const use = document.getElementById('use-selected-idea');
  panel.hidden = false;
  title.textContent = 'Loading your selected idea…';
  function unavailable() {
    title.textContent = 'This idea could not be loaded';
    status.textContent = 'You can still write your own brief below, or choose another class idea.';
  }
  if (!/^\d{1,3}$/.test(seq)) { unavailable(); return; }
  fetch('../assets/workshop-ideas.json')
    .then(response => { if (!response.ok) throw new Error('Idea archive unavailable'); return response.json(); })
    .then(data => {
      const idea = data.ideas.find(item => String(item.seq) === seq);
      if (!idea) throw new Error('Unknown idea');
      const p = idea.improved;
      title.textContent = p.name;
      document.getElementById('selected-idea-original').textContent = 'Student idea: ' + idea.original;
      document.getElementById('selected-idea-proposal').textContent = 'AI proposal: ' + p.line;
      const suggestions = {
        user: p.users + '\nUseful result: ' + p.line,
        trigger: 'Trigger: ' + p.loop.trigger + '\nMake: ' + p.loop.make + '\nDeliver: ' + p.loop.deliver,
        check: p.loop.check + '\nStill decide: what happens if this check fails?',
        test: p.firstTest
      };
      status.textContent = 'Use the suggestion to begin. Your existing writing will be kept. You decide human control and how to learn from feedback.';
      use.hidden = false;
      use.addEventListener('click', () => {
        let filled = 0;
        for (const [name, value] of Object.entries(suggestions)) {
          const field = document.querySelector('.six textarea[name="' + name + '"]');
          if (field && !field.value.trim()) {
            field.value = value;
            field.dispatchEvent(new Event('input', {bubbles: true}));
            filled++;
          }
        }
        status.textContent = filled
          ? 'Added suggestions to ' + filled + ' empty fields. Existing writing was kept. Review every line, then decide the human controls and feedback test.'
          : 'Your brief already has writing in these fields. It has been kept. You can edit it below or clear it to start again.';
        const field = document.querySelector('.six textarea[name="user"]');
        if (field) field.focus({preventScroll: true});
      });
    }).catch(unavailable);
})();
