(function () {
  'use strict';
  var questions = Array.from(document.querySelectorAll('[data-question]'));
  var progress = document.getElementById('learning-progress');
  questions.forEach(function (question) {
    var choices = Array.from(question.querySelectorAll('[data-answer]'));
    var feedback = question.querySelector('.quiz-feedback');
    choices.forEach(function (choice) {
      choice.setAttribute('aria-pressed', 'false');
      choice.addEventListener('click', function () {
        choices.forEach(function (button) { button.setAttribute('aria-pressed', String(button === choice)); });
        var correct = choice.getAttribute('data-answer') === 'yes';
        question.classList.toggle('is-correct', correct);
        feedback.textContent = (correct ? 'Yes. ' : 'Not quite. ') + choice.getAttribute('data-feedback');
        var answered = questions.filter(function (item) { return item.classList.contains('is-correct'); }).length;
        if (progress) {
          progress.textContent = answered === questions.length
            ? 'All five answers correct. Now use these questions on your own idea. Nothing was submitted.'
            : answered + ' of ' + questions.length + ' answers correct. You can change any answer. Nothing is submitted.';
        }
      });
    });
  });
})();
