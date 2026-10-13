/* Preserve shared links to the theory that now lives at /learn/. */
(function () {
  var topics = ['model', 'idea', 'one-loop', 'three-loops', 'grow', 'improve', 'control', 'ai-native'];
  var topic = location.hash.slice(1);
  if (topics.indexOf(topic) !== -1) location.replace('../learn/' + location.hash);
})();
